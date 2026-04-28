// Single source of truth for socket message and room-state shapes shared between
// the server (`src/server/socket.ts`) and the client store / UI.
//
// `GameId` lives in `src/games/types.ts` so this file can be imported safely from
// either side without dragging server-only code into the client bundle.

import type { GameId } from '@/games/types';

export type RoomStatus = 'lobby' | 'countdown' | 'playing' | 'result';

export type PublicPlayer = {
  playerToken: string;
  nickname: string;
  connected: boolean;
  color: string;
  manual: boolean;
};

export type PublicRoomState = {
  id: string;
  status: RoomStatus;
  gameId: GameId;
  loserCount: number;
  players: PublicPlayer[];
  currentRound?: { gameId: GameId; startAt: number; durationMs: number };
};

export type GameStartPayload = {
  gameId: GameId;
  seed: number;
  startAt: number;
  durationMs: number;
  replay: unknown;
  players: { playerToken: string; nickname: string; color: string }[];
};

export type ResultPayload = { ranking: string[]; losers: string[] };

export type CountdownPayload = { startAt: number };

export type ErrorPayload = { code: string; message: string };

export type JoinAck =
  | { ok: true; playerToken: string; isHost: boolean }
  | { ok: false; code: string; message: string };

export type AddPlayerAck =
  | { ok: true; playerToken: string }
  | { ok: false; code: string; message: string };

export type RemovePlayerAck =
  | { ok: true }
  | { ok: false; code: string; message: string };

export type ServerToClientEvents = {
  state: (state: PublicRoomState) => void;
  joined: (payload: { you: { playerToken: string; isHost: boolean } }) => void;
  error: (payload: ErrorPayload) => void;
  countdown: (payload: CountdownPayload) => void;
  'game:start': (payload: GameStartPayload) => void;
  'game:result': (payload: ResultPayload) => void;
};

export type ClientToServerEvents = {
  join: (
    payload: { roomId: string; nickname: string; playerToken?: string; hostToken?: string },
    ack: (res: JoinAck) => void,
  ) => void;
  setLoserCount: (payload: { count: number }) => void;
  setGameId: (payload: { gameId: GameId }) => void;
  start: () => void;
  reset: () => void;
  'host:addPlayer': (
    payload: { nickname: string },
    ack: (res: AddPlayerAck) => void,
  ) => void;
  'host:removePlayer': (
    payload: { playerToken: string },
    ack?: (res: RemovePlayerAck) => void,
  ) => void;
};
