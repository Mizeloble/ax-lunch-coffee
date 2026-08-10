import { io, type Socket } from 'socket.io-client';

// 미니앱 번들은 토스 CDN({appName}.web.tossmini.com)에서 서빙되므로 소켓·API가
// 페이지 오리진에 붙으면 안 된다 — 게임 서버 절대 URL(VITE_SERVER_URL)로 붙는다.
// 로컬 dev는 vite 프록시(same-origin)라 빈 값으로 동작.
export const SERVER_URL: string = import.meta.env.VITE_SERVER_URL ?? '';

// 샌드박스 실측용: 토스 웹뷰에서 polling 폴백 없이 순수 WebSocket만 검증할 때 1.
const WS_ONLY = import.meta.env.VITE_WS_ONLY === '1';

let singleton: Socket | null = null;

export function getSocket(): Socket {
  if (singleton) return singleton;
  const opts = {
    autoConnect: true,
    transports: WS_ONLY ? ['websocket'] : ['websocket', 'polling'],
    reconnection: true,
    // 웹 클라이언트(src/lib/socket-client.ts)와 동일한 무한 재시도 정책.
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 4000,
  };
  singleton = SERVER_URL ? io(SERVER_URL, opts) : io(opts);
  return singleton;
}

export function disposeSocket() {
  if (singleton) {
    singleton.disconnect();
    singleton = null;
  }
}
