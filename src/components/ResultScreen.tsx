'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ko } from '@/lib/i18n';
import { useRoomStore } from '@/store/room-store';
import { getSocket } from '@/lib/socket-client';
import clsx from 'clsx';

export function ResultScreen({ onReplay }: { onReplay?: () => void } = {}) {
  const result = useRoomStore((s) => s.result);
  const state = useRoomStore((s) => s.state);
  const myToken = useRoomStore((s) => s.myToken);
  const isHost = useRoomStore((s) => s.isHost);
  const gameStart = useRoomStore((s) => s.gameStart);
  const router = useRouter();
  const [showRanking, setShowRanking] = useState(false);

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

  const fullRanking = result.ranking
    .map((tk) => state.players.find((p) => p.playerToken === tk))
    .filter((p): p is NonNullable<typeof p> => !!p);

  const canReplay = !!gameStart && !!onReplay;

  function leaveRoom() {
    router.push('/');
  }

  return (
    <main
      className="fixed inset-0 z-30 flex flex-col items-center justify-center px-6 text-center overflow-hidden"
      style={{ background: 'radial-gradient(120% 80% at 50% 0%, #14141c 0%, #0b0b10 55%) #0b0b10' }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

      <div className="relative z-10 w-full max-w-sm flex flex-col items-center">
        {/* Header chip — ☕ 오늘 커피값 × N명 */}
        <div className="inline-flex items-center gap-2 pl-3.5 pr-3 py-1.5 rounded-full bg-white/[0.05] border border-white/[0.08] text-xs text-zinc-400 font-semibold whitespace-nowrap">
          <span className="text-sm">☕️</span>
          <span>{ko.result.headerChip}</span>
          <span className="px-2 py-0.5 rounded-full bg-amber-400 text-zinc-900 font-extrabold text-[11px]">
            {ko.result.countBadge(losers.length)}
          </span>
        </div>

        <LoserBlock losers={losers} />

        <div
          className={clsx(
            'mt-8 font-extrabold -tracking-wide',
            iLost ? 'text-rose-300' : 'text-emerald-300',
          )}
          style={{ fontSize: iLost && losers.length === 1 ? 18 : 17 }}
        >
          {iLost ? ko.result.youLost : ko.result.youWon}
        </div>

        {/* Bottom actions — host primary grid vs guest secondary row */}
        {isHost ? (
          <div className="mt-10 w-full flex flex-col gap-2">
            <button
              type="button"
              onClick={() => getSocket().emit('start')}
              className="w-full py-4 rounded-2xl bg-amber-400 text-zinc-900 font-extrabold text-lg active:scale-[0.98] shadow-[0_8px_24px_rgba(251,191,36,0.25)]"
            >
              {ko.result.again}
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => getSocket().emit('reset')}
                className="py-3.5 rounded-xl bg-transparent text-zinc-400 border-[1.5px] border-zinc-800 font-semibold text-sm active:scale-[0.98]"
              >
                {ko.result.changeGame}
              </button>
              <button
                type="button"
                onClick={leaveRoom}
                className="py-3.5 rounded-xl bg-transparent text-zinc-400 border-[1.5px] border-zinc-800 font-semibold text-sm active:scale-[0.98]"
              >
                {ko.result.closeRoom}
              </button>
            </div>
            {canReplay && (
              <button
                type="button"
                onClick={onReplay}
                className="mt-1 w-full py-2.5 text-zinc-500 text-xs underline-offset-2 hover:underline"
              >
                {ko.result.replay}
              </button>
            )}
          </div>
        ) : (
          <div className="mt-12 w-full flex flex-col items-center gap-3">
            <div className="inline-flex items-center gap-2 text-xs text-zinc-500">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              <span>{ko.result.waitingNext}</span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowRanking((s) => !s)}
                className="px-4 py-2.5 rounded-xl bg-transparent text-zinc-400 border border-zinc-800 text-[13px] font-semibold active:scale-[0.98]"
              >
                {showRanking ? ko.result.fullRankingHide : ko.result.fullRankingShow}
              </button>
              <button
                type="button"
                onClick={leaveRoom}
                className="px-4 py-2.5 rounded-xl bg-transparent text-zinc-400 border border-zinc-800 text-[13px] font-semibold active:scale-[0.98]"
              >
                {ko.result.leaveRoom}
              </button>
            </div>
            {canReplay && (
              <button
                type="button"
                onClick={onReplay}
                className="mt-1 text-zinc-500 text-xs underline-offset-2 hover:underline"
              >
                {ko.result.replay}
              </button>
            )}
          </div>
        )}

        {/* Inline ranking (guest disclosure) */}
        {!isHost && showRanking && fullRanking.length > 0 && (
          <RankingList ranking={fullRanking} myToken={myToken} />
        )}
      </div>

      {/* Host: ranking shown as compact disclosure below action grid (kept from v1, polished) */}
      {isHost && fullRanking.length > 0 && (
        <details className="relative z-10 mt-6 w-full max-w-sm rounded-xl bg-zinc-900/70 border border-zinc-800 px-4 py-3 text-left group">
          <summary className="text-xs font-semibold text-zinc-400 cursor-pointer select-none list-none flex items-center justify-between">
            <span>{ko.result.fullRanking}</span>
            <span className="text-zinc-600 transition-transform group-open:rotate-180">▾</span>
          </summary>
          <div className="border-t border-zinc-800 mt-3 pt-3">
            <RankingList ranking={fullRanking} myToken={myToken} />
          </div>
        </details>
      )}
    </main>
  );
}

