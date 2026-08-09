// Single source of truth for socket message and room-state shapes shared between
// the server (`src/server/socket.ts`) and the client store / UI.
//
// `GameId` lives in `src/games/types.ts` so this file can be imported safely from
// either side without dragging server-only code into the client bundle.

import type { GameId } from '@/games/types';

export type RoomStatus = 'lobby' | 'charging' | 'countdown' | 'playing' | 'result';

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
  /** playerToken currently holding host authority (null if none). A client is
   * host when its own token equals this — reassigned on host auto-promotion. */
  hostPlayerToken: string | null;
  players: PublicPlayer[];
  /** Present only while status === 'charging' — lets a client that reloaded
   * mid-charge (and thus missed the one-shot `charge:start`) rebuild the phase
   * countdown instead of sitting on a placeholder until the race starts. */
  chargeEndsAt?: number;
  currentRound?: {
    gameId: GameId;
    startAt: number;
    durationMs: number;
    /** Penalty count this round actually ran with (already clamped to the player
     * count — may differ from the room's `loserCount` setting). */
    loserCount: number;
    /**
     * Players as of round start. Needed because `players` at the top level drifts:
     * someone evicted after the grace window disappears from it, and a spectator
     * who joined mid-round appears in it. A client rebuilding `game:start` from
     * this state has to see the round's own roster — otherwise names go blank
     * mid-race, and anyone not in the round gets a playable-looking screen whose
     * input the server can only reject.
     */
    players: { playerToken: string; nickname: string; color: string }[];
    /** Game-specific intro data exposed for mid-play reconnects (e.g. reaction's goAt/deadlineAt). */
    replay?: unknown;
    /** Present only while status === 'result' — lets a client that missed the
     * `game:result` broadcast (navigated away mid-round) rebuild the result screen. */
    ranking?: string[];
    losers?: string[];
  };
};

export type GameStartPayload = {
  gameId: GameId;
  seed: number;
  startAt: number;
  durationMs: number;
  /** Penalty count for this round (clamped to the player count server-side).
   * Renderers need it to reveal *every* loser — without it the marble games
   * staged the last place alone and contradicted the result screen. */
  loserCount: number;
  replay: unknown;
  players: { playerToken: string; nickname: string; color: string }[];
};

export type ResultPayload = {
  ranking: string[];
  losers: string[];
};

export type CountdownPayload = { startAt: number };

/**
 * Mid-round leaderboard snapshot for trivia. Emitted at each question's closeAt
 * (i.e. when the reveal phase begins) so clients can show running totals during
 * the reveal without learning what others picked before they answered themselves.
 * Standings are sorted server-side, descending by score.
 *
 * Also the reveal channel: `correctIndex` is this question's answer, pushed only
 * now — the intro broadcast is answer-free so devtools can't read the whole
 * round's answers at game:start.
 */
export type TriviaStandingsPayload = {
  qIndex: number;
  correctIndex: 0 | 1 | 2 | 3;
  standings: Array<{ playerToken: string; score: number; combo: number }>;
};

/**
 * Trivia all-answered short-circuit: when every connected non-manual player has
 * picked for the current question before the timer expires, the server collapses
 * the remaining wait and advances. The new full schedule (offsets from startAt,
 * length === question count) is broadcast so every client realigns its wall-clock
 * phase calculation. Past offsets are unchanged; only `qIndex` and beyond shift.
 */
export type TriviaReschedulePayload = {
  qIndex: number;
  openAtOffsets: number[];
  closeAtOffsets: number[];
};

export type ChargeStartPayload = { endsAt: number };
export type ChargeStatePayload = { totals: Record<string, number>; cap: number };

/**
 * Live tick from the marble-tilt server-authoritative simulation. Unlike the
 * deterministic precompute path used by `marble`/`marble-cheer`, marble-tilt
 * streams positions ~60 Hz (see `TICK_HZ` in liveSim.ts) so player tilt input can
 * affect the race in real time.
 * `t` is the server tick index, useful for late-frame ordering / interpolation
 * gates. `finished` indices crossed the goal during this tick (one-shot fanfare
 * trigger). `done: true` signals the last tick — no more positions will arrive.
 */
export type MarbleTiltTickPayload = {
  t: number;
  positions: number[]; // [x0,y0,x1,y1,...] in box2d meters, rounded to .01
  finished?: number[]; // marble indices (matching playerOrder) that crossed goal this tick
  /**
   * Authoritative finish order so far, as marble indices — best first. Sent on
   * every tick (≤30 small ints) because the client must not *infer* it: deriving
   * the penalty set from "who I saw finish" named the winner as a loser on any
   * client that reloaded mid-race, and under-counted losers whenever two marbles
   * crossed on the same tick. Once the race ends this carries the complete final
   * ranking, which is also what lets a timed-out race reveal its losers at all.
   */
  order?: number[];
  /** Marble indices whose owner triggered a boost during this tick — clients
   *  use these for one-shot visual effects (white flash + burst). */
  boosted?: number[];
  done?: boolean;
};

/**
 * Server ack for `reaction:tap`. `offsetMs` is the offset the server recorded
 * (arrival − goAt) — the exact number the result screen will later show. The
 * renderer displays this instead of its local estimate so the in-game badge and
 * the final ranking can never disagree. `recorded: false` = tap was ignored
 * (duplicate, outside window, not playing).
 */
