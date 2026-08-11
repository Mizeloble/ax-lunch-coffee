/**
 * ALLOWED_ORIGIN env → socket.io `cors.origin` value.
 *
 * Comma-separated list; whitespace around entries and empty segments are
 * dropped (trailing commas, accidental double commas). Unset/blank → `false`
 * (deny cross-origin — same-origin still works). Single entry stays a string,
 * multiple become an array — both shapes are accepted by socket.io, and the
 * single-string case preserves the exact behavior the fly secret has today.
 *
 * 왜 복수 오리진인가: 토스 미니앱 빌드는 tossmini.com(실서비스 + 콘솔 QR
 * 테스트, 호스트 2개)에서 서빙되고 웹앱은 배포 호스트에 남는데, 전부 이 소켓
 * 서버 하나에 붙는다. (docs/toss-miniapp-review.md Phase 1)
 *
 * 의존성 제로 — server.ts의 콜드스타트 계약(정적 import 최소화) 안에서
 * metrics.ts와 같은 근거로 정적 import 허용.
 */
export function parseAllowedOrigin(raw: string | undefined): string | string[] | false {
  const origins = (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (origins.length === 0) return false;
  return origins.length === 1 ? origins[0] : origins;
}