function LoserBlock({
  losers,
}: {
  losers: { playerToken: string; nickname: string; color: string }[];
}) {
  const n = losers.length;
  const nameSize = n === 1 ? 80 : n === 2 ? 56 : 44;
  const lineGap = n === 1 ? 0 : n === 2 ? 14 : 10;
  const dotSize = n === 1 ? 14 : n === 2 ? 12 : 10;

  return (
    <div className="mt-9 flex flex-col items-center" style={{ gap: lineGap }}>
      {losers.map((p) => (
        <div key={p.playerToken} className="flex flex-col items-center gap-3.5">
          <div
            className="font-black text-zinc-50 flex items-center justify-center gap-4"
            style={{
              fontSize: nameSize,
              letterSpacing: '-0.05em',
              lineHeight: 1,
              textShadow: `0 4px 60px ${p.color}50`,
            }}
          >
            <span
              className="rounded-full shrink-0"
              style={{
                width: dotSize,
                height: dotSize,
                background: p.color,
                boxShadow: `0 0 0 4px ${p.color}30`,
              }}
            />
            <span>{p.nickname}</span>
          </div>
          <div className="inline-flex items-center px-3 py-1 rounded-full bg-white/[0.05] border border-white/[0.08] text-[11px] text-zinc-400 font-bold uppercase tracking-[0.06em]">
            {ko.result.loserBadge}
          </div>
        </div>
      ))}
    </div>
  );
}

function RankingList({
  ranking,
  myToken,
}: {
  ranking: { playerToken: string; nickname: string; color: string }[];
  myToken: string | null;
}) {
  return (
    <ul className="mt-3 w-full max-w-sm space-y-1.5">
      {ranking.map((p, i) => {
        const rank = i + 1;
        const isMe = p.playerToken === myToken;
        return (
          <li
            key={p.playerToken}
            className={clsx(
              'flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm',
              isMe && 'bg-amber-400/15',
            )}
          >
            <span className="w-7 text-right text-xs font-bold text-zinc-500 tabular-nums">
              {ko.result.rank(rank)}
            </span>
            <span
              className="h-3 w-3 rounded-full shrink-0"
              style={{ background: p.color }}
              aria-hidden
            />
            <span className={clsx('truncate', isMe ? 'text-amber-300 font-bold' : 'text-zinc-200')}>
              {p.nickname}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
