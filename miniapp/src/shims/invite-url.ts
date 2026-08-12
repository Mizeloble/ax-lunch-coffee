import { useEffect, useState } from 'react';

// '@/lib/invite-url'의 미니앱 구현 (vite alias로 교체).
// 웹 오리진 URL 대신 토스 공유 링크(https://minion.toss.im/...)를 만든다 —
// 미니앱에서 자사 웹 URL 배포는 정책 금지, 이 링크는 미니앱 안으로 들여보내는
// 공식 경로다. 방 코드는 딥링크 경로에 실린다.

const APP_NAME = import.meta.env.VITE_APP_NAME ?? 'bokbulbok-party';
const BRIDGE_TIMEOUT_MS = 4000;

// 방마다 한 번만 생성 (Lobby·ResultScreen이 같은 방에서 재요청).
const cache = new Map<string, string>();
const pending = new Map<string, Promise<string>>();

function createLink(roomId: string): Promise<string> {
  const cached = cache.get(roomId);
  if (cached) return Promise.resolve(cached);
  const inflight = pending.get(roomId);
  if (inflight) return inflight;

  const p = (async () => {
    const { isTossWebView } = await import('../toss-env');
    if (!isTossWebView()) throw new Error('not in toss webview');
    const { getTossShareLink } = await import('@apps-in-toss/web-framework');
    // 타임아웃이 이긴 뒤 늦게 거부되는 브릿지 프라미스가 unhandled rejection이
    // 되지 않도록 미리 삼켜둔다 (race는 진 쪽에 핸들러를 붙이지 않는다).
    const create = getTossShareLink(`intoss://${APP_NAME}/r/${roomId.toUpperCase()}?join=1`);
    create.catch(() => {});
    const link = await Promise.race([
      create,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('bridge timeout')), BRIDGE_TIMEOUT_MS),
      ),
    ]);
    cache.set(roomId, link);
    return link;
  })();
  // 실패한 promise를 캐시에 남기면 영영 재시도 못 한다 — 정리 후 다음 호출에서 재시도.
  p.catch(() => pending.delete(roomId));
  pending.set(roomId, p);
  return p;
}

/** 생성 완료 전에는 '' — 소비처(QR·복사 버튼)는 빈 값을 그리지 않는 정도로 취급. */
export function useInviteUrl(roomId: string): string {
  const [url, setUrl] = useState(() => cache.get(roomId) ?? '');

  useEffect(() => {
    let cancelled = false;
    setUrl(cache.get(roomId) ?? '');
    createLink(roomId)
      .then((link) => {
        if (!cancelled) setUrl(link);
      })
      .catch(() => {
        // 토스 웹뷰 밖(로컬 브라우저)이거나 브릿지 실패 — 초대 UI가 빈 QR로
        // 남는다. 방 코드 구두 전달 폴백이 항상 있으므로 게임 진행엔 지장 없다.
      });
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  return url;
}
