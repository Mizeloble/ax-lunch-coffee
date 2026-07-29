import type { ReplayPayload } from '../../server/rooms';
import type { ComputeResultInput, GameServerModule } from '../types';
import { GAME } from '../../lib/constants';
import { mulberry32 } from '../../lib/rng';
import { TRIVIA_POOL_SORTED } from './questions';
import { computeRunningScores } from './scoring';

/**
 * Structural shape every quiz question must satisfy. Both trivia and nonsense
 * pools are assignable to this (their narrower `category` unions widen to string),
 * so the plan/score engine below stays content-agnostic and is shared by both games.
 */
export type QuizQuestion = {
  id: string;
  category: string;
  question: string;
  choices: readonly [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
  note?: string;
  /**
   * Sibling families this question belongs to. Two questions sharing a family
   * never land in the same round — see `pickQuestions`. A question can sit in
   * more than one family (에펠탑 문항은 "에펠탑"이자 "유럽 국가" 계열).
   */
  exclusiveGroups?: readonly string[];
  /** 1 = easy, 2 = normal, 3 = hard. Untagged pools (nonsense) count as normal. */
  difficulty?: 1 | 2 | 3;
};

const DEFAULT_DIFFICULTY = 2;

/**
 * Replay payload broadcast on game:start. Carries everything the client needs to
 * render every question + reveal phase deterministically off wall-clock.
 *
 * `correctIndex` is the *post-shuffle* position. Choices are also already shuffled.
 * Both are server-authoritative; client never recomputes.
 *
 * `cumulativeScores` is filled in at result time (computeResult) and is empty in
 * the broadcast at game:start — the client doesn't need it during the answer phase
 * and exposing per-player ranking mid-round would leak who's ahead before reveal.
 * Mid-round leaderboard rendering uses the client's local prediction (which mirrors
 * the same `scoring.ts` formula), and the result screen uses the authoritative
 * snapshot here.
 */
export type TriviaReplayData = {
  schedule: {
    /** ms offsets from startAt — when each question becomes interactive. */
    openAtOffsets: number[];
    /** ms offsets from startAt — when the answer window closes / reveal begins. */
    closeAtOffsets: number[];
  };
  questions: Array<{
    id: string;
    category: string;
    question: string;
    choices: [string, string, string, string];
    correctIndex: 0 | 1 | 2 | 3;
    /** Optional "did you know?" line for the result-screen detail view. */
    note?: string;
  }>;
  /**
   * Per-player cumulative score timeline: scores[playerToken][qIndex] = total
   * points after question qIndex (inclusive). Empty {} during the in-game broadcast,
   * populated only in the result. Used by ResultScreen to display final scores.
   */
  scores: Record<string, number[]>;
  /**
   * Per-player per-question picks (post-shuffle choice index, or null = no answer).
   * Empty {} during the in-game broadcast — exposing this mid-round would spoil
   * everyone's answers. Populated only in the result, where it powers the
   * "특이점" detail panel ("everyone got it right except…", or vice versa).
   */
  picks: Record<string, Array<0 | 1 | 2 | 3 | null>>;
};

/**
 * Draw `count` questions without replacement under three constraints:
 *
 * - Sibling exclusion: at most one question per `exclusiveGroups` family. Sibling
 *   questions permute a closed answer set (베토벤 별명 4개, 영화제 최고상 3개),
 *   so revealing one crosses answers off the next — a round with two of them is
 *   measurably easier. Some families can't be fixed by rewriting distractors
 *   because the plausible wrong answers *are* the siblings' answers.
 * - Difficulty quota: ~40% easy, ~20% hard, rest normal (5 → 2/2/1). Without this
 *   a seeded draw swings between an all-"수도는?" round and an all-연도암기 round.
 * - Freshness: questions already served to this room are skipped (`excludeIds`).
 *   A party plays several rounds back to back, and a 345-question pool still
 *   repeats ~17% of slots over 20 rounds by pure chance — "아까 그거 또 나왔네".
 * - Category spread: one category fills at most ~60% of the round (3 of 5), so a
 *   round doesn't land 4-5 questions of the same flavor.
 *
 * Constraints are dropped in reverse order of importance when the pool can't
 * satisfy them (a leak hurts more than a missed quota, which hurts more than a
 * repeat, which hurts more than a lopsided flavor mix), so the round is always
 * `min(count, pool.length)` long. The quota switches off entirely for a pool that
 * carries no difficulty tags (nonsense) — otherwise every question would read as
 * normal, the normal quota would bind at 2, and the *category* cap would be the
 * constraint dropped to fill the round. That would silently trade one pool's
 * balance for another's.
 *
 * Picks come back sorted easy → hard: the finale carries a 2x multiplier, so the
 * last question should be the one worth betting on.
 */
function pickQuestions(
  rng: () => number,
  count: number,
  sortedPool: readonly QuizQuestion[],
  excludeIds: ReadonlySet<string>,
): QuizQuestion[] {
  const pool = [...sortedPool];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }
  const n = Math.min(count, pool.length);
  const cap = Math.max(1, Math.ceil(n * 0.6));
  const easyQuota = Math.round(n * 0.4);
  const hardQuota = Math.max(1, Math.floor(n * 0.2));
  const quota: Record<1 | 2 | 3, number> = {
    1: easyQuota,
    2: n - easyQuota - hardQuota,
    3: hardQuota,
  };

  const picked: QuizQuestion[] = [];
  const pickedIds = new Set<string>();
  const perCategory = new Map<string, number>();
  const perDifficulty: Record<1 | 2 | 3, number> = { 1: 0, 2: 0, 3: 0 };
  const usedGroups = new Set<string>();

  const quotaEnabled = sortedPool.some((q) => q.difficulty != null);
  const levelOf = (q: QuizQuestion) => q.difficulty ?? DEFAULT_DIFFICULTY;
  const noUsedSibling = (q: QuizQuestion) =>
    !(q.exclusiveGroups ?? []).some((g) => usedGroups.has(g));
  const underQuota = (q: QuizQuestion) =>
    !quotaEnabled || perDifficulty[levelOf(q)] < quota[levelOf(q)];
  const underCap = (q: QuizQuestion) => (perCategory.get(q.category) ?? 0) < cap;
  const unseen = (q: QuizQuestion) => !excludeIds.has(q.id);

  const take = (q: QuizQuestion) => {
    picked.push(q);
    pickedIds.add(q.id);
    perCategory.set(q.category, (perCategory.get(q.category) ?? 0) + 1);
    perDifficulty[levelOf(q)] += 1;
    for (const g of q.exclusiveGroups ?? []) usedGroups.add(g);
  };

  const passes: Array<(q: QuizQuestion) => boolean> = [
    (q) => noUsedSibling(q) && underQuota(q) && unseen(q) && underCap(q),
    (q) => noUsedSibling(q) && underQuota(q) && unseen(q),
    (q) => noUsedSibling(q) && underQuota(q) && underCap(q),
    (q) => noUsedSibling(q) && underQuota(q),
    (q) => noUsedSibling(q),
    () => true,
  ];
  for (const accepts of passes) {
    for (const q of pool) {
      if (picked.length >= n) break;
      if (pickedIds.has(q.id)) continue;
      if (!accepts(q)) continue;
      take(q);
    }
  }

  // Stable sort: ties keep shuffle order, so this stays deterministic.
  return picked
    .map((q, i) => ({ q, i }))
    .sort((a, b) => levelOf(a.q) - levelOf(b.q) || a.i - b.i)
    .map((e) => e.q);
}

