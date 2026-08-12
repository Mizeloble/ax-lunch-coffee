# miniapp/ — 앱인토스 PoC 클라이언트

토스 미니앱(앱인토스) 게시 검토용 최소 클라이언트 ([docs/toss-miniapp-review.md](../docs/toss-miniapp-review.md) Phase 1).
앱인토스는 SSR·외부 호스팅을 금지하므로(정적 `.ait` 번들만) 프론트를 Vite CSR로 분리하고,
게임 서버(Socket.IO)는 기존 Fly 백엔드를 그대로 쓴다.

## 구조

- `../src`의 RoomClient·게임 렌더러·스토어·i18n을 **그대로 재사용** — vite alias 두 개만 교체:
  - `next/navigation` → `src/shims/next-navigation.ts` (상태 기반 화면 전환)
  - `@/lib/socket-client` → `src/shims/socket-client.ts` (절대 URL·WS-only 옵션)
- `src/Home.tsx`: PoC 홈 (방 만들기 / 코드 입장)
- `src/DeepLinkPanel.tsx`: 입장 경로 실측 패널 — `getTossShareLink` 공유 링크 QR(주 경로, https 여부 자동 판정) + 원시 스킴 QR(대조용)
- `apps-in-toss.config.ts`: 앱인토스 SDK 3.x 설정 (appName `bokbulbok`)

## 실행

```bash
npm install            # miniapp/ 안에서
npm run dev            # http://localhost:5173 — /socket.io는 :3000으로 프록시 (리포 루트에서 npm run dev 선행)
```

기본 dev는 프록시라 **same-origin**이다. 실제 미니앱은 토스 CDN 오리진이므로 크로스오리진을
재현하려면 절대 URL로 띄운다 (오리진 관련 회귀는 프록시 경유로는 잡히지 않는다):

```bash
VITE_SERVER_URL=http://localhost:3000 npm run dev
```

방 생성은 HTTP가 아니라 `room:create` 소켓 이벤트다 — Next 라우트 핸들러에는 CORS 헤더가 없어
크로스오리진에서 막히고, 그 사이 서버엔 고아 방이 남기 때문. 오리진에 민감한 채널은 소켓 하나뿐이다.

## 번들 (.ait)

```bash
VITE_SERVER_URL=https://bokbulbok-party.fly.dev VITE_WS_ONLY=1 npm run build:ait
```

샌드박스 테스트 전 서버의 `ALLOWED_ORIGIN`에 tossmini 도메인 추가 필요:
`https://bokbulbok-party.web.tossmini.com`, `https://bokbulbok-party.private-web.tossmini.com`
