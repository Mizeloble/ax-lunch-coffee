'use client';

import { useEffect, useRef } from 'react';
import { ko } from '@/lib/i18n';
import type { SimulationResult } from './sim';

const MARBLE_RADIUS = 0.25; // box2d meters, matches lazygyu
const VIEW_HEIGHT_METERS = 22; // baseline meters of vertical track shown
const ZOOM_THRESHOLD = 5; // meters from zoomY where the camera starts zooming in (lazygyu)
const ZOOM_MAX = 4; // max zoom multiplier near goal (lazygyu uses 4×)
const CAMERA_EASE_RATE = 6; // exponential ease constant — ~150ms time to converge 90%

export type MarbleRendererProps = {
  startAt: number;
  durationMs: number;
  replay: SimulationResult;
  players: { playerToken: string; nickname: string; color: string }[];
  myPlayerToken: string | null;
};

type Particle = {
  x: number; // world meters
  y: number;
  vx: number; // m/s
  vy: number;
  life: number; // seconds remaining
  totalLife: number;
  color: string;
  size: number; // world meters
  rot: number;
  vrot: number;
  emoji?: string; // when set, render as text instead of confetti rect
};

type Burst = {
  x: number;
  y: number;
  age: number; // seconds since spawn
  color: string;
  rankLabel: string;
};

type Pane = {
  // Pixel rect on the canvas
  px: number;
  py: number;
  pw: number;
  ph: number;
  label: string;
  particles: Particle[];
  bursts: Burst[];
  pulse: number; // 0..1, label highlight when finish events happen
  shake: number; // 0..1, screen-shake intensity
};

