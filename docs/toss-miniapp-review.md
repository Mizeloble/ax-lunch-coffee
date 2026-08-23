# 토스 미니앱(앱인토스) 게시 검토

> 작성일: 2026-08-08. 앱인토스 개발자센터 공식 문서(developers-apps-in-toss.toss.im 전문)와
> 2026년 공식 블로그 업데이트를 전수 조사한 결과. 이 문서는 의사결정 + 진행 시 실행 절차를 겸한다.

## 0. TL;DR

| 질문 | 답 |
|---|---|
| 지금 구조 그대로 올릴 수 있나? | **불가.** SSR·외부 호스팅 금지 — 프론트는 정적 번들(`.ait`)을 토스 CDN에 업로드하는 방식만 허용 |
| 포팅 경로는 존재하나? | **있음.** 별도 CSR 클라이언트(정적 번들) + 기존 Fly 백엔드(`wss://`) 조합. 백엔드 자체 운영은 공식 허용 |
| 법적 선결 조건은? | **게임 등급분류 필수.** 최단 경로는 구글 플레이 선출시($25) → IARC 자체등급 |
| 수익화는? | 애드핏/애드센스 **금지**. 앱인토스 광고 SDK만(수수료 15%) + **사업자 등록 필수** |
| 콘텐츠 심사 리스크는? | "술게임/벌칙" 카피가 민감 콘텐츠 기준(음주 반복 = 2단계)에 저촉 가능. 미니앱용 카피 정리 필요 |
| **QR 즉시입장(핵심 가치)은 살아남나?** | **살아남는다.** `getTossShareLink`로 방 코드를 실은 공유 링크를 만들어 QR·단톡방 배포 — 미니앱 안으로 들여보내는 건 허용(§2-3). 잃는 건 "토스 미설치자"뿐이고, 웹판은 그대로 병행 |
| 얻는 것은? | 토스 유저 ~3,000만 노출 채널(통합 미니앱 홈·검색·게임홈), 공유 리워드·푸시 등 성장 도구. Stage 0 정체를 뚫을 유력한 유통 경로 |

**권고: 즉시 게시 불가, 조건부 진행.** 순서는 ① 사업자 등록·투자 의사결정 → ② 샌드박스 PoC(반나절~1일, 무료)로 Socket.IO·입장 플로우 실측 → ③ 통과 시 등급분류 + 포팅 착수. PoC 실패 시 즉시 중단(매몰 비용 $0).

---

## 1. 게시 요건 정리

### 1-1. 절차와 소요

```
콘솔 가입(토스 비즈니스, 만 19세+) → 워크스페이스 생성 → (사업자 등록) → 앱 등록(게임 트랙)
→ 개발 → 샌드박스 테스트 → .ait 번들 업로드 → 토스앱 테스트(1회 이상 필수) → 출시 검수(3~5영업일) → 출시
```

- 게임 기준 개발~출시 총 소요 약 **2~4주** (공식 FAQ).
- 검수 4개 축: 서비스(출시 가능 여부) / 기능 / 디자인 / 보안. 출시 후에도 사후 모니터링, 위반 시 긴급 중단 선조치.
- 지원 환경: Android 7+ / iOS 16+.

### 1-2. 사업자 등록 — 출시엔 불필요, 수익화엔 필수

| 사업자 **필요** | 사업자 **불필요** |
|---|---|
| 토스 로그인, 인앱 결제, **인앱 광고**, 토스페이, 프로모션(토스포인트) | 익명 식별키(anonKey), 리더보드·게임 프로필, **공유 리워드**, 푸시 |

- 무사업자 출시 = 수익화 전면 차단. 광고 목적이면 개인사업자 등록이 실질적 전제.
- 사업자등록증 업종과 미니앱 업종 일치 필요. 면세 사업자는 등록 불가.

### 1-3. 게임 등급분류 (법적 필수 — 최대 허들)

게임산업진흥법상 미분류 게임은 출시 불가. 두 경로:

