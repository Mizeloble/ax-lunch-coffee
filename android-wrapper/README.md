# android-wrapper/ — TWA 래핑 앱 (원스토어 등급분류용)

`https://bokbulbok-party.fly.dev`를 Trusted Web Activity로 감싼 Android 앱.
목적은 원스토어 자체등급분류(앱인토스 출시의 법적 요건) — 상세 맥락은
[docs/toss-miniapp-review.md](../docs/toss-miniapp-review.md) §1-3.

- 패키지: `com.mizeloble.bokbulbok` / 앱 이름: 복불복파티
- TWA 검증: [public/.well-known/assetlinks.json](../public/.well-known/assetlinks.json)이
  서명 키 SHA256과 패키지를 연결 — 검증되면 주소창 없는 전체화면. 키를 바꾸면 이 파일도 갱신.

## ⚠️ 서명 키 (커밋 금지)

`signing/release.keystore` + `signing/keystore-credentials.txt` — **이 키를 잃으면
같은 패키지로 앱 업데이트가 영영 불가능**하다. 저장소 밖 안전한 곳(패스워드 매니저 등)에
반드시 백업할 것. gitignore로 커밋은 차단돼 있다.

## 빌드

전제(1회): Homebrew `openjdk@17`, Android cmdline-tools(`~/Library/Android/sdk/cmdline-tools/latest`),
`npm i -g @bubblewrap/cli`, `~/.bubblewrap/config.json`:

```json
{
  "jdkPath": "/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk",
  "androidSdkPath": "~/Library/Android/sdk/cmdline-tools/latest"
}
```

주의: bubblewrap의 `androidSdkPath`는 SDK 루트가 아니라 **`bin/`이 있는 cmdline-tools
디렉토리**를 가리켜야 하고(`tools/` 또는 `bin/` 존재로 검증), `jdkPath`는 macOS JDK
번들(`…/openjdk.jdk`, 내부에 `Contents/Home`)이어야 한다.

```bash
cd android-wrapper
bubblewrap update --skipVersionUpgrade   # twa-manifest.json → 프로젝트 재생성 (버전 프롬프트 회피)
PASS=$(grep KEYSTORE_PASSWORD signing/keystore-credentials.txt | cut -d= -f2)
BUBBLEWRAP_KEYSTORE_PASSWORD="$PASS" BUBBLEWRAP_KEY_PASSWORD="$PASS" \
  bubblewrap build --skipPwaValidation < /dev/null
```

산출물: `app-release-signed.apk`(원스토어 업로드용), `app-release-bundle.aab`.
버전 올릴 때: `twa-manifest.json`의 `appVersionName`/`appVersionCode` 수정 후 위 절차.
