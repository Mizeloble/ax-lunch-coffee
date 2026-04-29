# games/marble-cheer/

마블 레이스의 변형. 시작 직전 5초 "응원 충전" 페이즈 동안 모은 탭 횟수가 마블 반경/밀도에 미세 반영됨.

## 진실의 원천
- 시뮬·렌더는 `../marble/sim.ts`, `../marble/Renderer.tsx`를 그대로 재사용. 코드 복제 금지.
- 추가 입력은 `chargeRatios: Record<playerToken, number ∈ [0,1]>` 하나뿐.
- `seed + players + chargeRatios`가 동일하면 `frames` 동일 (결정론).

## 충전 페이즈 자체의 처리
- 서버: `GAME_META['marble-cheer'].needsPreCharge === true`이면 `src/server/socket.ts` start 분기가 자동으로 charging 단계 추가.
- 클라: `src/components/ChargePhase.tsx`가 status === 'charging'일 때 떠오름.
- 이 모듈은 *시뮬만* 책임짐. 페이즈 자체의 흐름은 건드리지 않음.

## 금기
- physics.createMarble 시그니처 변경 시 `marble`도 영향. 기본값 `chargeRatio = 0`을 유지해서 marble 회귀 없게.
