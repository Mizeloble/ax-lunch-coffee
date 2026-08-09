'use client';

import { useEffect, useRef, useState } from 'react';
import { ko } from '@/lib/i18n';
import { getSocket } from '@/lib/socket-client';
import { serverNow } from '@/lib/server-clock';
import { haptics } from '@/games/marble/haptics';
import { GAME } from '@/lib/constants';
import type { ReactionGoPayload, ReactionTapAck } from '@/lib/protocol';

type Player = { playerToken: string; nickname: string; color: string };

type Phase = 'ready' | 'go' | 'tabulating';

/**
 * Reaction game UI. Three phases:
 *   ready       startAt..GO signal   — gray screen, taps here = false start (visual feedback only)
 *   go          GO..deadlineAt       — amber GO screen, first tap recorded
 *   tabulating  deadlineAt..end      — waiting for server-authoritative result
 *
 * The GO time is NOT known in advance: the server pushes `reaction:go` at goAt
 * itself (pre-announcing it let a devtools one-liner schedule an inhuman tap).
 * That signal is received by RoomClient and handed down as `goTimes` — a mid-round
 * reconnect gets it replayed before this component mounts, so the subscription has
 * to live above it. It carries no timestamps: receipt is the anchor, and the window
 * runs `windowMs` from there. Server is the source of truth for tapOffsets — the
 * tap payload carries no timestamp either. Background-tab guard: visibility !==
 * 'visible' suppresses tap input.
 */
