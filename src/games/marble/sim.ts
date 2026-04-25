import { mulberry32 } from './rng';
import { Box2dPhysics } from './lazygyu/physics';
import { stages } from './lazygyu/maps';
import type { MapEntityState } from './lazygyu/MapEntity';

export type StaticEntity = {
  x: number;
  y: number;
  shape: MapEntityState['shape'];
  // For kinematic entities (rotors), constant angular velocity in rad/s — clients animate locally.
  angularVelocity: number;
  isKinematic: boolean;
};

export type SimulationResult = {
  fps: number;
  durationMs: number;
  // frames[i] = flat [x0,y0,x1,y1,...] of marble positions in box2d meters at frame i
  frames: number[][];
  // playerToken order matching the indices in each frame
  playerOrder: string[];
  // first to finish ... last to finish (last = worst)
  finishOrder: string[];
  // For each playerOrder index: the frame on which the marble crossed the goal line, or -1 if never finished.
  // Used by the client to spawn finish-line fanfare particles at the right moment.
  finishFrames: number[];
  // Static + kinematic entities to draw on the client (sent once per round)
  entities: StaticEntity[];
  goalY: number;
  zoomY: number;
  // box2d coordinate range (for camera sizing on client)
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  // Slow-motion ranges: each [startFrame, endFrame] inclusive plays back at slowFactor speed.
  // Empty array means no slow-mo. Ranges are sorted and non-overlapping.
  slowRanges: [number, number][];
  slowFactor: number;
};

const FPS = 30; // recording FPS; client interpolates between frames if higher refresh
const STEP_DT = 1 / 90; // physics substep — 90Hz for stable contacts with fast marbles
const STEPS_PER_FRAME = 3; // 90 / 30 = 3 substeps per recorded frame
const MAX_SECONDS = 60;
const MAX_FRAMES = MAX_SECONDS * FPS;

