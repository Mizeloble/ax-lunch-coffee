'use client';

import { create } from 'zustand';

export type PublicPlayer = {
  playerToken: string;
  nickname: string;
  connected: boolean;
  color: string;
  manual: boolean;
};

export type PublicRoomState = {
  id: string;
  status: 'lobby' | 'countdown' | 'playing' | 'result';
  gameId: 'marble' | 'slot' | 'elimination' | 'reaction';
  loserCount: number;
  players: PublicPlayer[];
  currentRound?: { gameId: string; startAt: number; durationMs: number };
};

export type GameStartPayload = {
  gameId: 'marble' | 'slot' | 'elimination' | 'reaction';
  seed: number;
  startAt: number;
  durationMs: number;
  replay: unknown;
  players: { playerToken: string; nickname: string; color: string }[];
};

export type ResultPayload = { ranking: string[]; losers: string[] };

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
