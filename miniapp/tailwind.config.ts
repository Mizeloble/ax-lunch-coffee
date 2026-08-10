import type { Config } from 'tailwindcss';

// ../src 컴포넌트를 그대로 번들하므로 스캔 범위에 리포 src 전체가 들어가야 한다.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}', '../src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Pretendard', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
