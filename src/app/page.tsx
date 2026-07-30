'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ko } from '@/lib/i18n';
import { isValidRoomId, normalizeRoomId } from '@/lib/ids';
import { GAME_META, type GameId } from '@/games/types';
import { gameShortLabel } from '@/lib/game-labels';
import { AdSlot } from '@/components/AdSlot';
import { SiteFooter } from '@/components/SiteFooter';
import { Logo } from '@/components/Logo';

// 랜딩 라인업은 로비 GamePicker와 같은 출처(GAME_META) — 활성 게임만, 같은 순서.
const GAME_IDS = (Object.keys(GAME_META) as GameId[]).filter((id) => GAME_META[id].enabled);

// 구조화 데이터(검색 리치 결과용) — FAQ는 아래 가시 섹션과 같은 출처(i18n).
// 클라이언트 컴포넌트지만 SSR로 초기 HTML에 포함되므로 크롤러가 읽는다.
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
const JSON_LD = JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: ko.app.title,
      url: siteUrl,
      description: ko.app.metaDescription,
      applicationCategory: 'GameApplication',
      operatingSystem: 'Any',
      inLanguage: 'ko',
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'KRW' },
    },
    {
      '@type': 'FAQPage',
      mainEntity: ko.landing.faq.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
  ],
});

export default function LandingPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // 방 생성 실패·혼잡은 네이티브 alert() 대신 인라인 배너로 — 공개 서비스 느낌.
  const [error, setError] = useState<string | null>(null);
  // QR을 못 찍는 참가자용 방 코드 직접 입력.
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);

  function joinByCode() {
    if (!isValidRoomId(code)) {
      setCodeError(ko.landing.joinByCodeInvalid);
      return;
    }
    router.push(`/r/${normalizeRoomId(code)}?join=1`);
  }

  async function createRoom() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/rooms', { method: 'POST' });
      if (!res.ok) {
        // 503 = 전역 방 수 상한, 429 = IP 레이트리밋 → 둘 다 "잠시 후" 혼잡 안내
        setBusy(false);
        setError(res.status === 503 || res.status === 429 ? ko.landing.busy : ko.landing.createFailed);
        return;
      }
      const { roomId, hostToken } = (await res.json()) as { roomId: string; hostToken: string };
      try {
        sessionStorage.setItem(`bbk:host:${roomId}`, hostToken);
      } catch {}
      router.push(`/r/${roomId}`);
    } catch {
      setBusy(false);
      setError(ko.landing.createFailed);
    }
  }

  return (
    <>
      {/* pb-36: 하단 고정 CTA 바(+서브라인)에 가리지 않도록 스크롤 영역 여백 확보 */}
      <main className="min-h-dvh px-6 pb-36">
        <div className="mx-auto w-full max-w-sm space-y-6 py-8">
          {/* 헤더 — 로고 + "설치 없음 · 무료" 한 줄. 오픈소스 배지는 푸터로 내려갔다. */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Logo size={34} />
              <span className="text-xl font-bold">{ko.app.title}</span>
            </div>
            <span className="rounded-full bg-emerald-400/10 px-3 py-1.5 text-[13px] font-semibold text-emerald-300/90">
              {ko.landing.installFree}
            </span>
          </div>

          {/* 히어로 — 화면에서 유일하게 큰 한 줄. '벌칙'만 빨강으로 로고의 빨간 링을 회수한다. */}
          <div className="space-y-3">
            <h1 className="text-[38px] font-extrabold leading-[1.15] -tracking-[0.04em]">
              {ko.landing.heroTitle.pre}
              <span className="text-red-500">{ko.landing.heroTitle.accent}</span>
              {ko.landing.heroTitle.post}
              <br />
              {ko.landing.heroTitle.line2}
            </h1>
            <p className="text-[15px] leading-relaxed text-zinc-400">{ko.landing.heroSub}</p>
          </div>

          {/* 히어로 데모 — 여러 미니게임 하이라이트 몽타주(마블·반응속도·퀴즈) */}
          <div className="space-y-2">
            <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
              <video
                className="h-44 w-full object-cover"
                autoPlay
                muted
                loop
                playsInline
                poster="/demo-games.jpg"
                aria-label={ko.landing.demoAlt}
              >
                <source src="/demo-games.mp4" type="video/mp4" />
              </video>
            </div>
            <p className="text-center text-[13px] text-zinc-500">
              {ko.landing.demoCaption(GAME_IDS.length)}
            </p>
          </div>

          {/* 3스텝 스트립 — 세로 리스트를 한 줄로 압축. 빨강이 히어로 다음으로 다시 등장. */}
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

          {/* 미니게임 라인업 — 로비 진입 전 콜드 방문자에게 콘텐츠 노출 */}
          <div className="space-y-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-[15px] font-bold text-zinc-100">
                {ko.landing.gamesTitle(GAME_IDS.length)}
              </h2>
              <span className="text-[13px] text-zinc-500">{ko.landing.gamesSubtitle}</span>
            </div>
            <ul className="grid grid-cols-2 gap-2">
              {GAME_IDS.map((id) => (
                <li key={id}>
                  {/* 게임 소개 페이지 링크 — 검색 유입 페이지로의 내부 링크 겸 상세 규칙 안내 */}
                  <Link
                    href={`/games/${id}`}
                    className="surface flex h-full items-center gap-2.5 rounded-xl px-3 py-2.5 active:scale-[0.98]"
                  >
                    <span className="text-xl leading-none" aria-hidden>
                      {GAME_META[id].emoji}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold text-zinc-100">
                        {ko.games[id]}
                      </span>
                      <span className="block truncate text-[12px] text-zinc-500">
                        {gameShortLabel(id)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* 코드로 입장 — QR을 못 찍는 참가자(카메라 없음·링크만 받음)용 우회 경로 */}
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

          {/* FAQ — 검색 유입용 콘텐츠(FAQPage JSON-LD와 같은 출처). 접힌 상태로 조용히. */}
          <div className="space-y-2.5">
            <h2 className="text-[15px] font-bold text-zinc-100">{ko.landing.faqTitle}</h2>
            <ul className="space-y-1.5">
              {ko.landing.faq.map((f) => (
                <li key={f.q}>
                  <details className="surface group rounded-xl px-3.5 py-3">
                    <summary className="flex cursor-pointer select-none list-none items-center justify-between gap-2 text-[14px] font-medium text-zinc-200">
                      <span>{f.q}</span>
                      <span
                        className="text-lg leading-none text-zinc-600 transition-transform group-open:rotate-45"
                        aria-hidden
                      >
                        ＋
                      </span>
                    </summary>
                    <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">{f.a}</p>
                  </details>
                </li>
              ))}
            </ul>
          </div>

          <AdSlot placement="landing" width={320} height={50} />
        </div>
        <SiteFooter />
      </main>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON_LD }} />

      {/* 하단 고정 CTA — 스크롤 어디서든 즉시 시작. 노치/홈인디케이터 회피. */}
      <div className="fixed inset-x-0 bottom-0 z-50 bg-gradient-to-t from-zinc-950 via-zinc-950/95 to-transparent px-6 pt-6 pb-[max(env(safe-area-inset-bottom),16px)]">
        <div className="mx-auto w-full max-w-sm space-y-2">
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
          {/* 버튼이 뭘 하는지 한 줄 — "방 만들기"만으론 QR이 나온다는 걸 모른다. */}
          <p className="text-center text-[13px] text-zinc-500">{ko.landing.createRoomSub}</p>
        </div>
      </div>
    </>
  );
}
