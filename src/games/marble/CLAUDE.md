# games/marble/

## 물리
[lazygyu/roulette](https://github.com/lazygyu/roulette) (MIT)의 box2d-wasm 기반.
원본은 `lazygyu/`(NOTICE 명시), 이 위에 결정성 RNG 주입.

## 진실의 원천
- 시뮬은 **서버에서만** (`sim.ts` → `server.ts`).
- 클라(`Renderer.tsx`)는 받은 리플레이 프레임 재생만. 자체 시뮬 X.
- 같은 `seed` + 같은 `players` (+ 선택적 `chargeRatios`) → 같은 `frames`.

## 공유
- `sim.ts`/`Renderer.tsx`는 `marble-cheer`도 그대로 재사용. `simulateRace(seed, players, chargeRatios?)`의 마지막 인자만 marble-cheer가 채움.
- `physics.createMarble(id, x, y, chargeRatio = 0)` 기본값 0이 marble의 기존 동작을 유지.

## 데이터
- 120 FPS 시뮬, 미터 좌표
- 프레임당 마블 위치 배열 + 정적 엔티티 한 번만 전송
- socket.io 기본 압축
