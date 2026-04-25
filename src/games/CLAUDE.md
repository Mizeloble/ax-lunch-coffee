# games/

게임은 플러그인. 각 게임은 `<id>/server.ts`(서버 결과 결정) + `<id>/Renderer.tsx`(클라 재생) 한 쌍.

## 새 게임 추가 순서
1. `types.ts`의 `GAME_META`에 메타데이터 등록 (`enabled: false`로 시작)
2. `<id>/server.ts`에 `GameServerModule` 구현 — `computeResult`는 **순수 함수** (같은 입력 → 같은 출력)
3. `src/server/game-runner.ts`의 `REGISTRY`에 매핑 추가
4. `<id>/Renderer.tsx`에 React 컴포넌트 — props로 받은 `replay`만 보고 렌더 (네트워크 호출 X)
5. `RoomClient.tsx`에서 `gameId`별 분기에 추가
6. 검증 끝나면 `enabled: true`

## 금기
- `Renderer`에서 결과를 다시 계산하지 않기 — 서버 ranking이 진실.
- `computeResult` 안에서 `Date.now()`/전역 RNG 사용 금지. 전부 `seed` 인자로.
