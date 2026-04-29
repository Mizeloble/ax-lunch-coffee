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
  // For pre-charge games (marble-cheer): playerToken -> [0,1] charge ratio (tap count / cap)
  chargeRatios?: Record<string, number>;
};

export type GameServerModule = {
  /** Deterministic given the same input. May be async (e.g. needs to load WASM). */
  computeResult(input: ComputeResultInput): ReplayPayload | Promise<ReplayPayload>;
};

// Technical metadata only. Display label lives in `ko.games[id]` (i18n).
// `needsPreCharge: true` makes the server insert a 5s tap-charging phase before sim runs.
// `needsClientInput: true` is reserved for games that collect input *during* play (reaction).
export const GAME_META = {
  marble: {
    emoji: '🏁',
    estimatedSeconds: 35,
    needsClientInput: false,
    needsPreCharge: false,
    enabled: true,
  },
  'marble-cheer': {
    emoji: '📣',
    estimatedSeconds: 40,
    needsClientInput: false,
    needsPreCharge: true,
    enabled: true,
  },
  slot: {
    emoji: '🎰',
    estimatedSeconds: 8,
    needsClientInput: false,
    needsPreCharge: false,
    enabled: false,
  },
  elimination: {
    emoji: '🎯',
    estimatedSeconds: 20,
    needsClientInput: false,
    needsPreCharge: false,
    enabled: false,
  },
  reaction: {
    emoji: '⚡',
    estimatedSeconds: 6,
    needsClientInput: true,
    needsPreCharge: false,
    enabled: false,
  },
} as const;

export type GameId = keyof typeof GAME_META;
