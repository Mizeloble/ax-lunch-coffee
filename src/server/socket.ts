import type { Server as IOServer, Socket } from 'socket.io';
import {
  addPlayer,
  clearCharge,
  clearReaction,
  findPlayerBySocket,
  getRoom,
  isHostToken,
  publicRoomState,
  touch,
  type RoomState,
} from './rooms';
import { prepareGameIntro, runGame } from './game-runner';
import { ko } from '../lib/i18n';
import { GAME, NICKNAME, ROOM } from '../lib/constants';
import { GAME_META } from '../games/types';
import type { ClientToServerEvents, ServerToClientEvents } from '../lib/protocol';
import { mulberry32 } from '../games/reaction/server';

type IO = IOServer<ClientToServerEvents, ServerToClientEvents>;

export function attachSocketHandlers(io: IO) {
  io.on('connection', (socket) => {
    let currentRoomId: string | null = null;

    socket.on('join', (payload, ack) => {
      const room = getRoom(payload.roomId);
      if (!room) return ack(err('NO_ROOM', ko.errors.roomNotFound));
      if (room.players.size >= GAME.MAX_PLAYERS && !payload.playerToken) {
        return ack(err('FULL', ko.errors.full));
      }
      if (room.status !== 'lobby' && room.status !== 'result' && !payload.playerToken) {
        return ack(err('IN_PROGRESS', ko.errors.inProgress));
      }
      const nickCheck = validateNickname(room, payload.nickname, payload.playerToken);
      if (!nickCheck.ok) return ack(nickCheck);

      const player = addPlayer(room, {
        nickname: nickCheck.nickname,
        playerToken: payload.playerToken,
        socketId: socket.id,
      });

      const isHost = isHostToken(room, payload.hostToken);
      if (isHost) room.hostSocketId = socket.id;

      currentRoomId = room.id;
      socket.join(room.id);
      ack({ ok: true, playerToken: player.playerToken, isHost });
      io.to(room.id).emit('state', publicRoomState(room));
    });

    socket.on('host:addPlayer', (payload, ack) => {
      const guard = requireHost(currentRoomId, socket);
      if (!guard.ok) return ack(guard);
      const { room } = guard;

      if (room.status !== 'lobby' && room.status !== 'result') {
        return ack(err('BAD_STATE', ko.errors.badStateAdd));
      }
      if (room.players.size >= GAME.MAX_PLAYERS) return ack(err('FULL', ko.errors.full));

      const nickCheck = validateNickname(room, payload.nickname);
      if (!nickCheck.ok) return ack(nickCheck);

      const player = addPlayer(room, { nickname: nickCheck.nickname, socketId: null, manual: true });
      io.to(room.id).emit('state', publicRoomState(room));
      ack({ ok: true, playerToken: player.playerToken });
    });

    socket.on('host:removePlayer', ({ playerToken }, ack) => {
      const guard = requireHost(currentRoomId, socket);
      if (!guard.ok) return ack?.(guard);
      const { room } = guard;

      if (room.status !== 'lobby' && room.status !== 'result') {
        return ack?.(err('BAD_STATE', ko.errors.badStateChange));
      }
      const target = room.players.get(playerToken);
      if (!target) return ack?.(err('NO_PLAYER', ko.errors.noPlayer));
      if (!target.manual) return ack?.(err('NOT_MANUAL', ko.errors.notManual));

      if (target.graceTimer) clearTimeout(target.graceTimer);
      room.players.delete(playerToken);
      touch(room);
      io.to(room.id).emit('state', publicRoomState(room));
      ack?.({ ok: true });
    });

    socket.on('setLoserCount', ({ count }) => {
      const guard = requireHost(currentRoomId, socket);
      if (!guard.ok) return;
      const { room } = guard;
      if (room.status !== 'lobby' && room.status !== 'result') return;
      room.loserCount = clamp(Math.floor(count), GAME.LOSER_COUNT_MIN, GAME.LOSER_COUNT_MAX);
      touch(room);
      io.to(room.id).emit('state', publicRoomState(room));
    });

    socket.on('setGameId', ({ gameId }) => {
      const guard = requireHost(currentRoomId, socket);
      if (!guard.ok) return;
      const { room } = guard;
      if (room.status !== 'lobby' && room.status !== 'result') return;
      room.gameId = gameId;
      touch(room);
      io.to(room.id).emit('state', publicRoomState(room));
    });

    socket.on('start', async () => {
      const guard = requireHost(currentRoomId, socket);
      if (!guard.ok) return;
      const { room } = guard;

      const connectedPlayers = [...room.players.values()].filter((p) => p.connected);
      if (connectedPlayers.length < GAME.MIN_PLAYERS) return;
      if (room.status === 'charging' || room.status === 'countdown' || room.status === 'playing') return;

      const meta = GAME_META[room.gameId];
      if (meta.needsClientInput) {
        await runReactionRound(io, room);
      } else if (meta.needsPreCharge) {
        startChargingPhase(io, room);
      } else {
        await runRound(io, room, /*chargeRatios*/ undefined);
      }
    });

    socket.on('charge:tick', ({ count }) => {
      const room = currentRoomId ? getRoom(currentRoomId) : null;
      if (!room || room.status !== 'charging' || !room.charge) return;
      const player = findPlayerBySocket(room, socket.id);
      if (!player) return;
      const safe = Math.max(0, Math.min(GAME.CHARGE_TAP_CAP, Math.floor(count)));
      const prev = room.charge.counts.get(player.playerToken) ?? 0;
      // Idempotent: client sends cumulative count, we keep the maximum.
      if (safe > prev) room.charge.counts.set(player.playerToken, safe);
    });

    socket.on('reaction:tap', () => {
      // Capture arrival time IMMEDIATELY — this is the source of truth for ranking.
      const arrivalAt = Date.now();
      const room = currentRoomId ? getRoom(currentRoomId) : null;
      if (!room || room.gameId !== 'reaction' || !room.reaction) return;
      if (room.status !== 'playing') return;
      if (arrivalAt > room.reaction.deadlineAt) return;
      const player = findPlayerBySocket(room, socket.id);
      if (!player) return;
      // First tap only — server-authoritative.
      if (room.reaction.firstTaps.has(player.playerToken)) return;
      const offset = arrivalAt - room.reaction.goAt;
      room.reaction.firstTaps.set(player.playerToken, offset);
    });

    socket.on('reset', () => {
      const guard = requireHost(currentRoomId, socket);
      if (!guard.ok) return;
      const { room } = guard;
      clearCharge(room);
      clearReaction(room);
      room.status = 'lobby';
      room.currentRound = undefined;
      touch(room);
      io.to(room.id).emit('state', publicRoomState(room));
    });

    socket.on('disconnect', () => {
      const room = currentRoomId ? getRoom(currentRoomId) : null;
      if (!room) return;
      const player = findPlayerBySocket(room, socket.id);
      if (!player) return;
      player.connected = false;
      player.socketId = null;
      if (room.hostSocketId === socket.id) room.hostSocketId = null;
      io.to(room.id).emit('state', publicRoomState(room));

      // Grace period: drop player if they don't return in time
      player.graceTimer = setTimeout(() => {
        if (!player.connected) {
          room.players.delete(player.playerToken);
          touch(room);
          io.to(room.id).emit('state', publicRoomState(room));
        }
      }, ROOM.RECONNECT_GRACE_MS);
    });
  });
}

