'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { ko } from '@/lib/i18n';
import { getSocket } from '@/lib/socket-client';
import { haptics } from '@/games/marble/haptics';
import { GAME } from '@/lib/constants';
import type { TriviaReplayData } from './server';

type Player = { playerToken: string; nickname: string; color: string };

type CurrentPhase =
  | { kind: 'pre' }
  | { kind: 'question'; qIndex: number; openAt: number; closeAt: number }
  | { kind: 'reveal'; qIndex: number; closeAt: number; revealUntil: number }
  | { kind: 'final' };

const CHOICE_LABELS = ['A', 'B', 'C', 'D'] as const;
const CHOICE_BG = [
  'bg-rose-500/15 border-rose-500/40 text-rose-100',
  'bg-amber-500/15 border-amber-500/40 text-amber-100',
  'bg-emerald-500/15 border-emerald-500/40 text-emerald-100',
  'bg-sky-500/15 border-sky-500/40 text-sky-100',
] as const;

/**
 * Trivia game UI. Phases driven entirely by wall-clock against the schedule embedded
 * in `replay.data` — no network calls during play. Server is the source of truth for
 * answer arrival time; client does NOT send a timestamp.
 *
 * Each question: 8s answer window → 2s reveal. After last reveal: 3s "tabulating"
 * before result screen takes over.
 */
export function TriviaRenderer({
  startAt,
  replay,
  myPlayerToken,
}: {
  startAt: number;
  durationMs: number;
  replay: TriviaReplayData;
  players: Player[];
  myPlayerToken: string | null;
}) {
  const [now, setNow] = useState(() => Date.now());
  // playerToken-scoped answer log (myAnswers[i] = my pick for question i).
  // Server holds the canonical record; this only drives the local "제출됨" UI.
  const [myAnswers, setMyAnswers] = useState<Array<0 | 1 | 2 | 3 | null>>(() =>
    Array.from({ length: replay.questions.length }, () => null),
  );
  // Track which question indices we've already played the haptic tick for, so the
  // open-question pulse fires exactly once per phase even though RAF re-evaluates.
  const tickedRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      setNow(Date.now());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const phase = useMemo<CurrentPhase>(() => {
    const { openAtOffsets, closeAtOffsets } = replay.schedule;
    const total = replay.questions.length;
    if (now < startAt) return { kind: 'pre' };
    for (let i = 0; i < total; i++) {
      const openAt = startAt + openAtOffsets[i];
      const closeAt = startAt + closeAtOffsets[i];
      const revealUntil = closeAt + GAME.TRIVIA_REVEAL_MS;
      if (now < openAt) return { kind: 'pre' };
      if (now < closeAt) return { kind: 'question', qIndex: i, openAt, closeAt };
      if (now < revealUntil) return { kind: 'reveal', qIndex: i, closeAt, revealUntil };
    }
    return { kind: 'final' };
  }, [now, startAt, replay]);

  // Light haptic at each question open
  useEffect(() => {
    if (phase.kind !== 'question') return;
    if (tickedRef.current.has(phase.qIndex)) return;
    tickedRef.current.add(phase.qIndex);
    haptics.countdownTick();
  }, [phase]);

  function handlePick(qIndex: number, choice: 0 | 1 | 2 | 3) {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    if (myAnswers[qIndex] != null) return;
    setMyAnswers((prev) => {
      if (prev[qIndex] != null) return prev;
      const next = prev.slice();
      next[qIndex] = choice;
      return next;
    });
    haptics.chargeTap();
    getSocket().emit('trivia:answer', { qIndex, choice });
  }

  // Cumulative score: count every question whose closeAt has already passed
  // (i.e. has been revealed at least once). This keeps the badge accurate during
  // both the reveal phase of question i and the question phase of question i+1.
  const myScore = useMemo(() => {
    const { closeAtOffsets } = replay.schedule;
    let revealedThrough = -1;
    for (let i = 0; i < replay.questions.length; i++) {
      if (now >= startAt + closeAtOffsets[i]) revealedThrough = i;
    }
    let s = 0;
    for (let i = 0; i <= revealedThrough; i++) {
      if (myAnswers[i] === replay.questions[i].correctIndex) s++;
    }
    return s;
  }, [now, startAt, myAnswers, replay]);

  return (
    <main
      key={myPlayerToken ?? 'spectator'}
      className="fixed inset-0 z-30 flex flex-col bg-zinc-950 text-zinc-100 select-none"
      style={{
        paddingTop: 'max(env(safe-area-inset-top), 12px)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 16px)',
      }}
    >
      <Header
        questionLabel={
          phase.kind === 'question' || phase.kind === 'reveal'
            ? ko.trivia.questionLabel(phase.qIndex + 1, replay.questions.length)
            : ''
        }
        timeLeftSec={
          phase.kind === 'question'
            ? Math.max(0, Math.ceil((phase.closeAt - now) / 1000))
            : null
        }
        score={myScore}
      />

      <div className="flex-1 px-4 pt-3 pb-2 flex flex-col">
        {phase.kind === 'pre' && <PreView />}
        {(phase.kind === 'question' || phase.kind === 'reveal') && (
          <QuestionView
            question={replay.questions[phase.qIndex]}
            qIndex={phase.qIndex}
            myPick={myAnswers[phase.qIndex]}
            revealing={phase.kind === 'reveal'}
            onPick={handlePick}
          />
        )}
        {phase.kind === 'final' && <FinalView />}
      </div>
    </main>
  );
}

