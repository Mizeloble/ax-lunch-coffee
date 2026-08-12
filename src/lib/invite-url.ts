'use client';

import { useMemo } from 'react';

/**
 * 방 초대 링크 훅 — 플랫폼별로 구현이 갈린다.
 *
 * 웹(이 파일): 현재 오리진 기반 `/r/<방코드>?join=1`.
 * 미니앱: vite alias로 shim 교체 — `getTossShareLink('intoss://<앱>/r/<방코드>')`가
 * 만든 토스 공유 링크(https). 미니앱에서 웹 URL을 배포하면 자사 웹 유도 금지
 * 정책에 걸리므로 이 분리가 필수다. shim은 비동기 생성 동안 ''를 반환한다 —
 * 소비처(QR·복사)는 빈 문자열을 그리는 정도로만 취급하면 된다.
 */
export function useInviteUrl(roomId: string): string {
  return useMemo(() => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/r/${roomId}?join=1`;
  }, [roomId]);
}
