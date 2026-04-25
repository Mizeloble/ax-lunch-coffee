# games/marble/

## v1 단순화
v1은 자체 구현한 simplified physics(중력 + 페그 충돌 + 마블 간 충돌)로 시작.
[lazygyu/roulette](https://github.com/lazygyu/roulette) (MIT)의 box2d-wasm 기반으로 v1.1에서 교체 예정.

## 진실의 원천
- 시뮬은 **서버에서만** (`simulate.ts` → `server.ts`).
- 클라(`Renderer.tsx`)는 받은 리플레이 트랙 재생만. 자체 시뮬 X.
- 같은 `seed` + 같은 `players` → 같은 `frames` (서버 단일 실행이라 자명).

## 데이터
- 30 FPS, ~25–35초 → 750–1050 프레임
- 프레임당 `[x0,y0,x1,y1,...]` (round3로 KB 절감)
- delta-encode 후 socket.io의 기본 압축으로 전송 (12명 기준 ~30–50KB)