// --- charge / round flow ---------------------------------------------------

/**
 * Pre-game tap-charging phase used by games with `needsPreCharge` (currently
 * marble-cheer). Broadcasts an aggregate `charge:state` every CHARGE_TICK_MS so
 * clients can render gauges, then runs the round with chargeRatios derived from
 * each player's tap total. Manual (no-phone) players default to a neutral 50%.
 */
function startChargingPhase(io: IO, room: RoomState) {
  const endsAt = Date.now() + GAME.CHARGE_MS;
  room.status = 'charging';

  const tickTimer = setInterval(() => {
    if (!room.charge) return;
    const totals: Record<string, number> = {};
    for (const [token, count] of room.charge.counts) totals[token] = count;
    io.to(room.id).emit('charge:state', { totals, cap: GAME.CHARGE_TAP_CAP });
  }, GAME.CHARGE_TICK_MS);

  const finishTimer = setTimeout(async () => {
    if (!getRoom(room.id) || room.status !== 'charging') return;

    const counts = room.charge?.counts ?? new Map<string, number>();
    clearCharge(room);

    const chargeRatios: Record<string, number> = {};
    for (const p of room.players.values()) {
      if (p.manual) {
        chargeRatios[p.playerToken] = GAME.CHARGE_MANUAL_DEFAULT;
      } else {
        const c = counts.get(p.playerToken) ?? 0;
        chargeRatios[p.playerToken] = Math.min(c, GAME.CHARGE_TAP_CAP) / GAME.CHARGE_TAP_CAP;
      }
    }

    await runRound(io, room, chargeRatios);
  }, GAME.CHARGE_MS);

  room.charge = { endsAt, counts: new Map(), tickTimer, finishTimer };
  touch(room);
  io.to(room.id).emit('state', publicRoomState(room));
  io.to(room.id).emit('charge:start', { endsAt });
  // Send an immediate empty state so clients render gauges from t=0 without a 250ms gap.
  io.to(room.id).emit('charge:state', { totals: {}, cap: GAME.CHARGE_TAP_CAP });
}