export type ReactionTapAck = { recorded: true; offsetMs: number } | { recorded: false };

/**
 * Answer receipt for trivia. Display-only, like ReactionTapAck: the renderer's
 * optimistic "answered" badge must roll back when the server dropped the answer
 * (arrived after closeAt / short-circuit advance / rate limit), or the in-game
 * score would disagree with the final ranking.
 */
export type TriviaAnswerAck = { recorded: boolean };

/**
 * Reaction game GO signal, emitted by the server AT goAt — never announced in
 * advance. Pre-announcing goAt (or the round seed it derives from) let a one-line
 * devtools script schedule an inhumanly fast tap; now the earliest possible
 * scripted reaction is bounded by real network latency.
 *
 * Deliberately carries no timestamps. An absolute goAt let a script aim its tap
 * to land just past the 80ms human-reaction floor instead of at whatever its own
 * latency happened to be — a slower connection could out-aim a faster one. The
 * client anchors on receipt; the server's own window stays the authority for what
 * counts, and the ack reports the offset it actually recorded.
 */
export type ReactionGoPayload = {
  /** How long the tap window stays open, measured from *receipt* of this event. */
  windowMs: number;
};

export type MarbleBoostAck = { accepted: boolean; remaining: number };

/**
 * Everything a quiz client needs to rejoin a round already in progress, sent to
 * that socket alone on `join`. The three things it carries are exactly the three
 * that can't be rebuilt from `state`: the schedule may have been pulled forward
 * by the all-answered short-circuit, the answers revealed so far arrive on
 * one-shot `trivia:standings` pushes (state's intro is deliberately answer-free),
 * and a player's own picks live only in that client's React state until now.
 */
export type TriviaResumePayload = {
  /** Current schedule as ms offsets from startAt — post short-circuit. */
  openAtOffsets: number[];
  closeAtOffsets: number[];
  /** Correct index per question, null for questions not yet revealed. */
  revealed: Array<0 | 1 | 2 | 3 | null>;
  /** This player's own submitted picks, null where they didn't answer. */
  myPicks: Array<0 | 1 | 2 | 3 | null>;
  /** ms offset from each question's openAt for the picks above (0 when no pick). */
  myPickOffsets: number[];
};

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
  error: (payload: ErrorPayload) => void;
  countdown: (payload: CountdownPayload) => void;
  'charge:start': (payload: ChargeStartPayload) => void;
  'charge:state': (payload: ChargeStatePayload) => void;
  'game:start': (payload: GameStartPayload) => void;
  'game:result': (payload: ResultPayload) => void;
  'reaction:go': (payload: ReactionGoPayload) => void;
  'trivia:resume': (payload: TriviaResumePayload) => void;
  'trivia:standings': (payload: TriviaStandingsPayload) => void;
  'trivia:reschedule': (payload: TriviaReschedulePayload) => void;
  'marble:tick': (payload: MarbleTiltTickPayload) => void;
  /** Sent to all clients right before the server exits (deploy/restart) so they
   * can show a "restarting" notice instead of a silent freeze. No payload. */
  'server:shutdown': (payload: Record<string, never>) => void;
};

export type ClientToServerEvents = {
  join: (
    payload: { roomId: string; nickname: string; playerToken?: string; hostToken?: string },
    ack: (res: JoinAck) => void,
  ) => void;
  /** Clock sync probe: ack carries the server's `Date.now()`. Display-only —
   * the client uses it to correct its own clock, never to assert timing. */
  'time:sync': (ack: (serverTime: number) => void) => void;
  setLoserCount: (payload: { count: number }) => void;
  setGameId: (payload: { gameId: GameId }) => void;
  start: () => void;
  reset: () => void;
  /** Charge phase: client sends cumulative tap count (idempotent). */
  'charge:tick': (payload: { count: number }) => void;
  /** Reaction game: tap signal. No payload — server uses arrival time as the source
   * of truth and returns the recorded offset via ack (display-only channel). */
  'reaction:tap': (ack?: (res: ReactionTapAck) => void) => void;
  /** Trivia game: answer for the currently open question. Server uses arrival time, not client timestamps. */
  'trivia:answer': (
    payload: { qIndex: number; choice: 0 | 1 | 2 | 3 },
    ack?: (res: TriviaAnswerAck) => void,
  ) => void;
  /** Marble-tilt: client streams normalized X-axis tilt (-1..1) at ~20 Hz while playing. */
  'marble:tilt': (payload: { x: number }) => void;
  /** Marble-tilt: instant boost (tap). Server enforces per-round budget + cooldown. */
  /** Tilt-race boost. Ack mirrors the server's budget so the client's counter
   *  can't drift (reload resets it locally; jitter can lose one to the cooldown). */
  'marble:boost': (ack?: (res: MarbleBoostAck) => void) => void;
  'host:addPlayer': (
    payload: { nickname: string },
    ack: (res: AddPlayerAck) => void,
  ) => void;
  'host:removePlayer': (
    payload: { playerToken: string },
    ack?: (res: RemovePlayerAck) => void,
  ) => void;
};
