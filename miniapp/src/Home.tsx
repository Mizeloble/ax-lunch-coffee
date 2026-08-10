import { useState } from 'react';
import { ko } from '@/lib/i18n';
import { isValidRoomId, normalizeRoomId } from '@/lib/ids';
import { Logo } from '@/components/Logo';
import { ROOM } from '@/lib/constants';
import type { RoomCreateAck } from '@/lib/protocol';
import { navigate } from './router';
import { getSocket } from './shims/socket-client';
import { DeepLinkPanel } from './DeepLinkPanel';
import { miniKo } from './i18n';

// PoC 홈: 방 만들기 + 코드 입장 + 입장 경로 실측 패널만.
// 랜딩의 SEO·FAQ·광고·데모 영상은 미니앱에 불필요해서 싣지 않는다.
export function Home() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);

  function joinByCode() {
    if (!isValidRoomId(code)) {
      setCodeError(ko.landing.joinByCodeInvalid);
      return;
    }
    navigate(`/r/${normalizeRoomId(code)}?join=1`);
  }

  // 방 생성도 소켓으로 — 미니앱은 토스 CDN 오리진이라 HTTP 라우트는 CORS로 막힌다.
  // 오리진에 민감한 채널을 소켓 하나로 통일한다.
  function createRoom() {
    if (busy) return;
    setBusy(true);
    setError(null);
    getSocket()
      .timeout(ROOM.CREATE_TIMEOUT_MS)
      .emit('room:create', (timeoutErr: Error | null, res?: RoomCreateAck) => {
        if (timeoutErr || !res) {
          setBusy(false);
          setError(ko.landing.createFailed);
          return;
        }
        if (!res.ok) {
          setBusy(false);
          setError(res.message || ko.landing.createFailed);
          return;
        }
        try {
          sessionStorage.setItem(`bbk:host:${res.roomId}`, res.hostToken);
        } catch {}
        navigate(`/r/${res.roomId}`);
      });
  }

  return (
    <main className="min-h-dvh px-6 pb-[max(env(safe-area-inset-bottom),24px)]">
      <div className="mx-auto w-full max-w-sm space-y-6 py-8">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Logo size={34} />
            <span className="text-xl font-bold">{ko.app.title}</span>
          </div>
          <span className="rounded-full bg-amber-400/10 px-3 py-1.5 text-[13px] font-semibold text-amber-300/90">
            {miniKo.badge}
          </span>
        </div>

        <div className="space-y-2">
          {error && (
            <p
              role="alert"
              className="rounded-xl bg-rose-500/15 px-3 py-2 text-center text-xs text-rose-200"
            >
              {error}
            </p>
          )}
          <button type="button" onClick={createRoom} disabled={busy} className="btn-primary">
            {busy ? ko.landing.creating : ko.landing.createRoom}
          </button>
          <p className="text-center text-[13px] text-zinc-500">{ko.landing.createRoomSub}</p>
        </div>

        <div className="space-y-2.5">
          <h2 className="text-[15px] font-bold text-zinc-100">{ko.landing.joinByCodeTitle}</h2>
          <div className="flex gap-2">
            <input
              inputMode="text"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              maxLength={6}
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                if (codeError) setCodeError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') joinByCode();
              }}
              placeholder={ko.landing.joinByCodePlaceholder}
              aria-label={ko.landing.joinByCodePlaceholder}
              className="min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3 font-mono text-base tracking-[0.2em] uppercase placeholder:tracking-normal placeholder:font-sans focus:border-amber-400 focus:outline-none"
            />
            <button
              type="button"
              onClick={joinByCode}
              disabled={code.trim().length === 0}
              className="flex-none rounded-xl bg-zinc-700 px-5 py-3 text-sm font-bold text-zinc-100 active:scale-[0.98] disabled:opacity-50"
            >
              {ko.landing.joinByCodeSubmit}
            </button>
          </div>
          {codeError && (
            <p role="alert" className="text-xs text-rose-400">
              {codeError}
            </p>
          )}
        </div>

        <DeepLinkPanel />
      </div>
    </main>
  );
}