/**
 * Reaction game round: client-input game where ranking is computed AFTER play.
 * Flow:
 *   1. countdown (3s) — clients render "준비…" via the renderer's startAt gate
 *   2. wait until goAt (seed-derived 1.5..3.5s after startAt) — "지금!" phase
 *   3. accept `reaction:tap` until deadlineAt; server-arrival time = ranking truth
 *   4. after deadline + REACTION_TAIL_MS, build tapOffsets and call computeResult
 *
 * Note: unlike marble, the broadcast game:start sends an *intro-only* replay
 * payload (`{ goAt, deadlineAt }`). The final ranking arrives via game:result.
 */
async function runReactionRound(io: IO, room: RoomState) {
  const connectedPlayers = [...room.players.values()].filter((p) => p.connected);
  if (connectedPlayers.length < GAME.MIN_PLAYERS) return;

  const seed = (Math.random() * 0x7fffffff) | 0;
  const intro = prepareGameIntro({ gameId: 'reaction', seed });
  if (!intro) {
    console.error('reaction game has no prepareIntro');
    return;
  }

  const startAt = Date.now() + GAME.COUNTDOWN_MS;
  const goAt = startAt + intro.goAtOffsetMs;
  const deadlineAt = goAt + GAME.REACTION_DEADLINE_MS;

  // Set status=countdown and stash a placeholder replay so publicRoomState carries
  // intro data for mid-play reconnects via the `currentRound.replay` channel.
  room.status = 'countdown';
  const introReplay = {
    durationMs: intro.durationMs,
    ranking: [] as string[],
    losers: [] as string[],
    // offsets stays empty until the round ends — ResultScreen uses presence of
    // entries (not the field itself) to decide whether to render ms badges.
    data: { goAt, deadlineAt, offsets: {} as Record<string, number | null> },
  };
  room.currentRound = { gameId: 'reaction', seed, startAt, replay: introReplay };

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
        loserCount: room.loserCount,
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
    room.currentRound = { gameId: 'reaction', seed, startAt, replay };
    clearReaction(room);
    room.status = 'result';
    io.to(room.id).emit('state', publicRoomState(room));
    io.to(room.id).emit('game:result', { ranking: replay.ranking, losers: replay.losers });
  }, deadlineAt + GAME.REACTION_TAIL_MS - Date.now());

  room.reaction = { goAt, deadlineAt, firstTaps: new Map(), finishTimer };
  touch(room);
  io.to(room.id).emit('state', publicRoomState(room));
  io.to(room.id).emit('countdown', { startAt });
  io.to(room.id).emit('game:start', {
    gameId: 'reaction',
    seed,
    startAt,
    durationMs: intro.durationMs,
    // offsets stays empty here — populated on the post-round state broadcast.
    replay: { goAt, deadlineAt, offsets: {} as Record<string, number | null> },
    players: connectedPlayers.map((p) => ({
      playerToken: p.playerToken,
      nickname: p.nickname,
      color: p.color,
    })),
  });

  setTimeout(() => {
    if (!getRoom(room.id) || room.currentRound?.startAt !== startAt) return;
    room.status = 'playing';
    io.to(room.id).emit('state', publicRoomState(room));
  }, GAME.COUNTDOWN_MS);
}