function shuffleChoices(
  rng: () => number,
  question: QuizQuestion,
): { choices: [string, string, string, string]; correctIndex: 0 | 1 | 2 | 3 } {
  const order = [0, 1, 2, 3];
  for (let i = 3; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = order[i];
    order[i] = order[j];
    order[j] = tmp;
  }
  const choices = order.map((idx) => question.choices[idx]) as [string, string, string, string];
  const correctIndex = order.indexOf(question.correctIndex) as 0 | 1 | 2 | 3;
  return { choices, correctIndex };
}

/**
 * Build the complete intro/replay schedule from a seed. Pure — no Date.now / global RNG.
 * The quiz round (`rounds/quiz.ts`) calls this directly to ship the schedule in the
 * `game:start` replay; `computeResult` rebuilds the same payload at result time so no
 * state leaks through.
 *
 * `excludeIds` (ids this room has already been served) is an *input*, not state read
 * from the room — the round module snapshots it at start and hands the identical
 * snapshot to `computeResult`, so both builds agree even though the room's list grows
 * between the two calls. Same (seed, pool, excludeIds) → same plan, always.
 *
 * Determinism: a single rng stream consumed in fixed order — pickQuestions first,
 * then per-question shuffleChoices. `excludeIds` only filters candidates; it consumes
 * no rng, so adding it leaves every existing seed→shuffle mapping intact. Add new rng
 * consumers only at the end to keep those mappings stable.
 */
