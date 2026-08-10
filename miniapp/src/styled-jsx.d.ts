// Next의 styled-jsx 타입 보강(next-env.d.ts)이 miniapp 타입체크엔 없어서 재사용
// 컴포넌트의 <style jsx>가 에러난다 — 최소 보강. 재사용 컴포넌트의 <style jsx>는
// 전부 @keyframes 정의뿐이라 Vite 런타임에서 전역 <style>로 렌더돼도 안전하다.
import 'react';

declare module 'react' {
  interface StyleHTMLAttributes<T> extends HTMLAttributes<T> {
    jsx?: boolean;
    global?: boolean;
  }
}
