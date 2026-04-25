import type { Server as IOServer, Socket } from 'socket.io';
import {
  addPlayer,
  findPlayerBySocket,
  getRoom,
  isHostToken,
  publicRoomState,
  touch,
  type GameId,
  type RoomState,
} from './rooms';
import { runGame } from './game-runner';

const COUNTDOWN_MS = 3000;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 30;
const NICKNAME_MAX = 10;
const RECONNECT_GRACE_MS = 10_000;

type ServerToClientEvents = {
  state: (state: ReturnType<typeof publicRoomState>) => void;
  joined: (payload: { you: { playerToken: string; isHost: boolean } }) => void;
  error: (payload: { code: string; message: string }) => void;
  countdown: (payload: { startAt: number }) => void;
  'game:start': (payload: {
    gameId: GameId;
    seed: number;
    startAt: number;
    durationMs: number;
    replay: unknown;
    players: { playerToken: string; nickname: string; color: string }[];
  }) => void;
  'game:result': (payload: { ranking: string[]; losers: string[] }) => void;
};

type ClientToServerEvents = {
  join: (
    payload: { roomId: string; nickname: string; playerToken?: string; hostToken?: string },
    ack: (res: { ok: true; playerToken: string; isHost: boolean } | { ok: false; code: string; message: string }) => void,
  ) => void;
  setLoserCount: (payload: { count: number }) => void;
  setGameId: (payload: { gameId: GameId }) => void;
  start: () => void;
  reset: () => void;
};

export function attachSocketHandlers(io: IOServer<ClientToServerEvents, ServerToClientEvents>) {
  io.on('connection', (socket) => {
    let currentRoomId: string | null = null;

    socket.on('join', (payload, ack) => {
      const room = getRoom(payload.roomId);
      if (!room) return ack({ ok: false, code: 'NO_ROOM', message: '방을 찾을 수 없어요' });
      if (room.players.size >= MAX_PLAYERS && !payload.playerToken) {
        return ack({ ok: false, code: 'FULL', message: '방이 꽉 찼어요' });
      }
      if (room.status !== 'lobby' && room.status !== 'result' && !payload.playerToken) {
        return ack({ ok: false, code: 'IN_PROGRESS', message: '이미 진행 중이에요' });
      }
      const nickname = sanitizeNickname(payload.nickname);
      if (!nickname) return ack({ ok: false, code: 'BAD_NICK', message: '닉네임을 확인해주세요' });

      // Duplicate nickname check (excluding the rejoining same token)
      for (const p of room.players.values()) {
        if (p.nickname === nickname && p.playerToken !== payload.playerToken) {
          return ack({ ok: false, code: 'DUP_NICK', message: '같은 닉네임이 이미 있어요' });
        }
      }

      const player = addPlayer(room, {
        nickname,
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

    socket.on('setLoserCount', ({ count }) => {
      const room = currentRoomId ? getRoom(currentRoomId) : null;
      if (!room) return;
      if (!isCurrentSocketHost(room, socket)) return;
      const c = clamp(Math.floor(count), 1, 3);
      room.loserCount = c;
      touch(room);
      io.to(room.id).emit('state', publicRoomState(room));
    });

    socket.on('setGameId', ({ gameId }) => {
      const room = currentRoomId ? getRoom(currentRoomId) : null;
      if (!room) return;
      if (!isCurrentSocketHost(room, socket)) return;
      room.gameId = gameId;
      touch(room);
      io.to(room.id).emit('state', publicRoomState(room));
    });

    socket.on('start', async () => {
      const room = currentRoomId ? getRoom(currentRoomId) : null;
      if (!room) return;
      if (!isCurrentSocketHost(room, socket)) return;
      const connectedCount = [...room.players.values()].filter((p) => p.connected).length;
      if (connectedCount < MIN_PLAYERS) return;
      if (room.status === 'countdown' || room.status === 'playing') return;

      const players = [...room.players.values()].filter((p) => p.connected);
      const seed = (Math.random() * 0x7fffffff) | 0;
      // Mark as countdown immediately so a second click is ignored even while WASM loads
      room.status = 'countdown';
      io.to(room.id).emit('state', publicRoomState(room));

      let replay;
      try {
        replay = await runGame({ gameId: room.gameId, seed, players, loserCount: room.loserCount });
      } catch (err) {
        console.error('runGame failed', err);
        room.status = 'lobby';
        io.to(room.id).emit('state', publicRoomState(room));
        return;
      }

      const startAt = Date.now() + COUNTDOWN_MS;
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
        players: players.map((p) => ({ playerToken: p.playerToken, nickname: p.nickname, color: p.color })),
      });

      // Move to playing at startAt; result emit is fire-and-forget after duration
      setTimeout(() => {
        if (!getRoom(room.id) || room.currentRound?.startAt !== startAt) return;
        room.status = 'playing';
        io.to(room.id).emit('state', publicRoomState(room));
      }, COUNTDOWN_MS);

      setTimeout(() => {
        if (!getRoom(room.id) || room.currentRound?.startAt !== startAt) return;
        room.status = 'result';
        io.to(room.id).emit('state', publicRoomState(room));
        io.to(room.id).emit('game:result', { ranking: replay.ranking, losers: replay.losers });
      }, COUNTDOWN_MS + replay.durationMs);
    });

    socket.on('reset', () => {
      const room = currentRoomId ? getRoom(currentRoomId) : null;
      if (!room) return;
      if (!isCurrentSocketHost(room, socket)) return;
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
      }, RECONNECT_GRACE_MS);
    });
  });
}

function isCurrentSocketHost(room: RoomState, socket: Socket) {
  return room.hostSocketId === socket.id;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function sanitizeNickname(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (t.length < 1 || t.length > NICKNAME_MAX) return null;
  return t;
}
