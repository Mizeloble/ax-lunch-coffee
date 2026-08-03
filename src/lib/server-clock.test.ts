import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  getClockOffsetMs,
  resetClockForTest,
  serverNow,
  syncServerClock,
} from './server-clock';

/**
 * 오프셋 부호를 뒤집으면 스큐가 두 배로 벌어진다 — 눈으로는 "왜 나만 화면이
 * 어긋나지"로만 보여서 잡기 어렵다. 계산을 여기서 못박는다.
 */

type Sample = { serverAtMid: number; rtt: number };

/** 프로브 i마다 Date.now()가 t0, t1 순으로 불린다. */
function fakeSocket(samples: Sample[], t0Base = 1_000) {
  const times: number[] = [];
  let i = 0;
  for (const s of samples) {
    const t0 = t0Base + i * 1_000;
    times.push(t0, t0 + s.rtt);
    i++;
  }
  const nowSeq = [...times];
  let n = 0;
  vi.spyOn(Date, 'now').mockImplementation(() => nowSeq[Math.min(n++, nowSeq.length - 1)]);

  let call = 0;
  return {
    emit(_event: 'time:sync', ack: (serverTime: number) => void) {
      const s = samples[Math.min(call++, samples.length - 1)];
      ack(s.serverAtMid);
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  resetClockForTest();
});

describe('syncServerClock', () => {
  it('앞선 서버 시계를 양수 오프셋으로 잡는다', async () => {
    // 로컬이 서버보다 5초 느림. 서버는 왕복 중간 시점에 자기 시각을 찍는다.
    const skew = 5_000;
    const samples = [0, 1, 2, 3, 4].map((i) => {
      const t0 = 1_000 + i * 1_000;
      const rtt = 100;
      return { rtt, serverAtMid: t0 + rtt / 2 + skew };
    });
    await syncServerClock(fakeSocket(samples));
    expect(getClockOffsetMs()).toBe(skew);
  });

  it('뒤처진 서버 시계는 음수 오프셋', async () => {
    const skew = -3_000;
    const samples = [0, 1, 2, 3, 4].map((i) => {
      const t0 = 1_000 + i * 1_000;
      const rtt = 40;
      return { rtt, serverAtMid: t0 + rtt / 2 + skew };
    });
    await syncServerClock(fakeSocket(samples));
    expect(getClockOffsetMs()).toBe(skew);
  });

  it('RTT가 가장 낮은 표본을 채택한다 (지연이 클수록 비대칭 오차가 크다)', async () => {
    const truth = 2_000;
    // 느린 표본들은 왕복이 한쪽으로 쏠려 엉뚱한 값을 만든다.
    const samples = [0, 1, 2, 3, 4].map((i) => {
      const t0 = 1_000 + i * 1_000;
      if (i === 3) return { rtt: 20, serverAtMid: t0 + 10 + truth }; // 정확
      return { rtt: 800, serverAtMid: t0 + 400 + truth + 900 }; // 비대칭 오염
    });
    await syncServerClock(fakeSocket(samples));
    expect(getClockOffsetMs()).toBe(truth);
  });

  it('응답이 숫자가 아니면 무시하고 기존 추정치를 유지한다', async () => {
    const bad = {
      emit(_e: 'time:sync', ack: (t: number) => void) {
        (ack as (t: unknown) => void)(undefined);
      },
    };
    await syncServerClock(bad);
    expect(getClockOffsetMs()).toBe(0); // 동기화 실패 = 현행(보정 없음) 동작
  });

  it('serverNow()가 오프셋을 반영한다', async () => {
    const skew = 1_234;
    const samples = [0, 1, 2, 3, 4].map((i) => {
      const t0 = 1_000 + i * 1_000;
      return { rtt: 0, serverAtMid: t0 + skew };
    });
    const sock = fakeSocket(samples);
    await syncServerClock(sock);
    // 스텁 큐가 끝나면 마지막 값이 계속 반환된다.
    expect(serverNow() - Date.now()).toBe(skew);
  });
});
