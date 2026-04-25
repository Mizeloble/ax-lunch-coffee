# components/

모바일 퍼스트. 데스크탑은 부수적.

## 규칙
- 한국어 문자열은 `src/lib/i18n.ts`에서만 import. 컴포넌트 안에 인라인 금지.
- 터치 타겟 최소 44px (`py-3` 이상).
- 모달/시트는 화면 하단에서 올라오는 바텀시트 패턴(`items-end sm:items-center`).
- 색은 amber-400 = primary, zinc-800/900 = surface, rose/emerald = 결과 강조.

## 안전영역
하단 고정 CTA는 `pb-[max(env(safe-area-inset-bottom),16px)]`로 노치/홈인디케이터 회피.
