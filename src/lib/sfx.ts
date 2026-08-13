'use client';

/**
 * 효과음 신디사이저 (에셋 없는 WebAudio 톤 합성).
 *
 * haptics(src/games/marble/haptics.ts)가 피드백 버스 역할을 하면서 이벤트마다
 * 여기 `playFeedbackSound`를 같이 호출한다 — 렌더러 호출부는 그대로 두고
 * 진동·사운드가 한 이벤트에서 나간다. 사운드와 진동의 켬/끔은 서로 독립.
 *
 * 기본값은 플랫폼별로 다르다: 웹은 `configureSfx`를 부르지 않으므로 꺼짐(기존
 * 동작 불변), 미니앱은 부트에서 기본 켬으로 설정한다 — 앱인토스 게임 검수
 * 체크리스트(효과음 적용 + On/Off 설정 제공)가 미니앱 쪽 요구라서다.
 *
 * 검수 요건 "백그라운드 전환 시 사운드 즉시 종료": visibilitychange에서
 * AudioContext를 suspend한다. 복귀 시 자동 재개하지 않고 다음 재생에서 resume.
 */

export type FeedbackSound =
  | 'countdownTick'
  | 'countdownGo'
  | 'myFinish'
  | 'loserConfirmed'
  | 'chargeTap'
  | 'reactionGo'
  | 'reactionFalseStart'
  | 'triviaCorrect'
  | 'triviaWrong'
  | 'triviaCombo'
  | 'triviaUrgentTick';

const STORAGE_KEY = 'bbk:sound';

let platformDefault = false;
let ctx: AudioContext | null = null;
let visibilityHooked = false;
let unlockHooked = false;

// 모바일 웹뷰(WKWebView·Android WebView)는 사용자 제스처 "안에서" AudioContext를
// 만들거나 resume해야 소리가 난다. 효과음은 대부분 타이머에서 발화하므로(카운트다운
// 틱 등) 제스처 컨텍스트가 아니다 — 첫 터치에서 미리 깨워두는 언락 훅이 필수.
// 데스크톱에선 무해한 no-op에 가깝다.
function installUnlock(): void {
  if (unlockHooked || typeof document === 'undefined') return;
  unlockHooked = true;
  const unlock = () => {
    const c = getCtx();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
    if (c && c.state === 'running') {
      document.removeEventListener('pointerdown', unlock, true);
      document.removeEventListener('touchend', unlock, true);
    }
  };
  document.addEventListener('pointerdown', unlock, true);
  document.addEventListener('touchend', unlock, true);
}

function readStored(): boolean | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === null ? null : v === '1';
  } catch {
    return null;
  }
}

export function isSoundEnabled(): boolean {
  return readStored() ?? platformDefault;
}

export function setSoundEnabled(on: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
  } catch {}
  if (!on) {
    // 즉시 침묵 — 재생 중이던 꼬리까지 끊는다.
    ctx?.suspend().catch(() => {});
  }
}

/** 플랫폼 부트에서 한 번 호출 (미니앱: { defaultEnabled: true }). */
export function configureSfx(opts: { defaultEnabled: boolean }): void {
  platformDefault = opts.defaultEnabled;
  installUnlock();
}

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    try {
      ctx = new AC();
    } catch {
      return null;
    }
  }
  if (!visibilityHooked) {
    visibilityHooked = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') ctx?.suspend().catch(() => {});
    });
  }
  return ctx;
}

/** freq(Hz) 톤 하나. at은 ctx.currentTime 기준 오프셋(초). */
function tone(
  c: AudioContext,
  freq: number,
  durMs: number,
  { type = 'sine', gain = 0.12, at = 0 }: { type?: OscillatorType; gain?: number; at?: number } = {},
) {
  const t0 = c.currentTime + at;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  // 클릭 노이즈 방지: 어택 5ms, 릴리즈는 지속시간의 절반.
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + durMs / 1000);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + durMs / 1000 + 0.02);
}

const PATTERNS: Record<FeedbackSound, (c: AudioContext) => void> = {
  countdownTick: (c) => tone(c, 880, 70, { type: 'square', gain: 0.06 }),
  countdownGo: (c) => {
    tone(c, 660, 90, { type: 'square', gain: 0.09 });
    tone(c, 990, 160, { type: 'square', gain: 0.09, at: 0.09 });
  },
  myFinish: (c) => {
    tone(c, 1046, 90, { gain: 0.1 });
    tone(c, 1318, 90, { gain: 0.1, at: 0.08 });
    tone(c, 1568, 180, { gain: 0.12, at: 0.16 });
  },
  loserConfirmed: (c) => {
    tone(c, 392, 140, { type: 'sawtooth', gain: 0.08 });
    tone(c, 311, 140, { type: 'sawtooth', gain: 0.08, at: 0.13 });
    tone(c, 233, 260, { type: 'sawtooth', gain: 0.09, at: 0.26 });
  },
  chargeTap: (c) => tone(c, 1200, 35, { type: 'square', gain: 0.035 }),
  reactionGo: (c) => tone(c, 990, 110, { type: 'square', gain: 0.11 }),
  reactionFalseStart: (c) => tone(c, 150, 220, { type: 'sawtooth', gain: 0.1 }),
  triviaCorrect: (c) => {
    tone(c, 1318, 80, { gain: 0.09 });
    tone(c, 1760, 140, { gain: 0.1, at: 0.07 });
  },
  triviaWrong: (c) => tone(c, 220, 160, { type: 'sawtooth', gain: 0.09 }),
  triviaCombo: (c) => {
    tone(c, 1046, 60, { gain: 0.08 });
    tone(c, 1318, 60, { gain: 0.08, at: 0.06 });
    tone(c, 1760, 100, { gain: 0.1, at: 0.12 });
  },
  triviaUrgentTick: (c) => tone(c, 740, 45, { type: 'square', gain: 0.05 }),
};

export function playFeedbackSound(name: FeedbackSound): void {
  if (!isSoundEnabled()) return;
  installUnlock();
  const c = getCtx();
  if (!c) return;
  // iOS는 사용자 제스처 전 재생을 막는다 — resume 실패는 조용히 무시하고
  // 다음 제스처 이후 재생부터 소리가 난다.
  if (c.state === 'suspended') {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    c.resume().catch(() => {});
  }
  try {
    PATTERNS[name](c);
  } catch {
    // 톤 합성 실패는 게임 진행에 영향 없어야 한다.
  }
}
