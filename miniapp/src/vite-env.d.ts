/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 게임 서버 절대 URL (예: https://bokbulbok-party.fly.dev). 미설정이면 same-origin(dev 프록시). */
  readonly VITE_SERVER_URL?: string;
  /** '1'이면 polling 폴백 없이 WebSocket만 사용 (샌드박스 실측용). */
  readonly VITE_WS_ONLY?: string;
  /** 앱인토스 appName (딥링크 스킴용). 기본 'bokbulbok'. */
  readonly VITE_APP_NAME?: string;
  /** `ait build`가 출력하는 deploymentId — intoss-private:// 테스트 스킴에 필요. */
  readonly VITE_DEPLOYMENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