export function ReactionRenderer({
  startAt,
  goTimes,
  durationMs,
  myPlayerToken,
}: {
  startAt: number;
  /** null until the server's GO signal lands — before that every tap is a false start. */
  goTimes: ReactionGoPayload | null;
  durationMs: number;
  players: Player[];
  myPlayerToken: string | null;
}) {
  const [now, setNow] = useState(() => serverNow());
  // The GO event carries no timestamps (see ReactionGoPayload) — receipt *is* the
  // start. Stamped once, when the payload first arrives.
  const goAnchorRef = useRef<{ at: number; windowMs: number } | null>(null);
  if (goTimes && !goAnchorRef.current) {
    goAnchorRef.current = { at: serverNow(), windowMs: goTimes.windowMs };
  }
  const goAnchor = goTimes ? goAnchorRef.current : null;
  // Local snapshot of "my reaction time" — server is authoritative for ranking but we
  // surface this immediately so the user sees their effort acknowledged.
  const [myOffsetMs, setMyOffsetMs] = useState<number | null>(null);
  const [falseStartFlash, setFalseStartFlash] = useState(0);
  // Sticks for the rest of the round once you false-start. Used to keep a
  // persistent "위반 · 대기" badge so users don't think the game is bugged
  // when later taps stop responding.
  const [falseStartLocked, setFalseStartLocked] = useState(false);
  // Mirrors `tappedRef` in React state: only the first tap counts, so once it's
  // spent the surface must *look* spent too. Unlocking after a false start was
  // re-enabling a button that silently ignored every further press.
  const [tapped, setTapped] = useState(false);
  const tappedRef = useRef(false);

  // RAF tick (drives phase transition + countdown numerals)
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      setNow(serverNow());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // 3·2·1 haptic ticks at fixed offsets from startAt. Offsets sit safely below
  // REACTION_PRE_GO_MIN_MS (1500ms) so the silence between the last tick and GO
  // varies 300–2300ms — preserves the "you don't know when GO comes" anti-cheat.
  // No haptic fires on GO itself (iOS Safari lacks navigator.vibrate, so a GO
  // pulse would advantage Android players).
  useEffect(() => {
    const now = serverNow();
    const timers = [400, 800, 1200]
      .map((off) => startAt + off)
      .filter((fireAt) => fireAt > now + 50)
      .map((fireAt) => window.setTimeout(() => haptics.countdownTick(), fireAt - now));
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [startAt]);

  function handleTap() {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    if (tappedRef.current) return;
    tappedRef.current = true;
    setTapped(true);
    const tapAt = serverNow();

    // No GO signal yet (or tapped before it): false start. A tap racing the GO
    // packet over the wire can still be recorded as valid by the server — the
    // ack below unlocks the UI in that case, mirroring the valid-tap branch.
    if (goAnchor == null) {
      // false start — visual + haptic, no offset surfaced
      haptics.reactionFalseStart();
      setFalseStartFlash((k) => k + 1);
      setFalseStartLocked(true);
      // Still emit so the server records this player's first input as a false start.
      // Server uses arrival time, not our `tapAt`, so we don't send a timestamp.
      getSocket().emit('reaction:tap', (res: ReactionTapAck) => {
        if (!res?.recorded || res.offsetMs < GAME.REACTION_MIN_HUMAN_RT_MS) return;
        setFalseStartLocked(false);
        setMyOffsetMs(res.offsetMs);
      });
      return;
    }
    if (tapAt > goAnchor.at + goAnchor.windowMs) return; // window closed

    haptics.reactionGo();
    // Local estimate for instant feedback only — the server ack below replaces it
    // with the recorded offset (the exact number the result screen will show), so
    // the in-game badge and the final ranking can't disagree by latency/clock skew.
    // Anchored on when GO reached us, so this under-reads by one-way latency —
    // the ack below replaces it with the server's recorded offset.
    setMyOffsetMs(Math.max(0, Math.round(tapAt - goAnchor.at)));
    getSocket().emit('reaction:tap', (res: ReactionTapAck) => {
      if (!res?.recorded) return; // keep the local estimate (ack lost / tap ignored)
      if (res.offsetMs < GAME.REACTION_MIN_HUMAN_RT_MS) {
        // Looked fine locally, but arrived under the human-RT floor — the server
        // will classify it as a false start, so flip the UI to match the ranking.
        setMyOffsetMs(null);
        setFalseStartFlash((k) => k + 1);
        setFalseStartLocked(true);
        return;
      }
      setMyOffsetMs(res.offsetMs);
    });
  }

  const phase: Phase =
    goAnchor == null ? 'ready' : now < goAnchor.at + goAnchor.windowMs ? 'go' : 'tabulating';

  // Saturating bar — fills to ~85% by REACTION_PRE_GO_MIN_MS (1500ms) and creeps
  // asymptotically toward 100% afterwards. The visual gap between "almost full"
  // and "actually GO" is imperceptible, so the bar shows "round in progress"
  // without leaking when GO will fire.
  const readyElapsedMs = Math.max(0, now - startAt);
  const readyProgress = 1 - Math.exp(-readyElapsedMs / 800);

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
        disabled={phase === 'tabulating' || falseStartLocked || tapped}
        aria-label={ko.reaction.tapHint}
        className="absolute inset-0 flex flex-col items-center justify-center text-center transition-colors duration-100"
        style={{
          background:
            phase === 'go'
              ? 'radial-gradient(closest-side, #fbbf24, #f59e0b)'
              : phase === 'tabulating'
                ? '#18181b'
                : '#27272a',
          opacity: falseStartLocked ? 0.45 : 1,
        }}
      >
        {phase === 'ready' && <ReadyView progress={readyProgress} />}
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

      {/* Persistent false-start banner — sits above the (now-disabled) tap surface
          for the rest of the round so users know their input is locked and the
          ranking is still TBD (an even-earlier false-starter could overtake). */}
      {falseStartLocked && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col items-center px-6 pt-[max(env(safe-area-inset-top),12px)]">
          <div className="rounded-2xl bg-rose-600/95 px-5 py-3 text-center text-white shadow-2xl ring-1 ring-rose-300/40 backdrop-blur">
            <div className="text-sm font-black tracking-tight">
              {ko.reaction.falseStartLockedTitle}
            </div>
            <div className="mt-1 text-xs font-medium leading-snug text-rose-50/90">
              {ko.reaction.falseStartLockedRule}
            </div>
          </div>
        </div>
      )}

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
        @keyframes reaction-go-whiteflash {
          0% { opacity: 0.85; }
          100% { opacity: 0; }
        }
        @keyframes reaction-go-pulse {
          0% { transform: scale(0.88); opacity: 0; }
          55% { transform: scale(1.06); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </main>
  );
}

function ReadyView({ progress }: { progress: number }) {
  // 노랑 = 탭해도 되는 순간, 빨강 = 아직·위반. "준비…"는 눌러도 되는 것처럼 읽혀서
  // 신호등 규칙이 성립하지 않았다 — 이 화면은 전부 빨강 쪽이다.
  return (
    <>
      <div className="text-xs uppercase tracking-[0.18em] text-amber-400/80 font-bold">
        {ko.reaction.readySub}
      </div>
      <div
        className="mt-3 font-black text-red-500 leading-none"
        style={{ fontSize: 80, letterSpacing: '-0.06em' }}
      >
        {ko.reaction.ready}
      </div>
      <p className="mt-3 px-6 text-[15px] font-bold text-red-300/90">{ko.reaction.readyRule}</p>
      {/* Progress hint — anti-cheat: not the actual remaining ms, just an opaque bar */}
      <div className="mt-8 h-1.5 w-44 overflow-hidden rounded-full bg-zinc-800">
        <div
          className="h-full bg-red-500/70 transition-[width] duration-100"
          style={{ width: `${Math.min(100, progress * 100)}%` }}
        />
      </div>
      <p className="mt-6 text-[13px] text-zinc-500">{ko.reaction.tapHint}</p>
    </>
  );
}

function GoView({ myOffsetMs }: { myOffsetMs: number | null }) {
  return (
    <>
      {/* Brief white flash at GO. Pure CSS — fires once on mount because GoView
          is conditionally rendered only when phase transitions to 'go'. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 animate-[reaction-go-whiteflash_220ms_ease-out_forwards]"
        style={{ background: 'rgba(255,255,255,0.9)' }}
      />
      <div
        className="font-black text-zinc-950 leading-none animate-[reaction-go-pulse_320ms_cubic-bezier(0.34,1.56,0.64,1)_both]"
        style={{ fontSize: 120, letterSpacing: '-0.06em' }}
      >
        {ko.reaction.go}
      </div>
      <div className="mt-2 text-2xl font-black text-zinc-950/80">{ko.reaction.goSub}</div>
      {myOffsetMs != null && (
        <div className="mt-8 rounded-2xl bg-zinc-950/15 px-5 py-3 text-2xl font-black tabular-nums text-zinc-950">
          {ko.reaction.myTime(myOffsetMs)}
          <div className="mt-0.5 text-xs font-bold uppercase tracking-wider text-zinc-950/70">
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
