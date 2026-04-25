'use client';

import { useEffect, useRef } from 'react';
import type { SimulationResult } from './sim';

const MARBLE_RADIUS = 0.25; // box2d meters, matches lazygyu
const VIEW_HEIGHT_METERS = 22; // baseline meters of vertical track shown
const ZOOM_THRESHOLD = 8; // meters from zoomY where the camera starts zooming in
const ZOOM_MAX = 2.6; // max zoom multiplier near goal

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
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);

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

    // Track which finish frames have been "consumed" for fanfare so we spawn each only once.
    let lastProcessedFrame = -1;

    // Two panes: main (my marble) and inset (current leader). Both share the same draw routine.
    const mainPane: Pane = { px: 0, py: 0, pw: 0, ph: 0, label: '', particles: [], bursts: [], pulse: 0, shake: 0 };
    const insetPane: Pane = { px: 0, py: 0, pw: 0, ph: 0, label: '1등 시점', particles: [], bursts: [], pulse: 0, shake: 0 };

    let raf = 0;
    let lastT = performance.now();
    const draw = (now: number) => {
      const dtSec = Math.min(0.05, (now - lastT) / 1000); // clamp jank
      lastT = now;

      const elapsed = Math.max(0, Date.now() - startAt);
      const frameF = elapsedToFrameF(elapsed, fps, replay.slowRanges, replay.slowFactor, totalFrames);
      const idx = Math.min(totalFrames - 1, Math.max(0, Math.floor(frameF)));
      const tFrac = Math.min(1, Math.max(0, frameF - idx));
      const cur = replay.frames[idx];
      const next = replay.frames[Math.min(totalFrames - 1, idx + 1)];

      // For animations that depend on real wall-clock (like rotor angles), use the in-sim seconds
      // rather than wall-clock — keeps rotors in sync with marbles during slow-mo.
      const elapsedSec = frameF / fps;

      const W = canvas.width;
      const H = canvas.height;

      // Decide leader (max y across all marbles)
      let leaderY = 0;
      let leaderIdx = 0;
      for (let i = 0; i < replay.playerOrder.length; i++) {
        const yv = cur[i * 2 + 1];
        if (yv > leaderY) {
          leaderY = yv;
          leaderIdx = i;
        }
      }

      // My marble's current position (or leader if I haven't joined / am finished)
      const iAmFinished = myIdx >= 0 && replay.finishFrames[myIdx] >= 0 && idx >= replay.finishFrames[myIdx] + 5;
      const iAmLeader = myIdx === leaderIdx && !iAmFinished;
      const myYNow = myIdx >= 0 ? cur[myIdx * 2 + 1] : leaderY;

      // Detect new finish events for fanfare
      for (let f = lastProcessedFrame + 1; f <= idx; f++) {
        for (let i = 0; i < replay.finishFrames.length; i++) {
          if (replay.finishFrames[i] === f) {
            const wx = replay.frames[f][i * 2];
            const wy = replay.frames[f][i * 2 + 1];
            const color = playerByToken.get(replay.playerOrder[i])?.color ?? '#fbbf24';
            // Determine rank: index of this token in finishOrder + 1
            const rank = replay.finishOrder.indexOf(replay.playerOrder[i]) + 1;
            const rankLabel = formatRankLabel(rank, replay.playerOrder.length);
            spawnFinishBurst(mainPane.particles, wx, wy, color, rank);
            spawnFinishBurst(insetPane.particles, wx, wy, color, rank);
            mainPane.bursts.push({ x: wx, y: wy, age: 0, color, rankLabel });
            insetPane.bursts.push({ x: wx, y: wy, age: 0, color, rankLabel });
            const pulseStrength = rank === 1 ? 1.5 : 1;
            mainPane.pulse = Math.max(mainPane.pulse, pulseStrength);
            insetPane.pulse = Math.max(insetPane.pulse, pulseStrength);
            mainPane.shake = Math.max(mainPane.shake, rank === 1 ? 1 : 0.5);
            insetPane.shake = Math.max(insetPane.shake, rank === 1 ? 1 : 0.5);
          }
        }
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

      // Camera Ys
      const mainCamCenterY = iAmFinished || iAmLeader ? leaderY : myYNow;
      const insetCamCenterY = leaderY;

      // Zoom multiplier: ramps up as the relevant Y gets close to zoomY
      const mainZoom = computeZoom(mainCamCenterY, replay.zoomY);
      const insetZoom = computeZoom(insetCamCenterY, replay.zoomY);

      // Background
      ctx.fillStyle = '#0b0b10';
      ctx.fillRect(0, 0, W, H);

      // --- Draw main pane (with screen shake) ---
      mainPane.label = iAmFinished
        ? '내 공 도착 ✓ · 1등 시점'
        : iAmLeader
          ? '내 공 (1등!)'
          : '내 공 시점';
      const mainShakeX = (Math.random() - 0.5) * mainPane.shake * 8 * dpr;
      const mainShakeY = (Math.random() - 0.5) * mainPane.shake * 8 * dpr;
      ctx.save();
      ctx.translate(mainShakeX, mainShakeY);
      drawScene(ctx, mainPane, mainCamCenterY, mainZoom, dpr, replay, cur, next, tFrac, elapsedSec, playerByToken, myPlayerToken);
      drawParticles(ctx, mainPane, dtSec, dpr, mainCamCenterY, mainZoom, replay.bounds);
      ctx.restore();
      drawPaneFrame(ctx, mainPane, dpr, true);

      // --- Draw inset pane (only when meaningfully different from main) ---
      const showInset = !iAmLeader && !iAmFinished && myIdx !== leaderIdx;
      if (showInset) {
        // Clip to the inset rect
        ctx.save();
        roundedClip(ctx, insetPane.px, insetPane.py, insetPane.pw, insetPane.ph, 10 * dpr);
        ctx.fillStyle = '#0b0b10';
        ctx.fillRect(insetPane.px, insetPane.py, insetPane.pw, insetPane.ph);
        drawScene(ctx, insetPane, insetCamCenterY, insetZoom, dpr, replay, cur, next, tFrac, elapsedSec, playerByToken, myPlayerToken);
        drawParticles(ctx, insetPane, dtSec, dpr, insetCamCenterY, insetZoom, replay.bounds);
        ctx.restore();
        drawPaneFrame(ctx, insetPane, dpr, false);
      } else {
        // still tick particles to drain them
        insetPane.particles.length = 0;
      }

      // --- Live leaderboard (left side) ---
      drawLeaderboard(ctx, dpr, W, H, replay, cur, idx, playerByToken, myPlayerToken);

      // pulse + shake decay
      mainPane.pulse = Math.max(0, mainPane.pulse - dtSec * 1.6);
      insetPane.pulse = Math.max(0, insetPane.pulse - dtSec * 1.6);
      mainPane.shake = Math.max(0, mainPane.shake - dtSec * 4);
      insetPane.shake = Math.max(0, insetPane.shake - dtSec * 4);

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
  fps: number,
  slowRanges: [number, number][],
  slowFactor: number,
  totalFrames: number,
): number {
  const realFrameMs = 1000 / fps;
  const slowFrameMs = realFrameMs / slowFactor;
  let frameCursor = 0;
  let timeCursor = 0;
  for (const [s, e] of slowRanges) {
    // Normal-speed segment up to range start
    const normalFrames = s - frameCursor;
    const normalMs = normalFrames * realFrameMs;
    if (elapsedMs <= timeCursor + normalMs) {
      return Math.min(totalFrames - 1, frameCursor + (elapsedMs - timeCursor) / realFrameMs);
    }
    timeCursor += normalMs;
    frameCursor = s;
    // Slow-mo segment for range
    const slowFrameCount = e - s + 1;
    const slowMs = slowFrameCount * slowFrameMs;
    if (elapsedMs <= timeCursor + slowMs) {
      return Math.min(totalFrames - 1, s + (elapsedMs - timeCursor) / slowFrameMs);
    }
    timeCursor += slowMs;
    frameCursor = e + 1;
  }
  // Final normal-speed tail
  return Math.min(totalFrames - 1, frameCursor + (elapsedMs - timeCursor) / realFrameMs);
}

function formatRankLabel(rank: number, total: number): string {
  if (rank === 1) return '🏆 1등!';
  if (rank === total) return '🫣 꼴찌';
  return `${rank}등`;
}

function spawnFinishBurst(pool: Particle[], x: number, y: number, color: string, rank: number) {
  const palette = [color, '#fbbf24', '#ffffff', '#f472b6', '#a3e635'];
  // Top finishers get bigger fanfare
  const base = rank === 1 ? 80 : rank === 2 ? 55 : rank === 3 ? 45 : 32;
  for (let i = 0; i < base; i++) {
    const a = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 9;
    const life = 1.0 + Math.random() * 0.9;
    pool.push({
      x,
      y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed - 2.5,
      life,
      totalLife: life,
      color: palette[Math.floor(Math.random() * palette.length)],
      size: 0.18 + Math.random() * 0.24,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 12,
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

  // Static + kinematic entities
  for (const e of replay.entities) {
    const ex = e.x;
    const ey = e.y;
    if (e.shape.type === 'polyline') {
      ctx.strokeStyle = '#e4e4e7';
      ctx.lineWidth = Math.max(2, scale * 0.12);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < e.shape.points.length; i++) {
        const [px2, py2] = e.shape.points[i];
        const wx = ex + px2;
        const wy = ey + py2;
        const [sxp, syp] = toPx(wx, wy);
        if (syp < py - 50 && (i + 1 >= e.shape.points.length || toPx(ex + e.shape.points[i + 1][0], ey + e.shape.points[i + 1][1])[1] < py - 50)) {
          if (started) {
            ctx.stroke();
            ctx.beginPath();
            started = false;
          }
          continue;
        }
        if (!started) {
          ctx.moveTo(sxp, syp);
          started = true;
        } else {
          ctx.lineTo(sxp, syp);
        }
      }
      if (started) ctx.stroke();
    } else if (e.shape.type === 'box') {
      const angle = e.angularVelocity * elapsedSec + e.shape.rotation;
      const [sxp, syp] = toPx(ex, ey);
      if (syp < py - 50 || syp > py + ph + 50) continue;
      const w = e.shape.width * scale * 2;
      const h = e.shape.height * scale * 2;
      ctx.save();
      ctx.translate(sxp, syp);
      ctx.rotate(angle);
      const grad = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
      grad.addColorStop(0, '#0ea5b8');
      grad.addColorStop(0.5, '#22d3ee');
      grad.addColorStop(1, '#0ea5b8');
      ctx.fillStyle = grad;
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.restore();
    } else if (e.shape.type === 'circle') {
      const [sxp, syp] = toPx(ex, ey);
      if (syp < py - 50 || syp > py + ph + 50) continue;
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
  for (let i = 0; i < replay.playerOrder.length; i++) {
    const token = replay.playerOrder[i];
    const player = playerByToken.get(token);
    const xA = cur[i * 2];
    const yA = cur[i * 2 + 1];
    const xB = next[i * 2];
    const yB = next[i * 2 + 1];
    const x = lerp(xA, xB, tFrac);
    const y = lerp(yA, yB, tFrac);
    const [sxp, syp] = toPx(x, y);
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

    // label above marble
    const label = player?.nickname ?? '';
    ctx.font = `${10 * dpr}px sans-serif`;
    ctx.textAlign = 'center';
    const labelW = ctx.measureText(label).width + 8 * dpr;
    const labelH = 14 * dpr;
    const labelY = syp - r - labelH - 2 * dpr;
    ctx.fillStyle = isMe ? '#fbbf24' : 'rgba(0,0,0,0.7)';
    roundRect(ctx, sxp - labelW / 2, labelY, labelW, labelH, 4 * dpr);
    ctx.fill();
    ctx.fillStyle = isMe ? '#0b0b10' : '#ffffff';
    ctx.fillText(label, sxp, labelY + 10 * dpr);
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
    // Expanding ring (sonar)
    const ringT = Math.min(1, t / 0.7);
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
    ctx.fillStyle = p.color;
    const sz = Math.max(3 * dpr, p.size * scale);
    ctx.save();
    ctx.translate(sxp, syp);
    ctx.rotate(p.rot);
    ctx.fillRect(-sz / 2, -sz / 4, sz, sz / 2);
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

  const rowH = 26 * dpr;
  const padding = 6 * dpr;
  const panelW = Math.min(120 * dpr, W * 0.28);
  const panelX = 6 * dpr;
  const panelY = 6 * dpr;
  const panelH = padding * 2 + rowH * rows.length;

  // Background
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  roundRectPath(ctx, panelX, panelY, panelW, panelH, 8 * dpr);
  ctx.fill();

  ctx.font = `bold ${10 * dpr}px sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.textAlign = 'left';
  // (Skip header — keep it tight on mobile)

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const player = playerByToken.get(r.token);
    const ry = panelY + padding + i * rowH;
    const isMe = r.token === myPlayerToken;

    // Row background highlight for me
    if (isMe) {
      ctx.fillStyle = 'rgba(251,191,36,0.18)';
      ctx.fillRect(panelX + 2, ry + 1, panelW - 4, rowH - 2);
    }

    // Rank number
    ctx.font = `bold ${11 * dpr}px sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillStyle = r.rank === 1 ? '#fbbf24' : r.rank === 2 ? '#cbd5e1' : r.rank === 3 ? '#fb923c' : '#9ca3af';
    ctx.fillText(`${r.rank}`, panelX + 18 * dpr, ry + 17 * dpr);

    // Color dot
    ctx.fillStyle = player?.color ?? '#666';
    ctx.beginPath();
    ctx.arc(panelX + 28 * dpr, ry + rowH / 2, 5 * dpr, 0, Math.PI * 2);
    ctx.fill();

    // Nickname
    ctx.font = `${11 * dpr}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillStyle = isMe ? '#fbbf24' : r.finished ? 'rgba(255,255,255,0.55)' : '#ffffff';
    const nameMaxW = panelW - 50 * dpr - (r.finished ? 14 * dpr : 0);
    const name = ellipsize(ctx, player?.nickname ?? '', nameMaxW);
    ctx.fillText(name, panelX + 38 * dpr, ry + 17 * dpr);

    // Finished check mark
    if (r.finished) {
      ctx.font = `${10 * dpr}px sans-serif`;
      ctx.textAlign = 'right';
      ctx.fillStyle = '#10b981';
      ctx.fillText('✓', panelX + panelW - 6 * dpr, ry + 17 * dpr);
    }
  }
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
