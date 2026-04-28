import type { ReplayPayload } from '../server/rooms';

export type GameInputPlayer = {
  playerToken: string;
  nickname: string;
  color: string;
};

export type ComputeResultInput = {
  seed: number;
  players: GameInputPlayer[];
  loserCount: number;
  // For client-input games (reaction): map of playerToken -> tap offset ms (from startAt)
  tapOffsets?: Record<string, number | null>;
};

export type GameServerModule = {
  /** Deterministic given the same input. May be async (e.g. needs to load WASM). */
  computeResult(input: ComputeResultInput): ReplayPayload | Promise<ReplayPayload>;
};

// Technical metadata only. Display label lives in `ko.games[id]` (i18n).
export const GAME_META = {
  marble: { emoji: '🏁', estimatedSeconds: 35, needsClientInput: false, enabled: true },
  slot: { emoji: '🎰', estimatedSeconds: 8, needsClientInput: false, enabled: false },
  elimination: { emoji: '🎯', estimatedSeconds: 20, needsClientInput: false, enabled: false },
  reaction: { emoji: '⚡', estimatedSeconds: 6, needsClientInput: true, enabled: false },
} as const;

export type GameId = keyof typeof GAME_META;
