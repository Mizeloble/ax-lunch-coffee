import { clearRoundTimers, getRoom, publicRoomState, touch, type RoomState } from '../rooms';
import { runGame } from '../game-runner';
import { GAME } from '../../lib/constants';
import { effectiveLoserCount, emitResult, type IO } from './shared';

/**
 * Run sim → broadcast countdown + game:start → schedule playing/result transitions.
 * Shared by the no-charge path (marble) and the post-charge path (marble-cheer).
 */
export async function runRound(io: IO, room: RoomState, chargeRatios: Record<string, number> | undefined) {
  const connectedPlayers = [...room.players.values()].filter((p) => p.connected);
  if (connectedPlayers.length < GAME.MIN_PLAYERS) {
    room.status = 'lobby';
    io.to(room.id).emit('state', publicRoomState(room));
    return;
  }

  const seed = (Math.random() * 0x7fffffff) | 0;
  const loserCount = effectiveLoserCount(room.loserCount, connectedPlayers.length);
  // Round roster, snapshotted once: `game:start`, `currentRound.players` and the
  // result must all describe the same set even as the room's own list changes.
  const roundPlayers = connectedPlayers.map((p) => ({
    playerToken: p.playerToken,
    nickname: p.nickname,
    color: p.color,
  }));
  const epoch = ++room.roundEpoch;
  // Mark as countdown immediately so a second click is ignored even while WASM loads.
  // Drop the finished round's `currentRound` in the same breath: clients rebuild
  // `game:start` from it on reconnect, and broadcasting "countdown" alongside the
  // *previous* round's data made them stage the game that just ended.
  room.status = 'countdown';
  room.currentRound = undefined;
  io.to(room.id).emit('state', publicRoomState(room));

  let replay;
  try {
    replay = await runGame({
      gameId: room.gameId,
      seed,
      players: connectedPlayers,
      loserCount,
      chargeRatios,
    });
  } catch (err) {
    console.error('runGame failed', err);
    room.status = 'lobby';
    io.to(room.id).emit('state', publicRoomState(room));
    return;
  }

  // If the room moved on while the sim was running (host hit reset, possibly
  // followed by another start), this run is stale — don't clobber the newer
  // round's currentRound / broadcasts.
  if (!getRoom(room.id) || room.status !== 'countdown' || room.roundEpoch !== epoch) return;

  const startAt = Date.now() + GAME.COUNTDOWN_MS;
  room.currentRound = { gameId: room.gameId, seed, startAt, loserCount, players: roundPlayers, replay };
  touch(room);
  io.to(room.id).emit('state', publicRoomState(room));
  io.to(room.id).emit('countdown', { startAt });
  io.to(room.id).emit('game:start', {
    gameId: room.gameId,
    seed,
    startAt,
    durationMs: replay.durationMs,
    loserCount,
    replay: replay.data,
    players: roundPlayers,
  });

  // Tracked on the room so `deleteRoom`/`reset` can cancel them. Untracked, their
  // closures pinned the whole frame track — the largest object in the process —
  // for the length of the race after the room was already gone.
  clearRoundTimers(room);
  room.roundTimers = [
    setTimeout(() => {
      if (!getRoom(room.id) || room.currentRound?.startAt !== startAt) return;
      room.status = 'playing';
      io.to(room.id).emit('state', publicRoomState(room));
    }, Math.max(0, startAt - Date.now())),

    setTimeout(() => {
      if (!getRoom(room.id) || room.currentRound?.startAt !== startAt) return;
      room.status = 'result';
      io.to(room.id).emit('state', publicRoomState(room));
      emitResult(io, room, replay);
    }, Math.max(0, startAt + replay.durationMs - Date.now())),
  ];
}
