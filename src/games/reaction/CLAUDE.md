# games/reaction/

## 진실의 원천
- **서버 도착 시각만 사용** — 클라가 보낸 `tapAt` 등을 신뢰하지 않는다. payload는 인자 없는 `reaction:tap`. 서버가 `Date.now() - goAt`로 offset 계산.
- 첫 탭만 기록. 이후 `reaction:tap`은 무시.
- ranking은 `computeResult` 안에서만 결정. Renderer는 받은 `goAt`/`deadlineAt`만 보고 페이즈 분기.

## 결정성
- `prepareReactionIntro(seed)` — mulberry32로 `goAtOffset ∈ [PRE_GO_MIN, PRE_GO_MAX]` 산출. 같은 seed면 항상 같은 시각.
- 동률 tie-break은 `playerToken` 사전순.

## 분류
- `offset < REACTION_MIN_HUMAN_RT_MS(80ms)` = false start (음수 포함). 가장 일찍 누른 false-starter가 가장 꼴등.
- `offset == null` (manual + non-tapper) = false-starter 다음 묶음.

## 금기
- `Math.random()` / `Date.now()`를 `prepareIntro`/`computeResult` 안에서 호출 금지.
- 클라가 보낸 timestamp를 ranking에 직접 반영 금지.
- `reaction:tap` payload에 timestamp 추가 금지 (스푸핑 방지).
