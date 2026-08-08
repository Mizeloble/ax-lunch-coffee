'use client';

import { create } from 'zustand';
import type {
  GameStartPayload,
  PublicPlayer,
  PublicRoomState,
  ReactionGoPayload,
  ResultPayload,
  TriviaResumePayload,
} from '@/lib/protocol';

export type {
  GameStartPayload,
  PublicPlayer,
  PublicRoomState,
  ReactionGoPayload,
  ResultPayload,
  TriviaResumePayload,
};

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
  /** Quiz rejoin snapshot. Same reason as `reactionGo`: it lands on `join`, before
   * the renderer exists. */
  triviaResume: TriviaResumePayload | null;
  setMe: (token: string, isHost: boolean) => void;
  setState: (s: PublicRoomState) => void;
  setGameStart: (g: GameStartPayload | null) => void;
  setResult: (r: ResultPayload | null) => void;
  setReactionGo: (p: ReactionGoPayload | null) => void;
  setTriviaResume: (p: TriviaResumePayload | null) => void;
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
  triviaResume: null,
  setMe: (token, isHost) => set({ myToken: token, isHost }),
  setState: (s) => set({ state: s }),
  // A new round invalidates the previous round's one-shot payloads.
  setGameStart: (g) => set({ gameStart: g, result: null, reactionGo: null, triviaResume: null }),
  setResult: (r) => set({ result: r }),
  setReactionGo: (p) => set({ reactionGo: p }),
  setTriviaResume: (p) => set({ triviaResume: p }),
  reset: () =>
    set({
      myToken: null,
      isHost: false,
      state: null,
      gameStart: null,
      result: null,
      reactionGo: null,
      triviaResume: null,
    }),
}));
