import type { GameId, Player, ReplayPayload } from './rooms';
import { marbleServer } from '../games/marble/server';
import { marbleCheerServer } from '../games/marble-cheer/server';
import { reactionServer } from '../games/reaction/server';
import type { GameIntroTimings, GameServerModule } from '../games/types';
import { GAME_META } from '../games/types';

const REGISTRY: Record<GameId, GameServerModule | null> = {
  marble: marbleServer,
  'marble-cheer': marbleCheerServer,
  slot: null,
  elimination: null,
  reaction: reactionServer,
};

export async function runGame(args: {
  gameId: GameId;
  seed: number;
  players: Player[];
  loserCount: number;
  chargeRatios?: Record<string, number>;
  tapOffsets?: Record<string, number | null>;
}): Promise<ReplayPayload> {
  const mod = REGISTRY[args.gameId];
  if (!mod) {
    throw new Error(`Game not implemented: ${args.gameId}`);
  }
  const meta = GAME_META[args.gameId];
  if (!meta.enabled) {
    throw new Error(`Game disabled in v1: ${args.gameId}`);
  }
  return await mod.computeResult({
    seed: args.seed,
    players: args.players.map((p) => ({
      playerToken: p.playerToken,
      nickname: p.nickname,
      color: p.color,
    })),
    loserCount: args.loserCount,
    chargeRatios: args.chargeRatios,
    tapOffsets: args.tapOffsets,
  });
}

/**
 * For `needsClientInput` games: derive deterministic intro timings from a seed
 * before tap collection begins. Returns `null` if the game has no intro phase.
 */
export function prepareGameIntro(args: { gameId: GameId; seed: number }): GameIntroTimings | null {
  const mod = REGISTRY[args.gameId];
  if (!mod?.prepareIntro) return null;
  return mod.prepareIntro({ seed: args.seed });
}
