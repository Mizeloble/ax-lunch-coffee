import { describe, it, expect } from 'vitest';
import { resolveLosers } from './losers';
import { marbleServer } from '../server';

// 레이스 연출은 서버가 고른 벌칙자와 정확히 같은 집합을 지목해야 한다. 어긋나면
// 꼴찌에서 두 번째가 "4등 골인!" 중립 카드를 본 뒤 결과 화면에서 벌칙자로 뒤집힌다.
const ORDER = ['a', 'b', 'c', 'd', 'e']; // 1등 → 꼴찌

describe('resolveLosers', () => {
  it('벌칙 1명: 꼴찌만, 직전 완주자가 확정 시점', () => {
    expect(resolveLosers(ORDER, 1)).toEqual({ loserTokens: ['e'], lastSafeToken: 'd' });
  });

  it('벌칙 2~3명: 뒤에서부터 N명을 꼴찌순으로, 마지막 생존자가 확정 시점', () => {
    expect(resolveLosers(ORDER, 2)).toEqual({ loserTokens: ['e', 'd'], lastSafeToken: 'c' });
    expect(resolveLosers(ORDER, 3)).toEqual({ loserTokens: ['e', 'd', 'c'], lastSafeToken: 'b' });
  });

  it('인원보다 큰 벌칙 수는 전원 몰살 대신 1등을 남긴다 (서버 클램프와 동일)', () => {
    // 2명 방 + 벌칙 3명: 서버도 effectiveLoserCount로 1명까지만 잡는다.
    expect(resolveLosers(['a', 'b'], 3)).toEqual({ loserTokens: ['b'], lastSafeToken: 'a' });
  });

  it('빈 finishOrder에서 터지지 않는다', () => {
    expect(resolveLosers([], 1)).toEqual({ loserTokens: [], lastSafeToken: undefined });
  });

  it('확정 시점은 항상 모든 벌칙자보다 앞선다', () => {
    for (const n of [1, 2, 3]) {
      const { loserTokens, lastSafeToken } = resolveLosers(ORDER, n);
      expect(loserTokens).not.toContain(lastSafeToken);
      expect(ORDER.indexOf(lastSafeToken!)).toBeLessThan(
        Math.min(...loserTokens.map((t) => ORDER.indexOf(t))),
      );
    }
  });
});

describe('연출 ↔ 서버 결과 일치', () => {
  it('렌더러가 뽑는 벌칙자 집합이 서버 losers와 같다', async () => {
    const players = ['p1', 'p2', 'p3', 'p4', 'p5'].map((playerToken) => ({
      playerToken,
      nickname: playerToken,
      color: '#fff',
    }));
    for (const loserCount of [1, 2, 3]) {
      const replay = await marbleServer.computeResult({ seed: 7, players, loserCount });
      const { loserTokens } = resolveLosers(
        (replay.data as { finishOrder: string[] }).finishOrder,
        loserCount,
      );
      // 서버 losers는 완주순(앞이 덜 나쁨), 연출은 꼴찌순 — 집합으로 비교한다.
      expect([...loserTokens].sort()).toEqual([...replay.losers].sort());
    }
  });
});
