'use client';

/**
 * hostToken 보관 — 플랫폼별로 구현이 갈린다.
 *
 * 웹(이 파일): sessionStorage. 탭 단위 수명이 의도된 동작이다(방을 만든 탭이
 * 호스트, 탭을 닫으면 권한 소멸 — 다른 탭/기기로 새는 것보다 안전).
 * 미니앱: vite alias로 shim 교체 — 웹뷰 sessionStorage 수명이 보장되지 않아
 * 네이티브 Storage(인메모리 캐시 + 비동기 영속)를 쓴다.
 *
 * 키 형식(`bbk:host:<roomId>`)은 기존 세션과의 호환을 위해 유지.
 */
export function readHostToken(roomId: string): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.sessionStorage.getItem(`bbk:host:${roomId}`) ?? undefined;
  } catch {
    return undefined;
  }
}

export function saveHostToken(roomId: string, hostToken: string): void {
  try {
    window.sessionStorage.setItem(`bbk:host:${roomId}`, hostToken);
  } catch {}
}
