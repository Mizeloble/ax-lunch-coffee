# store-assets/ — 앱인토스 콘솔 등록물

`src/`의 HTML을 Playwright 뷰포트 캡처로 `out/` PNG를 만든다 (정확한 픽셀 크기 보장).
재생성: miniapp dev 서버(:5173) 실행 → `/store-assets/src/<파일>.html`을 해당 크기 뷰포트로 캡처.
게임 스크린샷은 프로덕션(fly.dev)에서 실제 방(수동 참가자 지훈·서연·민준·하늘)을 돌려 캡처 — 무편집.

| 파일 | 크기 | 콘솔 슬롯 |
|---|---|---|
| out/logo-600.png | 600×600 | 앱 로고 + 다크모드 앱 로고 (겸용) |
| out/thumbnail-1932.png | 1932×828 | 썸네일 |
| out/shot-1-lobby.png | 636×1048 | 스크린샷 세로 1 (로비·QR 초대) |
| out/shot-2-race.png | 636×1048 | 스크린샷 세로 2 (마블 레이스) |
| out/shot-3-result.png | 636×1048 | 스크린샷 세로 3 (결과·벌칙 발표) |
| out/shot-4-race-wide.png | 1504×741 | 스크린샷 가로 1 (골인 장면) |

카피 기조: 전연령 파티게임 — 음주·술자리 표현 배제 (docs/toss-miniapp-review.md §3-1).
