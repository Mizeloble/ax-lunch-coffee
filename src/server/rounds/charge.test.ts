import { describe, it, expect } from 'vitest';
import { computeChargeRatios } from './charge';
import { GAME } from '../../lib/constants';

// 응원 비율은 마블 물리(반경·밀도·헤드스타트)에 그대로 먹히는 값이라, 여기서
// 새는 건 결과가 조용히 기울어지는 형태로만 드러난다. rounds/ 전체에 테스트가
// 하나도 없던 게 2차 검증에서 지적된 사각지대라 이 함수부터 못박는다.
const CAP = GAME.CHARGE_TAP_CAP;

describe('computeChargeRatios', () => {
  it('탭 수를 0..1로 정규화한다', () => {
    const r = computeChargeRatios(
      [{ playerToken: 'a' }, { playerToken: 'b' }],
      new Map([
        ['a', CAP],
        ['b', CAP / 2],
      ]),
    );
    expect(r.a).toBe(1);
    expect(r.b).toBe(0.5);
  });

  it('미탭 플레이어는 0 (키 자체가 없어도)', () => {
    const r = computeChargeRatios([{ playerToken: 'a' }], new Map());
    expect(r.a).toBe(0);
  });

  it('manual(폰 없는) 참가자는 탭 수와 무관하게 고정 기본값', () => {
    const r = computeChargeRatios(
      [{ playerToken: 'm', manual: true }],
      new Map([['m', CAP]]),
    );
    expect(r.m).toBe(GAME.CHARGE_MANUAL_DEFAULT);
  });

  it('캡을 넘는 보고값·음수·NaN을 막는다 (클라 자기신고 값이다)', () => {
    const r = computeChargeRatios(
      [{ playerToken: 'over' }, { playerToken: 'neg' }, { playerToken: 'nan' }],
      new Map([
        ['over', CAP * 10],
        ['neg', -50],
        ['nan', Number.NaN],
      ]),
    );
    expect(r.over).toBe(1);
    expect(r.neg).toBe(0);
    expect(r.nan).toBe(0);
  });

  it('모든 참가자에게 유한한 비율을 부여한다', () => {
    const players = ['a', 'b', 'c'].map((playerToken) => ({ playerToken }));
    const r = computeChargeRatios(players, new Map([['a', 3]]));
    for (const p of players) {
      expect(Number.isFinite(r[p.playerToken]), p.playerToken).toBe(true);
      expect(r[p.playerToken]).toBeGreaterThanOrEqual(0);
      expect(r[p.playerToken]).toBeLessThanOrEqual(1);
    }
  });
});
