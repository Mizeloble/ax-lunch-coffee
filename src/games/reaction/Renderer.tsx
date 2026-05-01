'use client';

import { useEffect, useRef, useState } from 'react';
import { ko } from '@/lib/i18n';
import { getSocket } from '@/lib/socket-client';
import { haptics } from '@/games/marble/haptics';

type Player = { playerToken: string; nickname: string; color: string };

type Phase = 'ready' | 'go' | 'tabulating';

/**
 * Reaction game UI. Three wall-clock phases driven by RAF:
 *   ready       startAt..goAt        — gray screen, taps here = false start (visual feedback only)
 *   go          goAt..deadlineAt     — amber GO screen, first tap recorded
 *   tabulating  deadlineAt..end      — waiting for server-authoritative result
 *
 * Server is the source of truth for tapOffsets — payload carries no timestamp.
 * Background-tab guard: visibility !== 'visible' suppresses tap input entirely.
 */
export function ReactionRenderer({
  startAt,
  goAt,
  deadlineAt,
  durationMs,
  myPlayerToken,
}: {
  startAt: number;
  goAt: number;
  deadlineAt: number;
  durationMs: number;
  players: Player[];
  myPlayerToken: string | null;
}) {
  const [now, setNow] = useState(() => Date.now());
  // Local snapshot of "my reaction time" — server is authoritative for ranking but we
  // surface this immediately so the user sees their effort acknowledged.
  const [myOffsetMs, setMyOffsetMs] = useState<number | null>(null);
  const [falseStartFlash, setFalseStartFlash] = useState(0);
  const tappedRef = useRef(false);

  // RAF tick (drives phase transition + countdown numerals)
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      setNow(Date.now());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  function handleTap() {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    if (tappedRef.current) return;
    tappedRef.current = true;
    const tapAt = Date.now();

    if (tapAt < goAt) {
      // false start — visual + haptic, no offset surfaced
      haptics.reactionFalseStart();
      setFalseStartFlash((k) => k + 1);
      // Still emit so the server records this player's first input as a false start.
      // Server uses arrival time, not our `tapAt`, so we don't send a timestamp.
      getSocket().emit('reaction:tap');
      return;
    }
    if (tapAt > deadlineAt) return; // window closed

    haptics.reactionGo();
    setMyOffsetMs(Math.max(0, Math.round(tapAt - goAt)));
    getSocket().emit('reaction:tap');
  }

  const phase: Phase = now < goAt ? 'ready' : now < deadlineAt ? 'go' : 'tabulating';

  // Soft preview countdown during ready phase (no exact reveal — just "곧" sense)
  const readyTotalMs = Math.max(1, goAt - startAt);
  const readyElapsedMs = Math.max(0, Math.min(readyTotalMs, now - startAt));
  const readyProgress = readyElapsedMs / readyTotalMs;

  return (
    <main
      key={myPlayerToken ?? 'spectator'}
      className="fixed inset-0 z-30 select-none touch-none overflow-hidden"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
    >
      {/* Single full-screen tap surface — color shifts with phase */}
      <button
        type="button"
        onPointerDown={handleTap}
        disabled={phase === 'tabulating'}
        aria-label={ko.reaction.tapHint}
        className="absolute inset-0 flex flex-col items-center justify-center text-center transition-colors duration-100"
        style={{
          background:
            phase === 'go'
              ? 'radial-gradient(closest-side, #fbbf24, #f59e0b)'
              : phase === 'tabulating'
                ? '#18181b'
                : '#27272a',
        }}
      >
        {phase === 'ready' && (
          <ReadyView
            elapsed={readyElapsedMs}
            progress={readyProgress}
            durationMs={durationMs}
            startAt={startAt}
          />
        )}
        {phase === 'go' && <GoView myOffsetMs={myOffsetMs} />}
        {phase === 'tabulating' && <TabulatingView />}

        {/* Red false-start flash overlay (key remounts to retrigger animation) */}
        {falseStartFlash > 0 && (
          <span
            key={falseStartFlash}
            aria-hidden
            className="pointer-events-none absolute inset-0 animate-[reaction-flash_360ms_ease-out]"
            style={{ background: 'rgba(239,68,68,0.45)' }}
          />
        )}
        {falseStartFlash > 0 && (
          <span
            key={`txt-${falseStartFlash}`}
            className="pointer-events-none absolute top-12 left-1/2 -translate-x-1/2 rounded-full bg-rose-500 px-4 py-2 text-sm font-bold text-white shadow-2xl animate-[reaction-toast_900ms_ease-out_forwards]"
          >
            {ko.reaction.falseStart}
          </span>
        )}
      </button>

      <style jsx>{`
        @keyframes reaction-flash {
          0% { opacity: 0.9; }
          100% { opacity: 0; }
        }
        @keyframes reaction-toast {
          0% { opacity: 0; transform: translate(-50%, -8px); }
          15% { opacity: 1; transform: translate(-50%, 0); }
          75% { opacity: 1; transform: translate(-50%, 0); }
          100% { opacity: 0; transform: translate(-50%, -4px); }
        }
      `}</style>
    </main>
  );
}

function ReadyView({
  progress,
}: {
  elapsed: number;
  progress: number;
  durationMs: number;
  startAt: number;
}) {
  return (
    <>
      <div className="text-[11px] uppercase tracking-[0.18em] text-amber-400/80 font-bold">
        {ko.reaction.readySub}
      </div>
      <div
        className="mt-3 font-black text-zinc-100 leading-none"
        style={{ fontSize: 80, letterSpacing: '-0.06em' }}
      >
        {ko.reaction.ready}
      </div>
      {/* Progress hint — anti-cheat: not the actual remaining ms, just an opaque bar */}
      <div className="mt-10 h-1.5 w-44 overflow-hidden rounded-full bg-zinc-800">
        <div
          className="h-full bg-zinc-600 transition-[width] duration-100"
          style={{ width: `${Math.min(100, progress * 100)}%` }}
        />
      </div>
      <p className="mt-6 text-xs text-zinc-500">{ko.reaction.tapHint}</p>
    </>
  );
}

function GoView({ myOffsetMs }: { myOffsetMs: number | null }) {
  return (
    <>
      <div
        className="font-black text-zinc-950 leading-none"
        style={{ fontSize: 120, letterSpacing: '-0.06em' }}
      >
        {ko.reaction.go}
      </div>
      <div className="mt-2 text-2xl font-black text-zinc-950/80">{ko.reaction.goSub}</div>
      {myOffsetMs != null && (
        <div className="mt-8 rounded-2xl bg-zinc-950/15 px-5 py-3 text-2xl font-black tabular-nums text-zinc-950">
          {ko.reaction.myTime(myOffsetMs)}
          <div className="mt-0.5 text-[11px] font-bold uppercase tracking-wider text-zinc-950/70">
            {ko.reaction.youTapped}
          </div>
        </div>
      )}
    </>
  );
}

function TabulatingView() {
  return (
    <>
      <div className="text-zinc-500 text-sm">{ko.reaction.tabulating}</div>
      <div className="mt-4 flex gap-1.5">
        <span className="h-2 w-2 animate-pulse rounded-full bg-zinc-600" />
        <span className="h-2 w-2 animate-pulse rounded-full bg-zinc-600 [animation-delay:120ms]" />
        <span className="h-2 w-2 animate-pulse rounded-full bg-zinc-600 [animation-delay:240ms]" />
      </div>
    </>
  );
}
