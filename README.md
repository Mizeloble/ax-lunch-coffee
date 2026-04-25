# 점심 커피내기 ☕️

점심에 동료 4~12명(최대 30명)이 폰으로 모여 커피값을 정하는 멀티플레이 웹앱.

호스트가 방을 열고 QR 코드를 띄우면, 다른 사람들이 폰 카메라로 스캔해서 입장 → 게임 한 판 → 패자가 커피 ☕️.

## 게임

v1은 **마블 레이스** 한 종만. 호스트가 패자 인원(1~3명) 설정 후 시작 → 30초가량의 물리 기반 구슬 경주 → 꼴찌 N명 패배.

추후 v1.1+에서 **슬롯머신 / 탈락 룰렛 / 동시탭 반응속도** 추가 예정.

## 개발

```bash
npm install
npm run dev
# → http://localhost:3000
```

핸드폰으로 같이 테스트하려면 https가 필요:

```bash
# 같은 머신에서
ngrok http 3000
# 출력된 https URL로 모든 폰이 접속
```

iOS 카메라가 QR 코드의 `https://...` URL은 바로 열어주지만, `http://...` LAN URL은 막힐 수 있음. 그래서 ngrok 또는 Fly 프리뷰 배포가 필수.

## 배포 (Fly.io)

```bash
fly launch --copy-config --no-deploy   # 첫 배포 시
fly deploy
```

도쿄(nrt) 리전 + 무료 티어 VM 1대로 충분.

## 아키텍처 한눈에

- **Next.js 16 (App Router)** + 커스텀 Node 서버(`server.ts`)에 **Socket.IO** 부착
- 방·플레이어는 서버 메모리 `Map`에만 (DB 없음)
- 게임 결과는 서버가 권위적으로 결정 → 프레임 단위 리플레이 트랙을 한 번에 브로드캐스트 → 모든 폰이 동일 wall-clock에 재생
- 닉네임은 localStorage에 저장되어 다음 방 입장 시 자동 입력
- 호스트가 아닌 참가자도 우상단 "초대하기"로 QR/링크 재공유 가능

`/Users/jjmize/.claude/plans/4-12-wild-wigderson.md`에 전체 설계 기록.

## 폴더별 가이드

각 폴더 `CLAUDE.md`에 최소 지침이 있음:

- [`/CLAUDE.md`](./CLAUDE.md)
- [`src/server/`](src/server/CLAUDE.md) — 방 메모리, 권위적 결과
- [`src/games/`](src/games/CLAUDE.md) — 게임 플러그인 추가 방법
- [`src/games/marble/`](src/games/marble/CLAUDE.md) — 마블 시뮬 / lazygyu 출처
- [`src/components/`](src/components/CLAUDE.md) — 모바일 UI 규약
- [`src/app/`](src/app/CLAUDE.md) — App Router 구조
