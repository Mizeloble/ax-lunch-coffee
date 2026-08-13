// 게임 피드백 버스: 이벤트 하나가 진동 + 효과음(src/lib/sfx.ts)으로 나간다.
// 렌더러들은 haptics.<event>()만 호출하고 출력 채널별 켬/끔은 각 모듈이 관리한다.
//
// 진동 기본 구현은 navigator.vibrate(iOS 미지원 → no-op). 미니앱은
// setHapticsBackend로 네이티브 햅틱(Device.triggerHaptic)을 꽂는다 — iOS에서도
// 진동이 생기는 개선. localStorage 뮤트 토글은 두 백엔드 모두에 적용된다.

import { playFeedbackSound, type FeedbackSound } from '@/lib/sfx';

const MUTE_KEY = 'marble.haptics.muted';

export type HapticEvent = FeedbackSound;

let backend: ((event: HapticEvent, pattern: number | number[]) => void) | null = null;

/**
 * 플랫폼 부트에서 네이티브 햅틱 백엔드를 꽂는다 (미니앱: Device.triggerHaptic 매핑).
 * 진동 패턴도 같이 넘긴다 — 네이티브 호출이 실패하는 기기에서 백엔드가
 * navigator.vibrate로 폴백할 수 있게.
 */
export function setHapticsBackend(
  fn: ((event: HapticEvent, pattern: number | number[]) => void) | null,
): void {
  backend = fn;
}

function isMuted(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function fire(event: HapticEvent, pattern: number | number[]): void {
  playFeedbackSound(event);
  if (isMuted()) return;
  if (backend) {
    try {
      backend(event, pattern);
    } catch {
      // 네이티브 브릿지 실패는 게임 진행에 영향 없어야 한다.
    }
    return;
  }
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // some browsers throw on user-gesture requirements; silently ignore
  }
}

export const haptics = {
  countdownTick(): void {
    fire('countdownTick', 30);
  },
  countdownGo(): void {
    fire('countdownGo', [0, 60, 40, 80]);
  },
  myFinish(): void {
    fire('myFinish', [60, 40, 120]);
  },
  loserConfirmed(): void {
    fire('loserConfirmed', [0, 0, 0, 200]);
  },
  chargeTap(): void {
    fire('chargeTap', 8);
  },
  reactionGo(): void {
    fire('reactionGo', 40);
  },
  reactionFalseStart(): void {
    fire('reactionFalseStart', [0, 30, 30, 30]);
  },
  triviaCorrect(): void {
    fire('triviaCorrect', [0, 25, 30, 25]);
  },
  triviaWrong(): void {
    fire('triviaWrong', [0, 50, 30, 80]);
  },
  triviaCombo(): void {
    fire('triviaCombo', [0, 15, 25, 15, 25, 30]);
  },
  triviaUrgentTick(): void {
    fire('triviaUrgentTick', 15);
  },
};
