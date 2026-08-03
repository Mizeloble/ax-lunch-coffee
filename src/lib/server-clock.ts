'use client';

/**
 * Server-clock estimate for a browser whose own clock may be wrong.
 *
 * Every phase in this app is anchored to server wall-clock stamps (`startAt`,
 * `goAt`/`deadlineAt`, the quiz schedule, charge `endsAt`) and the client decides
 * what to show by comparing them against its own clock. A phone whose clock is a
 * few seconds off therefore mis-renders the round while everyone else is fine:
 * the marble replay starts mid-race, the quiz shows the wrong question, and in
 * reaction — where ranking is decided in milliseconds — a fast clock turns every
 * tap into a false start. NTP keeps most phones within tens of ms, but manual
 * clock settings and drifting old devices are exactly the "why is it broken only
 * on my phone" case.
 *
 * Cristian's algorithm over the socket: ask the server for its time, assume the
 * round trip is symmetric, keep the sample with the lowest RTT (the least room
 * for asymmetry). Offset stays 0 until a sync lands, so the untouched behaviour
 * is the fallback, never a worse one.
 *
 * Not a substitute for server authority: nothing here is ever sent back to the
 * server, and no ranking depends on it. It only decides what this client draws.
 */

const PROBES = 5;
const PROBE_TIMEOUT_MS = 2000;

let offsetMs = 0;

/** Best estimate of the server's clock right now. */
export function serverNow(): number {
  return Date.now() + offsetMs;
}

/** Current estimated offset (server − local), in ms. 0 until the first sync. */
export function getClockOffsetMs(): number {
  return offsetMs;
}

/** 테스트 전용 — 오프셋 초기화. */
export function resetClockForTest() {
  offsetMs = 0;
}

type SyncSocket = {
  emit(event: 'time:sync', ack: (serverTime: number) => void): unknown;
};

/**
 * Measure the offset and store it. Safe to call repeatedly — a reconnect after
 * the phone slept is exactly when the clock is most likely to have moved.
 * Never throws and never rejects: a failed sync just leaves the last estimate.
 */
export async function syncServerClock(socket: SyncSocket): Promise<void> {
  let bestRtt = Number.POSITIVE_INFINITY;
  let bestOffset: number | null = null;

  for (let i = 0; i < PROBES; i++) {
    const sample = await probe(socket);
    if (!sample) continue;
    if (sample.rtt < bestRtt) {
      bestRtt = sample.rtt;
      bestOffset = sample.offset;
    }
  }

  if (bestOffset !== null && Number.isFinite(bestOffset)) offsetMs = bestOffset;
}

function probe(socket: SyncSocket): Promise<{ rtt: number; offset: number } | null> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(null);
    }, PROBE_TIMEOUT_MS);

    socket.emit('time:sync', (serverTime: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const t1 = Date.now();
      if (typeof serverTime !== 'number' || !Number.isFinite(serverTime)) {
        resolve(null);
        return;
      }
      const rtt = t1 - t0;
      // Server's clock at t1 ≈ serverTime + (one-way latency) ≈ serverTime + rtt/2.
      resolve({ rtt, offset: serverTime + rtt / 2 - t1 });
    });
  });
}
