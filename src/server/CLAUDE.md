# server/

## 불변조건
- 방 상태는 메모리(`rooms.ts`의 `Map`) 전용. **DB 추가 금지** (v1 요건).
- 결과는 서버가 결정. 클라이언트 보고를 진실로 신뢰하지 않음.
- 게임 결과는 `ReplayPayload` 형태로 한 번에 브로드캐스트. 실시간 스트리밍 X.

## 호스트 식별
`hostToken`(서버 발급) 일치 + 현재 소켓이 `room.hostSocketId`와 동일할 때만 호스트 권한 동작.

## 정리
빈 방·idle 방은 `rooms.ts`의 `scheduleCleanup`이 자동 정리. 새 게임 추가 시에도 추가 타이머 만들지 말 것.
