# games/reaction/

## 진실의 원천
- **서버 도착 시각만 사용** — 클라가 보낸 `tapAt` 등을 신뢰하지 않는다. payload는 인자 없는 `reaction:tap`. 서버가 `Date.now() - goAt`로 offset 계산.
- 서버는 기록한 offset을 **ack로 돌려줌**(`ReactionTapAck`) — 표시 전용 채널. Renderer의 "내 기록" 배지는 이 값을 쓴다(로컬 추정값은 ack 도착 전 즉시 피드백용). 결과 화면 ms와 항상 일치해야 함.
- 첫 탭만 기록. 이후 `reaction:tap`은 무시.
- ranking은 `computeResult` 안에서만 결정. **goAt은 사전 공지 금지** — `game:start`에는 goAt·deadlineAt·실seed를 싣지 않고(사전에 알면 콘솔 한 줄 스크립트가 매판 이김), 서버가 goAt 시각에 `reaction:go {goAt, deadlineAt}`를 push한다. Renderer는 이 이벤트 수신 전 탭을 전부 false start로 처리하되 ack로 교정.
- `reaction:go`는 1회성 브로드캐스트라, goAt이 지난 뒤 재입장하는 소켓에는 `join` 핸들러가 개별 재전송한다(goAt 이전엔 절대 안 보냄 — 치팅 방지 유지). 구독은 `RoomClient`에 있고 Renderer는 `goTimes` prop으로 받는다 — 재접속 재전송은 Renderer 마운트 **전에** 도착하므로 Renderer 안에서 구독하면 놓친다.

## 결정성
- `prepareReactionIntro(seed)` — mulberry32로 `goAtOffset ∈ [PRE_GO_MIN, PRE_GO_MAX]` 산출. 같은 seed면 항상 같은 시각.
- 동률 tie-break은 seed 파생 셔플 순서(`seededTieRank`) — 토큰 사전순은 방 생성 후 고정이라 manual 2명 이상이면 매판 같은 사람이 지게 되어 폐기.

## 분류
- `offset < REACTION_MIN_HUMAN_RT_MS(80ms)` = false start (음수 포함). 가장 일찍 누른 false-starter가 가장 꼴등.
- `offset == null` (manual + non-tapper) = false-starter 다음 묶음.

## 금기
- `Math.random()` / `Date.now()`를 `prepareIntro`/`computeResult` 안에서 호출 금지.
- 클라가 보낸 timestamp를 ranking에 직접 반영 금지.
- `reaction:tap` payload에 timestamp 추가 금지 (스푸핑 방지).