| 경로 | 비용 | 소요 | 비고 |
|---|---|---|---|
| **(A-1) 원스토어 자체등급분류 — 권장 (2026-08-15 변경)** | **무료** | 앱 심사 며칠 | 개인 등록 가능·테스트 의무 없음. 앱인토스 콘솔 스토어 링크 항목이 원스토어 명시 수용. Android 래핑(TWA/WebView) 필요. 플레이 화면 4장(스토어 2 + 앱인토스 2, 무편집) 제출로 동일 게임 증명 |
| (A-2) 구글 플레이 자체등급분류 | $25(1회) | **3~4주+** | 초판이 최단 경로로 봤으나 오판 — 2023-11 이후 신규 개인 계정은 **비공개 테스트 12명×14일 연속 + 프로덕션 접근 심사(~7일)** 의무([공식 정책](https://support.google.com/googleplay/android-developer/answer/14151465)). 장기 유통 가치로 병행은 가능 |
| (B) GRAC 직접 신청 — **백업 경로** | 수수료 (개인 50% 감면) | 10~15일 + 서류(설명자료·영상) | 2026-08-15 재검증: [개인 개발자 수수료 감면 공식 운영](https://www.etnews.com/20231004000132) — 비사업자 개인 신청 경로 존재 확인. APK 불필요. 원스토어 심사 거절 시 전환 |

> 2026-08-15 재검증 근거: 원스토어 경로는 [앱인토스 개발자 커뮤니티 실전 사례](https://techchat-apps-in-toss.toss.im/t/topic/3570)로 확인(자체등급 심사 통과 후 1일 내 게임물관리위 DB 등재). 웹뷰 거절 기준은 "참여 기능 없는 홍보·정보성 웹뷰"라 게임은 비해당.

콘솔 제출 정보에 등급분류 번호·이용등급·**대표자 인감/사인 이미지** 포함. 등록자명 ≠ 신청자명이면 반려.

---

## 2. 아키텍처 갭 분석

### 2-1. 현재 구조 vs 앱인토스 요구

| 영역 | 현재 (이 저장소) | 앱인토스 요구 | 갭 |
|---|---|---|---|
| 프론트 렌더링 | Next.js 16 SSR (App Router) | **SSR 금지.** CSR/SSG 정적 번들만 | 🟢 해결 — [`miniapp/`](../miniapp/) Vite CSR 엔트리로 분리, `../src` 컴포넌트는 그대로 재사용 |
| 호스팅 | Fly.io 단일 인스턴스 (프론트+백 동일 오리진) | 프론트는 토스 CDN(`<appName>.web.tossmini.com`), 백엔드는 자체 운영 허용 | 🔴 오리진 분리 → CORS·소켓 URL 명시 필요 |
| 실시간 통신 | Socket.IO 4.8 동일 오리진 상대 연결(`io()`), websocket+polling | WebSocket은 **`wss://` 한정** 허용. Socket.IO 언급 없음 | 🟡 `io('wss://<fly-app>')` 명시 + `ALLOWED_ORIGIN`에 tossmini 도메인 추가. 샌드박스 실측 필수 |
| 방 입장 | QR(외부 카메라 앱) → 웹 URL / 6자 코드 입력 | 미니앱 **안으로** 들여보내는 공유 링크는 허용(`getTossShareLink`) — 금지는 바깥(자사 웹)으로 내보내는 것 | 🟡 QR 즉시입장 구조는 보존. 링크 생성만 교체 (§2-3) |
| 초대 URL 생성 | `window.location.origin` 기반 (`RoomClient.tsx:84`) | 웹뷰 오리진 = tossmini.com | 🟡 `getTossShareLink('intoss://<앱>/r/<방>')`로 교체 |
| hostToken 보관 | `sessionStorage` | 웹뷰 세션 정책 미보장. 네이티브 `Storage.*` API 제공 | 🟡 `Storage` API로 이전 권장 |
| 폰트 | jsdelivr CDN (layout.tsx, 무조건 로드) | 외부 CDN 로딩 가능하나 번들 자립 권장 | 🟢 번들에 폰트 포함으로 전환 |
| 광고 | env 게이팅 (현재 `none`) | 외부 광고 스크립트 금지 | 🟢 `none` 유지 시 충돌 없음 — 미니앱 빌드에선 AdSlot 자체 제외 |
| 뒤로가기/종료 | 브라우저 내비게이션 | 게임은 OS 뒤로가기 제스처 **사용 불가**, 종료 확인 모달 필수, 풀스크린 | 🟡 SDK 이벤트로 신규 구현 |
| 사운드 | 게임별 효과음·햅틱 | **사운드 On/Off 설정 필수**, 백그라운드 전환 시 즉시 종료, 무음 모드 대응 | 🟡 설정 UI 신규 (검수 반려 사유) |
| 다크모드 | 다크 테마(`#0b0b10`) 기본 | **라이트 모드 기준으로만** 개발/디자인 | 🟡 확인 필요 — 게임 화면은 자유도 있을 수 있으나 가이드는 라이트 기준 |
| 진동 | `navigator.vibrate` (iOS 미지원) | `Device.triggerHaptic` — iOS 포함 동작 | 🟢 오히려 개선 기회 |
| 번들 크기 | — | 압축 해제 100MB 이하 | 🟢 문제없음 (box2d-wasm 포함해도 여유) |

### 2-2. 포팅 시 재사용 가능 vs 신규

**재사용 (서버 권위 구조 덕에 대부분 보존):**
- 백엔드 전체: `server.ts`, `src/server/*`(rooms, rounds, socket), 게임 서버 로직 — 변경은 CORS 오리진 추가 정도
- `src/lib/socket-client.ts`(URL 명시로 변경), `server-clock.ts`, 게임 Renderer들(`src/games/*/`), zustand 스토어, i18n

**신규 (미니앱 전용 클라이언트):**
- Vite 기반 CSR 엔트리 + `@apps-in-toss/web-framework` (공식 표준. Next `output: 'export'`도 가능하나 커스텀 서버·API 라우트와 얽혀 있어 별도 Vite 앱이 깔끔)
- `apps-in-toss.config.ts` (SDK 3.x, permissions 선언 — 검수에 사용됨)
- ~~방 생성 API 호출~~ → 해결됨: `room:create` 소켓 이벤트(v2.30.0)로 웹·미니앱이 같은 경로를 쓴다
- 입장 플로우 UI(§2-3), 사운드 설정, 종료 모달, 닫기 버튼 대응
- SEO·OG·sitemap·robots·랜딩은 미니앱에서 전부 불필요 (제외)

### 2-3. 입장 플로우 — QR 즉시입장은 보존된다

> 이 절은 2026-08-09에 다시 썼다. 초판은 "QR 즉시입장이 미니앱에서 성립하지 않는다"고 판단했으나,
> 1차 자료 재확인 결과 **틀렸다**. 금지되는 것은 미니앱에서 **바깥**(자사 웹사이트·자사 앱 설치)으로
> 내보내는 행위이고, 미니앱 **안으로** 들여보내는 공유 링크는 토스가 API로 제공한다.

**핵심 메커니즘** — [`getTossShareLink`](https://developers-apps-in-toss.toss.im/documentation/common/growth/share/miniapp-share-link.md) (또는 동등한 `Share.createLink`). 둘 다 WebView SDK(`@apps-in-toss/web-framework`)에서 지원되는 것을 문서 예제로 확인했다.

```ts
function getTossShareLink(url: string, ogImageUrl?: string): Promise<string>;
// url 예: intoss://<앱이름>/r/<방코드>  ← 경로·쿼리 지원이 문서에 명시
```

- **경로에 방 코드를 실을 수 있다** → "QR 한 번 → 그 방으로 바로 입장"이 그대로 성립한다. 웹판과 동작상 동일.
- **미설치자는 앱스토어/플레이스토어로 폴백**된다(문서 명시). 웹판의 "설치 없이 아무나"와 다른 유일한 지점.
- 진입 시 `Environment.initialURL`("앱에 처음 진입할 때 사용한 스킴 URL")로 딥링크를 읽어 방 코드를 파싱한다.
- OG 이미지 미리보기는 Android 5.240.0+ / iOS 5.239.0+.

**입장 경로 (우선순위)**
1. **단톡방 공유 링크** — 실사용 주 경로. 링크를 카톡·문자로 던지면 탭 한 번에 해당 방 입장. 회식 멤버가 이미 단톡방에 있는 경우가 대부분이라 QR보다 자연스럽다.
2. **공유 링크 QR** — 현장 즉석용. 호스트 화면에 QR을 띄우고 기본 카메라로 스캔. 기존 `qrcode` 캔버스([QRCode.tsx](../src/components/QRCode.tsx)) 그대로 재사용. **전제: 반환 문자열이 `https://`여야 기본 카메라가 인식한다** — 문서가 명시하지 않아 실측 대상(§6-2).
3. **6자 방 코드 입력** — 확실한 폴백. 이미 구현된 `joinByCode` 로직 이식.
4. **공유 리워드/연락처 모듈**(`contactsViral`) — 토스 푸시 초대. 사업자 불필요이나 **미니앱 승인 후에만 동작**하고 샌드박스에서는 빈 화면이라 PoC 단계에서 검증 불가.

**토스 미설치 참가자**
- 방 코드를 화면에 표시하는 것 자체는 금지 대상이 아니다 — 방 코드는 미니앱의 자체 입장 수단이고, 그 코드를 어디에 쓰는지는 앱이 관여하지 않는다. 서버가 같으므로 웹 클라이언트가 같은 방에 들어오는 것도 기술적으로 이미 된다.
- **다만 이건 해석이다.** 문서에 "허용"이라고 쓰여 있지 않고, "미니앱 내에서 앱 내 기능을 완결적으로 제공하지 않는 구조"라는 조항이 검수자 재량으로 넓게 읽힐 여지가 있다. **지켜야 할 선: 앱 안에서 웹사이트를 언급·링크하지 않는다.** 코드만 띄우고 안내는 하지 않는다.
- 기존 **"폰 없는 사람"(수동 플레이어)** 기능이 추가 완충 — 호스트가 대신 추가하면 마블류 운빨 게임은 결과에 포함된다(반응속도·퀴즈는 직접 입력이라 불가).

**남은 제약 (초판에서 유효했던 것)**
- 참가자 전원이 토스 앱 사용자여야 한다는 사실 자체는 변하지 않는다. 다만 장벽이 "이 게임 설치"가 아니라 "토스 설치"라 성격이 다르고, 토스 유입 경로로 들어온 사용자에게는 사실상 무마찰이다.
- 미니앱 내 QR **스캐너**는 여전히 없다(`Device.openCamera()`는 정지 사진 1장). 단 참가자는 폰 기본 카메라로 찍으므로 주 경로에는 영향 없다.
- **전략 결론: 웹판을 대체하지 않고 병행한다.** "설치 없이 아무나"라는 근본 가치는 웹판에 그대로 남고, 미니앱은 토스 안에서 게임을 발견한 사용자를 위한 별도 유통 채널이다.

### 2-4. 적대적 검증에서 나온 결함 (2026-08-09)

위 결론과 PoC를 의도적으로 반증하려 시도한 결과. **확인된 결함 2건, 미해결 불확실 2건.**

| # | 발견 | 상태 |
|---|---|---|
| V1 | **`POST /api/rooms` 크로스오리진 차단** — Socket.IO의 `cors` 옵션은 `/socket.io/`에만 적용되고 Next 라우트 핸들러에는 CORS 헤더가 없다. `curl`로 헤더 부재 확인 + 브라우저에서 실제 차단 재현(`No 'Access-Control-Allow-Origin' header`). 서버는 방을 **생성까지 하고** 클라만 응답을 못 읽어, 실패와 동시에 고아 방이 남는다 | ✅ **수정 완료** — 방 생성을 `room:create` 소켓 이벤트로 이전, HTTP 라우트 삭제 |
| V2 | **PoC 로컬 검증이 same-origin이었다** — vite 프록시가 `/api`·`/socket.io`를 같은 오리진으로 만들어 V1을 가렸다. 즉 "전체 루프 통과"는 크로스오리진을 검증하지 못한 결과다 | ✅ **재검증 완료** — `VITE_SERVER_URL` 절대 URL(:5173→:3000)로 전체 루프 통과 |
| V3 | **warm start 딥링크 미보장** — `Environment.initialURL`은 "처음 진입할 때"의 URL이고 이후 갱신되지 않는다. 미니앱이 이미 떠 있는 상태에서 **두 번째 방** 링크를 타면 방 코드가 전달되지 않을 수 있다. WebView SDK용 후속 딥링크 이벤트는 문서에 없다(RN SDK는 라우팅 파라미터로 처리) | 🟡 미해결 → 실측 항목, 폴백은 방 코드 입력 |
| V4 | **공유 링크의 https 여부 미확인** — 문서가 명시하지 않는다("반환 링크가 `https://`로 시작하는지 여부는 문서에 명시돼 있지 않아요"). 앱스토어 폴백이 동작한다는 서술상 https 래퍼일 가능성이 높고 `deep_link_value`도 https 단축링크 관례지만, **추론이지 확인이 아니다** | ✅ **실측 해소 (2026-08-12)** — 토스 웹뷰에서 `getTossShareLink`가 `https://minion.toss.im/<id>` 단축링크 반환 확인. 기본 카메라 QR 스캔 가능 → 입장 경로 2(공유 링크 QR) 성립 |

추가로 재평가한 리스크: **등급분류의 복합 실패 가능성.** IARC 경로는 구글 플레이에 TWA를 실제 출시해야 성립하는데, 플레이 스토어도 자체 심사가 있고 WebView 래핑 앱에 대한 최소 기능 요건이 있다. 여기서 반려되면 GRAC 직접 신청으로 되돌아가는데 그 경로는 비사업자 가능 여부가 불확실(§6-4)하다. 초판은 이 연쇄를 과소평가했다.

---

## 3. 정책·콘텐츠 리스크

### 3-1. 민감 콘텐츠 기준과 현재 카피의 저촉 지점

앱인토스 민감 콘텐츠 등급 중 이 게임과 직접 관련된 행:

| 항목 | 2단계(주의 — 진입 전 경고 노출) | 3단계(출시 불가) |
|---|---|---|
| 약물·도박 | **음주·흡연 반복**, 도박 행위 등장 | 도박 미화·권장 |
| 기타 부적절 | **위험한 행동(불장난 등) 묘사** | 불법행위 조장·극단행동 유도 |
| 혐오·차별 | 특정 집단 조롱 지속 반복 (출시 불가로 격상) | 명시적 혐오 |

현재 저촉 가능 지점:
- `layout.tsx` keywords·랜딩 FAQ·i18n 전반의 **"술게임 / 회식 / 벌칙"** 문구 — 금융 앱 심사 맥락에서 음주 컨텍스트가 전면에 노출됨
- 벌칙은 유저가 자유 입력하는 구조 — 게임 자체가 벌칙 내용을 강제하진 않으나, 스크린샷·앱 설명·예시 문구에 음주가 등장하면 등급·심사에 직접 영향
- "사행성·베팅성 콘텐츠"는 출시 불가 카테고리이나, 복불복은 **재산상 이득이 걸린 베팅이 아니므로** 비해당으로 판단(벌칙 정하기 = 놀이). 단 앱 설명에서 "내기" 표현은 피할 것
- 2026-06부터 만 14세 사용자 노출 시작 — 연령등급이 노출 가능한 유저 풀을 직접 결정. 미니앱 버전은 "파티게임/복불복" 중심의 전연령 카피로 재작성하는 것이 유리

### 3-2. 기타 해당 정책

- **확률형 토스포인트 프로모션 금지**: 게임 앱의 룰렛·뽑기형 포인트 지급, 게임 결과(승패·등수) 기반 보상 모두 명시적 금지. "복불복 결과로 포인트" 류 기획은 원천 불가
- **외부 링크·자사 앱 유도 금지**: 푸터의 GitHub/후원 링크, 피드백 URL 등은 미니앱 빌드에서 제거. 미니앱 안에서 서비스 완결 필수
- **다크패턴 금지**: 진입 즉시 바텀시트 금지 — 현재 InviteSheet·ConsentBanner 노출 타이밍 점검. 동의 배너는 외부 광고가 없는 미니앱 빌드에선 불필요하므로 제거
- **어뷰징 방지**: 유사 기능 앱 다중 출시 금지 — 게임별(마블/퀴즈/리액션) 쪼개기 출시 불가, 하나의 미니앱으로

---

## 4. 수익화 영향

- **애드핏/애드센스 삽입 금지** — 외부 광고 네트워크 전면 불가. [growth-strategy.md](growth-strategy.md)의 "Stage 2 → 도메인+애드핏" 트랙은 **토스 밖 웹 서비스에만 유효**, 미니앱 안에서는 무효
- 허용 수익화: 앱인토스 광고(전면형/보상형/배너, 수수료 **15%**, 사업자 필수), 인앱 결제(수수료 5% + 앱마켓 15~30%)
- 광고 배치 규칙: 배너는 상단/하단만, 로딩·컷신 등 일시 화면 노출 금지, 사전 로딩 필수 — 기존 "대기 화면만 광고" 원칙과 방향은 같음
- 셈법: 자체 웹은 광고 수익 100%지만 유입이 0에 가깝고, 토스는 15% 떼지만 유입 채널(통합홈·검색·공유 리워드)이 붙음. **Stage 0 정체 상황에선 유통이 수수료보다 크다** — 단 사업자 등록·등급분류라는 고정 진입 비용이 선행

---

## 5. 진행 로드맵 (조건부)

### Phase 0 — 의사결정 (사용자 액션, 비용 $0)
- [ ] 개인사업자 등록 의향 확정 (수익화 안 할 거면 무사업자 출시도 가능하나 광고 목적과 모순)
- [ ] 앱인토스 콘솔 가입 + 워크스페이스 생성 (무료, 토스 비즈니스)
- **킬 기준**: 사업자 등록 의향 없음 + 수익화가 목적 → 중단하고 기존 웹 성장 전략 유지

### Phase 1 — 샌드박스 PoC (개발 반나절~1일, 비용 $0)

**PoC 클라이언트 완성 — [`miniapp/`](../miniapp/)** (2026-08-09).
Vite CSR + `@apps-in-toss/web-framework` 3.0.2. **포팅 리스크가 예상보다 낮다는 것이 최대 수확**:
`../src`의 RoomClient·게임 렌더러·스토어·i18n을 손대지 않고 그대로 재사용했고, 갈아끼운 건 vite alias 두 개뿐이다
(`next/navigation` → 상태 기반 라우터 shim, `@/lib/socket-client` → 절대 URL·WS-only 옵션 shim).
로컬 검증 완료: 방 생성 → 닉네임 입장 → 로비(소켓 연결·플레이어 목록) → 마블 리플레이 재생 → 결과 화면 전체 루프 통과.
`ait build`로 `.ait` 번들 생성 확인(140KB, JS 399KB — 100MB 제한 대비 무시 가능).
번들에 외부 광고·분석·폰트 CDN URL이 **하나도 포함되지 않음**(`NODE_ENV=production` 주입으로 광고 자리 표시까지 제거) — 정책 §3-2 준수.

**실측 결과 (2026-08-12, 실제 토스 앱 — 콘솔 QR 테스트 배포로 진행):**
- [x] **wss Socket.IO 연결 ✅ — 킬 기준 통과.** `VITE_WS_ONLY=1`(polling 폴백 없음) + `VITE_SERVER_URL` 절대 URL 번들로 토스 웹뷰에서 방 생성·입장·게임 전 과정 동작
- [x] **`getTossShareLink` → https ✅ (V4 해소).** `https://minion.toss.im/<id>` 단축링크 반환 — 기본 카메라 QR 스캔 가능, 입장 경로 2 성립
- [x] **크로스 플랫폼 혼합 방 ✅.** 토스 미니앱 호스트 + 웹 참가자(fly.dev)가 같은 방에서 마블 1판 완주, 리플레이·최종 순위 양쪽 화면 일치(서버 권위 + 시계 동기화 검증)
- [x] **재연결 ✅.** 게임 화면에서 홈 이탈 → 10초 후 복귀 → 방 그대로 복구. (참고: 첫 시도에서 "방을 찾을 수 없어요"가 떴는데 이는 웹뷰 문제가 아니라 결과 화면 3분 idle로 전원 이탈한 방을 서버가 정상 GC한 것 — 재접속 통신 자체는 그때도 동작했다)
- [ ] ~~공유 링크 QR로 방 진입~~ / ~~warm start 딥링크(V3)~~ → **출시 후 재확인으로 이월.** 링크 탭 시 "지금은 서비스를 사용할 수 없어요" — `intoss://`가 정식 출시 후에만 열리는 정책이라 테스트 배포에서는 검증 불가. 실패해도 방 코드 입력 폴백이 있어 킬 아님

**출시 후 재확인 목록**: ① `minion.toss.im` 공유 링크 탭 → 미니앱 해당 방 진입 ② warm start(미니앱 떠 있는 상태에서 두 번째 방 링크) 딥링크 전달(V3) ③ `contactsViral` 공유 리워드(승인 후에만 동작)

**판정: GO.** 킬 기준(wss)을 포함해 테스트 배포에서 검증 가능한 전 항목 통과, 차단 요인 없음. Phase 2(등급분류 + 본 포팅) 진행.

**실측 전 서버 선결 작업:**
1. ✅ **완료 (v2.30.0)** — 방 생성을 `room:create` 소켓 이벤트로 이전하고 `POST /api/rooms`를 삭제했다. IP 레이트리밋·MAX_ROOMS·메트릭은 그대로 보존(핸드셰이크 IP로 키잉). 이제 오리진에 민감한 채널은 소켓 하나뿐이라 CORS 설정 지점도 한 곳이다. 크로스오리진(:5173→:3000)에서 방 생성~결과까지 전체 루프 검증 완료.
2. ✅ **완료 (v2.31.0)** — `ALLOWED_ORIGIN` 콤마 분리 지원([src/server/allowed-origin.ts](../src/server/allowed-origin.ts) + 유닛 테스트). appName `bokbulbok-party` 확정(2026-08-12 콘솔 등록, 변경 불가) 후 fly secret에 tossmini 오리진 2개 반영 완료 — 프로덕션에서 3개 오리진 CORS 에코 확인.

### Phase 2 — 등급분류 + 포팅 (진행 중)

**본 포팅 1차 완료 (2026-08-13, v2.32.0).** 검수 체크리스트 대응 상태:

| 검수 항목 | 구현 |
|---|---|
| 사운드 적용 + On/Off 설정 | ✅ `src/lib/sfx.ts` WebAudio 신디사이저(에셋 없음) — haptics를 피드백 버스로 확장해 이벤트 하나가 진동+효과음으로. 미니앱 기본 켬 + **홈 화면 설정 행**(v2.34.0, 플로팅은 자리 충돌로 폐기), **웹은 기본 꺼짐(동작 불변)**. 백그라운드 전환 시 AudioContext suspend |
| 종료 확인 모달 | ✅ `ExitGuard` — `graniteEvent.backEvent`(Android 뒤로가기) → 확인 모달 → `closeView()` |
| OS 뒤로가기 제스처 불가 | ✅ iOS `Screen.setIosSwipeBack({isEnabled:false})` + Android은 ExitGuard가 흡수 |
| 게임 중 화면 유지 | ✅ `useWakeLock` shim → `setScreenAwakeMode` (웹뷰엔 navigator.wakeLock 없음) |
| 딥링크 진입 | ✅ 부트에서 `Environment.initialURL` 파싱 → `/r/<코드>` 자동 입장 |
| 초대 링크 | ✅ `useInviteUrl` 플랫폼 분리 — 웹: 오리진 URL / 미니앱: `getTossShareLink` https 링크 (웹 URL 배포 금지 준수). Lobby·ResultScreen의 QR·복사가 자동으로 토스 링크 사용 |
| hostToken 보존 | ✅ `host-token` shim — 네이티브 `Storage`(인메모리 캐시 + JSON 영속). 웹뷰 재생성에도 호스트 권한 유지 |
| 햅틱 iOS | ✅ `Device.triggerHaptic` 백엔드 — 웹(navigator.vibrate)은 iOS 무진동이었는데 미니앱은 iOS도 동작 |

핵심 설계: **웹뷰 감지 게이트**(`toss-env.ts`, SDK와 같은 조건 `window.ReactNativeWebView`). SDK 브릿지 호출 일부가 웹뷰 밖에서 *동기로* throw해서(예: `Storage.setItem`) — 실제로 `room:create` ack 콜백을 죽여 "생성 중"에 갇히는 버그로 발현 — 모든 SDK 진입점을 게이트로 막았다. 로컬 브라우저에선 웹 기본 동작으로 폴백.

**1차 실기기 테스트 (2026-08-13):** 소리·진동 무음, 초대 링크는 생성됨.
- 초대 링크가 `https://<appName>.private-web.tossmini.com/r/<코드>?join=1`로 반환됨 — **shim은 정상 동작**(번들 분석으로 웹 구현 미포함 확인). 테스트 배포에서는 `getTossShareLink`가 공개 래퍼(minion.toss.im) 대신 비공개 웹 URL을 주는 것. 토스 앱 밖에서 열면 CDN이 거부(CloudFront MissingKey) — 정상. **출시 후 공개 링크 반환 여부를 재확인 목록에 추가**
- 소리 무음의 유력 원인: AudioContext **제스처 언락 부재** — 효과음이 타이머에서 발화해 모바일 웹뷰의 자동재생 정책에 걸림 → v2.32.1에서 첫 터치 언락 훅 + 사운드 토글 켤 때 확인음·햅틱(제스처 안 실행이라 언락 겸 진단) 추가
- 진동 무음은 미해명 — 햅틱 백엔드 등록은 정황상 성공(같은 게이트 뒤의 shim이 동작). 기기 설정(미디어 볼륨·시스템 진동) 확인과 함께 재테스트

**2·3차 실기기 테스트 (2026-08-14): 사운드·진동 해결.**
- 사운드 ✅ — 제스처 언락(v2.32.1)이 유효. 토글 확인음 정상
- 진동 ✅ — `Device.triggerHaptic` + `navigator.vibrate` 폴백 조합(v2.32.2)으로 동작. 토스 햅틱 타입이 UI용이라 약해서 큰 순간(GO·골인·벌칙 확정)은 2연타 보강(v2.32.3)
- 공유 링크 ✅ — 테스트 배포에서도 공개 래퍼(`minion.toss.im/<id>`) 반환 확인. 1차의 private-web URL은 재현 안 된 일회성 관찰

**실기기 확인 완료 (2026-08-23):** Android 뒤로가기 → 종료 확인 모달 ✅,
Safe Area(노치·홈 인디케이터, 결과 화면 하단 버튼 포함) ✅, 효과음·진동 ✅.
→ **검수 자가점검표에서 코드로 대응 가능한 항목은 전부 닫힘.**

**출시 후로 이월:** `minion.toss.im` 공유 링크 탭 → 방 진입, warm start 딥링크(V3).
정식 출시 전에는 `intoss://`가 열리지 않아 테스트 배포에서 검증 불가.
- [ ] 결과 공유 카드(`share-card.ts`)의 다운로드/공유가 웹뷰에서 동작하는지 — 안 되면 SDK `share()` 전환
- [ ] 다크 테마 유지 리스크 — 가이드는 라이트 기준이나 게임 트랙은 풀스크린 자유도 있음. 검수 반려 시 대응
- [ ] (선택) Pretendard 폰트 번들 포함 — 현재 시스템 폰트

**병행 트랙:**
- 등급분류: **원스토어**에 래핑 앱 출시(무료) → 자체등급분류 (§1-3 경로 재평가 참조. 구글 플레이는 신규 개인 계정 테스트 의무로 3~4주+ — 선택 병행)
- 에셋: §3 콘텐츠 정리(전연령 카피·스크린샷), 로고·썸네일 제작 (#9)
- 용량 대비: 토스 유입 시 `MAX_ROOMS`(현재 10)·VM 스펙 상향 검토 ([launch-checklist.md](launch-checklist.md) Phase 2 항목과 동일)

### Phase 3 — 검수·출시
- 게임 트랙 등록물: 로고 600×600 PNG(둥근 모서리·투명 불가), 썸네일 1932×828 PNG, 등급 정보, 리더보드 설정
- 토스앱 테스트 1회 이상 → 검수 요청(3~5영업일). 반려 빈발 항목: 사운드 설정 부재, Safe Area 침범, 종료 모달 부재

---

## 6. 불확실 항목과 확인 방법

| # | 항목 | 확인 방법 |
|---|---|---|
| 1 | Socket.IO(wss) 실동작 | Phase 1 샌드박스 실측 — **절대 URL로**(V2) |
| 2 | `getTossShareLink` 반환 문자열이 `https://`인지 (기본 카메라 QR 인식의 전제, V4) | Phase 1 실측 — PoC 패널이 자동 판정 |
| 3 | warm start 시 후속 딥링크 전달 여부 (V3) | Phase 1 실측 (실패해도 코드 입력 폴백) |
| 3b | 웹뷰 `getUserMedia` 카메라 스트림 (미니앱 내 QR 스캐너 구현 가능성) | Phase 1 실측 — 주 경로는 기본 카메라라 영향 작음 |
| 4 | 비사업자 GRAC 직접 신청 가능 여부 | 채널톡 / [개발자 커뮤니티](https://techchat-apps-in-toss.toss.im/) 문의 |
| 5 | 복불복 게임의 웹보드 게임 해당 여부 (베팅 구조 아니므로 비해당 추정) | 검수 문의 |
| 6 | 익명 식별키만 쓰는 게임의 개인정보처리방침 등록 필수 여부 | 콘솔 등록 화면에서 확인 |
| 7 | 연령 정책 최종본 (문서 "만 19세+" vs 2026-06 블로그 "만 14세+ 노출") | 블로그가 최신 — 콘솔 연령등급 설정에서 재확인 |
| 8 | 외부 CDN(폰트 등) 도메인 화이트리스트 필요 여부 | 번들 자립으로 회피 권장, 필요 시 문의 |

---

## 7. 출처

- [앱인토스 개발자센터](https://developers-apps-in-toss.toss.im/) · [전문 덤프](https://developers-apps-in-toss.toss.im/llms-full.txt)
- [서비스 오픈 정책](https://developers-apps-in-toss.toss.im/intro/guide.md) · [서비스별 주의사항(민감 콘텐츠·웹보드)](https://developers-apps-in-toss.toss.im/intro/caution.md)
- [게임 출시 가이드(체크리스트)](https://developers-apps-in-toss.toss.im/checklist/app-game.md)
- [미니앱 등록](https://developers-apps-in-toss.toss.im/guide/operation/console-workspace.md) · [출시](https://developers-apps-in-toss.toss.im/guide/operation/deploy.md) · [사업자 등록](https://developers-apps-in-toss.toss.im/guide/operation/register-business.md)
- [기존 웹 프로젝트 SDK 연동](https://developers-apps-in-toss.toss.im/tutorials/webview.md) · [SDK 3.x 마이그레이션](https://developers-apps-in-toss.toss.im/documentation/integration/sdk-3.x.md)
- [미니앱 공유 링크(getTossShareLink)](https://developers-apps-in-toss.toss.im/documentation/common/growth/share/miniapp-share-link.md) · [Share API](https://developers-apps-in-toss.toss.im/documentation/sdk/domains-api/share.md) · [Environment.initialURL](https://developers-apps-in-toss.toss.im/documentation/sdk/domains-api/environment/environment.initialurl.md) · [공유 리워드](https://developers-apps-in-toss.toss.im/documentation/common/growth/share/reward.md)
- [네트워크(wss/CORS)](https://developers-apps-in-toss.toss.im/documentation/common/network-environment/network.md) · [권한](https://developers-apps-in-toss.toss.im/documentation/common/permission.md)
- [인앱 광고](https://developers-apps-in-toss.toss.im/guide/monetization/in-app-ad.md) · [정산](https://developers-apps-in-toss.toss.im/guide/settlement.md) · [프로모션](https://developers-apps-in-toss.toss.im/guide/marketing/promotion.md)
- 블로그: [게임 등급분류](https://toss.im/apps-in-toss/blog/game_rating_classification) · [게임 SDK 가이드](https://toss.im/apps-in-toss/blog/apps-in-toss-game-sdk-guide) · [통합 미니앱 홈(3월)](https://toss.im/apps-in-toss/blog/update-26-3-18) · [틴즈 노출(6월)](https://toss.im/apps-in-toss/blog/update-26-06-11)
- [toss/apps-in-toss-examples](https://github.com/toss/apps-in-toss-examples) · [@apps-in-toss/web-framework](https://www.npmjs.com/package/@apps-in-toss/web-framework)
