# server/

## 불변조건
- **방·플레이어 상태는 메모리 전용** (`rooms.ts`의 `Map`). 외부 DB·영속 저장소 도입 금지.
- 영속 데이터 없음 — 서버 재시작 시 전부 초기화되는 게 정상. 영속이 필요해 보이면 먼저 합의(공개 범용 서비스라 그룹 간 격리 문제로 이어짐).
- 결과는 서버가 결정. 클라이언트 보고를 진실로 신뢰하지 않음.
- 게임 결과는 `ReplayPayload` 형태로 한 번에 브로드캐스트. 실시간 스트리밍 X.

## 호스트 식별
`hostToken`(서버 발급) 일치 + 현재 소켓이 `room.hostSocketId`와 동일할 때만 호스트 권한 동작.

## 시계
모든 페이즈는 서버 wall-clock 스탬프(`startAt`·`goAt`/`deadlineAt`·퀴즈 스케줄·`endsAt`)에 걸려 있고 클라가 자기 시계와 비교해 그린다. 그래서 클라는 접속할 때마다 `time:sync` 왕복으로 오프셋을 재고(`src/lib/server-clock.ts`), 서버 스탬프와 비교하는 자리엔 `Date.now()` 대신 `serverNow()`를 쓴다 — 자기들끼리만 비교하는 로컬 간격(쿨다운·스로틀)은 그대로 로컬 시계다.

새 타이밍 값을 클라로 보낼 때 이 규칙을 깨지 말 것. 다만 **오프셋은 표시용일 뿐** — 클라가 보낸 시각을 결과에 반영하지 않는다는 원칙은 그대로다(payload에 timestamp 금지).

## 라운드 중 재접속
폰 잠금·탭 폐기로 **풀 리로드**한 클라는 `game:start`를 놓친다. 그래서 `publicRoomState`의 `currentRound`는 라운드를 재구성할 수 있을 만큼을 담는다 — `exposesReplayData`가 true인 게임(reaction·quiz·live-marble)은 intro까지 실어 보내고, 클라(`RoomClient`)가 이걸로 `gameStart`를 복원한다. precompute 마블은 프레임이 수 MB라 제외 — 그쪽은 로비 대신 "진행 중" 대기 화면을 보여준다.

1회성 이벤트(`reaction:go`)는 state로 못 나르므로 `join` 핸들러가 조건부로 개별 재전송하고, 진행 중 바뀌는 값(퀴즈 단축 스케줄)은 state에 실리는 intro도 같이 갱신해야 한다. 새 게임이 라운드 중 상태를 갖는다면 이 두 경로를 같이 챙길 것.

## 정리
빈 방·idle 방은 `rooms.ts`의 `scheduleCleanup`이 자동 정리. 새 게임 추가 시에도 추가 타이머 만들지 말 것. 방이 라운드 도중 삭제될 수 있으므로(`deleteRoom`) 러너·타이머 정리는 거기서도 호출된다.
