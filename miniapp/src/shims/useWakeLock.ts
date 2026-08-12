import { useEffect } from 'react';

// '@/lib/useWakeLock'의 미니앱 구현 (vite alias로 교체).
// 토스 웹뷰에는 navigator.wakeLock이 없을 수 있다 — SDK의 setScreenAwakeMode로
// 라운드 동안 화면 꺼짐을 막는다 (검수 항목이기도 하다: 게임 중 화면 유지).
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    let disposed = false;

    void (async () => {
      try {
        const { setScreenAwakeMode } = await import('@apps-in-toss/web-framework');
        await setScreenAwakeMode({ enabled: true });
        // 라운드가 이 effect의 cleanup보다 먼저 끝났으면 즉시 해제.
        if (disposed) await setScreenAwakeMode({ enabled: false });
      } catch {
        // 웹뷰 밖이거나 미지원 버전 — 화면이 안 붙잡힐 뿐 게임은 진행된다.
      }
    })();

    return () => {
      disposed = true;
      void import('@apps-in-toss/web-framework')
        .then(({ setScreenAwakeMode }) => setScreenAwakeMode({ enabled: false }))
        .catch(() => {});
    };
  }, [active]);
}
