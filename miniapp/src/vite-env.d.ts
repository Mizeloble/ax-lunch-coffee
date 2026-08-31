/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 게임 서버 절대 URL (예: https://bokbulbok-party.fly.dev). 미설정이면 same-origin(dev 프록시). */
  readonly VITE_SERVER_URL?: string;
  /** '1'이면 polling 폴백 없이 WebSocket만 사용 (샌드박스 실측용). */
  readonly VITE_WS_ONLY?: string;
  /** 앱인토스 appName (딥링크 스킴용). 기본 'bokbulbok-party' (콘솔 등록값). */
  readonly VITE_APP_NAME?: string;
  /** '1'이면 홈에 개발자 진단 패널(입장 경로 실측·햅틱 테스트)을 노출. 출시 빌드에서는 끈다. */
  readonly VITE_DEBUG_PANEL?: string;
  /** `ait build`가 출력하는 deploymentId — intoss-private:// 테스트 스킴에 필요. */
  readonly VITE_DEPLOYMENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