export async function simulateRace(
  seed: number,
  players: { playerToken: string }[],
): Promise<SimulationResult> {
  const rng = mulberry32(seed);

  const physics = new Box2dPhysics(rng);
  await physics.init();

  const stage = stages[0];
  physics.createStage(stage);

  // Marble spawn formula ported from lazygyu/src/marble.ts:72
  const max = players.length;
  const maxLine = Math.ceil(max / 10);
  const lineDelta = -Math.max(0, Math.ceil(maxLine - 5));
  for (let i = 0; i < players.length; i++) {
    const line = Math.floor(i / 10);
    const x = 10.25 + (i % 10) * 0.6;
    const y = maxLine - line + lineDelta;
    physics.createMarble(i, x, y);
  }

  physics.start();

  // Snapshot static/kinematic entities once
  const initialEntities: StaticEntity[] = physics.getEntities().map((e, idx) => {
    // Determine if the body is kinematic by checking the source map entity (we can't easily ask the body)
    const src = stage.entities?.[idx];
    const isKinematic = src?.type === 'kinematic';
    return {
      x: e.x,
      y: e.y,
      shape: e.shape,
      angularVelocity: src?.props.angularVelocity ?? 0,
      isKinematic,
    };
  });

  const frames: number[][] = [];
  const finishOrder: string[] = [];
  const finishedSet = new Set<number>();
  const finishFrames: number[] = new Array(players.length).fill(-1);
  // Once a marble crosses the goal line, freeze its position (cosmetically) and remove from physics
  const frozenPositions = new Map<number, { x: number; y: number }>();
  // Anti-stuck (ported from lazygyu/src/marble.ts): if marble barely moves for STUCK_DELAY ms, shake it
  const lastPos = new Map<number, { x: number; y: number }>();
  const stuckMs = new Map<number, number>();
  const STUCK_DELAY_MS = 1500;
  const STUCK_DIST_SQ = 0.05 * 0.05; // less than 5cm moved
  const FRAME_MS = 1000 / FPS;

  let frameIdx = 0;

  while (frameIdx < MAX_FRAMES) {
    for (let s = 0; s < STEPS_PER_FRAME; s++) {
      physics.step(STEP_DT);
    }

    const snap = new Array(players.length * 2);
    for (let i = 0; i < players.length; i++) {
      const frozen = frozenPositions.get(i);
      const p = frozen ?? physics.getMarblePosition(i);
      snap[i * 2] = round2(p.x);
      snap[i * 2 + 1] = round2(p.y);

      if (frozen) continue;

      // Anti-stuck
      const prev = lastPos.get(i);
      if (prev) {
        const dx = p.x - prev.x;
        const dy = p.y - prev.y;
        if (dx * dx + dy * dy < STUCK_DIST_SQ) {
          const total = (stuckMs.get(i) ?? 0) + FRAME_MS;
          stuckMs.set(i, total);
          if (total >= STUCK_DELAY_MS) {
            physics.shakeMarble(i);
            stuckMs.set(i, 0);
          }
        } else {
          stuckMs.set(i, 0);
        }
      }
      lastPos.set(i, { x: p.x, y: p.y });

      if (p.y > stage.goalY) {
        finishedSet.add(i);
        finishOrder.push(players[i].playerToken);
        finishFrames[i] = frameIdx;
        frozenPositions.set(i, { x: p.x, y: stage.goalY + 0.5 });
        physics.removeMarble(i);
      }
    }
    frames.push(snap);
    frameIdx++;

    if (finishedSet.size === players.length) break;
  }

  // Stragglers ranked by how far they got (higher y = closer to goal)
  if (finishedSet.size < players.length) {
    const lastFrame = frames[frames.length - 1];
    const remaining: { idx: number; y: number }[] = [];
    for (let i = 0; i < players.length; i++) {
      if (!finishedSet.has(i)) remaining.push({ idx: i, y: lastFrame[i * 2 + 1] });
    }
    remaining.sort((a, b) => b.y - a.y);
    for (const r of remaining) finishOrder.push(players[r.idx].playerToken);
  }

  // Slow-motion: build short windows around each finish event so the climactic moments stretch out
  // without making the whole race plod. Window: 0.8s before a finish through 0.2s after.
  const SLOWMO_FACTOR = 0.4;
  const PRE_MS = 800;
  const POST_MS = 200;
  const preF = Math.round((PRE_MS / 1000) * FPS);
  const postF = Math.round((POST_MS / 1000) * FPS);
  const rawRanges: [number, number][] = [];
  for (const ff of finishFrames) {
    if (ff < 0) continue;
    rawRanges.push([Math.max(0, ff - preF), Math.min(frames.length - 1, ff + postF)]);
  }
  rawRanges.sort((a, b) => a[0] - b[0]);
  const slowRanges: [number, number][] = [];
  for (const r of rawRanges) {
    const last = slowRanges[slowRanges.length - 1];
    if (last && r[0] <= last[1] + 1) {
      last[1] = Math.max(last[1], r[1]);
    } else {
      slowRanges.push([r[0], r[1]]);
    }
  }
  // Recompute durationMs to include the time-stretching from slow-mo
  const realFrameMs = 1000 / FPS;
  let stretchedDurationMs = frames.length * realFrameMs;
  for (const [s, e] of slowRanges) {
    stretchedDurationMs += (e - s + 1) * realFrameMs * (1 / SLOWMO_FACTOR - 1);
  }

  // Compute coordinate bounds from static entities for camera sizing
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const e of initialEntities) {
    if (e.shape.type === 'polyline') {
      for (const [px, py] of e.shape.points) {
        const ax = e.x + px;
        const ay = e.y + py;
        if (ax < minX) minX = ax;
        if (ax > maxX) maxX = ax;
        if (ay < minY) minY = ay;
        if (ay > maxY) maxY = ay;
      }
    }
  }
  // Cap the upper invisible reach (polylines extend to y=-300 visually invisible)
  if (minY < 0) minY = 0;

  return {
    fps: FPS,
    durationMs: Math.round(stretchedDurationMs),
    frames,
    playerOrder: players.map((p) => p.playerToken),
    finishOrder,
    finishFrames,
    entities: initialEntities,
    goalY: stage.goalY,
    zoomY: stage.zoomY,
    bounds: { minX, maxX, minY, maxY },
    slowRanges,
    slowFactor: SLOWMO_FACTOR,
  };
}

function round2(v: number) {
  return Math.round(v * 100) / 100;
}