export function buildQuizPlan(
  seed: number,
  sortedPool: readonly QuizQuestion[],
  excludeIds: Iterable<string> = [],
): {
  questions: Omit<TriviaReplayData, 'scores'>['questions'];
  schedule: TriviaReplayData['schedule'];
  durationMs: number;
} {
  const rng = mulberry32(seed);
  const picks = pickQuestions(
    rng,
    GAME.TRIVIA_QUESTION_COUNT,
    sortedPool,
    excludeIds instanceof Set ? excludeIds : new Set(excludeIds),
  );

  const questions = picks.map((q) => {
    const { choices, correctIndex } = shuffleChoices(rng, q);
    return {
      id: q.id,
      category: q.category,
      question: q.question,
      choices,
      correctIndex,
      ...(q.note ? { note: q.note } : {}),
    };
  });

  const openAtOffsets: number[] = [];
  const closeAtOffsets: number[] = [];
  let cursor = 0;
  for (let i = 0; i < questions.length; i++) {
    openAtOffsets.push(cursor);
    cursor += GAME.TRIVIA_QUESTION_MS;
    closeAtOffsets.push(cursor);
    cursor += GAME.TRIVIA_REVEAL_MS;
  }
  const durationMs = cursor + GAME.TRIVIA_TAIL_MS;

  return {
    questions,
    schedule: { openAtOffsets, closeAtOffsets },
    durationMs,
  };
}

type Entry = {
  token: string;
  total: number;
  cumulative: number[];
  // Sum of atOffsetMs for *correct* answers only. Defensive tie-break for
  // sub-ms-equal scores; primary ranking is by total points.
  speedSum: number;
};

/**
 * Pool-agnostic result computation shared by trivia and nonsense. Same input
 * shape; the only difference between the two games is which `sortedPool` is passed.
 */
export function computeQuizResult(
  input: ComputeResultInput,
  sortedPool: readonly QuizQuestion[],
): ReplayPayload {
  const { seed, players, loserCount, triviaAnswers, excludeIds } = input;
  // Must be the *same* snapshot the round used at start — see buildQuizPlan.
  const plan = buildQuizPlan(seed, sortedPool, excludeIds ?? []);
  const correctIndices = plan.questions.map((q) => q.correctIndex);

  const entries: Entry[] = players.map((p) => {
    const answers = triviaAnswers?.[p.playerToken] ?? [];
    const { cumulative, total } = computeRunningScores(answers, correctIndices);
    let speedSum = 0;
    for (let i = 0; i < plan.questions.length; i++) {
      const ans = answers[i];
      if (ans && ans.choice === correctIndices[i]) speedSum += ans.atOffsetMs;
    }
    return { token: p.playerToken, total, cumulative, speedSum };
  });

  entries.sort((a, b) => {
    if (a.total !== b.total) return b.total - a.total; // higher score = better
    if (a.speedSum !== b.speedSum) return a.speedSum - b.speedSum; // faster = better
    return a.token < b.token ? -1 : a.token > b.token ? 1 : 0;
  });

  const ranking = entries.map((e) => e.token);
  const losers = ranking.slice(-loserCount);

  const scores: Record<string, number[]> = {};
  for (const e of entries) scores[e.token] = e.cumulative;

  // Pull per-player picks straight from the input answer log (already in
  // post-shuffle index space). Used by the result-screen "특이점" panel.
  const picks: Record<string, Array<0 | 1 | 2 | 3 | null>> = {};
  for (const p of players) {
    const ans = triviaAnswers?.[p.playerToken] ?? [];
    picks[p.playerToken] = plan.questions.map((_, i) => ans[i]?.choice ?? null);
  }

  const data: TriviaReplayData = {
    schedule: plan.schedule,
    questions: plan.questions,
    scores,
    picks,
  };

  return {
    durationMs: plan.durationMs,
    ranking,
    losers,
    data,
  };
}

export const triviaServer: GameServerModule = {
  computeResult(input: ComputeResultInput): ReplayPayload {
    return computeQuizResult(input, TRIVIA_POOL_SORTED);
  },
  // No prepareIntro: the quiz round bakes the schedule into the game:start replay
  // directly (see rounds/quiz.ts), so it never goes through prepareGameIntro.
};