export function MarbleRenderer({ startAt, durationMs, replay, players, myPlayerToken }: MarbleRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    // Cap DPR at 1.5: the marble pegs are too small for the extra pixels to be visible,
    // and full DPR=2 doubles the fill cost on already-busy phones.
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    function resize() {
      if (!canvas || !wrapper) return;
      const rect = wrapper.getBoundingClientRect();
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrapper);

    const playerByToken = new Map(players.map((p) => [p.playerToken, p]));
    const fps = replay.fps;
    const totalFrames = replay.frames.length;
    const myIdx = myPlayerToken ? replay.playerOrder.indexOf(myPlayerToken) : -1;

    // Pre-sort non-polyline entities by Y so we can binary-search the visible band each frame.
    // Polylines span huge Y ranges (e.g. -300..111), so they can't be sorted — keep them separate
    // and iterate all 22.
    const polylineEntities: typeof replay.entities = [];
    const sortedEntities: typeof replay.entities = [];
    for (const e of replay.entities) {
      if (e.shape.type === 'polyline') polylineEntities.push(e);
      else sortedEntities.push(e);
    }
    sortedEntities.sort((a, b) => a.y - b.y);
    const sortedYs = sortedEntities.map((e) => e.y);

    // Pre-measure nickname widths once instead of measureText-per-marble-per-frame.
    ctx.font = `bold ${14 * dpr}px sans-serif`;
    const labelWidths = new Map<string, number>();
    for (const p of players) labelWidths.set(p.playerToken, ctx.measureText(p.nickname).width);

    // Track which finish frames have been "consumed" for fanfare so we spawn each only once.
    let lastProcessedFrame = -1;

    // Loser = the very last entry in finishOrder. That's the player who pays for coffee.
    const loserToken = replay.finishOrder[replay.finishOrder.length - 1];
    const loserIdx = loserToken ? replay.playerOrder.indexOf(loserToken) : -1;
    // Second-to-last finisher: their crossing locks in the loser. That's the climactic
    // moment — the loser's own crossing is anticlimactic since the result is already known.
    const stlToken = replay.finishOrder[replay.finishOrder.length - 2];
    const stlIdx = stlToken ? replay.playerOrder.indexOf(stlToken) : -1;
    const loserDecidedFrame = stlIdx >= 0 ? replay.finishFrames[stlIdx] : -1;

    // Personal rank: locked when MY marble crosses, or when the loser is decided
    // (if I'm the loser, since I never cross).
    const myRank = myPlayerToken ? replay.finishOrder.indexOf(myPlayerToken) + 1 : 0;
    const totalPlayers = replay.playerOrder.length;
    const myFinishLockedFrame =
      myIdx < 0
        ? -1
        : myIdx === loserIdx
          ? loserDecidedFrame
          : replay.finishFrames[myIdx];

    // Two panes: main (my marble) and inset (꼴등 후보). Both share the same draw routine.
    const mainPane: Pane = { px: 0, py: 0, pw: 0, ph: 0, label: '', particles: [], bursts: [], pulse: 0, shake: 0 };
    const insetPane: Pane = { px: 0, py: 0, pw: 0, ph: 0, label: '꼴등 시점', particles: [], bursts: [], pulse: 0, shake: 0 };

    // Cumulative playback time at the START of each frame (cumMs[i] = sum of frameDurations[0..i-1]).
    // Used to map wall-clock elapsed → frameF via binary search.
    const frameDurations = replay.frameDurations;
    const cumMs = new Float64Array(frameDurations.length + 1);
    for (let i = 0; i < frameDurations.length; i++) cumMs[i + 1] = cumMs[i] + frameDurations[i];

    // Stateful smooth camera (lazygyu-style): position and zoom ease toward target each frame
    // instead of snapping. Re-initialized to target on the very first draw.
    let camY = 0, camZoom = 1;
    let insetCamY = 0, insetCamZoom = 1;
    let camInit = false;

    let raf = 0;
    let lastT = performance.now();
    const draw = (now: number) => {
      // Clamp to [0, 0.05]: RAF's `now` can be slightly behind `lastT` on the first frame
      // (different time origins), which would yield a negative dt and feed negative ages
      // into burst/particle math (radii go negative → canvas throws).
      const dtSec = Math.max(0, Math.min(0.05, (now - lastT) / 1000));
      lastT = now;

      const elapsed = Math.max(0, Date.now() - startAt);
      const frameF = elapsedToFrameF(elapsed, cumMs, frameDurations, totalFrames);
      const idx = Math.min(totalFrames - 1, Math.max(0, Math.floor(frameF)));
      const tFrac = Math.min(1, Math.max(0, frameF - idx));
      const cur = replay.frames[idx];
      const next = replay.frames[Math.min(totalFrames - 1, idx + 1)];

      // For animations that depend on real wall-clock (like rotor angles), use the in-sim seconds
      // rather than wall-clock — keeps rotors in sync with marbles during slow-mo.
      const elapsedSec = frameF / fps;

      const W = canvas.width;
      const H = canvas.height;

      // Live 꼴등 후보: the slowest unfinished marble (lowest y). Once everyone finishes,
      // fall back to the precomputed loserIdx so the camera stays parked on them.
      let liveLoserY = Infinity;
      let liveLoserIdx = -1;
      for (let i = 0; i < replay.playerOrder.length; i++) {
        const ff = replay.finishFrames[i];
        if (ff >= 0 && idx >= ff) continue; // already finished
        const yv = cur[i * 2 + 1];
        if (yv < liveLoserY) {
          liveLoserY = yv;
          liveLoserIdx = i;
        }
      }
      if (liveLoserIdx < 0 && loserIdx >= 0) {
        liveLoserIdx = loserIdx;
        liveLoserY = cur[loserIdx * 2 + 1];
      }

      // My marble's current position (or 꼴등 view if I'm finished early)
      // Switch camera to the loser-candidate ~170ms after my marble crosses the goal.
      const finishHoldFrames = Math.ceil(fps * 0.17);
      const iAmFinished = myIdx >= 0 && replay.finishFrames[myIdx] >= 0 && idx >= replay.finishFrames[myIdx] + finishHoldFrames;
      const iAmLoserCandidate = myIdx === liveLoserIdx && !iAmFinished;
      const myYNow = myIdx >= 0 ? cur[myIdx * 2 + 1] : liveLoserY;

      // Fanfare fires when the SECOND-TO-LAST finisher crosses — that's the moment
      // the loser is mathematically locked in. Three staggered bursts (0s, 0.25s, 0.55s
      // after) layered with confetti + emoji rain, pointing the camera/eye straight at
      // "you owe coffee".
      const burstFrame1 = loserDecidedFrame;
      const burstFrame2 = loserDecidedFrame + Math.floor(fps * 0.25);
      const burstFrame3 = loserDecidedFrame + Math.floor(fps * 0.55);
      for (let f = lastProcessedFrame + 1; f <= idx; f++) {
        if (loserIdx < 0) continue;
        const isB1 = f === burstFrame1;
        const isB2 = f === burstFrame2;
        const isB3 = f === burstFrame3;
        if (!isB1 && !isB2 && !isB3) continue;
        const wx = replay.frames[Math.min(f, replay.frames.length - 1)][loserIdx * 2];
        const wy = replay.frames[Math.min(f, replay.frames.length - 1)][loserIdx * 2 + 1];
        const color = playerByToken.get(replay.playerOrder[loserIdx])?.color ?? '#fbbf24';
        const intensity = isB1 ? 1.0 : isB2 ? 0.75 : 0.55;
        spawnFinishBurst(mainPane.particles, wx, wy, color, intensity);
        spawnFinishBurst(insetPane.particles, wx, wy, color, intensity);
        if (isB1) {
          mainPane.bursts.push({ x: wx, y: wy, age: 0, color, rankLabel: formatLoserLabel() });
          insetPane.bursts.push({ x: wx, y: wy, age: 0, color, rankLabel: formatLoserLabel() });
        }
        mainPane.pulse = Math.max(mainPane.pulse, isB1 ? 2.5 : 1.4);
        insetPane.pulse = Math.max(insetPane.pulse, isB1 ? 2.5 : 1.4);
        mainPane.shake = Math.max(mainPane.shake, isB1 ? 1.8 : 0.9);
        insetPane.shake = Math.max(insetPane.shake, isB1 ? 1.8 : 0.9);
      }
      lastProcessedFrame = idx;

      // Layout: main fills full canvas; inset is top-right ~32% wide × 28% tall
      mainPane.px = 0;
      mainPane.py = 0;
      mainPane.pw = W;
      mainPane.ph = H;
      const insetW = Math.floor(W * 0.36);
      const insetH = Math.floor(H * 0.32);
      const insetMargin = 8 * dpr;
      insetPane.px = W - insetW - insetMargin;
      insetPane.py = insetMargin;
      insetPane.pw = insetW;
      insetPane.ph = insetH;

      // Camera target: when I'm done, follow the live 꼴등 candidate. Otherwise follow myself.
      // The actual cam values ease toward these targets so the view glides instead of snapping
      // (lazygyu's `cur + (target - cur) * factor` per frame, made framerate-independent here).
      const targetMainY = iAmFinished ? liveLoserY : myYNow;
      const targetInsetY = liveLoserY;
      const targetMainZoom = computeZoom(targetMainY, replay.zoomY);
      const targetInsetZoom = computeZoom(targetInsetY, replay.zoomY);
      if (!camInit) {
        camY = targetMainY; camZoom = targetMainZoom;
        insetCamY = targetInsetY; insetCamZoom = targetInsetZoom;
        camInit = true;
      } else {
        const k = 1 - Math.exp(-dtSec * CAMERA_EASE_RATE);
        camY += (targetMainY - camY) * k;
        camZoom += (targetMainZoom - camZoom) * k;
        insetCamY += (targetInsetY - insetCamY) * k;
        insetCamZoom += (targetInsetZoom - insetCamZoom) * k;
      }

      // Background
      ctx.fillStyle = '#0b0b10';
      ctx.fillRect(0, 0, W, H);

      // --- Draw main pane (with screen shake) ---
      mainPane.label = iAmFinished
        ? '내 공 도착 ✓ · 꼴등 시점'
        : iAmLoserCandidate
          ? '내 공 (위험! 꼴등 후보)'
          : '내 공 시점';
      const mainShakeX = mainPane.shake > 0 ? (Math.random() - 0.5) * mainPane.shake * 8 * dpr : 0;
      const mainShakeY = mainPane.shake > 0 ? (Math.random() - 0.5) * mainPane.shake * 8 * dpr : 0;
      ctx.save();
      if (mainShakeX || mainShakeY) ctx.translate(mainShakeX, mainShakeY);
      drawScene(ctx, mainPane, camY, camZoom, dpr, replay, cur, next, tFrac, elapsedSec, playerByToken, myPlayerToken, polylineEntities, sortedEntities, sortedYs, labelWidths);
      drawParticles(ctx, mainPane, dtSec, dpr, camY, camZoom, replay.bounds);
      ctx.restore();
      drawPaneFrame(ctx, mainPane, dpr, true);

      // --- Draw inset pane (only when meaningfully different from main) ---
      const showInset = !iAmFinished && myIdx !== liveLoserIdx;
      if (showInset) {
        // Clip to the inset rect
        ctx.save();
        roundedClip(ctx, insetPane.px, insetPane.py, insetPane.pw, insetPane.ph, 10 * dpr);
        ctx.fillStyle = '#0b0b10';
        ctx.fillRect(insetPane.px, insetPane.py, insetPane.pw, insetPane.ph);
        drawScene(ctx, insetPane, insetCamY, insetCamZoom, dpr, replay, cur, next, tFrac, elapsedSec, playerByToken, myPlayerToken, polylineEntities, sortedEntities, sortedYs, labelWidths);
        drawParticles(ctx, insetPane, dtSec, dpr, insetCamY, insetCamZoom, replay.bounds);
        ctx.restore();
        drawPaneFrame(ctx, insetPane, dpr, false);
      } else {
        // still tick particles to drain them
        insetPane.particles.length = 0;
      }

      // --- Live leaderboard (left side) ---
      drawLeaderboard(ctx, dpr, W, H, replay, cur, idx, playerByToken, myPlayerToken);

      // --- Loser-name reveal banner (everyone sees it, swoops in at decision moment) ---
      if (loserDecidedFrame >= 0 && idx >= loserDecidedFrame && loserIdx >= 0) {
        const loserNick = playerByToken.get(replay.playerOrder[loserIdx])?.nickname ?? '';
        const loserColor = playerByToken.get(replay.playerOrder[loserIdx])?.color ?? '#fbbf24';
        drawLoserBanner(ctx, dpr, W, H, loserNick, loserColor, idx - loserDecidedFrame, fps, now);
      }

      // --- Personal rank card (centered top, bouncy entry once my rank is locked) ---
      if (myFinishLockedFrame >= 0 && idx >= myFinishLockedFrame && myRank > 0) {
        drawPersonalRankCard(ctx, dpr, W, H, myRank, totalPlayers, idx - myFinishLockedFrame, fps, now);
      }

      // pulse + shake decay (slower decay so the loser fanfare lingers)
      mainPane.pulse = Math.max(0, mainPane.pulse - dtSec * 1.2);
      insetPane.pulse = Math.max(0, insetPane.pulse - dtSec * 1.2);
      mainPane.shake = Math.max(0, mainPane.shake - dtSec * 3);
      insetPane.shake = Math.max(0, insetPane.shake - dtSec * 3);

      if (elapsed < durationMs + 1500) {
        raf = requestAnimationFrame(draw);
      }
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [startAt, durationMs, replay, players, myPlayerToken]);

  return (
    <div ref={wrapperRef} className="absolute inset-0 bg-zinc-950">
      <canvas ref={canvasRef} />
    </div>
  );
}

