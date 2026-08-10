import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoSrc = path.resolve(here, '../src');
const shims = path.resolve(here, 'src/shims');

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: [
      // 미니앱은 토스 CDN에서 서빙되므로 소켓이 페이지 오리진에 붙으면 안 된다 —
      // 절대 URL로 붙는 shim으로 교체. next/navigation은 Vite에 없으니 최소 구현.
      { find: '@/lib/socket-client', replacement: path.join(shims, 'socket-client.ts') },
      { find: 'next/navigation', replacement: path.join(shims, 'next-navigation.ts') },
      { find: /^@\//, replacement: repoSrc + '/' },
    ],
    // ../src 파일들이 리포 루트 node_modules에서 두 번째 react를 집어오면 훅이
    // 깨진다(Invalid hook call) — 공유 런타임 의존성은 miniapp 것 하나로 강제.
    dedupe: ['react', 'react-dom', 'zustand', 'socket.io-client', 'clsx', 'qrcode', 'nanoid'],
  },
  // ../src의 env 게이팅 모듈(ads/analytics)이 process.env를 읽는다 — NEXT_PUBLIC_*을
  // 하나도 주지 않아 전부 'none' 기본값이 된다(미니앱엔 외부 광고 SDK 금지).
  // NODE_ENV는 넘겨야 한다 — AdSlot이 이걸로 dev placeholder를 가르므로, 없으면
  // 프로덕션 .ait 번들에도 광고 자리 표시가 남는다.
  define: { 'process.env': JSON.stringify({ NODE_ENV: mode }) },
  server: {
    fs: { allow: ['..'] },
    // 로컬 dev: 같은 오리진처럼 보이게 프록시 → VITE_SERVER_URL 없이 동작.
    proxy: {
      '/api': 'http://localhost:3000',
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
  },
}));
