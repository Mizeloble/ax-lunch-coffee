'use client';

import { create } from 'zustand';
import type {
  GameStartPayload,
  PublicPlayer,
  PublicRoomState,
  ResultPayload,
} from '@/lib/protocol';

export type { GameStartPayload, PublicPlayer, PublicRoomState, ResultPayload };

type RoomStore = {
  myToken: string | null;
  isHost: boolean;
  state: PublicRoomState | null;
  gameStart: GameStartPayload | null;
  result: ResultPayload | null;
  setMe: (token: string, isHost: boolean) => void;
  setState: (s: PublicRoomState) => void;
  setGameStart: (g: GameStartPayload | null) => void;
  setResult: (r: ResultPayload | null) => void;
};

export const useRoomStore = create<RoomStore>((set) => ({
  myToken: null,
  isHost: false,
  state: null,
  gameStart: null,
  result: null,
  setMe: (token, isHost) => set({ myToken: token, isHost }),
  setState: (s) => set({ state: s }),
  setGameStart: (g) => set({ gameStart: g, result: null }),
  setResult: (r) => set({ result: r }),
}));
