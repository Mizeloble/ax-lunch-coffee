'use client';

import { useEffect, useRef } from 'react';
import { ko } from '@/lib/i18n';
import { useRoomStore } from '@/store/room-store';
import { getSocket } from '@/lib/socket-client';
import clsx from 'clsx';

export function ResultScreen() {
  const result = useRoomStore((s) => s.result);
  const state = useRoomStore((s) => s.state);
  const myToken = useRoomStore((s) => s.myToken);
  const isHost = useRoomStore((s) => s.isHost);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    function size() {
      if (!canvas) return;
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
    }
    size();
    window.addEventListener('resize', size);

    type P = { x: number; y: number; vx: number; vy: number; size: number; color: string; rot: number; vrot: number };
    const palette = ['#fbbf24', '#ef4444', '#22c55e', '#3b82f6', '#ec4899', '#a855f7', '#06b6d4'];
    const particles: P[] = [];
    function spawnBurst() {
      if (!canvas) return;
      const cx = canvas.width / 2;
      for (let i = 0; i < 80; i++) {
        const a = Math.random() * Math.PI * 2;
        const speed = 4 + Math.random() * 8;
        particles.push({
          x: cx,
          y: canvas.height * 0.2,
          vx: Math.cos(a) * speed * 30,
          vy: Math.sin(a) * speed * 30 - 100,
          size: (4 + Math.random() * 5) * dpr,
          color: palette[Math.floor(Math.random() * palette.length)],
          rot: Math.random() * Math.PI,
          vrot: (Math.random() - 0.5) * 8,
        });
      }
    }
    spawnBurst();
    const burstId = setInterval(spawnBurst, 1800);

    let raf = 0;
    let lastT = performance.now();
    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.vy += 600 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vrot * dt;
        if (p.y > canvas.height + 40) {
          particles.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(burstId);
      window.removeEventListener('resize', size);
    };
  }, []);

  if (!result || !state) return null;

  const losers = result.losers
    .map((tk) => state.players.find((p) => p.playerToken === tk))
    .filter((p): p is NonNullable<typeof p> => !!p);

  const iLost = !!myToken && result.losers.includes(myToken);

  return (
    <main className="fixed inset-0 z-30 bg-[#0b0b10] flex flex-col items-center justify-center px-6 text-center overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

      <div className="relative z-10 w-full max-w-xs">
        <div className="text-sm text-zinc-400">{ko.result.losers(result.losers.length)}</div>
        <div className="text-6xl mt-2">☕️</div>

        <ul className="mt-6 space-y-2">
          {losers.map((p) => (
            <li
              key={p.playerToken}
              className="rounded-2xl px-4 py-3 flex items-center gap-3 shadow-lg"
              style={{ background: p.color }}
            >
              <span className="text-2xl">🫣</span>
              <span className="font-bold text-zinc-900 text-lg">{p.nickname}</span>
            </li>
          ))}
        </ul>

        <div className={clsx('mt-6 text-base font-bold', iLost ? 'text-rose-300' : 'text-emerald-300')}>
          {iLost ? ko.result.youLost : ko.result.youWon}
        </div>

        {isHost && (
          <div className="mt-10 space-y-2">
            <button
              type="button"
              onClick={() => getSocket().emit('start')}
              className="w-full py-4 rounded-2xl bg-amber-400 text-zinc-900 font-bold text-lg active:scale-[0.98]"
            >
              {ko.result.again}
            </button>
            <button
              type="button"
              onClick={() => getSocket().emit('reset')}
              className="w-full py-3 rounded-xl bg-zinc-800 text-zinc-200 font-medium active:scale-[0.98]"
            >
              {ko.result.changeGame}
            </button>
          </div>
        )}
        {!isHost && <p className="text-xs text-zinc-500 mt-8">호스트가 다음 라운드를 시작할 거예요</p>}
      </div>
    </main>
  );
}
