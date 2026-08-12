import { useCallback, useEffect, useState } from 'react';
import { QRCode } from '@/components/QRCode';
import { isValidRoomId, normalizeRoomId } from '@/lib/ids';
import { miniKo } from './i18n';

const APP_NAME = import.meta.env.VITE_APP_NAME ?? 'bokbulbok-party';
// `ait build`가 출력하는 deploymentId — intoss-private:// 테스트 스킴에 필요.
const DEPLOYMENT_ID = import.meta.env.VITE_DEPLOYMENT_ID ?? '';

// 토스 웹뷰 밖(로컬 브라우저)에서는 브릿지 응답이 오지 않을 수 있다 — 무한 로딩
// 대신 명시적 실패로 떨어뜨린다.
const BRIDGE_TIMEOUT_MS = 3000;

type LinkState =
  | { kind: 'loading' }
  | { kind: 'ok'; link: string }
  | { kind: 'unavailable'; reason: string };

/**
 * 입장 경로 실측 패널 (P1-5).
 *
 * 주 경로는 `getTossShareLink`가 만든 **토스 공유 링크**다 — 미니앱 안으로 들여보내는
 * 링크라 정책 대상이 아니고(자사 웹 유도 금지는 바깥으로 내보내는 경우), 경로에 방 코드를
 * 실을 수 있어서 "QR 한 번 → 그 방 입장"이 그대로 성립한다. 앱 미설치자는 앱스토어로 폴백.
 *
 * 실측해야 하는 것: 반환 문자열이 `https://`인지. 문서가 명시하지 않는데, https여야
 * 폰 기본 카메라가 QR을 인식한다(원시 커스텀 스킴은 카메라가 무시할 수 있다).
 * 비교용으로 원시 스킴 QR도 같이 띄워 어느 쪽이 열리는지 대조한다.
 */
export function DeepLinkPanel() {
  const [code, setCode] = useState('');
  const [state, setState] = useState<LinkState>({ kind: 'loading' });

  const path = isValidRoomId(code) ? `/r/${normalizeRoomId(code)}` : '';
  const deeplink = `intoss://${APP_NAME}${path}`;
  const testDeeplink =
    `intoss-private://${APP_NAME}${path}` +
    (DEPLOYMENT_ID ? `${path ? '&' : '?'}_deploymentId=${DEPLOYMENT_ID}` : '');

  const build = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const { isTossWebView } = await import('./toss-env');
      if (!isTossWebView()) throw new Error('not in toss webview');
      const { getTossShareLink } = await import('@apps-in-toss/web-framework');
      // race에서 진 쪽 프라미스의 늦은 거부가 unhandled rejection이 되지 않게 삼킨다.
      const create = getTossShareLink(deeplink);
      create.catch(() => {});
      const link = await Promise.race([
        create,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('bridge timeout')), BRIDGE_TIMEOUT_MS),
        ),
      ]);
      setState({ kind: 'ok', link });
    } catch (e) {
      setState({ kind: 'unavailable', reason: e instanceof Error ? e.message : String(e) });
    }
  }, [deeplink]);

  useEffect(() => {
    void build();
  }, [build]);

  return (
    <details className="surface rounded-xl px-3.5 py-3">
      <summary className="cursor-pointer select-none text-[14px] font-medium text-zinc-200">
        {miniKo.deepLink.title}
      </summary>
      <div className="mt-3 space-y-4">
        <p className="text-[13px] leading-relaxed text-zinc-400">{miniKo.deepLink.help}</p>

        <input
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder={miniKo.deepLink.placeholder}
          aria-label={miniKo.deepLink.placeholder}
          className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3 font-mono text-base tracking-[0.2em] uppercase placeholder:tracking-normal placeholder:font-sans focus:border-amber-400 focus:outline-none"
        />

        {/* 주 경로 — 실제 초대에 쓸 링크 */}
        <div className="space-y-1.5 text-center">
          <p className="text-[13px] font-semibold text-amber-300">{miniKo.deepLink.shareLink}</p>
          {state.kind === 'ok' ? (
            <>
              <QRCode value={state.link} size={200} />
              <p className="break-all font-mono text-[12px] text-zinc-400">{state.link}</p>
              <p
                className={
                  state.link.startsWith('https://')
                    ? 'text-[12px] font-semibold text-emerald-400'
                    : 'text-[12px] font-semibold text-amber-400'
                }
              >
                {state.link.startsWith('https://')
                  ? miniKo.deepLink.httpsOk
                  : miniKo.deepLink.httpsNo}
              </p>
            </>
          ) : (
            <p className="text-[13px] text-zinc-500">
              {state.kind === 'loading' ? miniKo.deepLink.loading : miniKo.deepLink.sdkUnavailable}
            </p>
          )}
        </div>

        {/* 비교용 — 원시 스킴이 기본 카메라에서 열리는지 대조 */}
        <div className="space-y-3 border-t border-white/10 pt-3">
          <p className="text-[13px] font-semibold text-zinc-400">{miniKo.deepLink.rawTitle}</p>
          {[
            { label: miniKo.deepLink.live, url: deeplink },
            { label: miniKo.deepLink.priv, url: testDeeplink },
          ].map(({ label, url }) => (
            <div key={url} className="space-y-1.5 text-center">
              <p className="text-[13px] text-zinc-400">{label}</p>
              <QRCode value={url} size={160} />
              <p className="break-all font-mono text-[12px] text-zinc-500">{url}</p>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}
