import { describe, it, expect } from 'vitest';
import { prepareReactionIntro, reactionServer } from './server';
import { GAME } from '../../lib/constants';
import type { GameInputPlayer } from '../types';

function players(...tokens: string[]): GameInputPlayer[] {
  return tokens.map((t) => ({ playerToken: t, nickname: t, color: '#fff' }));
}

// `GameServerModule.computeResult` is typed `ReplayPayload | Promise<ReplayPayload>`
// (marble's is async). Reaction's is synchronous, but we `await` so the type narrows.
describe('reactionServer.computeResult', () => {
  it('ranks taps fastest-first, then false starts, then no-taps', async () => {
    const res = await reactionServer.computeResult({
      seed: 1,
      players: players('a', 'b', 'c', 'd'),
      loserCount: 1,
      tapOffsets: {
        a: 120, // valid tap
        b: 300, // valid tap (slower)
        c: -50, // false start (before goAt)
        d: null, // no tap
      },
    });
    expect(res.ranking).toEqual(['a', 'b', 'c', 'd']);
    expect(res.losers).toEqual(['d']);
  });

  it('treats a sub-human-RT positive offset as a false start', async () => {
    const res = await reactionServer.computeResult({
      seed: 1,
      players: players('fast', 'slow'),
      loserCount: 1,
      tapOffsets: {
        fast: GAME.REACTION_MIN_HUMAN_RT_MS - 1, // flinch → false start
        slow: GAME.REACTION_MIN_HUMAN_RT_MS + 100, // legit tap → wins
      },
    });
    expect(res.ranking).toEqual(['slow', 'fast']);
  });

  it('ranks the earliest false-starter worst', async () => {
    const res = await reactionServer.computeResult({
      seed: 1,
      players: players('early', 'late'),
      loserCount: 1,
      tapOffsets: { early: -200, late: -10 },
    });
    // late (-10) flinched less → better; early (-200) is the worst.
    expect(res.ranking).toEqual(['late', 'early']);
    expect(res.losers).toEqual(['early']);
  });

  it('breaks no-tap ties by a seed-derived order — deterministic per seed, varying across seeds', async () => {
    const tied = async (seed: number) =>
      (
        await reactionServer.computeResult({
          seed,
          players: players('zoe', 'amy'),
          loserCount: 1,
          tapOffsets: { zoe: null, amy: null },
        })
      ).ranking;
    // Same seed → same order, regardless of player input order.
    expect(await tied(1)).toEqual(await tied(1));
    const swapped = await reactionServer.computeResult({
      seed: 1,
      players: players('amy', 'zoe'),
      loserCount: 1,
      tapOffsets: { zoe: null, amy: null },
    });
    expect(swapped.ranking).toEqual(await tied(1));
    // Not a fixed token order: across seeds both players lose sometimes.
    // (Alphabetical tie-break made the same manual player lose every round.)
    const firsts = new Set<string>();
    for (let s = 0; s < 20; s++) firsts.add((await tied(s))[0]);
    expect(firsts).toEqual(new Set(['amy', 'zoe']));
  });

  it('broadcast durationMs leaks nothing about goAt — same for every seed', () => {
    // goAt은 라운드의 유일한 비밀인데 durationMs가 그 아핀 파생값이면
    // `goAt = startAt + durationMs - 2100`으로 그대로 역산된다(실제 발생한 회귀).
    const durations = new Set<number>();
    const goAts = new Set<number>();
    for (let seed = 0; seed < 200; seed++) {
      const intro = prepareReactionIntro(seed);
      durations.add(intro.durationMs);
      goAts.add(intro.goAtOffsetMs);
    }
    expect(goAts.size).toBeGreaterThan(1); // goAt은 seed마다 달라야 하고
    expect(durations.size).toBe(1); // durationMs는 그걸 드러내면 안 된다
    // 상한이어야 라운드가 잘리지 않는다.
    for (let seed = 0; seed < 200; seed++) {
      const intro = prepareReactionIntro(seed);
      expect(intro.durationMs).toBeGreaterThanOrEqual(
        intro.deadlineOffsetMs + GAME.REACTION_TAIL_MS,
      );
    }
  });

  it('is deterministic for the same seed (intro timing)', async () => {
    const input = { seed: 42, players: players('a', 'b'), loserCount: 1, tapOffsets: {} };
    const a = await reactionServer.computeResult(input);
    const b = await reactionServer.computeResult(input);
    expect(a.durationMs).toBe(b.durationMs);
    expect((a.data as { goAt: number }).goAt).toBe((b.data as { goAt: number }).goAt);
  });
});
