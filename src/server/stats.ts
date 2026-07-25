// /stats 대시보드용 Fly Prometheus 조회 + 인메모리 캐시.
//
// - 토큰: FLY_PROMETHEUS_TOKEN (fly secret) — `fly tokens create readonly personal`로
//   만든 읽기 전용 org 토큰. 미설정(로컬 등)이면 페이지가 안내 문구를 보여준다.
// - 캐시 10분: scale-to-zero 앱에서 /stats가 긁혀도 Prometheus 호출이 분당 1회를
//   넘지 않게. 조회 실패 시엔 스테일 캐시라도 반환(없으면 null).

const PROM_URL = 'https://api.fly.io/prometheus/personal/api/v1/query';
const APP_NAME = 'bokbulbok-party';
const CACHE_MS = 10 * 60 * 1000;

// docs/growth-strategy.md 단계 게이트 수치 — 전략 문서와 함께 갱신할 것.
export const GATE = {
  /** Stage 2(도메인+애드핏 착수) 기준: 주당 방 생성 */
  stage2Weekly: 30,
  /** Stage 2 기준: 연속 달성 주 수 */
  stage2Streak: 4,
  /** Stage 3(확장) 기준: 주당 방 생성 */
  stage3Weekly: 300,
} as const;

export type TrafficStats = {
  /** 주간 방 생성 수 — [최근 7일, 1주 전, 2주 전, 3주 전] */
  weeklyRooms: number[];
  /** 최근 30일 게임별 시작 라운드 수 */
  roundsByGame: Record<string, number>;
  /** 최근 30일 방 생성 수 — 방당 평균의 분모 */
  rooms30: number;
  /** 최근 30일 참가자 입장 수 (신규만 — 재접속·dev 봇 제외) */
  players30: number;
  fetchedAt: number;
};

let cache: TrafficStats | null = null;

type PromVector = {
  status: string;
  data?: { result?: { metric: Record<string, string>; value: [number, string] }[] };
};

async function promQuery(auth: string, query: string): Promise<PromVector> {
  const res = await fetch(`${PROM_URL}?query=${encodeURIComponent(query)}`, {
    headers: { Authorization: auth },
    // Next fetch 캐시와 무관하게 항상 원본 조회 — 캐싱은 위의 모듈 캐시가 담당.
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`prometheus ${res.status}`);
  return (await res.json()) as PromVector;
}

function scalarOf(v: PromVector): number {
  const raw = v.data?.result?.[0]?.value?.[1];
  return raw ? Math.round(Number(raw)) : 0;
}

export async function getTrafficStats(): Promise<TrafficStats | null> {
  const raw = process.env.FLY_PROMETHEUS_TOKEN;
  if (!raw) return null;
  if (cache && Date.now() - cache.fetchedAt < CACHE_MS) return cache;

  // `fly tokens create` 출력은 "FlyV1 ..." 프리픽스 포함, `fly auth token`은 미포함 —
  // 둘 다 받도록 정규화.
  const auth = raw.startsWith('FlyV1') ? raw : `FlyV1 ${raw}`;
  const rooms = (offset: string) =>
    `sum(increase(bbk_rooms_created_total{app="${APP_NAME}"}[7d]${offset ? ` offset ${offset}` : ''}))`;

  try {
    const [w0, w1, w2, w3, rounds, rooms30, players30] = await Promise.all([
      promQuery(auth, rooms('')),
      promQuery(auth, rooms('7d')),
      promQuery(auth, rooms('14d')),
      promQuery(auth, rooms('21d')),
      promQuery(auth, `sum by (game) (increase(bbk_rounds_started_total{app="${APP_NAME}"}[30d]))`),
      promQuery(auth, `sum(increase(bbk_rooms_created_total{app="${APP_NAME}"}[30d]))`),
      promQuery(auth, `sum(increase(bbk_players_joined_total{app="${APP_NAME}"}[30d]))`),
    ]);

    const roundsByGame: Record<string, number> = {};
    for (const r of rounds.data?.result ?? []) {
      const n = Math.round(Number(r.value[1]));
      if (n > 0) roundsByGame[r.metric.game ?? '?'] = n;
    }

    cache = {
      weeklyRooms: [scalarOf(w0), scalarOf(w1), scalarOf(w2), scalarOf(w3)],
      roundsByGame,
      rooms30: scalarOf(rooms30),
      players30: scalarOf(players30),
      fetchedAt: Date.now(),
    };
    return cache;
  } catch {
    return cache;
  }
}

/** 현재 게이트 판정 — 페이지와 (미래의) 주간 리포트가 같은 로직을 쓰도록 한 곳에. */
export function gateStatus(weeklyRooms: number[]): {
  streak: number;
  stage: 0 | 1 | 2 | 3;
} {
  let streak = 0;
  for (const w of weeklyRooms) {
    if (w >= GATE.stage2Weekly) streak++;
    else break;
  }
  const w0 = weeklyRooms[0] ?? 0;
  const stage =
    w0 >= GATE.stage3Weekly ? 3
    : streak >= GATE.stage2Streak ? 2
    : w0 > 0 ? 1
    : 0;
  return { streak, stage };
}
