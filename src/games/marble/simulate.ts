import { mulberry32 } from './rng';
import { TRACK } from './track';

export type SimulationResult = {
  fps: number;
  durationMs: number;
  // frames[frameIdx] = flat array of [x0,y0,x1,y1,...] in track-normalized coords (x ∈ [0,1], y ∈ [0,TRACK.height])
  frames: number[][];
  // playerToken order this sim was run with
  playerOrder: string[];
  // finish order (last = worst)
  finishOrder: string[];
};

type Marble = {
  token: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  finished: boolean;
  finishedAtFrame: number;
};

const FPS = 30;
const DT = 1 / FPS;
const MAX_FRAMES = 50 * FPS; // 50 second cap

export function simulateRace(seed: number, players: { playerToken: string }[]): SimulationResult {
  const rng = mulberry32(seed);

  // Spread starting positions across the track width with mild jitter
  const marbles: Marble[] = players.map((p, idx) => {
    const slot = (idx + 0.5) / players.length;
    const jitter = (rng() - 0.5) * 0.03;
    return {
      token: p.playerToken,
      x: clamp(slot + jitter, TRACK.marbleRadius + 0.02, 1 - TRACK.marbleRadius - 0.02),
      y: TRACK.startY + rng() * 0.01,
      vx: (rng() - 0.5) * 0.05,
      vy: 0,
      finished: false,
      finishedAtFrame: -1,
    };
  });

  const frames: number[][] = [];
  const finishOrder: string[] = [];

  let frameIdx = 0;
  while (frameIdx < MAX_FRAMES) {
    // record this frame's snapshot
    const snap = new Array(marbles.length * 2);
    for (let i = 0; i < marbles.length; i++) {
      snap[i * 2] = round3(marbles[i].x);
      snap[i * 2 + 1] = round3(marbles[i].y);
    }
    frames.push(snap);

    // step
    for (const m of marbles) {
      if (m.finished) continue;

      // Forces
      m.vy += TRACK.gravity * DT;
      m.vx += (rng() - 0.5) * 0.05 * DT;

      // Drag (per-second decay)
      const dragMul = 1 - TRACK.drag * DT;
      m.vx *= dragMul;
      m.vy *= dragMul;

      // Velocity caps — prevent tunneling and keep the race visually coherent
      if (m.vy > TRACK.maxVy) m.vy = TRACK.maxVy;
      if (m.vy < -TRACK.maxVy * 0.5) m.vy = -TRACK.maxVy * 0.5;
      if (m.vx > TRACK.maxVx) m.vx = TRACK.maxVx;
      if (m.vx < -TRACK.maxVx) m.vx = -TRACK.maxVx;

      // Integrate
      m.x += m.vx * DT;
      m.y += m.vy * DT;

      // Walls — bouncy, add a small kick so marbles don't slide along edges forever
      if (m.x < TRACK.marbleRadius + 0.01) {
        m.x = TRACK.marbleRadius + 0.01;
        m.vx = Math.abs(m.vx) * 0.6 + 0.04;
      } else if (m.x > 1 - TRACK.marbleRadius - 0.01) {
        m.x = 1 - TRACK.marbleRadius - 0.01;
        m.vx = -Math.abs(m.vx) * 0.6 - 0.04;
      }

      // Peg collisions
      for (const peg of TRACK.pegs) {
        const dx = m.x - peg.x;
        const dy = m.y - peg.y;
        const d2 = dx * dx + dy * dy;
        const minD = TRACK.marbleRadius + peg.r;
        if (d2 < minD * minD && d2 > 1e-7) {
          const d = Math.sqrt(d2);
          const nx = dx / d;
          const ny = dy / d;
          // separate
          const overlap = minD - d;
          m.x += nx * overlap;
          m.y += ny * overlap;
          // reflect velocity along normal (with energy loss)
          const dot = m.vx * nx + m.vy * ny;
          if (dot < 0) {
            const restitution = 0.45;
            m.vx -= (1 + restitution) * dot * nx;
            m.vy -= (1 + restitution) * dot * ny;
          }
          // tangential noise so marbles don't get trapped symmetrically
          m.vx += (rng() - 0.5) * 0.12;
        }
      }

      // Marble-marble collisions (mass-equal elastic-ish)
      for (const o of marbles) {
        if (o === m || o.finished) continue;
        const dx = m.x - o.x;
        const dy = m.y - o.y;
        const d2 = dx * dx + dy * dy;
        const minD = TRACK.marbleRadius * 2;
        if (d2 < minD * minD && d2 > 1e-7) {
          const d = Math.sqrt(d2);
          const nx = dx / d;
          const ny = dy / d;
          const overlap = (minD - d) * 0.5;
          m.x += nx * overlap;
          m.y += ny * overlap;
          o.x -= nx * overlap;
          o.y -= ny * overlap;
          const relVx = m.vx - o.vx;
          const relVy = m.vy - o.vy;
          const dot = relVx * nx + relVy * ny;
          if (dot < 0) {
            const impulse = -dot * 0.7;
            m.vx += nx * impulse;
            m.vy += ny * impulse;
            o.vx -= nx * impulse;
            o.vy -= ny * impulse;
          }
        }
      }

      // finish line
      if (!m.finished && m.y >= TRACK.finishY) {
        m.finished = true;
        m.finishedAtFrame = frameIdx;
        finishOrder.push(m.token);
      }
    }

    // Anti-stuck: if a marble hardly moved over the last second, kick it
    if (frameIdx > 0 && frameIdx % 30 === 0) {
      const lookback = Math.min(30, frames.length - 1);
      const past = frames[frames.length - 1 - lookback];
      for (let i = 0; i < marbles.length; i++) {
        const m = marbles[i];
        if (m.finished) continue;
        const yPast = past[i * 2 + 1];
        if (m.y - yPast < 0.05) {
          // stuck — kick
          m.vx += (rng() - 0.5) * 0.3;
          m.vy += 0.2;
        }
      }
    }

    frameIdx++;
    if (marbles.every((m) => m.finished)) break;
  }

  // Anyone who didn't finish counts as last (in current y order, lowest y = worst)
  const stragglers = marbles
    .filter((m) => !m.finished)
    .sort((a, b) => b.y - a.y); // higher y = better progress
  for (const m of stragglers) finishOrder.push(m.token);

  return {
    fps: FPS,
    durationMs: Math.round((frameIdx / FPS) * 1000),
    frames,
    playerOrder: marbles.map((m) => m.token),
    finishOrder,
  };
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
function round3(v: number) {
  return Math.round(v * 1000) / 1000;
}
