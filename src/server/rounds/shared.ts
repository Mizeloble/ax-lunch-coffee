import type { Server as IOServer } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '../../lib/protocol';
import type { RoomState } from '../rooms';

export type IO = IOServer<ClientToServerEvents, ServerToClientEvents>;

/**
 * Clamp the configured loser count to the round's actual player count. The
 * setting is chosen in the lobby and players can leave before start — without
 * this, a 2-player round with loserCount 3 marks everyone (1st place included)
 * as a loser, and the marble-tilt live runner ends the race on its first tick
 * (its finish threshold `players - loserCount` drops to <= 0).
 */
export function effectiveLoserCount(loserCount: number, playerCount: number): number {
  return Math.max(1, Math.min(loserCount, playerCount - 1));
}

/**
 * Broadcast the round result. Server-authoritative ranking/losers only —
 * no persistence (the app is memory-only; no DB). Shared by every round flow.
 */
export function emitResult(
  io: IO,
  room: RoomState,
  replay: { ranking: string[]; losers: string[] },
) {
  io.to(room.id).emit('game:result', {
    ranking: replay.ranking,
    losers: replay.losers,
  });
}
