import { createRoot } from 'react-dom/client';
import '@/app/globals.css';
import { configureSfx } from '@/lib/sfx';
import { App } from './App';
import { initTossPlatform } from './toss';
import { hydrateHostTokens } from './shims/host-token';

// 효과음 기본값은 브릿지가 필요 없는 동기 설정 — 렌더 전에 잡아둬야 설정 행이
// '꺼짐'으로 깜빡였다가 '켜짐'으로 바뀌지 않는다.
configureSfx({ defaultEnabled: true });

// 렌더를 먼저 한다. 예전엔 hostToken 하이드레이션(최대 1.5초)과 플랫폼 초기화를
// await한 뒤에야 render해서, 그동안 빈 화면이 몇 초씩 보였다. 둘 다 첫 페인트를
// 막을 이유가 없다 — 딥링크 라우팅은 완료되는 대로 상태 갱신으로 반영되고,
// 호스트 권한은 localStorage의 playerToken 경로로도 복구된다.
createRoot(document.getElementById('root')!).render(<App />);

void (async () => {
  // 순서는 유지: 딥링크로 방에 들어갈 때 hostToken이 먼저 캐시에 올라와 있어야 한다.
  await hydrateHostTokens();
  await initTossPlatform();
})();
