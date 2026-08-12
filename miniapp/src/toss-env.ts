// 토스 웹뷰 감지 — SDK 자체가 쓰는 조건과 동일(window.ReactNativeWebView 주입 여부).
// SDK 브릿지 호출은 웹뷰 밖에서 "동기로" throw하는 것도 있어서(예: Storage.setItem),
// 호출부마다 try/catch에 기대는 대신 이 게이트로 아예 진입하지 않는다 — 로컬
// 브라우저 개발에서 unhandled rejection·콜백 사망을 원천 차단.
export function isTossWebView(): boolean {
  return (
    typeof window !== 'undefined' &&
    (window as unknown as { ReactNativeWebView?: unknown }).ReactNativeWebView != null
  );
}
