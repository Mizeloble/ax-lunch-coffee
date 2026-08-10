# app/

Next.js 16 App Router. 정적 페이지(`page.tsx`)는 가능한 한 서버 컴포넌트로, 인터랙션은 `'use client'` 자식으로 위임.

## 구조
- `page.tsx`: "방 만들기" 랜딩 (클라 — `useRouter` 사용)
- `r/[roomId]/page.tsx`: 서버 컴포넌트, `searchParams.join` 추출만 하고 `RoomClient`로 위임
- `r/[roomId]/RoomClient.tsx`: 모든 룸 상태/소켓 처리

## 주의
HTTP API 라우트는 없다. 방 생성은 `room:create` 소켓 이벤트(`src/server/socket.ts`) — 미니앱처럼
다른 오리진에서 호출할 때 Next 라우트 핸들러는 CORS 헤더가 없어 막히기 때문. 오리진에 민감한
채널을 소켓 CORS 한 곳으로 통일했으니, 새 엔드포인트도 HTTP 라우트 대신 소켓 이벤트로 붙일 것.
