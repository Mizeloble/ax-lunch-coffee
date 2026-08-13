// 토스 웹뷰 플랫폼 초기화 — main.tsx 부트에서 1회 호출.
// 전부 best-effort: 토스 웹뷰 밖(로컬 브라우저)에서는 브릿지가 없으므로
// 각 단계가 조용히 실패하고 앱은 웹처럼 동작한다.

import { setHapticsBackend, type HapticEvent } from '@/games/marble/haptics';
import { configureSfx } from '@/lib/sfx';
import { navigate } from './router';

const ROOM_PATH_RE = /\/r\/([A-Z0-9]{4,8})/i;

// 게임 피드백 이벤트 → 토스 네이티브 햅틱 타입. navigator.vibrate와 달리
// iOS에서도 동작한다(웹 대비 개선점).
const HAPTIC_MAP: Record<HapticEvent, 'tickWeak' | 'tap' | 'tickMedium' | 'softMedium' | 'basicWeak' | 'basicMedium' | 'success' | 'error' | 'wiggle' | 'confetti'> = {
  countdownTick: 'tickWeak',
  countdownGo: 'basicMedium',
  myFinish: 'success',
  loserConfirmed: 'error',
  chargeTap: 'tickWeak',
  reactionGo: 'basicMedium',
  reactionFalseStart: 'error',
  triviaCorrect: 'success',
  triviaWrong: 'error',
  triviaCombo: 'confetti',
  triviaUrgentTick: 'tickWeak',
};

export async function initTossPlatform(): Promise<void> {
  // 검수 요건: 미니앱은 효과음 기본 켬 + On/Off 설정 제공(SoundToggle).
  configureSfx({ defaultEnabled: true });

  // 웹뷰 밖(로컬 브라우저) — 브릿지 호출은 동기 throw·내부 unhandled rejection을
  // 일으키므로 아예 진입하지 않는다.
  const { isTossWebView } = await import('./toss-env');
  if (!isTossWebView()) return;

  const sdk = await import('@apps-in-toss/web-framework');

  // 네이티브 햅틱 백엔드. triggerHaptic 거부 시 navigator.vibrate로 폴백
  // (실기기에서 이 조합으로 진동 확인됨). 토스 햅틱 타입은 UI용이라 약하게
  // 설계돼 있어, 큰 순간만 짧은 간격 2연타로 체감을 키운다.
  const strong = new Set<HapticEvent>(['countdownGo', 'myFinish', 'loserConfirmed', 'reactionGo']);
  const trigger = (event: HapticEvent, pattern: number | number[]) => {
    void sdk.Device.triggerHaptic({ type: HAPTIC_MAP[event] }).catch(() => {
      try {
        navigator.vibrate?.(pattern);
      } catch {}
    });
  };
  setHapticsBackend((event, pattern) => {
    trigger(event, pattern);
    if (strong.has(event)) setTimeout(() => trigger(event, 0), 130);
  });

  // 검수 요건: 게임은 OS 뒤로가기 제스처 사용 불가 — iOS 스와이프 백 차단.
  // (Android 하드웨어 뒤로가기는 graniteEvent.backEvent로 ExitGuard가 받는다.)
  try {
    await sdk.Screen.setIosSwipeBack({ isEnabled: false });
  } catch {}

  // 딥링크 진입: intoss://bokbulbok-party/r/AB12CD → 해당 방으로 바로.
  // initialURL은 첫 진입 시점 값만 갖는다(warm start 미반영 — 알려진 한계,
  // 폴백은 방 코드 입력).
  try {
    const initial = sdk.Environment.initialURL;
    const m = typeof initial === 'string' ? initial.match(ROOM_PATH_RE) : null;
    if (m) navigate(`/r/${m[1].toUpperCase()}?join=1`);
  } catch {}
}
