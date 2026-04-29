# 점심 커피내기 ☕️

점심에 동료 4~12명(최대 30명)이 폰으로 모여 커피값을 정하는 멀티플레이 웹앱.

호스트가 방을 열고 QR 코드를 띄우면 다른 사람들이 폰 카메라로 스캔해서 입장 → 게임 한 판 → 패자가 커피 ☕️.

- **운영 배포**: [ax-lunch-coffee.fly.dev](https://ax-lunch-coffee.fly.dev) (Fly.io · 도쿄 nrt)
- **상태**: v1 출시 — 마블 레이스만 활성. v1.1에서 슬롯 추가 예정.

## 게임

| ID | 이름 | 길이 | 상태 |
| --- | --- | --- | --- |
| 🏁 marble | 마블 레이스 | ~35초 | **활성 (v1)** |
| 📣 marble-cheer | 응원 마블 레이스 | ~40초 | **활성 (v1.1)** — 시작 전 5초 탭 충전이 마블 물리에 미세 반영 |
| 🎰 slot | 슬롯머신 룰렛 | ~8초 | 비활성 (v1.2) |
| 🎯 elimination | 탈락 룰렛 | ~20초 | 비활성 (v1.3) |
| ⚡ reaction | 동시탭 반응속도 | ~6초 | 비활성 (v1.4) |

활성 여부는 [`src/games/types.ts`](src/games/types.ts)의 `GAME_META`에서 단일 진실. 카드는 모두 보이지만 비활성은 잠금.

## 주요 기능

- **방 만들기 → QR 입장**: 호스트가 방 만들고 QR 띄움 → 다른 폰이 스캔하면 같은 방 입장
- **닉네임 기억**: 첫 입장 시 입력 → `localStorage`에 저장 → 다음에는 자동 입장 ("바꾸기"로 변경 가능)
- **호스트가 직접 추가**: 폰을 안 가져온 동료도 호스트 화면에서 직접 등록·삭제 (오프라인 참가자)
- **누구나 초대하기**: 호스트뿐 아니라 게스트도 우상단에서 QR/링크 재공유 (옆자리 릴레이)
- **권위적 결과 + 동기 재생**: 서버가 시뮬·결정 → 리플레이 트랙 한 번에 브로드캐스트 → 모든 폰이 동일 wall-clock에 재생
- **재연결 복구**: 끊겨도 10초 grace 안에 같은 토큰으로 돌아오면 상태 복구
- **결과 후 자동 정리**: 결과 화면 3분 idle → 메인 자동 이동, 빈 방 60초 후 소멸

## 개발

```bash
npm install
npm run dev            # http://localhost:3000 (Next + Socket.IO 동일 포트)
npm run typecheck
```

핸드폰 멀티 테스트는 https가 필요. iOS 카메라가 `http://...` LAN URL은 거부하기 때문:

```bash
ngrok http 3000        # 로컬 빠른 반복용
# 또는
fly deploy             # 90초, 실 LTE 환경 검증용
```

봇으로 부하 테스트하려면 [`scripts/sim-debug.ts`](scripts/sim-debug.ts) 참고.

## 배포 (Fly.io)

```bash
fly launch --copy-config --no-deploy   # 첫 배포 시 (이미 설정됨)
fly deploy
```

도쿄(nrt) 리전 + `shared-cpu-1x` / 512MB 한 대로 충분. 설정은 [`fly.toml`](fly.toml).

## 아키텍처 한눈에

- **Next.js 16 (App Router)** + 커스텀 Node 서버([`server.ts`](server.ts))에 **Socket.IO** 부착
- **box2d-wasm**으로 서버에서 헤드리스 물리 시뮬, 클라는 받은 프레임 재생만 ([`src/games/marble/`](src/games/marble/))
- 방·플레이어는 서버 메모리 `Map`에만 (DB 없음, 빈 방 60초 후 소멸)
- 모바일 퍼스트 UI: Tailwind + Pretendard, amber-400 = primary
- 한국어 카피는 [`src/lib/i18n.ts`](src/lib/i18n.ts) 한 곳에서만

## 폴더별 가이드

각 폴더의 `CLAUDE.md`에 불변조건·금기만 기록:

- [`/CLAUDE.md`](./CLAUDE.md)
- [`src/server/`](src/server/CLAUDE.md) — 방 메모리, 권위적 결과, 호스트 식별
- [`src/games/`](src/games/CLAUDE.md) — GameModule 인터페이스, 새 게임 추가 순서
- [`src/games/marble/`](src/games/marble/CLAUDE.md) — 마블 시뮬·렌더, lazygyu 출처
- [`src/games/marble-cheer/`](src/games/marble-cheer/CLAUDE.md) — 응원 충전 변형 (sim 공유)
- [`src/components/`](src/components/CLAUDE.md) — 모바일 UI 규약, amber 위계
- [`src/app/`](src/app/CLAUDE.md) — App Router 구조

## 로드맵

### ✅ v1 (출시 완료)

- [x] 방 생성 / QR 입장 / 닉네임 localStorage 기억
- [x] 게스트도 QR·링크 재공유 (`navigator.share` 포함)
- [x] 호스트가 폰 없는 동료 직접 추가·삭제
- [x] 로비 / 게임 선택 카드 / 패자 수 (1~3명) 설정
- [x] 마블 레이스: lazygyu 트랙 이식, 서버 헤드리스 시뮬, 리플레이 동기화
- [x] 꼴등 중심 카메라 + 슬로우모 연출
- [x] 카운트다운 → 동기 재생 → 결과 화면 (개인 등수 카드)
- [x] 다시 하기 / 게임 바꾸기 루프
- [x] 디자인 시안 통합 (Pretendard · amber 위계 · Display 결과)
- [x] 재연결 복구 (10초 grace) + 결과 3분 idle 자동 이탈
- [x] Fly.io 도쿄 배포 + 한국어 UI

### ✅ v1.1 — 응원 마블 레이스 📣

- [x] 시작 전 5초 "응원 충전" 페이즈 (`needsPreCharge` 메타 플래그)
- [x] 충전 비율을 마블 반경/밀도에 미세 반영 (결정론 유지)
- [x] manual(폰 없는) 참가자는 평균값(50%)으로 자동 충전
- [x] 매크로 방지: 한 명당 최대 50탭 cap
- [x] 자기 게이지 + 전체 평균 게이지 + 햅틱

### v1.2 — 슬롯머신 룰렛 🎰

- [ ] [`src/games/slot/server.ts`](src/games/) — 시드 → ranking 순수 함수
- [ ] [`src/games/slot/Renderer.tsx`](src/games/) — 세로 슬롯 이징 애니메이션
- [ ] `GAME_META.slot.enabled = true` + 카드 활성
- [ ] 4명/12명 해피패스 검증

### v1.3 — 탈락 룰렛 🎯

- [ ] 라운드별 탈락 순서 결정 (서버에서 미리 확정)
- [ ] 원형 스피너 렌더 + 라운드별 재생
- [ ] 인원수에 따른 라운드 시간 튜닝

### v1.4 — 동시탭 반응속도 ⚡

- [ ] `tapOffsets` 클라 입력 수집 (최초의 `needsClientInput` 게임)
- [ ] `startAt` 동기화로 부정출발 처리
- [ ] 폰 시계 편차 케이스 검증

### 백로그 (우선순위 미정)

- [ ] 효과음 / 햅틱
- [ ] 관전자 모드 / 방 비밀번호
- [ ] PWA / 다국어
- [ ] 진행 중 라운드 재연결 복구
- [ ] 히스토리 (DB 도입 시점에)

## 크레딧 / 라이선스

- 작성·운영: **AX 전략그룹** · [jjmize.kim@samsung.com](mailto:jjmize.kim@samsung.com)
- 마블 물리: [lazygyu/roulette](https://github.com/lazygyu/roulette) (MIT) — `src/games/marble/lazygyu/`에 출처 명시 ([NOTICE](NOTICE))
