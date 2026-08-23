import { useState } from 'react';
import { isSoundEnabled, playFeedbackSound, setSoundEnabled } from '@/lib/sfx';
import { haptics } from '@/games/marble/haptics';
import { miniKo } from './i18n';

/**
 * 효과음 On/Off 설정 (검수 요건: "사운드 On/Off 사용자 설정 제공").
 *
 * 플로팅 버튼이 아니라 홈 화면의 설정 행으로 박아 넣는다 — 게임 화면 위에 떠 있으면
 * 네 모서리가 전부(로비 '초대' 버튼·하단 CTA·게임 '내 시점' 배지·토스 닫기 버튼)
 * 점유돼 있어 어디에 둬도 무언가와 겹쳤다. 설정은 자주 만지는 게 아니므로 홈에 두는
 * 편이 자연스럽고, 라운드 중 급히 줄일 때는 폰 볼륨 버튼이 있다.
 */
export function SoundToggle() {
  const [on, setOn] = useState(isSoundEnabled);

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={on ? miniKo.sound.turnOff : miniKo.sound.turnOn}
      onClick={() => {
        const next = !on;
        setSoundEnabled(next);
        setOn(next);
        // 켤 때 즉시 확인음+햅틱 — 사용자 제스처 안이라 AudioContext 언락을 겸하고,
        // 소리·진동이 실제로 나는지 그 자리에서 확인할 수 있다.
        if (next) {
          playFeedbackSound('triviaCorrect');
          haptics.countdownGo();
        }
      }}
      className="surface flex w-full items-center gap-2.5 rounded-xl px-3.5 py-3 active:scale-[0.99]"
    >
      <span className="text-lg leading-none" aria-hidden>
        {on ? '🔊' : '🔇'}
      </span>
      <span className="flex-1 text-left text-[14px] font-medium text-zinc-200">
        {miniKo.sound.label}
      </span>
      <span
        className={
          on
            ? 'text-[13px] font-bold text-amber-400'
            : 'text-[13px] font-bold text-zinc-500'
        }
      >
        {on ? miniKo.sound.on : miniKo.sound.off}
      </span>
    </button>
  );
}
