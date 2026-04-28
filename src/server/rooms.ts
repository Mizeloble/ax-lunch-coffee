import { newHostToken, newPlayerToken, newRoomId } from '../lib/ids';
import { ko } from '../lib/i18n';
import { MARBLE_COLORS, ROOM } from '../lib/constants';
import type { RoomStatus } from '../lib/protocol';
import type { GameId } from '../games/types';

export type { GameId, RoomStatus };

export type Player = {
  socketId: string | null; // null while disconnected (within grace window) or for host-added players
  playerToken: string;
  nickname: string;
  joinedAt: number;
  connected: boolean;
  graceTimer?: NodeJS.Timeout;
  color: string;
  manual: boolean; // host-added (no device); freely removable by host
};

export type ReplayPayload = {
  // marble: prefix-coded position track. shape: { fps, frames: number[][] (per-frame [x,y,...]) }
  // generic: { ranking } only
  durationMs: number;
  ranking: string[]; // playerToken order, last = worst
  losers: string[]; // playerTokens
  data?: unknown; // game-specific
};

export type RoomState = {
  id: string;
  hostToken: string;
  hostSocketId: string | null;
  status: RoomStatus;
  gameId: GameId; // selected game (default 'marble')
  loserCount: number; // 1..3
  players: Map<string, Player>; // keyed by playerToken
  currentRound?: { gameId: GameId; seed: number; startAt: number; replay: ReplayPayload };
  lastActivityAt: number;
  cleanupTimer?: NodeJS.Timeout;
};

// IMPORTANT: Next.js API routes (Turbopack-bundled) and the Socket.IO handler (loaded by tsx)
// run in different module instances, so a plain `new Map()` here would split into two stores
// (one used by `POST /api/rooms`, another by socket join). Pin to globalThis to share.
const ROOMS_KEY = '__lunchCoffeeRooms';
type GlobalWithRooms = typeof globalThis & { [ROOMS_KEY]?: Map<string, RoomState> };
const g = globalThis as GlobalWithRooms;
const rooms: Map<string, RoomState> = g[ROOMS_KEY] ?? new Map<string, RoomState>();
g[ROOMS_KEY] = rooms;

export function createRoom(): { roomId: string; hostToken: string } {
  // Avoid collisions
  let id = newRoomId();
  while (rooms.has(id)) id = newRoomId();
  const hostToken = newHostToken();
  const room: RoomState = {
    id,
    hostToken,
    hostSocketId: null,
    status: 'lobby',
    gameId: 'marble',
    loserCount: 1,
    players: new Map(),
    lastActivityAt: Date.now(),
  };
  rooms.set(id, room);
  scheduleCleanup(room);
  if (process.env.NODE_ENV !== 'production') seedDevBots(room);
  return { roomId: id, hostToken };
}

// Dev-only: seed 5 fake players so a single browser tab can test multiplayer flows
// without juggling incognito windows. Bots have no socket — they sit in the room as
// `connected: true` and get included in the simulation like any real player.
function seedDevBots(room: RoomState) {
  for (const name of ko.dev.botNames) {
    const token = newPlayerToken();
    const color = MARBLE_COLORS[room.players.size % MARBLE_COLORS.length];
    room.players.set(token, {
      socketId: null,
      playerToken: token,
      nickname: name,
      joinedAt: Date.now(),
      connected: true,
      color,
      manual: true,
    });
  }
}

export function getRoom(roomId: string): RoomState | undefined {
  return rooms.get(roomId.toUpperCase());
}

export function deleteRoom(roomId: string) {
  const r = rooms.get(roomId);
  if (!r) return;
  if (r.cleanupTimer) clearTimeout(r.cleanupTimer);
  for (const p of r.players.values()) {
    if (p.graceTimer) clearTimeout(p.graceTimer);
  }
  rooms.delete(roomId);
}

export function addPlayer(
  room: RoomState,
  params: { nickname: string; playerToken?: string; socketId: string | null; manual?: boolean },
): Player {
  const token = params.playerToken ?? newPlayerToken();
  const existing = room.players.get(token);
  if (existing) {
    if (existing.graceTimer) clearTimeout(existing.graceTimer);
    if (params.socketId !== null) existing.socketId = params.socketId;
    existing.connected = true;
    existing.nickname = params.nickname;
    return existing;
  }
  const color = MARBLE_COLORS[room.players.size % MARBLE_COLORS.length];
  const p: Player = {
    socketId: params.socketId,
    playerToken: token,
    nickname: params.nickname,
    joinedAt: Date.now(),
    connected: true,
    color,
    manual: params.manual ?? false,
  };
  room.players.set(token, p);
  touch(room);
  return p;
}

export function findPlayerBySocket(room: RoomState, socketId: string): Player | undefined {
  for (const p of room.players.values()) if (p.socketId === socketId) return p;
  return undefined;
}

export function isHostToken(room: RoomState, token: string | null | undefined): boolean {
  return !!token && token === room.hostToken;
}

export function touch(room: RoomState) {
  room.lastActivityAt = Date.now();
  scheduleCleanup(room);
}

function scheduleCleanup(room: RoomState) {
  if (room.cleanupTimer) clearTimeout(room.cleanupTimer);
  room.cleanupTimer = setTimeout(() => {
    const idleFor = Date.now() - room.lastActivityAt;
    const empty = [...room.players.values()].every((p) => !p.connected);
    if (idleFor >= ROOM.IDLE_MS || empty) {
      deleteRoom(room.id);
    } else {
      scheduleCleanup(room);
    }
  }, ROOM.IDLE_MS);
}

export function snapshotPlayers(room: RoomState) {
  return [...room.players.values()].map((p) => ({
    playerToken: p.playerToken,
    nickname: p.nickname,
    connected: p.connected,
    color: p.color,
    manual: p.manual,
  }));
}

export function publicRoomState(room: RoomState) {
  return {
    id: room.id,
    status: room.status,
    gameId: room.gameId,
    loserCount: room.loserCount,
    players: snapshotPlayers(room),
    currentRound: room.currentRound
      ? {
          gameId: room.currentRound.gameId,
          startAt: room.currentRound.startAt,
          durationMs: room.currentRound.replay.durationMs,
        }
      : undefined,
  };
}
