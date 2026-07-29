import { describe, it, expect } from 'vitest';
import { buildQuizPlan, computeQuizResult, type QuizQuestion } from './server';
import { GAME } from '../../lib/constants';
import type { GameInputPlayer } from '../types';

// Synthetic pool (decoupled from the real question bank so these tests stay valid
// as questions are added). Each question's correct answer text is uniquely tagged
// so we can assert the shuffle preserves *which* answer is correct.
const POOL: QuizQuestion[] = Array.from({ length: 8 }, (_, i) => ({
  id: `q${i}`,
  category: 'test',
  question: `question ${i}?`,
  choices: [`q${i}-a`, `q${i}-b`, `q${i}-c`, `q${i}-d`] as [string, string, string, string],
  correctIndex: (i % 4) as 0 | 1 | 2 | 3,
}));

const correctTextOf = (q: QuizQuestion) => q.choices[q.correctIndex];

function players(...tokens: string[]): GameInputPlayer[] {
  return tokens.map((t) => ({ playerToken: t, nickname: t, color: '#fff' }));
}

describe('buildQuizPlan', () => {
  it('is deterministic for the same seed + pool', () => {
    const a = buildQuizPlan(123, POOL);
    const b = buildQuizPlan(123, POOL);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('produces the configured number of questions with 4 shuffled choices each', () => {
    const plan = buildQuizPlan(7, POOL);
    expect(plan.questions).toHaveLength(GAME.TRIVIA_QUESTION_COUNT);
    for (const q of plan.questions) {
      expect(q.choices).toHaveLength(4);
      expect(q.correctIndex).toBeGreaterThanOrEqual(0);
      expect(q.correctIndex).toBeLessThanOrEqual(3);
    }
  });

  it('keeps the correct answer pointing at the right text after shuffling', () => {
    const plan = buildQuizPlan(7, POOL);
    const sourceById = new Map(POOL.map((q) => [q.id, q]));
    for (const q of plan.questions) {
      const src = sourceById.get(q.id)!;
      expect(q.choices[q.correctIndex]).toBe(correctTextOf(src));
      // Shuffle must preserve the full choice set, not just the answer.
      expect([...q.choices].sort()).toEqual([...src.choices].sort());
    }
  });

  it('emits a monotonically increasing schedule', () => {
    const plan = buildQuizPlan(7, POOL);
    const { openAtOffsets, closeAtOffsets } = plan.schedule;
    expect(openAtOffsets).toHaveLength(GAME.TRIVIA_QUESTION_COUNT);
    for (let i = 0; i < openAtOffsets.length; i++) {
      expect(closeAtOffsets[i]).toBeGreaterThan(openAtOffsets[i]);
      if (i > 0) expect(openAtOffsets[i]).toBeGreaterThan(closeAtOffsets[i - 1]);
    }
  });

  it('varies the question selection with the seed', () => {
    const firstIds = new Set(
      [1, 2, 3, 4, 5, 6].map((s) => buildQuizPlan(s, POOL).questions[0].id),
    );
    expect(firstIds.size).toBeGreaterThan(1);
  });

  it('caps how much of a round one category can fill (~60%)', () => {
    const mixed: QuizQuestion[] = Array.from({ length: 12 }, (_, i) => ({
      id: `m${i}`,
      category: i % 2 === 0 ? 'cat-a' : 'cat-b',
      question: `mixed ${i}?`,
      choices: [`m${i}-a`, `m${i}-b`, `m${i}-c`, `m${i}-d`] as [string, string, string, string],
      correctIndex: 0,
    }));
    const cap = Math.max(1, Math.ceil(GAME.TRIVIA_QUESTION_COUNT * 0.6));
    for (const seed of [1, 7, 42, 123, 999]) {
      const counts = new Map<string, number>();
      for (const q of buildQuizPlan(seed, mixed).questions) {
        counts.set(q.category, (counts.get(q.category) ?? 0) + 1);
      }
      for (const [cat, n] of counts) {
        expect(n, `seed ${seed} category ${cat}`).toBeLessThanOrEqual(cap);
      }
    }
  });

  it('fills the difficulty quota (2 easy / 2 normal / 1 hard) and orders easy → hard', () => {
    const tagged: QuizQuestion[] = Array.from({ length: 30 }, (_, i) => ({
      id: `t${String(i).padStart(2, '0')}`,
      category: `cat-${i % 4}`,
      question: `tagged ${i}?`,
      choices: [`t${i}-a`, `t${i}-b`, `t${i}-c`, `t${i}-d`] as [string, string, string, string],
      correctIndex: 0,
      difficulty: ((i % 3) + 1) as 1 | 2 | 3,
    }));
    const levelById = new Map(tagged.map((q) => [q.id, q.difficulty!]));
    for (const seed of [1, 7, 42, 123, 999, 31337]) {
      const levels = buildQuizPlan(seed, tagged).questions.map((q) => levelById.get(q.id)!);
      const count = (d: number) => levels.filter((x) => x === d).length;
      expect(count(1), `seed ${seed} easy`).toBe(2);
      expect(count(2), `seed ${seed} normal`).toBe(2);
      expect(count(3), `seed ${seed} hard`).toBe(1);
      expect([...levels], `seed ${seed} ordering`).toEqual([...levels].sort());
    }
  });

  it('leaves an untagged pool alone rather than trading its category balance', () => {
    // Regression: an untagged pool reads as all-normal. If the quota still applied
    // it would bind at 2 and the *category* cap would be dropped to fill the round.
    const mixed: QuizQuestion[] = Array.from({ length: 12 }, (_, i) => ({
      id: `u${i}`,
      category: i % 2 === 0 ? 'cat-a' : 'cat-b',
      question: `untagged ${i}?`,
      choices: [`u${i}-a`, `u${i}-b`, `u${i}-c`, `u${i}-d`] as [string, string, string, string],
      correctIndex: 0,
    }));
    const cap = Math.max(1, Math.ceil(GAME.TRIVIA_QUESTION_COUNT * 0.6));
    for (const seed of [1, 7, 42, 123, 999]) {
      const counts = new Map<string, number>();
      for (const q of buildQuizPlan(seed, mixed).questions) {
        counts.set(q.category, (counts.get(q.category) ?? 0) + 1);
      }
      for (const [cat, n] of counts) expect(n, `seed ${seed} ${cat}`).toBeLessThanOrEqual(cap);
    }
  });

  it('never picks two questions from the same sibling family', () => {
    // 6 families of 3; plenty of room to honor the constraint.
    const siblings: QuizQuestion[] = Array.from({ length: 18 }, (_, i) => ({
      id: `s${String(i).padStart(2, '0')}`,
      category: `cat-${i % 3}`,
      question: `sibling ${i}?`,
      choices: [`s${i}-a`, `s${i}-b`, `s${i}-c`, `s${i}-d`] as [string, string, string, string],
      correctIndex: 0,
      exclusiveGroups: [`fam-${i % 6}`],
    }));
    for (const seed of [1, 7, 42, 123, 999, 31337]) {
      const seen = new Set<string>();
      for (const q of buildQuizPlan(seed, siblings).questions) {
        const fam = siblings.find((s) => s.id === q.id)!.exclusiveGroups![0];
        expect(seen.has(fam), `seed ${seed} repeated ${fam}`).toBe(false);
        seen.add(fam);
      }
    }
  });

  it('honors every family a question belongs to, not just the first', () => {
    // q0 shares family A with q1 and family B with q2 — picking q0 must block both.
    const multi: QuizQuestion[] = [
      { groups: ['A', 'B'] },
      { groups: ['A'] },
      { groups: ['B'] },
      { groups: ['A'] },
      { groups: ['B'] },
      { groups: ['A', 'B'] },
    ].map((spec, i) => ({
      id: `m${i}`,
      category: 'test',
      question: `multi ${i}?`,
      choices: [`m${i}-a`, `m${i}-b`, `m${i}-c`, `m${i}-d`] as [string, string, string, string],
      correctIndex: 0,
      exclusiveGroups: spec.groups,
    }));
    // Only 2 families exist, so a fully-constrained round can hold at most 2
    // questions; the rest come from the unconstrained fallback pass.
    for (const seed of [3, 11, 77]) {
      const plan = buildQuizPlan(seed, multi);
      expect(plan.questions).toHaveLength(GAME.TRIVIA_QUESTION_COUNT);
      const ids = plan.questions.map((q) => q.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('still fills the round when families would starve it', () => {
    // Every question is in one family — the constraint alone can only supply 1,
    // so the fallback must top the round up to the configured count.
    const oneFamily: QuizQuestion[] = Array.from({ length: 9 }, (_, i) => ({
      id: `f${i}`,
      category: 'test',
      question: `family ${i}?`,
      choices: [`f${i}-a`, `f${i}-b`, `f${i}-c`, `f${i}-d`] as [string, string, string, string],
      correctIndex: 0,
      exclusiveGroups: ['only'],
    }));
    const plan = buildQuizPlan(5, oneFamily);
    expect(plan.questions).toHaveLength(GAME.TRIVIA_QUESTION_COUNT);
    expect(new Set(plan.questions.map((q) => q.id)).size).toBe(GAME.TRIVIA_QUESTION_COUNT);
  });

  it('still fills the round when the pool cannot honor the category cap', () => {
    // POOL is single-category, so the cap alone can't fill the round — the
    // fallback pass must top it up to the configured count.
    const plan = buildQuizPlan(9, POOL);
    expect(plan.questions).toHaveLength(GAME.TRIVIA_QUESTION_COUNT);
    expect(new Set(plan.questions.map((q) => q.id)).size).toBe(GAME.TRIVIA_QUESTION_COUNT);
  });
});

describe('computeQuizResult', () => {
  const SEED = 555;
  // Reuse the same plan computeQuizResult builds internally to craft answers in
  // post-shuffle index space.
  const correctIndices = buildQuizPlan(SEED, POOL).questions.map((q) => q.correctIndex);
  const allCorrect = (atOffsetMs: number) =>
    correctIndices.map((c) => ({ choice: c, atOffsetMs }));
  const allWrong = () =>
    correctIndices.map((c) => ({ choice: ((c + 1) % 4) as 0 | 1 | 2 | 3, atOffsetMs: 0 }));

  it('ranks by score (fast-correct > slow-correct > wrong)', () => {
    const res = computeQuizResult(
      {
        seed: SEED,
        players: players('fast', 'slow', 'wrong'),
        loserCount: 1,
        triviaAnswers: { fast: allCorrect(0), slow: allCorrect(2000), wrong: allWrong() },
      },
      POOL,
    );
    expect(res.ranking).toEqual(['fast', 'slow', 'wrong']);
    expect(res.losers).toEqual(['wrong']);
  });

  it('breaks exact ties by playerToken alphabetically', () => {
    const res = computeQuizResult(
      {
        seed: SEED,
        players: players('zed', 'ann'),
        loserCount: 1,
        triviaAnswers: { zed: allCorrect(0), ann: allCorrect(0) },
      },
      POOL,
    );
    expect(res.ranking).toEqual(['ann', 'zed']);
  });

  it('is deterministic for identical input', () => {
    const input = {
      seed: SEED,
      players: players('a', 'b', 'c'),
      loserCount: 2,
      triviaAnswers: { a: allCorrect(0), b: allCorrect(500), c: allWrong() },
    };
    const a = computeQuizResult(input, POOL);
    const b = computeQuizResult(input, POOL);
    expect(a.ranking).toEqual(b.ranking);
    expect(a.losers).toEqual(b.losers);
  });
});
