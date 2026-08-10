import { create } from 'zustand';

// 미니앱은 정적 서빙이라 히스토리 라우팅 없이 상태 기반 화면 전환만 쓴다.
// (토스 정책상 window.location.replace류 히스토리 조작도 금지.)
type NavStore = {
  path: string;
  navigate: (path: string) => void;
};

export const useNavStore = create<NavStore>((set) => ({
  path: '/',
  navigate: (path) => set({ path }),
}));

export const navigate = (path: string) => useNavStore.getState().navigate(path);
