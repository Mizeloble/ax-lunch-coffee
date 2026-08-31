import { useState } from 'react';
import { ko } from '@/lib/i18n';
import { isValidRoomId, normalizeRoomId } from '@/lib/ids';
import { Logo } from '@/components/Logo';
import { GAME_META, type GameId } from '@/games/types';
import { ROOM } from '@/lib/constants';
import { saveHostToken } from '@/lib/host-token';
import type { RoomCreateAck } from '@/lib/protocol';
import { navigate } from './router';
import { getSocket } from './shims/socket-client';
import { DeepLinkPanel } from './DeepLinkPanel';
import { SoundToggle } from './SoundToggle';
import { miniKo } from './i18n';

// 입장 경로 실측 패널은 개발자 진단용 — 출시 빌드에는 넣지 않는다.
// 필요할 때만 `VITE_DEBUG_PANEL=1 npm run build:ait`로 켠다.
const SHOW_DEBUG_PANEL = import.meta.env.VITE_DEBUG_PANEL === '1';

// 라인업은 로비 GamePicker와 같은 출처(GAME_META) — 활성 게임만, 같은 순서.
const GAME_IDS = (Object.keys(GAME_META) as GameId[]).filter((id) => GAME_META[id].enabled);

// 미니앱 홈: 방 만들기 + 코드 입장 + 효과음 설정.
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
        saveHostToken(res.roomId, res.hostToken);
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

        {/* 앱 소개 — 토스 미니앱 홈에서 처음 들어온 사람이 "이게 뭐 하는 앱인지"를
            CTA를 누르기 전에 알 수 있게. 웹 랜딩과 같은 출처(i18n)를 쓰되 음주
            맥락이 있는 FAQ·부제는 제외한다(전연령 등급 일관성). */}
        <div className="space-y-2">
          <h1 className="text-[30px] font-extrabold leading-[1.15] -tracking-[0.04em]">
            {ko.landing.heroTitle.pre}
            <span className="text-red-500">{ko.landing.heroTitle.accent}</span>
            {ko.landing.heroTitle.post}
            <br />
            {ko.landing.heroTitle.line2}
          </h1>
          <p className="text-[14px] leading-relaxed text-zinc-400">{ko.landing.heroSub}</p>
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

        <ol className="flex items-stretch gap-1.5" aria-label={ko.landing.howTitle}>
          {ko.landing.stepsShort.map((step) => (
            <li
              key={step}
              className="flex-1 rounded-xl border border-red-500/25 bg-red-500/[0.07] px-2 py-2.5 text-center text-[13px] font-semibold leading-tight text-red-200"
            >
              {step}
            </li>
          ))}
        </ol>

        {/* 게임 라인업 — 미니앱엔 게임 소개 페이지가 없으므로 링크 없이 목록만. */}
        <div className="space-y-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-[15px] font-bold text-zinc-100">
              {ko.landing.gamesTitle(GAME_IDS.length)}
            </h2>
            <span className="text-[13px] text-zinc-500">{ko.landing.gamesSubtitle}</span>
          </div>
          <ul className="grid grid-cols-2 gap-2">
            {GAME_IDS.map((id) => (
              <li key={id} className="surface flex items-center gap-2 rounded-xl px-3 py-2.5">
                <span className="text-lg leading-none" aria-hidden>
                  {GAME_META[id].emoji}
                </span>
                <span className="truncate text-[13px] font-semibold text-zinc-100">
                  {ko.games[id]}
                </span>
              </li>
            ))}
          </ul>
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

        <SoundToggle />

        {SHOW_DEBUG_PANEL && <DeepLinkPanel />}
      </div>
    </main>
  );
}
