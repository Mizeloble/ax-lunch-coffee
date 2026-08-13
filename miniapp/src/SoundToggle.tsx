import { useState } from 'react';
import { isSoundEnabled, playFeedbackSound, setSoundEnabled } from '@/lib/sfx';
import { haptics } from '@/games/marble/haptics';
import { miniKo } from './i18n';

// 검수 요건: 사운드 On/Off 사용자 설정 — 어느 화면에서든 접근 가능한 플로팅 토글.
// 게임 캔버스와 겹칠 수 있어 우상단 안전영역 아래 작은 아이콘으로만.
export function SoundToggle() {
  const [on, setOn] = useState(isSoundEnabled);

  return (
    <button
      type="button"
      aria-label={on ? miniKo.sound.turnOff : miniKo.sound.turnOn}
      aria-pressed={on}
      onClick={() => {
        const next = !on;
        setSoundEnabled(next);
        setOn(next);
        // 켤 때 즉시 확인음+햅틱 — 사용자 제스처 안이라 AudioContext 언락을
        // 겸하고, 소리·진동이 실제로 나는지 그 자리에서 확인할 수 있다.
        if (next) {
          playFeedbackSound('triviaCorrect');
          haptics.countdownGo();
        }
      }}
      className="fixed right-3 top-[max(env(safe-area-inset-top),12px)] z-[70] flex h-9 w-9 items-center justify-center rounded-full bg-zinc-800/80 text-base backdrop-blur-sm active:scale-95"
    >
      <span aria-hidden>{on ? '🔊' : '🔇'}</span>
    </button>
  );
}