/**
 * Run sim → broadcast countdown + game:start → schedule playing/result transitions.
 * Shared by the no-charge path (marble) and the post-charge path (marble-cheer).
 */
async function runRound(io: IO, room: RoomState, chargeRatios: Record<string, number> | undefined) {
  const connectedPlayers = [...room.players.values()].filter((p) => p.connected);
  if (connectedPlayers.length < GAME.MIN_PLAYERS) {
    room.status = 'lobby';
    io.to(room.id).emit('state', publicRoomState(room));
    return;
  }

  const seed = (Math.random() * 0x7fffffff) | 0;
  // Mark as countdown immediately so a second click is ignored even while WASM loads
  room.status = 'countdown';
  io.to(room.id).emit('state', publicRoomState(room));

  let replay;
  try {
    replay = await runGame({
      gameId: room.gameId,
      seed,
      players: connectedPlayers,
      loserCount: room.loserCount,
      chargeRatios,
    });
  } catch (err) {
    console.error('runGame failed', err);
    room.status = 'lobby';
    io.to(room.id).emit('state', publicRoomState(room));
    return;
  }

  const startAt = Date.now() + GAME.COUNTDOWN_MS;
  room.currentRound = { gameId: room.gameId, seed, startAt, replay };
  touch(room);
  io.to(room.id).emit('state', publicRoomState(room));
  io.to(room.id).emit('countdown', { startAt });
  io.to(room.id).emit('game:start', {
    gameId: room.gameId,
    seed,
    startAt,
    durationMs: replay.durationMs,
    replay: replay.data,
    players: connectedPlayers.map((p) => ({ playerToken: p.playerToken, nickname: p.nickname, color: p.color })),
  });

  setTimeout(() => {
    if (!getRoom(room.id) || room.currentRound?.startAt !== startAt) return;
    room.status = 'playing';
    io.to(room.id).emit('state', publicRoomState(room));
  }, GAME.COUNTDOWN_MS);

  setTimeout(() => {
    if (!getRoom(room.id) || room.currentRound?.startAt !== startAt) return;
    room.status = 'result';
    io.to(room.id).emit('state', publicRoomState(room));
    io.to(room.id).emit('game:result', { ranking: replay.ranking, losers: replay.losers });
  }, GAME.COUNTDOWN_MS + replay.durationMs);
}

// --- helpers ---------------------------------------------------------------

type Failure = { ok: false; code: string; message: string };

function err(code: string, message: string): Failure {
  return { ok: false, code, message };
}

/**
 * Resolve `currentRoomId` and verify the socket holds host rights.
 * Returns either `{ ok: true, room }` or a ready-to-ack failure payload.
 */
function requireHost(
  currentRoomId: string | null,
  socket: Socket,
): { ok: true; room: RoomState } | Failure {
  const room = currentRoomId ? getRoom(currentRoomId) : null;
  if (!room) return err('NO_ROOM', ko.errors.roomNotFound);
  if (room.hostSocketId !== socket.id) return err('NOT_HOST', ko.errors.notHost);
  return { ok: true, room };
}

/**
 * Sanitize and validate a nickname against length and per-room duplicate rules.
 * `excludeToken` lets a rejoining player keep their own nickname.
 */
function validateNickname(
  room: RoomState,
  raw: unknown,
  excludeToken?: string,
): { ok: true; nickname: string } | Failure {
  const nickname = sanitizeNickname(raw);
  if (!nickname) return err('BAD_NICK', ko.errors.badNick);
  for (const p of room.players.values()) {
    if (p.nickname === nickname && p.playerToken !== excludeToken) {
      return err('DUP_NICK', ko.errors.duplicateNick);
    }
  }
  return { ok: true, nickname };
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function sanitizeNickname(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (t.length < 1 || t.length > NICKNAME.MAX_LENGTH) return null;
  return t;
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
