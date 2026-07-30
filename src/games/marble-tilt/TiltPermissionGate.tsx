'use client';

import { ko } from '@/lib/i18n';
import clsx from 'clsx';
import { useGyro, type GyroState } from './useGyro';

/**
 * Lobby-side button that lets a participant grant device-orientation permission
 * BEFORE the race starts. iOS Safari requires the call to come from a user
 * gesture, so doing it during gameplay is too late — by then the renderer is
 * trying to read tilt without a grant. On Android the same button just flips
 * to granted with no modal.
 *
 * Hosts don't tilt anything (they're on a desktop most of the time) so the gate
 * suppresses itself for `isHost`.
 */
export function TiltPermissionGate({ isHost }: { isHost: boolean }) {
  // The hook is mounted here only to drive permission state — we don't actually
  // emit tilt from the lobby (active=false). The renderer mounts its own hook
  // when the race starts. iOS preserves the permission grant for the page's
  // lifetime, so the second mount inherits the grant.
  const { state, requestPermission } = useGyro({ active: false, onTilt: () => {} });

  if (isHost) {
    return (
      <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800 px-4 py-3 text-[13px] text-zinc-400">
        {ko.marbleTilt.hostNotice}
      </div>
    );
  }

  // 거부/미지원은 한 줄 안내로 끝내면 안 된다 — 조작이 아예 없어지는데, 그게 불이익
  // (꼴찌 확률↑)이라는 말도, 되돌리는 방법도 없이 그냥 참가하게 된다.
  if (state === 'denied' || state === 'unsupported') {
    const denied = state === 'denied';
    return (
      <div className="rounded-2xl border border-red-500/40 bg-red-500/[0.08] px-4 py-4">
        <div className="flex items-start gap-2.5">
          <span aria-hidden className="text-xl leading-none">
            📱
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-bold text-zinc-100">
              {denied ? ko.marbleTilt.deniedTitle : ko.marbleTilt.permUnsupported}
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-zinc-300">
              {denied ? ko.marbleTilt.deniedBody : ko.marbleTilt.unsupportedBody}
            </p>
            <div className="mt-2.5 inline-flex items-center rounded-full border border-red-500/30 bg-red-500/15 px-2.5 py-1 text-[12px] font-bold text-red-300">
              {ko.marbleTilt.deniedBadge}
            </div>
          </div>
        </div>

        {denied && (
          <>
            <button
              type="button"
              onClick={requestPermission}
              className="mt-3 w-full rounded-xl border-[1.5px] border-amber-600 bg-amber-600/15 py-3 text-[14px] font-bold text-amber-200 active:scale-[0.98]"
            >
              {ko.marbleTilt.permRetry}
            </button>
            {/* 재시도해도 안 되는 게 iOS의 정상 동작이다(한 번 거부하면 설정에서만 복구) —
                막다른 골목 대신 설정 경로와 "다른 게임으로 바꿔달라"는 선택지를 준다. */}
            <details className="mt-2.5 text-[13px] text-zinc-400">
              <summary className="cursor-pointer select-none list-none font-semibold text-zinc-300">
                {ko.marbleTilt.deniedHelpTitle}
              </summary>
              <p className="mt-1.5 leading-relaxed">{ko.marbleTilt.deniedHelpBody}</p>
            </details>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800 px-4 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-bold text-zinc-100">{ko.marbleTilt.hint}</div>
          <StatusLine state={state} />
        </div>
        <ActionButton state={state} onTap={requestPermission} />
      </div>
    </div>
  );
}

// denied/unsupported는 위의 전용 패널이 처리한다 — 여기 오는 건 idle/requesting/granted뿐.
function StatusLine({ state }: { state: GyroState }) {
  if (state === 'granted') {
    return <div className="mt-0.5 text-[12px] text-emerald-300">{ko.marbleTilt.permReady}</div>;
  }
  return null;
}

function ActionButton({ state, onTap }: { state: GyroState; onTap: () => void }) {
  if (state === 'granted') return null;
  const label =
    state === 'requesting' ? ko.marbleTilt.permRequesting : ko.marbleTilt.permEnable;
  return (
    <button
      type="button"
      disabled={state === 'requesting'}
      onClick={onTap}
      className={clsx(
        'whitespace-nowrap rounded-xl border-[1.5px] border-amber-600 bg-amber-600/15 px-3.5 py-2.5 text-[13px] font-bold text-amber-200 active:scale-[0.98]',
        state === 'requesting' && 'opacity-60',
      )}
    >
      {label}
    </button>
  );
}
