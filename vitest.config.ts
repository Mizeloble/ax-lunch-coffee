import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // `.claude/worktrees/*`는 리뷰용 체크아웃 사본이다. 기본 exclude에 안 걸려서
    // 같은 테스트가 두 번 돌고(개수가 2배로 보임) 사본 쪽 실패가 현재 코드의
    // 실패처럼 읽힌다 — 검증 결과를 오독하게 만드는 원인이라 명시적으로 제외한다.
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**', '.claude/worktrees/**'],
  },
});
