import { defineConfig } from '@apps-in-toss/web-framework/config';

// appName은 딥링크(intoss://{appName})·서빙 도메인({appName}.web.tossmini.com)의
// 식별자 — 콘솔에 앱을 등록할 때 같은 이름을 써야 한다.
export default defineConfig({
  // 콘솔 등록값과 일치 (2026-08-12 등록, 변경 불가)
  appName: 'bokbulbok-party',
  brand: { primaryColor: '#fbbf24' },
  webView: {},
  permissions: [],
  webBundleDir: 'dist',
});
