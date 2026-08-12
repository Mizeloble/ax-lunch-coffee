import { useEffect, useState } from 'react';
import { miniKo } from './i18n';

// 검수 요건: 종료 시 확인 모달. Android 하드웨어 뒤로가기(graniteEvent.backEvent)를
// 받아 바로 닫는 대신 확인을 거친다 — 게임 도중 실수로 방에서 튕기는 걸 막는다.
// 확인 시 closeView()로 미니앱을 닫는다.
export function ExitGuard() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    void (async () => {
      const { isTossWebView } = await import('./toss-env');
      if (!isTossWebView()) return; // 웹뷰 밖 — 뒤로가기 이벤트가 없으니 모달도 필요 없다.
      try {
        const { graniteEvent } = await import('@apps-in-toss/web-framework');
        unsubscribe = graniteEvent.addEventListener('backEvent', {
          onEvent: () => setOpen(true),
          onError: () => {},
        });
      } catch {}
    })();
    return () => unsubscribe?.();
  }, []);

  async function confirmExit() {
    try {
      const { closeView } = await import('@apps-in-toss/web-framework');
      await closeView();
    } catch {
      setOpen(false);
    }
  }

  if (!open) return null;
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={miniKo.exit.title}
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 sm:items-center"
    >
      <div className="w-full max-w-sm rounded-t-3xl bg-zinc-900 px-6 pt-6 pb-[max(env(safe-area-inset-bottom),24px)] sm:rounded-3xl sm:pb-6">
        <h2 className="text-lg font-bold text-zinc-100">{miniKo.exit.title}</h2>
        <p className="mt-1.5 text-sm text-zinc-400">{miniKo.exit.desc}</p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="btn-primary flex-1 !py-3.5 text-base"
          >
            {miniKo.exit.stay}
          </button>
          <button
            type="button"
            onClick={confirmExit}
            className="flex-1 rounded-2xl bg-zinc-700 py-3.5 text-base font-bold text-zinc-100 active:scale-[0.98]"
          >
            {miniKo.exit.leave}
          </button>
        </div>
      </div>
    </div>
  );
}
