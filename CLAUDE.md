# 점심 커피내기 (ax-lunch-coffee)

목적: 점심 동료 4~12명이 폰으로 함께 즐기는 커피값 정하기 게임. 호스트가 QR로 방을 열고 참가자들이 스캔해서 입장.

## 실행
- 개발: `npm run dev` (http://localhost:3000, Socket.IO 동일 포트)
- 타입체크: `npm run typecheck`
- 프로덕션: `npm run build && npm start`

## 아키텍처 한줄 요약
Next.js 16(App Router) + 커스텀 Node 서버(`server.ts`) + Socket.IO. 방·플레이어는 서버 메모리에만, DB 없음. 게임 결과는 서버가 권위적으로 결정 → 리플레이 트랙 형태로 브로드캐스트 → 모든 클라가 동일 wall-clock에 재생.

## 한국어 UI 원칙
- 모든 사용자 가시 문자열은 `src/lib/i18n.ts`에서만. 인라인 한국어 금지.
- 카피는 짧게(모바일 한 줄 안에 들어오게).

## 구현 순위
v1은 게임 A(마블 레이스)만. 이후 B·C·D 추가 시 `src/games/<id>/` 한 쌍씩만 늘림.
