import type { MetadataRoute } from 'next';
import { ko } from '@/lib/i18n';

// PWA manifest — 홈 화면 추가 시 standalone(주소창 없는 앱 모양)으로 열리게.
// 아이콘: SVG(과녁, app/icon.svg)는 크기 무관, iOS 홈 화면은 app/apple-icon.tsx가
// 빌드 시 생성하는 180px PNG를 쓴다.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: ko.app.title,
    short_name: ko.app.title,
    description: ko.app.metaDescription,
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0b0b10',
    theme_color: '#0b0b10',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
      // 192/512 PNG: TWA 래핑(원스토어 등급분류용 스토어 앱)과 안드로이드 홈 화면
      // 설치가 요구하는 래스터 아이콘. 로고와 같은 과녁 마크(store-assets 유래).
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}
