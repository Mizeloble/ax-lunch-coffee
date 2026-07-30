'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ko } from '@/lib/i18n';
import { useRoomStore } from '@/store/room-store';
import { AdSlot } from './AdSlot';
import { InviteSheet } from './InviteSheet';
import { ResultShareButton } from './ResultShareButton';
import { TriviaDetailPanel } from './TriviaDetailPanel';
import { useConfetti } from './useConfetti';
import { getSocket } from '@/lib/socket-client';
import { GAME } from '@/lib/constants';
import type { ReactionReplayData } from '@/games/reaction/server';
import type { TriviaReplayData } from '@/games/trivia/server';
import { GAME_META, gameCategory, isQuizGame } from '@/games/types';
import clsx from 'clsx';

export function ResultScreen({
  onReplay,
  inviteUrl,
}: { onReplay?: () => void; inviteUrl?: string } = {}) {
  const result = useRoomStore((s) => s.result);
  const state = useRoomStore((s) => s.state);
  const myToken = useRoomStore((s) => s.myToken);
  const isHost = useRoomStore((s) => s.isHost);
  const gameStart = useRoomStore((s) => s.gameStart);
  const router = useRouter();
  const [showInvite, setShowInvite] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useConfetti(canvasRef);

  if (!result || !state) return null;

  const losers = result.losers
    .map((tk) => state.players.find((p) => p.playerToken === tk))
    .filter((p): p is NonNullable<typeof p> => !!p);

  const iLost = !!myToken && result.losers.includes(myToken);

  const fullRanking = result.ranking
    .map((tk) => state.players.find((p) => p.playerToken === tk))
    .filter((p): p is NonNullable<typeof p> => !!p);

  const canReplay = !!gameStart && !!onReplay;

  // Reaction game: pull per-player tap offsets from the post-round state broadcast.
  // Empty during the intro broadcast — only populated when the round finishes.
  const reactionOffsets =
    gameCategory(state.gameId) === 'reaction'
      ? (state.currentRound?.replay as ReactionReplayData | undefined)?.offsets
      : undefined;
  const showReactionMs = !!reactionOffsets && Object.keys(reactionOffsets).length > 0;

  // Quiz games (trivia/nonsense): per-player cumulative score timeline. Last entry
  // = final score. Empty during the intro broadcast — only populated when the
  // round finishes.
  const triviaScores =
    isQuizGame(state.gameId)
      ? (state.currentRound?.replay as TriviaReplayData | undefined)?.scores
      : undefined;
  const showTriviaScores = !!triviaScores && Object.keys(triviaScores).length > 0;
  const triviaFinalScores: Record<string, number> | undefined = showTriviaScores
    ? Object.fromEntries(
        Object.entries(triviaScores!).map(([tk, arr]) => [tk, arr[arr.length - 1] ?? 0]),
      )
    : undefined;
  const triviaQuestions =
    isQuizGame(state.gameId)
      ? (state.currentRound?.replay as TriviaReplayData | undefined)?.questions
      : undefined;

  // 패자 사유는 게임마다 다르다 — 마블은 "꼴찌", 퀴즈는 "최저 점수", 반응속도는
  // "가장 늦게". 고정 문구("패자")를 쓰면 퀴즈 결과에서 거짓말이 된다.
  const loserReason = ko.result.loserReason[gameCategory(state.gameId)];

  // 퀴즈 지표 한 줄("5문제 중 1개 정답 · 640점") — 결과 화면과 공유 카드가 같은 계산을 쓴다.
  const triviaPicks =
    isQuizGame(state.gameId)
      ? (state.currentRound?.replay as TriviaReplayData | undefined)?.picks
      : undefined;
  const quizMetricFor = (tk: string): string | null => {
    if (!triviaQuestions || !triviaPicks || !triviaFinalScores) return null;
    const picks = triviaPicks[tk];
    if (!picks) return null;
    const correct = triviaQuestions.reduce(
      (n, q, i) => (picks[i] === q.correctIndex ? n + 1 : n),
      0,
    );
    return ko.result.quizMetric(correct, triviaQuestions.length, triviaFinalScores[tk] ?? 0);
  };

  // 공유 카드 지표 — 4b 규칙 그대로 게임별로 갈린다(검토 문서 5a). 퀴즈는 위 계산,
  // 반응속도는 결과 화면과 같은 formatReactionOffset, 마블 계열은 "N명 중 꼴찌".
  const cardMetricFor = (tk: string): string | null => {
    const cat = gameCategory(state.gameId);
    if (cat === 'quiz') return quizMetricFor(tk);
    if (cat === 'reaction') {
      const label = reactionOffsets ? formatReactionOffset(reactionOffsets[tk]) : null;
      return label ? label.text : null;
    }
    // marble · live-marble — 등수 외 지표가 없으니 판의 크기가 곧 맥락.
    return ko.result.marbleMetric(state.players.length);
  };

  function leaveRoom() {
    router.push('/');
  }

  return (
    <main
      className="fixed inset-0 z-30 overflow-y-auto overscroll-contain text-center"
      style={{ background: 'radial-gradient(120% 80% at 50% 0%, #14141c 0%, #0b0b10 55%) #0b0b10' }}
    >
      {/* Confetti canvas pinned to the viewport so it doesn't scroll with content. */}
      <canvas
        ref={canvasRef}
        className="fixed inset-0 w-full h-full pointer-events-none z-0"
      />

      {/* min-h-full + justify-center keeps the result block vertically centered when
          content fits the viewport, while gracefully growing taller (and scrolling)
          when the trivia detail panel expands beyond the screen. */}
      <div
        className="relative z-10 min-h-full flex flex-col items-center justify-center px-6 py-8"
        style={{
          paddingTop: 'max(env(safe-area-inset-top), 32px)',
          paddingBottom: 'max(env(safe-area-inset-bottom), 32px)',
        }}
      >
      <div className="relative z-10 w-full max-w-sm flex flex-col items-center">
        {/* Header chip — 🎯 오늘의 벌칙 × N명 */}
        <div className="inline-flex items-center gap-2 pl-3.5 pr-3 py-1.5 rounded-full bg-white/[0.05] border border-white/[0.08] text-xs text-zinc-400 font-semibold whitespace-nowrap">
          <span className="text-sm">🎯</span>
          <span>{ko.result.headerChip}</span>
          <span className="px-2 py-0.5 rounded-full bg-amber-400 text-zinc-900 font-extrabold text-xs">
            {ko.result.countBadge(losers.length)}
          </span>
        </div>

        <LoserBlock
          losers={losers}
          reason={loserReason}
          offsets={showReactionMs ? reactionOffsets : undefined}
          scores={showTriviaScores ? triviaFinalScores : undefined}
          metricFor={quizMetricFor}
        />

        <div
          className={clsx(
            'mt-8 font-extrabold -tracking-wide',
            iLost ? 'text-rose-300' : 'text-emerald-300',
          )}
          style={{ fontSize: iLost && losers.length === 1 ? 18 : 17 }}
        >
          {iLost ? ko.result.youLost : ko.result.youWon}
        </div>

        {/* 전체 순위는 항상 펼침 — 접어두면 놀릴 재료가 사라진다. 5명이면 접을 이유도 없다.
            색만으로 구분하지 않도록 ✕ 벌칙 / ✓ 면제 라벨을 붙인다(색약 + 저화질 캡처). */}
        {fullRanking.length > 0 && (
          <div className="mt-8 w-full text-left">
            <div className="flex items-baseline justify-between gap-2 px-1">
              <h2 className="text-[13px] font-bold text-zinc-400">{ko.result.fullRanking}</h2>
              <span className="text-[13px] text-zinc-600">
                {ko.result.rankingSub(ko.games[state.gameId])}
              </span>
            </div>
            <RankingList
              ranking={fullRanking}
              myToken={myToken}
              loserTokens={result.losers}
              offsets={showReactionMs ? reactionOffsets : undefined}
              scores={showTriviaScores ? triviaFinalScores : undefined}
            />
          </div>
        )}

        {/* 결과 카드 공유 + 재초대 — 호스트·게스트 공통. 단톡방으로 들고 나가는 바이럴
            고리(공유)와 다음 라운드에 늦은 친구를 합류시키는 고리(초대). */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <ResultShareButton
            losers={losers}
            header={ko.share.cardHeader(
              `${GAME_META[state.gameId].emoji} ${ko.games[state.gameId]}`,
              state.players.length,
            )}
            reasonBadge={ko.result.loserReasonBadge(loserReason)}
            metric={losers.length === 1 ? cardMetricFor(losers[0].playerToken) : null}
            winner={fullRanking[0] ? ko.share.cardWinner(fullRanking[0].nickname) : null}
          />
          {inviteUrl && (
            <button
              type="button"
              onClick={() => setShowInvite(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/[0.06] border border-white/[0.1] text-zinc-200 font-bold text-sm active:scale-[0.98]"
            >
              <span aria-hidden>👥</span>
              <span>{ko.result.invite}</span>
            </button>
          )}
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
            <button
              type="button"
              onClick={leaveRoom}
              className="px-4 py-2.5 rounded-xl bg-transparent text-zinc-400 border border-zinc-800 text-[13px] font-semibold active:scale-[0.98]"
            >
              {ko.result.leaveRoom}
            </button>
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

        {/* 대기 시간 광고 — 액션 버튼 아래. 다음 라운드를 기다리는 동안 노출 */}
        <AdSlot placement="result" width={320} height={50} className="mt-6" />
      </div>

      {/* Trivia: filtered "특이점" detail. Hides questions where everyone got the
          same outcome (all right / all wrong / all skipped) — only shows the rounds
          worth teasing about ("4명 다 맞혔는데 한 명만…"). */}
      {triviaQuestions &&
        triviaQuestions.length > 0 &&
        isQuizGame(state.gameId) &&
        (() => {
          const picks =
            (state.currentRound?.replay as TriviaReplayData | undefined)?.picks ?? {};
          if (Object.keys(picks).length === 0) return null;
          return (
            <TriviaDetailPanel
              questions={triviaQuestions}
              picks={picks}
              players={state.players}
              myToken={myToken}
            />
          );
        })()}
      </div>

      {showInvite && inviteUrl && (
        <InviteSheet url={inviteUrl} onClose={() => setShowInvite(false)} />
      )}
    </main>
  );
}

function LoserBlock({
  losers,
  reason,
  offsets,
  scores,
  metricFor,
}: {
  losers: { playerToken: string; nickname: string; color: string }[];
  reason: string;
  offsets?: Record<string, number | null>;
  scores?: Record<string, number>;
  metricFor?: (playerToken: string) => string | null;
}) {
  const n = losers.length;
  const nameSize = n === 1 ? 80 : n === 2 ? 56 : 44;
  const lineGap = n === 1 ? 0 : n === 2 ? 14 : 10;
  const dotSize = n === 1 ? 14 : n === 2 ? 12 : 10;

  return (
    <div className="mt-9 flex flex-col items-center" style={{ gap: lineGap }}>
      {/* 기울어진 "벌칙 당첨" 스탬프 — 단톡방 캡처에서 누가 걸렸는지 1초에 읽히게.
          이름 위로 겹치지 않도록 이름 블록 바로 위에 얹는다. */}
      <div className="relative mb-3 -rotate-[7deg] rounded-lg border-[2.5px] border-red-500/70 px-3.5 py-1 text-[15px] font-black tracking-[0.08em] text-red-400">
        {ko.result.stamp}
      </div>
      {losers.map((p) => {
        const offsetLabel = offsets ? formatReactionOffset(offsets[p.playerToken]) : null;
        const scoreVal = scores ? (scores[p.playerToken] ?? 0) : null;
        const metric = metricFor?.(p.playerToken) ?? null;
        return (
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
            <div className="flex items-center gap-1.5 flex-wrap justify-center">
              <div className="inline-flex items-center rounded-full border border-red-500/30 bg-red-500/15 px-3 py-1 text-xs font-bold text-red-300">
                {ko.result.loserReasonBadge(reason)}
              </div>
              {offsetLabel && (
                <div
                  className={clsx(
                    'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold tabular-nums border',
                    offsetLabel.tone === 'rose'
                      ? 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                      : offsetLabel.tone === 'dim'
                        ? 'bg-zinc-500/10 border-zinc-700 text-zinc-500'
                        : 'bg-white/[0.05] border-white/[0.08] text-zinc-300',
                  )}
                >
                  {offsetLabel.text}
                </div>
              )}
              {metric == null && scoreVal != null && (
                <div className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold tabular-nums border bg-amber-400/10 border-amber-400/30 text-amber-200">
                  {ko.trivia.yourScore(scoreVal)}
                </div>
              )}
            </div>
            {/* 퀴즈는 점수만으론 왜 졌는지 안 보인다 — 정답 수까지 한 줄로. */}
            {metric && <div className="text-[13px] text-zinc-400 tabular-nums">{metric}</div>}
          </div>
        );
      })}
    </div>
  );
}

function RankingList({
  ranking,
  myToken,
  loserTokens,
  offsets,
  scores,
}: {
  ranking: { playerToken: string; nickname: string; color: string }[];
  myToken: string | null;
  loserTokens: string[];
  offsets?: Record<string, number | null>;
  scores?: Record<string, number>;
}) {
  return (
    <ul className="mt-2 w-full max-w-sm space-y-1.5">
      {ranking.map((p, i) => {
        const rank = i + 1;
        const isMe = p.playerToken === myToken;
        const isLoser = loserTokens.includes(p.playerToken);
        const offsetLabel = offsets ? formatReactionOffset(offsets[p.playerToken]) : null;
        const scoreVal = scores ? (scores[p.playerToken] ?? 0) : null;
        return (
          <li
            key={p.playerToken}
            className={clsx(
              'flex items-center gap-2.5 rounded-lg px-2 py-2 text-[15px]',
              isLoser
                ? 'bg-red-500/15 ring-1 ring-red-500/30'
                : isMe
                  ? 'bg-amber-400/15'
                  : undefined,
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
            <span
              className={clsx(
                'flex-1 truncate',
                isLoser
                  ? 'text-red-200 font-bold'
                  : isMe
                    ? 'text-amber-300 font-bold'
                    : 'text-zinc-200',
              )}
            >
              {p.nickname}
            </span>
            <span
              className={clsx(
                'shrink-0 text-[11px] font-bold',
                isLoser ? 'text-red-300' : 'text-zinc-600',
              )}
            >
              {isLoser ? ko.result.rowLoser : ko.result.rowSafe}
            </span>
            {offsetLabel && (
              <span
                className={clsx(
                  'shrink-0 text-xs font-bold tabular-nums',
                  offsetLabel.tone === 'rose'
                    ? 'text-rose-400'
                    : offsetLabel.tone === 'dim'
                      ? 'text-zinc-600'
                      : isMe
                        ? 'text-amber-200'
                        : 'text-zinc-400',
                )}
              >
                {offsetLabel.text}
              </span>
            )}
            {scoreVal != null && (
              <span
                className={clsx(
                  'shrink-0 text-xs font-black tabular-nums',
                  isMe ? 'text-amber-200' : 'text-zinc-300',
                )}
              >
                {ko.trivia.yourScore(scoreVal)}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Reaction game: classify a tap offset for display.
 *  - null → "미탭" (dim)
 *  - < REACTION_MIN_HUMAN_RT_MS (incl. negative) → "−180ms · 위반" (rose)
 *  - otherwise → "217ms" (normal)
 * Mirrors server-side classify() in src/games/reaction/server.ts so badge colors
 * line up with bucket placement.
 */
function formatReactionOffset(
  offset: number | null | undefined,
): { text: string; tone: 'normal' | 'rose' | 'dim' } | null {
  if (offset === undefined) return null;
  if (offset === null) {
    return { text: ko.reaction.resultNoTap, tone: 'dim' };
  }
  if (offset < GAME.REACTION_MIN_HUMAN_RT_MS) {
    return { text: ko.reaction.resultFalseStart(offset), tone: 'rose' };
  }
  return { text: ko.reaction.resultMs(offset), tone: 'normal' };
}
