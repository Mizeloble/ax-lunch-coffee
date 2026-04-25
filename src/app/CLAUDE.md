# app/

Next.js 16 App Router. 정적 페이지(`page.tsx`)는 가능한 한 서버 컴포넌트로, 인터랙션은 `'use client'` 자식으로 위임.

## 구조
- `page.tsx`: "방 만들기" 랜딩 (클라 — `useRouter` 사용)
- `r/[roomId]/page.tsx`: 서버 컴포넌트, `searchParams.join` 추출만 하고 `RoomClient`로 위임
- `r/[roomId]/RoomClient.tsx`: 모든 룸 상태/소켓 처리
- `api/rooms/route.ts`: POST로 방 생성 (Socket.IO와 같은 Node 프로세스 메모리 공유)

## 주의
`api/rooms`는 `runtime: 'nodejs'` 강제. Edge에서는 `src/server/rooms.ts`의 `Map`을 쓸 수 없음.
