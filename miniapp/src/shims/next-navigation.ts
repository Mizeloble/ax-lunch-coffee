// 재사용하는 RoomClient·Lobby·ResultScreen이 쓰는 next/navigation의 최소 구현.
// vite.config.ts alias로 'next/navigation'이 이 파일로 치환된다.
import { navigate } from '../router';

// Next의 useRouter처럼 항상 같은 객체를 돌려줘야 한다 — 렌더마다 새 객체면
// RoomClient의 useEffect deps([status, router])가 매 렌더 재실행된다.
const router = {
  push: (href: string) => navigate(href),
  replace: (href: string) => navigate(href),
  back: () => navigate('/'),
  forward: () => {},
  refresh: () => {},
  prefetch: () => {},
};

export function useRouter() {
  return router;
}
