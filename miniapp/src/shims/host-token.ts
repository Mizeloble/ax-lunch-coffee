// '@/lib/host-token'의 미니앱 구현 (vite alias로 교체).
// 웹뷰 sessionStorage는 토스가 웹뷰를 재생성하면 사라질 수 있다 — 호스트가
// 앱을 나갔다 오면 권한을 잃는다. 네이티브 Storage(앱 삭제 전까지 유지)에
// 전체 토큰을 JSON 한 키로 영속하고, 동기 API를 위해 인메모리 캐시를 앞에 둔다.

import { Storage } from '@apps-in-toss/web-framework';
import { isTossWebView } from '../toss-env';

const STORE_KEY = 'bbk:hostTokens';
// 방 수명(IDLE 10분)보다 훨씬 길게만 유지하면 된다 — 오래된 토큰은 서버에
// 방이 없어 무해하지만, 무한히 쌓이지 않게 최근 것만 남긴다.
const MAX_ENTRIES = 20;

const cache = new Map<string, string>();

function persist(): void {
  // 웹뷰 밖에서 Storage.setItem은 "동기로" throw한다 — 게이트 없이는 호출부
  // (room:create ack 콜백)까지 같이 죽는다.
  if (!isTossWebView()) return;
  const obj = Object.fromEntries([...cache.entries()].slice(-MAX_ENTRIES));
  try {
    Storage.setItem(STORE_KEY, JSON.stringify(obj)).catch(() => {});
  } catch {}
}

/** 부트에서 1회, 렌더 전에 호출 — 딥링크로 바로 방에 들어가는 경로가 토큰을 동기로 읽는다. */
export async function hydrateHostTokens(): Promise<void> {
  if (!isTossWebView()) return;
  try {
    // 타임아웃이 이긴 뒤 늦게 거부되는 브릿지 프라미스가 unhandled rejection이
    // 되지 않도록 미리 삼켜둔다 (race는 진 쪽에 핸들러를 붙이지 않는다).
    const read = Storage.getItem(STORE_KEY);
    read.catch(() => {});
    const raw = await Promise.race([
      read,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 800)),
    ]);
    if (!raw) return;
    const obj = JSON.parse(raw) as Record<string, string>;
    for (const [roomId, token] of Object.entries(obj)) {
      if (typeof token === 'string') cache.set(roomId, token);
    }
  } catch {
    // 웹뷰 밖(로컬 브라우저)이거나 파싱 실패 — 빈 캐시로 시작하면 된다.
  }
}

export function readHostToken(roomId: string): string | undefined {
  return cache.get(roomId);
}

export function saveHostToken(roomId: string, hostToken: string): void {
  cache.set(roomId, hostToken);
  persist();
}