function Header({
  questionLabel,
  timeLeftSec,
  score,
}: {
  questionLabel: string;
  timeLeftSec: number | null;
  score: number;
}) {
  return (
    <div className="flex items-center justify-between px-4 pt-2 pb-1.5">
      <div className="flex items-baseline gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">
          🧠 {ko.games.trivia}
        </span>
        {questionLabel && (
          <span className="text-sm font-black text-amber-400 tabular-nums">{questionLabel}</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {timeLeftSec != null && (
          <span
            className={clsx(
              'rounded-full px-2.5 py-1 text-xs font-black tabular-nums',
              timeLeftSec <= 3
                ? 'bg-rose-500/20 text-rose-200 ring-1 ring-rose-500/40'
                : 'bg-zinc-800 text-zinc-300',
            )}
          >
            {ko.trivia.timeLeft(timeLeftSec)}
          </span>
        )}
        <span className="rounded-full bg-amber-400/15 px-2.5 py-1 text-xs font-black text-amber-300 ring-1 ring-amber-400/30 tabular-nums">
          {ko.trivia.scoreLabel} {ko.trivia.yourScore(score)}
        </span>
      </div>
    </div>
  );
}

function PreView() {
  return (
    <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">
      {ko.trivia.waitingNext}
    </div>
  );
}

function FinalView() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-zinc-400">
      <div className="text-sm">{ko.trivia.finalTabulating}</div>
      <div className="mt-4 flex gap-1.5">
        <span className="h-2 w-2 animate-pulse rounded-full bg-zinc-600" />
        <span className="h-2 w-2 animate-pulse rounded-full bg-zinc-600 [animation-delay:120ms]" />
        <span className="h-2 w-2 animate-pulse rounded-full bg-zinc-600 [animation-delay:240ms]" />
      </div>
    </div>
  );
}

function QuestionView({
  question,
  qIndex,
  myPick,
  revealing,
  onPick,
}: {
  question: TriviaReplayData['questions'][number];
  qIndex: number;
  myPick: 0 | 1 | 2 | 3 | null;
  revealing: boolean;
  onPick: (qIndex: number, choice: 0 | 1 | 2 | 3) => void;
}) {
  const myCorrect = myPick != null && myPick === question.correctIndex;

  return (
    <div className="flex flex-1 flex-col">
      <div className="rounded-2xl bg-zinc-900/80 ring-1 ring-zinc-800 px-4 py-5 mb-4">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-400/80">
          {question.category}
        </div>
        <div className="mt-2 text-lg font-bold leading-snug">{question.question}</div>
      </div>

      <div className="grid grid-cols-1 gap-2.5">
        {question.choices.map((label, i) => {
          const idx = i as 0 | 1 | 2 | 3;
          const picked = myPick === idx;
          const isCorrect = idx === question.correctIndex;
          const showCorrect = revealing && isCorrect;
          const showWrong = revealing && picked && !isCorrect;
          const dim = revealing && !isCorrect && !picked;
          const disabled = revealing || myPick != null;

          return (
            <button
              key={i}
              type="button"
              onClick={() => !disabled && onPick(qIndex, idx)}
              disabled={disabled}
              className={clsx(
                'relative flex items-center gap-3 rounded-2xl border-[1.5px] px-4 py-4 text-left transition-all',
                'min-h-[64px]',
                showCorrect && 'border-emerald-400 bg-emerald-500/20 text-emerald-50 ring-2 ring-emerald-400/60',
                showWrong && 'border-rose-500 bg-rose-500/15 text-rose-100 ring-1 ring-rose-500/50',
                !showCorrect && !showWrong && picked && 'border-amber-400 bg-amber-400/15 text-amber-100',
                !showCorrect && !showWrong && !picked && CHOICE_BG[i],
                dim && 'opacity-40',
                !disabled && 'active:scale-[0.98]',
              )}
            >
              <span
                className={clsx(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-black',
                  showCorrect
                    ? 'bg-emerald-400 text-emerald-950'
                    : showWrong
                      ? 'bg-rose-500 text-rose-50'
                      : picked
                        ? 'bg-amber-400 text-zinc-950'
                        : 'bg-zinc-800 text-zinc-400',
                )}
              >
                {CHOICE_LABELS[i]}
              </span>
              <span className="text-[15px] font-bold leading-snug flex-1">{label}</span>
              {revealing && isCorrect && (
                <span className="text-xs font-black text-emerald-300">{ko.trivia.correctReveal}</span>
              )}
              {!revealing && picked && (
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-300">
                  {ko.trivia.answered}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {revealing && (
        <div className="mt-4 text-center text-sm font-black">
          {myPick == null ? (
            <span className="text-zinc-500">{ko.trivia.noAnswer}</span>
          ) : myCorrect ? (
            <span className="text-emerald-400">{ko.trivia.correctReveal}</span>
          ) : (
            <span className="text-rose-400">{ko.trivia.wrongReveal}</span>
          )}
        </div>
      )}
    </div>
  );
}
