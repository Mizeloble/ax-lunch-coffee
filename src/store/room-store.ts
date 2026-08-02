'use client';

import { create } from 'zustand';
import type {
  GameStartPayload,
  PublicPlayer,
  PublicRoomState,
  ReactionGoPayload,
  ResultPayload,
} from '@/lib/protocol';

export type { GameStartPayload, PublicPlayer, PublicRoomState, ReactionGoPayload, ResultPayload };

type RoomStore = {
  myToken: string | null;
  isHost: boolean;
  state: PublicRoomState | null;
  gameStart: GameStartPayload | null;
  result: ResultPayload | null;
  /** Reaction GO signal. Held here rather than inside ReactionRenderer because the
   * server replays it to a mid-round reconnect right after `state` — the renderer
   * hasn't mounted its listener yet at that point, so the event would be lost. */
  reactionGo: ReactionGoPayload | null;
  setMe: (token: string, isHost: boolean) => void;
  setState: (s: PublicRoomState) => void;
  setGameStart: (g: GameStartPayload | null) => void;
  setResult: (r: ResultPayload | null) => void;
  setReactionGo: (p: ReactionGoPayload | null) => void;
  /** Drop all room-scoped data. Called when entering a room different from the one
   * the store currently holds — the store is a module singleton and survives route
   * changes, so stale state would otherwise leak into the next room. */
  reset: () => void;
};

export const useRoomStore = create<RoomStore>((set) => ({
  myToken: null,
  isHost: false,
  state: null,
  gameStart: null,
  result: null,
  reactionGo: null,
  setMe: (token, isHost) => set({ myToken: token, isHost }),
  setState: (s) => set({ state: s }),
  // A new round invalidates the previous round's GO signal.
  setGameStart: (g) => set({ gameStart: g, result: null, reactionGo: null }),
  setResult: (r) => set({ result: r }),
  setReactionGo: (p) => set({ reactionGo: p }),
  reset: () =>
    set({
      myToken: null,
      isHost: false,
      state: null,
      gameStart: null,
      result: null,
      reactionGo: null,
    }),
}));
