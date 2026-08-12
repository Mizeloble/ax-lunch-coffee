import { createRoot } from 'react-dom/client';
import '@/app/globals.css';
import { App } from './App';
import { initTossPlatform } from './toss';
import { hydrateHostTokens } from './shims/host-token';

// 부트 순서가 중요하다: (1) hostToken 하이드레이션 — 딥링크로 방에 바로 들어가는
// 경로가 렌더 직후 동기로 읽는다. (2) 플랫폼 초기화 — 딥링크 라우팅이 여기서
// 일어나므로 render 전에 끝나야 첫 페인트부터 방 화면이 뜬다.
void (async () => {
  await hydrateHostTokens();
  await initTossPlatform();
  createRoot(document.getElementById('root')!).render(<App />);
})();