// --- helpers ---

function computeZoom(camY: number, zoomY: number): number {
  const dist = Math.abs(zoomY - camY);
  if (dist >= ZOOM_THRESHOLD) return 1;
  const t = 1 - dist / ZOOM_THRESHOLD;
  return 1 + t * (ZOOM_MAX - 1);
}

function elapsedToFrameF(
  elapsedMs: number,
  cumMs: Float64Array,
  frameDurations: number[],
  totalFrames: number,
): number {
  if (elapsedMs <= 0) return 0;
  const total = cumMs[cumMs.length - 1];
  if (elapsedMs >= total) return totalFrames - 1;
  // Binary search: largest N with cumMs[N] <= elapsedMs (cumMs[N] is time at start of frame N).
  let lo = 0, hi = cumMs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (cumMs[mid] <= elapsedMs) lo = mid;
    else hi = mid - 1;
  }
  const frameStart = cumMs[lo];
  const frac = (elapsedMs - frameStart) / frameDurations[lo];
  return lo + Math.min(0.9999, frac);
}

function formatLoserLabel(): string {
  return '☕ 꼴찌!';
}

function spawnFinishBurst(pool: Particle[], x: number, y: number, color: string, intensity: number) {
  const palette = [color, '#fbbf24', '#ffffff', '#f472b6', '#a3e635', '#22d3ee', '#fb923c'];
  // Confetti — much denser than the v1 fanfare (was 80) so the 꼴찌 reveal feels physical.
  const confettiCount = Math.floor(180 * intensity);
  for (let i = 0; i < confettiCount; i++) {
    const a = Math.random() * Math.PI * 2;
    const speed = 5 + Math.random() * 14;
    const life = 1.4 + Math.random() * 1.4;
    pool.push({
      x,
      y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed - 4,
      life,
      totalLife: life,
      color: palette[Math.floor(Math.random() * palette.length)],
      size: 0.18 + Math.random() * 0.30,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 14,
    });
  }
  // Emoji rain — coffee, money flying, laughing emojis. Sparse but big.
  const emojis = ['☕', '💸', '😂', '🎉', '✨', '☕', '☕'];
  const emojiCount = Math.floor(28 * intensity);
  for (let i = 0; i < emojiCount; i++) {
    const a = Math.random() * Math.PI * 2;
    const speed = 3 + Math.random() * 8;
    const life = 1.8 + Math.random() * 1.6;
    pool.push({
      x,
      y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed - 5,
      life,
      totalLife: life,
      color: '#ffffff',
      size: 0.55 + Math.random() * 0.45,
      rot: 0,
      vrot: (Math.random() - 0.5) * 4,
      emoji: emojis[Math.floor(Math.random() * emojis.length)],
    });
  }
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  pane: Pane,
  camY: number,
  zoom: number,
  dpr: number,
  replay: SimulationResult,
  cur: number[],
  next: number[],
  tFrac: number,
  elapsedSec: number,
  playerByToken: Map<string, { color: string; nickname: string }>,
  myPlayerToken: string | null,
  polylineEntities: SimulationResult['entities'],
  sortedEntities: SimulationResult['entities'],
  sortedYs: number[],
  labelWidths: Map<string, number>,
) {
  const { px, py, pw, ph } = pane;
  // Coordinate system: fit width with zoom
  const trackXSpan = Math.max(replay.bounds.maxX - replay.bounds.minX, 16);
  const baseScale = Math.min(pw / trackXSpan, ph / VIEW_HEIGHT_METERS);
  const scale = baseScale * zoom;
  const trackCenterX = (replay.bounds.minX + replay.bounds.maxX) / 2;
  const offsetX = px + pw / 2 - trackCenterX * scale;
  const offsetY = py + ph * 0.55 - camY * scale; // camera centered at 55% from top

  const toPx = (wx: number, wy: number) => [wx * scale + offsetX, wy * scale + offsetY] as const;

  // Set clip to pane to keep drawing inside
  ctx.save();
  ctx.beginPath();
  ctx.rect(px, py, pw, ph);
  ctx.clip();

  // Polylines: long static walls; iterate all (only ~22).
  ctx.strokeStyle = '#e4e4e7';
  ctx.lineWidth = Math.max(2, scale * 0.12);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const e of polylineEntities) {
    if (e.shape.type !== 'polyline') continue;
    const ex = e.x;
    const ey = e.y;
    const points = e.shape.points;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < points.length; i++) {
      const [px2, py2] = points[i];
      const sxp = (ex + px2) * scale + offsetX;
      const syp = (ey + py2) * scale + offsetY;
      if (syp < py - 50 || syp > py + ph + 50) {
        // Cull: only break the path if the neighboring point is also off-screen,
        // otherwise we'd drop the segment that crosses the viewport edge.
        const np = points[i + 1];
        const pp = points[i - 1];
        const nextOff = !np || (ey + np[1]) * scale + offsetY < py - 50 || (ey + np[1]) * scale + offsetY > py + ph + 50;
        const prevOff = !pp || (ey + pp[1]) * scale + offsetY < py - 50 || (ey + pp[1]) * scale + offsetY > py + ph + 50;
        if (nextOff && prevOff) {
          if (started) {
            ctx.stroke();
            ctx.beginPath();
            started = false;
          }
          continue;
        }
      }
      if (!started) {
        ctx.moveTo(sxp, syp);
        started = true;
      } else {
        ctx.lineTo(sxp, syp);
      }
    }
    if (started) ctx.stroke();
  }

  // Boxes + circles: binary-search the visible Y window so we skip ~80% of pegs every frame.
  // Margin of 50px in pixel space converts to a small Y margin in world space.
  const halfWorldH = ph / scale / 2 + 50 / scale;
  const yMin = camY - halfWorldH;
  const yMax = camY + halfWorldH;
  const startIdx = lowerBound(sortedYs, yMin);
  const endIdx = upperBound(sortedYs, yMax);

  // Cache linear gradients for box pegs by pixel width — there are only ~6 unique widths,
  // so we go from 172 createLinearGradient calls per frame down to ~6.
  const boxGradCache = new Map<number, CanvasGradient>();
  for (let k = startIdx; k < endIdx; k++) {
    const e = sortedEntities[k];
    const ex = e.x;
    const ey = e.y;
    if (e.shape.type === 'box') {
      const angle = e.angularVelocity * elapsedSec + e.shape.rotation;
      const sxp = ex * scale + offsetX;
      const syp = ey * scale + offsetY;
      const w = e.shape.width * scale * 2;
      const h = e.shape.height * scale * 2;
      let grad = boxGradCache.get(w);
      if (!grad) {
        grad = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
        grad.addColorStop(0, '#0ea5b8');
        grad.addColorStop(0.5, '#22d3ee');
        grad.addColorStop(1, '#0ea5b8');
        boxGradCache.set(w, grad);
      }
      ctx.save();
      ctx.translate(sxp, syp);
      ctx.rotate(angle);
      ctx.fillStyle = grad;
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.restore();
    } else if (e.shape.type === 'circle') {
      const sxp = ex * scale + offsetX;
      const syp = ey * scale + offsetY;
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.arc(sxp, syp, e.shape.radius * scale, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Goal line
  const [, goalPy] = toPx(0, replay.goalY);
  if (goalPy >= py - 10 && goalPy <= py + ph + 10) {
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(px, goalPy - 2 * dpr, pw, 4 * dpr);
    ctx.font = `bold ${12 * dpr}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fbbf24';
    ctx.fillText('FINISH', px + pw / 2, goalPy - 8 * dpr);
  }

  // Marbles
  const r = MARBLE_RADIUS * scale;
  ctx.font = `bold ${14 * dpr}px sans-serif`;
  ctx.textAlign = 'center';
  for (let i = 0; i < replay.playerOrder.length; i++) {
    const token = replay.playerOrder[i];
    const player = playerByToken.get(token);
    const xA = cur[i * 2];
    const yA = cur[i * 2 + 1];
    const xB = next[i * 2];
    const yB = next[i * 2 + 1];
    const x = lerp(xA, xB, tFrac);
    const y = lerp(yA, yB, tFrac);
    const sxp = x * scale + offsetX;
    const syp = y * scale + offsetY;
    if (syp < py - 30 || syp > py + ph + 30) continue;

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.arc(sxp + 1.5 * dpr, syp + 2 * dpr, r, 0, Math.PI * 2);
    ctx.fill();

    // body
    const isMe = token === myPlayerToken;
    ctx.fillStyle = player?.color ?? '#aaa';
    ctx.beginPath();
    ctx.arc(sxp, syp, r, 0, Math.PI * 2);
    ctx.fill();

    if (isMe) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.arc(sxp, syp, r + 2 * dpr, 0, Math.PI * 2);
      ctx.stroke();
    }

    // label above marble — width pre-measured at mount, no per-frame measureText
    const label = player?.nickname ?? '';
    const labelW = (labelWidths.get(token) ?? 0) + 10 * dpr;
    const labelH = 19 * dpr;
    const labelY = syp - r - labelH - 3 * dpr;
    ctx.fillStyle = isMe ? '#fbbf24' : 'rgba(0,0,0,0.7)';
    roundRect(ctx, sxp - labelW / 2, labelY, labelW, labelH, 5 * dpr);
    ctx.fill();
    ctx.fillStyle = isMe ? '#0b0b10' : '#ffffff';
    ctx.fillText(label, sxp, labelY + 14 * dpr);
  }

  ctx.restore();
}

function drawParticles(
  ctx: CanvasRenderingContext2D,
  pane: Pane,
  dtSec: number,
  dpr: number,
  camY: number,
  zoom: number,
  bounds: { minX: number; maxX: number },
) {
  const { px, py, pw, ph, particles, bursts } = pane;
  const trackXSpan = Math.max(bounds.maxX - bounds.minX, 16);
  const baseScale = Math.min(pw / trackXSpan, ph / VIEW_HEIGHT_METERS);
  const scale = baseScale * zoom;
  const trackCenterX = (bounds.minX + bounds.maxX) / 2;
  const offsetX = px + pw / 2 - trackCenterX * scale;
  const offsetY = py + ph * 0.55 - camY * scale;
  const toPx = (wx: number, wy: number) => [wx * scale + offsetX, wy * scale + offsetY] as const;

  ctx.save();
  ctx.beginPath();
  ctx.rect(px, py, pw, ph);
  ctx.clip();

  // --- Bursts: flash + expanding ring + rank badge floating up ---
  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i];
    b.age += dtSec;
    const t = b.age;
    if (t > 1.6) {
      bursts.splice(i, 1);
      continue;
    }
    const [bxp, byp] = toPx(b.x, b.y);
    if (bxp < px - 200 || bxp > px + pw + 200 || byp < py - 200 || byp > py + ph + 200) continue;
    // Flash (very brief)
    if (t < 0.18) {
      const flashAlpha = (1 - t / 0.18) * 0.7;
      const grad = ctx.createRadialGradient(bxp, byp, 0, bxp, byp, scale * 6);
      grad.addColorStop(0, `rgba(255,255,255,${flashAlpha})`);
      grad.addColorStop(0.6, `rgba(255,255,200,${flashAlpha * 0.3})`);
      grad.addColorStop(1, 'rgba(255,255,200,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(px, py, pw, ph);
    }
    // Expanding ring (sonar) — clamp ringT to [0,1] in case t briefly goes negative due to timer skew.
    const ringT = Math.max(0, Math.min(1, t / 0.7));
    const ringR = ringT * scale * 5;
    const ringAlpha = (1 - ringT) * 0.9;
    ctx.strokeStyle = `rgba(255,255,255,${ringAlpha})`;
    ctx.lineWidth = 3 * dpr;
    ctx.beginPath();
    ctx.arc(bxp, byp, ringR, 0, Math.PI * 2);
    ctx.stroke();
    // Inner colored ring
    ctx.strokeStyle = b.color;
    ctx.globalAlpha = ringAlpha;
    ctx.lineWidth = 5 * dpr;
    ctx.beginPath();
    ctx.arc(bxp, byp, ringR * 0.7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // Sun rays (for top ranks only — implied by big burst)
    // Rank badge floats up
    const badgeY = byp - scale * 1.5 - t * 60 * dpr;
    const badgeAlpha = Math.max(0, 1 - Math.max(0, t - 0.3) / 1.3);
    ctx.globalAlpha = badgeAlpha;
    ctx.font = `bold ${22 * dpr}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 4 * dpr;
    ctx.strokeStyle = '#0b0b10';
    ctx.strokeText(b.rankLabel, bxp, badgeY);
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(b.rankLabel, bxp, badgeY);
    ctx.globalAlpha = 1;
  }

  // --- Confetti particles ---
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dtSec;
    if (p.life <= 0) {
      particles.splice(i, 1);
      continue;
    }
    p.vy += 12 * dtSec; // gravity m/s²
    p.x += p.vx * dtSec;
    p.y += p.vy * dtSec;
    p.rot += p.vrot * dtSec;
    const [sxp, syp] = toPx(p.x, p.y);
    if (syp < py - 30 || syp > py + ph + 30) continue;
    const alpha = Math.max(0, p.life / p.totalLife);
    ctx.globalAlpha = alpha;
    ctx.save();
    ctx.translate(sxp, syp);
    ctx.rotate(p.rot);
    if (p.emoji) {
      // Emoji particle: render as text. Size ~doubled vs confetti for readability.
      const fontPx = Math.max(18 * dpr, p.size * scale * 1.6);
      ctx.font = `${fontPx}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.emoji, 0, 0);
    } else {
      ctx.fillStyle = p.color;
      const sz = Math.max(3 * dpr, p.size * scale);
      ctx.fillRect(-sz / 2, -sz / 4, sz, sz / 2);
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawLeaderboard(
  ctx: CanvasRenderingContext2D,
  dpr: number,
  W: number,
  H: number,
  replay: SimulationResult,
  cur: number[],
  curFrame: number,
  playerByToken: Map<string, { color: string; nickname: string }>,
  myPlayerToken: string | null,
) {
  // Compose ranks: finished marbles by their finish frame ASC, then active by current y DESC
  type Row = { token: string; rank: number; finished: boolean };
  const rows: Row[] = [];
  const finishers: { token: string; finishFrame: number }[] = [];
  const active: { token: string; y: number }[] = [];
  for (let i = 0; i < replay.playerOrder.length; i++) {
    const f = replay.finishFrames[i];
    if (f >= 0 && f <= curFrame) {
      finishers.push({ token: replay.playerOrder[i], finishFrame: f });
    } else {
      active.push({ token: replay.playerOrder[i], y: cur[i * 2 + 1] });
    }
  }
  finishers.sort((a, b) => a.finishFrame - b.finishFrame);
  active.sort((a, b) => b.y - a.y);
  for (const f of finishers) rows.push({ token: f.token, rank: rows.length + 1, finished: true });
  for (const a of active) rows.push({ token: a.token, rank: rows.length + 1, finished: false });

  const rowH = 36 * dpr;
  const padding = 8 * dpr;
  const panelW = Math.min(170 * dpr, W * 0.4);
  const panelX = 8 * dpr;
  // Push below the top-left "내 공 시점" pane label so they don't overlap.
  const panelY = 56 * dpr;
  const panelH = padding * 2 + rowH * rows.length;

  // Background
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  roundRectPath(ctx, panelX, panelY, panelW, panelH, 10 * dpr);
  ctx.fill();

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const player = playerByToken.get(r.token);
    const ry = panelY + padding + i * rowH;
    const isMe = r.token === myPlayerToken;

    // Row background highlight for me
    if (isMe) {
      ctx.fillStyle = 'rgba(251,191,36,0.2)';
      ctx.fillRect(panelX + 2, ry + 1, panelW - 4, rowH - 2);
    }

    // Rank number
    ctx.font = `bold ${16 * dpr}px sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillStyle = r.rank === 1 ? '#fbbf24' : r.rank === 2 ? '#cbd5e1' : r.rank === 3 ? '#fb923c' : '#9ca3af';
    ctx.fillText(`${r.rank}`, panelX + 26 * dpr, ry + 24 * dpr);

    // Color dot
    ctx.fillStyle = player?.color ?? '#666';
    ctx.beginPath();
    ctx.arc(panelX + 40 * dpr, ry + rowH / 2, 7 * dpr, 0, Math.PI * 2);
    ctx.fill();

    // Nickname
    ctx.font = `${15 * dpr}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillStyle = isMe ? '#fbbf24' : r.finished ? 'rgba(255,255,255,0.55)' : '#ffffff';
    const nameMaxW = panelW - 68 * dpr - (r.finished ? 18 * dpr : 0);
    const name = ellipsize(ctx, player?.nickname ?? '', nameMaxW);
    ctx.fillText(name, panelX + 54 * dpr, ry + 24 * dpr);

    // Finished check mark
    if (r.finished) {
      ctx.font = `${14 * dpr}px sans-serif`;
      ctx.textAlign = 'right';
      ctx.fillStyle = '#10b981';
      ctx.fillText('✓', panelX + panelW - 8 * dpr, ry + 24 * dpr);
    }
  }
}

function drawPersonalRankCard(
  ctx: CanvasRenderingContext2D,
  dpr: number,
  W: number,
  H: number,
  rank: number,
  total: number,
  framesSinceLocked: number,
  fps: number,
  nowMs: number,
) {
  // Animation: ease-out-back over 0.45s gives the bouncy "pop" entry. After that,
  // a tiny shimmer pulse keeps the card alive instead of going static.
  const animT = Math.min(1, Math.max(0, framesSinceLocked / Math.max(1, fps * 0.45)));
  if (animT <= 0) return;
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const easedT = 1 + c3 * Math.pow(animT - 1, 3) + c1 * Math.pow(animT - 1, 2);
  const breathe = 1 + 0.025 * Math.sin(nowMs * 0.005);
  const scale = easedT * breathe;
  const alpha = Math.min(1, animT * 1.6);

  const isFirst = rank === 1;
  const isLast = rank === total;
  const isMid = !isFirst && !isLast;

  // Tier styling — gold for 1st (gradient), red for loser (with pulsing glow), dark
  // for everyone in the middle (with the player's accent).
  let bgTop: string, bgBottom: string, borderColor: string, headlineColor: string, subColor: string, glowColor: string;
  if (isFirst) {
    bgTop = '#fde68a';
    bgBottom = '#f59e0b';
    borderColor = '#78350f';
    headlineColor = '#451a03';
    subColor = 'rgba(69,26,3,0.75)';
    glowColor = 'rgba(251,191,36,0.85)';
  } else if (isLast) {
    bgTop = '#ef4444';
    bgBottom = '#991b1b';
    borderColor = '#fff';
    headlineColor = '#fff';
    subColor = 'rgba(255,255,255,0.85)';
    glowColor = 'rgba(239,68,68,0.95)';
  } else {
    bgTop = '#1f2937';
    bgBottom = '#0f172a';
    borderColor = '#fbbf24';
    headlineColor = '#fbbf24';
    subColor = 'rgba(255,255,255,0.75)';
    glowColor = 'rgba(251,191,36,0.55)';
  }

  const headline = isFirst ? ko.game.myRankFirst : isLast ? ko.game.myRankLast : ko.game.myRankMid(rank);
  const subtitle = isFirst
    ? ko.game.myRankSubFirst
    : isLast
      ? ko.game.myRankSubLast
      : ko.game.myRankSubMid(total);

  const cardW = 360 * dpr;
  const cardH = 140 * dpr;
  const cx = W / 2;
  const cy = H * 0.24;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.translate(-cx, -cy);

  // Outer glow: stronger pulse for the loser
  const glowPulse = isLast ? 22 + 14 * Math.abs(Math.sin(nowMs * 0.008)) : 18;
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = glowPulse * dpr;

  // Background gradient (vertical)
  const bgGrad = ctx.createLinearGradient(0, cy - cardH / 2, 0, cy + cardH / 2);
  bgGrad.addColorStop(0, bgTop);
  bgGrad.addColorStop(1, bgBottom);
  ctx.fillStyle = bgGrad;
  roundRect(ctx, cx - cardW / 2, cy - cardH / 2, cardW, cardH, 18 * dpr);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Border
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 3 * dpr;
  roundRectPath(ctx, cx - cardW / 2, cy - cardH / 2, cardW, cardH, 18 * dpr);
  ctx.stroke();

  // Subtle highlight band across the top (glassy sheen)
  const sheen = ctx.createLinearGradient(0, cy - cardH / 2, 0, cy);
  sheen.addColorStop(0, 'rgba(255,255,255,0.35)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  roundRect(ctx, cx - cardW / 2 + 2, cy - cardH / 2 + 2, cardW - 4, cardH / 2 - 2, 16 * dpr);
  ctx.fill();

  // Headline
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = headlineColor;
  ctx.font = `bold ${isMid ? 38 : 34}px sans-serif`;
  // Re-set with dpr-correct size
  ctx.font = `bold ${(isMid ? 38 : 34) * dpr}px sans-serif`;
  ctx.fillText(headline, cx, cy - 14 * dpr);

  // Subtitle
  ctx.font = `${15 * dpr}px sans-serif`;
  ctx.fillStyle = subColor;
  ctx.fillText(subtitle, cx, cy + 28 * dpr);

  ctx.restore();
}

function drawLoserBanner(
  ctx: CanvasRenderingContext2D,
  dpr: number,
  W: number,
  H: number,
  loserNick: string,
  loserColor: string,
  framesSinceDecided: number,
  fps: number,
  nowMs: number,
) {
  // Swoop down from above with a bouncy ease, then breathe with a soft pulse.
  const animT = Math.min(1, Math.max(0, framesSinceDecided / Math.max(1, fps * 0.55)));
  if (animT <= 0) return;
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const eased = 1 + c3 * Math.pow(animT - 1, 3) + c1 * Math.pow(animT - 1, 2);
  const slideY = (1 - eased) * -140 * dpr;
  const alpha = Math.min(1, animT * 2);
  const breathe = 1 + 0.025 * Math.sin(nowMs * 0.005);

  // Width = measure nickname + coffee icon + comfortable padding, capped to viewport.
  const cx = W / 2;
  const cy = H * 0.6 + slideY;
  const bannerH = 138 * dpr;
  const cornerR = 20 * dpr;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);
  ctx.scale(breathe, breathe);
  ctx.translate(-cx, -cy);

  // Compute width based on text content
  ctx.font = `bold ${44 * dpr}px sans-serif`;
  const nickW = ctx.measureText(`☕ ${loserNick}`).width;
  const bannerW = Math.min(W * 0.92, Math.max(360 * dpr, nickW + 96 * dpr));
  const left = cx - bannerW / 2;
  const top = cy - bannerH / 2;

  // Strong pulsing red glow — this is the climactic loser reveal
  const glowAmt = 28 + 18 * Math.abs(Math.sin(nowMs * 0.008));
  ctx.shadowColor = 'rgba(239,68,68,0.95)';
  ctx.shadowBlur = glowAmt * dpr;

  // Vertical red gradient — matches the loser rank card (visual consistency)
  const bgGrad = ctx.createLinearGradient(0, top, 0, top + bannerH);
  bgGrad.addColorStop(0, '#ef4444');
  bgGrad.addColorStop(0.55, '#b91c1c');
  bgGrad.addColorStop(1, '#7f1d1d');
  ctx.fillStyle = bgGrad;
  roundRect(ctx, left, top, bannerW, bannerH, cornerR);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Glossy sheen across top half (frosted highlight)
  const sheen = ctx.createLinearGradient(0, top, 0, top + bannerH * 0.5);
  sheen.addColorStop(0, 'rgba(255,255,255,0.28)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  roundRect(ctx, left + 2, top + 2, bannerW - 4, bannerH * 0.5 - 2, cornerR - 4);
  ctx.fill();

  // White outer border
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 3 * dpr;
  roundRectPath(ctx, left, top, bannerW, bannerH, cornerR);
  ctx.stroke();

  // Top "꼴찌 결정!" badge — uses the loser's marble color so they're visually tagged
  const badgeText = ko.game.loserRevealedBadge;
  ctx.font = `bold ${13 * dpr}px sans-serif`;
  const badgeTextW = ctx.measureText(badgeText).width;
  const badgePadX = 12 * dpr;
  const badgeW = badgeTextW + badgePadX * 2;
  const badgeH = 24 * dpr;
  const badgeX = cx - badgeW / 2;
  const badgeY = top - badgeH / 2 + 4 * dpr;
  ctx.fillStyle = loserColor;
  ctx.shadowColor = loserColor;
  ctx.shadowBlur = 12 * dpr;
  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, badgeH / 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5 * dpr;
  roundRectPath(ctx, badgeX, badgeY, badgeW, badgeH, badgeH / 2);
  ctx.stroke();
  ctx.fillStyle = '#0b0b10';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(badgeText, cx, badgeY + badgeH / 2 + 1 * dpr);

  // Main line: ☕ + nickname, big & bold with dark outline for punch
  ctx.font = `bold ${44 * dpr}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 5 * dpr;
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.strokeText(`☕ ${loserNick}`, cx, cy - 4 * dpr);
  ctx.fillStyle = '#fff';
  ctx.fillText(`☕ ${loserNick}`, cx, cy - 4 * dpr);

  // Subtitle
  ctx.font = `${16 * dpr}px sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fillText(ko.game.loserRevealedSub, cx, cy + 38 * dpr);

  ctx.restore();
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    const candidate = text.slice(0, mid) + '…';
    if (ctx.measureText(candidate).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + '…';
}

function drawPaneFrame(ctx: CanvasRenderingContext2D, pane: Pane, dpr: number, isMain: boolean) {
  const { px, py, pw, ph, label, pulse } = pane;
  // Border
  if (!isMain) {
    ctx.strokeStyle = pulse > 0.05 ? '#fbbf24' : 'rgba(255,255,255,0.45)';
    ctx.lineWidth = (pulse > 0.05 ? 3 : 1.5) * dpr;
    roundRectPath(ctx, px, py, pw, ph, 10 * dpr);
    ctx.stroke();
  }
  // Label badge top-left of pane
  if (label) {
    ctx.font = `bold ${11 * dpr}px sans-serif`;
    ctx.textAlign = 'left';
    const padding = 8 * dpr;
    const textW = ctx.measureText(label).width;
    const badgeW = textW + padding * 2;
    const badgeH = 22 * dpr;
    const bx = px + 8 * dpr;
    const by = py + 8 * dpr;
    ctx.fillStyle = pulse > 0.05 ? 'rgba(251,191,36,0.95)' : 'rgba(0,0,0,0.65)';
    roundRect(ctx, bx, by, badgeW, badgeH, 6 * dpr);
    ctx.fill();
    ctx.fillStyle = pulse > 0.05 ? '#0b0b10' : '#ffffff';
    ctx.fillText(label, bx + padding, by + badgeH * 0.7);
  }
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function roundedClip(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  roundRectPath(ctx, x, y, w, h, r);
  ctx.clip();
}
function lowerBound(arr: number[], target: number): number {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
function upperBound(arr: number[], target: number): number {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
