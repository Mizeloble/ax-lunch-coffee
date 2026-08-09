import {
  clearReaction,
  clearRoundTimers,
  getRoom,
  publicRoomState,
  touch,
  type RoomState,
} from '../rooms';
import { prepareGameIntro, runGame } from '../game-runner';
import { GAME } from '../../lib/constants';
import { mulberry32 } from '../../lib/rng';
import { effectiveLoserCount, emitResult, type IO } from './shared';

/**
 * Reaction game round: client-input game where ranking is computed AFTER play.
 * Flow:
 *   1. countdown (3s) — clients render "준비…" via the renderer's startAt gate
 *   2. wait until goAt (seed-derived 1.5..3.5s after startAt) — "지금!" phase
 *   3. accept `reaction:tap` until deadlineAt; server-arrival time = ranking truth
 *   4. after deadline + REACTION_TAIL_MS, build tapOffsets and call computeResult
 *
 * Note: unlike marble, the broadcast game:start sends an *intro-only* replay
 * payload. goAt is NEVER announced in advance — a scheduled `reaction:go` event
 * fires at goAt itself (pre-announcing it, or the seed it derives from, let a
 * one-line devtools script tap inhumanly fast with perfect consistency). The
 * final ranking arrives via game:result.
 */
export async function runReactionRound(io: IO, room: RoomState) {
  const connectedPlayers = [...room.players.values()].filter((p) => p.connected);
  if (connectedPlayers.length < GAME.MIN_PLAYERS) return;

  const seed = (Math.random() * 0x7fffffff) | 0;
  const intro = prepareGameIntro({ gameId: 'reaction', seed });
  if (!intro) {
    console.error('reaction game has no prepareIntro');
    return;
  }

  const loserCount = effectiveLoserCount(room.loserCount, connectedPlayers.length);
  // Round roster, snapshotted once: `game:start`, `currentRound.players` and the
  // result must all describe the same set even as the room's own list changes.
  const roundPlayers = connectedPlayers.map((p) => ({
    playerToken: p.playerToken,
    nickname: p.nickname,
    color: p.color,
  }));
  const startAt = Date.now() + GAME.COUNTDOWN_MS;
  const goAt = startAt + intro.goAtOffsetMs;
  const deadlineAt = goAt + GAME.REACTION_DEADLINE_MS;

  // Set status=countdown and stash a placeholder replay so publicRoomState carries
  // intro data for mid-play reconnects via the `currentRound.replay` channel.
  ++room.roundEpoch;
  room.status = 'countdown';
  const introReplay = {
    durationMs: intro.durationMs,
    ranking: [] as string[],
    losers: [] as string[],
    // offsets stays empty until the round ends — ResultScreen uses presence of
    // entries (not the field itself) to decide whether to render ms badges.
    // goAt/deadlineAt deliberately absent: this data rides every mid-play state
    // broadcast, which would leak the GO time before it fires.
    data: { offsets: {} as Record<string, number | null> },
  };
  room.currentRound = { gameId: 'reaction', seed, startAt, loserCount, players: roundPlayers, replay: introReplay };

  // Schedule final result computation. Stored on room so reset() can cancel it.
  const finishTimer = setTimeout(async () => {
    if (!getRoom(room.id) || room.currentRound?.startAt !== startAt) return;
    if (!room.reaction) return;

    // Use the snapshot from broadcast time so the result ranking matches the players
    // clients saw on `game:start`. Mid-round disconnects keep their slot — they just
    // end up as non-tappers if they didn't tap before dropping.
    const tapOffsets: Record<string, number | null> = {};
    for (const p of connectedPlayers) {
      if (p.bot) {
        // Dev-only bot: deterministic 200–400ms reaction so result screens look realistic.
        tapOffsets[p.playerToken] = simulateBotReaction(seed, p.playerToken);
      } else if (p.manual) {
        tapOffsets[p.playerToken] = null;
      } else {
        tapOffsets[p.playerToken] = room.reaction.firstTaps.get(p.playerToken) ?? null;
      }
    }

    let replay;
    try {
      replay = await runGame({
        gameId: 'reaction',
        seed,
        players: connectedPlayers,
        loserCount,
        tapOffsets,
      });
    } catch (err) {
      console.error('reaction runGame failed', err);
      clearReaction(room);
      room.status = 'lobby';
      room.currentRound = undefined;
      io.to(room.id).emit('state', publicRoomState(room));
      return;
    }

    // Preserve goAt/deadlineAt in the final replay.data so late observers can still
    // anchor their UI. computeResult set offsets relative to startAt; here we
    // overwrite with absolute wall-clock and carry tapOffsets through so the
    // result screen can show each player's reaction time.
    replay.data = { goAt, deadlineAt, offsets: tapOffsets };
    room.currentRound = { gameId: 'reaction', seed, startAt, loserCount, players: roundPlayers, replay };
    clearReaction(room);
    room.status = 'result';
    io.to(room.id).emit('state', publicRoomState(room));
    emitResult(io, room, replay);
  }, deadlineAt + GAME.REACTION_TAIL_MS - Date.now());

  // The GO signal: emitted AT goAt, never before, and with no timestamps — the
  // client anchors on receipt (see ReactionGoPayload). The server keeps its own
  // absolute window; this only tells the client how long to keep the screen live.
  const goTimer = setTimeout(() => {
    if (!getRoom(room.id) || room.reaction?.goAt !== goAt) return;
    io.to(room.id).emit('reaction:go', { windowMs: GAME.REACTION_DEADLINE_MS });
  }, goAt - Date.now());

  room.reaction = {
    goAt,
    deadlineAt,
    firstTaps: new Map(),
    participants: new Set(connectedPlayers.map((p) => p.playerToken)),
    finishTimer,
    goTimer,
  };
  touch(room);
  io.to(room.id).emit('state', publicRoomState(room));
  io.to(room.id).emit('countdown', { startAt });
  io.to(room.id).emit('game:start', {
    gameId: 'reaction',
    // Masked: the real seed derives goAt via prepareReactionIntro, which would
    // re-open the pre-announcement cheat. No client code reads this field.
    seed: 0,
    startAt,
    durationMs: intro.durationMs,
    loserCount,
    // offsets stays empty here — populated on the post-round state broadcast.
    // No goAt/deadlineAt: the GO time arrives via `reaction:go` when it fires.
    replay: { offsets: {} as Record<string, number | null> },
    players: roundPlayers,
  });

  // Tracked so `reset` / `deleteRoom` can cancel it. The startAt guard below would
  // usually catch a stale fire on its own, but it compares against the captured
  // `room` object — after the room is deleted that object still holds the old
  // round, so an untracked timer had nothing but room-id reuse standing between it
  // and broadcasting a dead round's state into a live one.
  clearRoundTimers(room);
  room.roundTimers = [
    setTimeout(() => {
      if (!getRoom(room.id) || room.currentRound?.startAt !== startAt) return;
      room.status = 'playing';
      io.to(room.id).emit('state', publicRoomState(room));
    }, Math.max(0, startAt - Date.now())),
  ];
}

/**
 * Dev-only deterministic bot reaction time. Mixes round seed with token hash so:
 *  - same seed + same player → same offset within a round (replayable)
 *  - different rounds (different seeds) → different offsets (not boring)
 *  - different bots in the same round → different offsets (varied result spread)
 * Range 200–400ms keeps bots in the realistic-human bucket so they neither
 * dominate nor always lose in dev testing.
 */
function simulateBotReaction(seed: number, token: string): number {
  let h = 0;
  for (let i = 0; i < token.length; i++) h = (h * 31 + token.charCodeAt(i)) | 0;
  const rng = mulberry32(seed ^ h);
  return 200 + Math.floor(rng() * 200);
}
