import type { Metadata, Viewport } from 'next';
import { ko } from '@/lib/i18n';
import './globals.css';

export const metadata: Metadata = {
  title: ko.app.title,
  description: ko.app.metaDescription,
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#0b0b10',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
        />
      </head>
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
