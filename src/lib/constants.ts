// Single source of truth for time/length thresholds shared between server, store, and components.
// Group by domain. Always include the unit in the name (`_MS`, `_COUNT`).

export const ROOM = {
  /** Drop a room after this much idle time. */
  IDLE_MS: 10 * 60_000,
  /** Hold a disconnected player's slot before evicting (handles tab backgrounding / reconnect). */
  RECONNECT_GRACE_MS: 10_000,
  /** Auto-redirect a stuck `result`-screen tab back to landing after this idle window. */
  IDLE_REDIRECT_MS: 3 * 60_000,
  /**
   * Global cap on concurrent in-memory rooms (single Fly shared-cpu-1x / 512MB,
   * no autoscale). This is a CAPACITY / OOM / abuse guard so the box degrades
   * gracefully (`room:create` → CAPACITY, client shows a "잠시 후 다시" notice)
   * instead of thrashing many concurrent box2d sims on one shared vCPU.
   *
   * NOTE: this does NOT bound hosting cost. Fly bills machine *started-seconds*,
   * not room count — cost ≈ how long the VM stays awake (sporadic all-day
   * traffic + auto-stop cooldown can keep it up most of the workday). Cost
   * levers are VM size / uptime, not this number.
   *
   * 25 is sized off measured cost, not guesswork (see docs/launch-checklist.md
   * §G): a held room costs ~0.7MB on top of a ~109MB runtime floor, so 25 rooms
   * land near 126MB — memory is nowhere near binding on the 512MB VM. The real
   * ceiling is the Fly `http_service` connection limit (soft 150 / hard 200):
   * at ~6 players per room, 25 rooms ≈ 150 sockets. **Raise those limits before
   * raising this**, or new players start getting refused at the proxy instead of
   * the graceful CAPACITY path here.
   */
  MAX_ROOMS: 25,
  /**
   * Grace window for a freshly-created room to be claimed by a live socket
   * (host page connecting + `join`). A room with no connected player after this
   * is treated as squatted/abandoned and dropped immediately — without it a
   * never-joined room would hold a MAX_ROOMS slot for the full IDLE_MS, letting
   * one IP exhaust global capacity by hammering `room:create`.
   */
  UNCLAIMED_MS: 90_000,
  /**
   * `room:create` ack 대기 상한. 소켓 연결까지 포함한 시간이라 Fly scale-to-zero
   * 콜드스타트(머신 기동 + Next prepare)를 넉넉히 덮어야 한다 — 짧으면 첫 방문자만
   * 실패한다. 초과 시 버튼을 풀고 실패 안내(재시도 가능).
   */
  CREATE_TIMEOUT_MS: 20_000,
} as const;

export const GAME = {
  COUNTDOWN_MS: 3000,
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 30,
  /** Inclusive bounds for the host's loser-count selector. */
  LOSER_COUNT_MIN: 1,
  LOSER_COUNT_MAX: 3,
  /** Pre-charge phase length for games with `needsPreCharge` (e.g. marble-cheer). */
  CHARGE_MS: 5000,
  /** Server-side broadcast cadence of aggregate charge totals during charging. */
  CHARGE_TICK_MS: 250,
  /** Per-player tap cap during the charge phase. Anti-macro. */
  CHARGE_TAP_CAP: 50,
  /** Default charge ratio for manual (no-phone) players. */
  CHARGE_MANUAL_DEFAULT: 0.5,
  /**
   * Post-endsAt buffer before charge totals are frozen — the reaction game's
   * REACTION_TAIL_MS for the same reason. Clients throttle tap packets and send a
   * final cumulative flush the moment their countdown hits 0, so that flush is
   * *always* in flight when the window closes; without a tail it landed after
   * `clearCharge` and every tap since the last throttled send was lost (worst for
   * players on slow connections). The displayed countdown still ends at endsAt —
   * this only widens what the server accepts.
   */
  CHARGE_TAIL_MS: 600,
  /** Reaction game: minimum offset before "GO!" before the goAt mark. */
  REACTION_PRE_GO_MIN_MS: 1500,
  /** Reaction game: maximum offset before "GO!". seed picks deterministically in [MIN, MAX]. */
  REACTION_PRE_GO_MAX_MS: 3500,
  /** Reaction game: window after goAt to accept taps. */
  REACTION_DEADLINE_MS: 1500,
  /** Reaction game: anything below this is treated as a false start (catches reflex 0..50ms guesses). */
  REACTION_MIN_HUMAN_RT_MS: 80,
  /** Reaction game: post-deadline buffer before broadcasting result, lets last in-flight tap arrive. */
  REACTION_TAIL_MS: 600,
  /** Trivia game: number of questions per round. */
  TRIVIA_QUESTION_COUNT: 5,
  /** Extra unseen questions the shuffle bag keeps in reserve before wrapping —
   *  covers a tail that's unusable because its members exclude each other. */
  TRIVIA_WRAP_MARGIN: 4,
  /** Trivia game: maximum time window per question (read + answer). When all
   * connected non-manual players answer earlier, the server short-circuits and
   * advances immediately, so this is the upper bound — typical play is faster. */
  TRIVIA_QUESTION_MS: 6000,
  /** Trivia game: post-question reveal phase showing the correct answer + the
   * mid-round leaderboard inline. Length tuned so players have time to (1) see
   * if they got it right, (2) read the +N toast, (3) glance at the standings —
   * all in the same screen without a jarring context switch. */
  TRIVIA_REVEAL_MS: 2000,
  /** Trivia game: tail buffer between the end of the last reveal and the result broadcast. */
  TRIVIA_TAIL_MS: 600,
  /** Trivia scoring: minimum points for a correct answer (answered at the buzzer). */
  TRIVIA_SCORE_BASE: 500,
  /** Trivia scoring: maximum points for a correct answer (answered instantly). */
  TRIVIA_SCORE_MAX: 1000,
  /** Trivia scoring: per-step combo bonus added per consecutive correct beyond the first. */
  TRIVIA_COMBO_BONUS: 100,
  /** Trivia scoring: combo bonus caps at this many consecutive correct answers. */
  TRIVIA_COMBO_CAP: 5,
  /** Trivia scoring: multiplier applied to the LAST question's score (double-or-nothing finale). */
  TRIVIA_LAST_QUESTION_MULT: 2,
} as const;

export const NICKNAME = {
  MAX_LENGTH: 10,
} as const;

export const RATE_LIMIT = {
  /**
   * 방 생성(`room:create` 소켓 이벤트) IP별 고정 윈도우 제한. 스팸/남용 방지.
   * 프로덕션에서만 적용(개발·LAN 테스트는 통과). 한 IP에서 윈도우 안에 정상적으로
   * 방을 여러 번 여는 경우(재시도·여러 모임)를 막지 않도록 넉넉히 잡되,
   * MAX_ROOMS보다 낮게 둠 — 한 IP가 한 윈도우 안에 전역 슬롯을 통째로
   * 소진(스쿼팅 → 모두에게 503)하지 못하게. (never-joined 방 빠른 GC와 함께 동작.)
   */
  ROOM_CREATE_WINDOW_MS: 60_000,
  ROOM_CREATE_MAX: 5,
} as const;

export const SOCKET_RATE = {
  /**
   * 소켓 이벤트 per-connection 고정 윈도우 제한 (남용/플러드 DoS 방지).
   * HTTP 방생성만 제한돼 있고 소켓 핸들러는 무제한이라, 소켓 하나로 초당 수천 번
   * emit해 단일 vCPU를 포화시킬 수 있었음. 프로덕션에서만 적용(개발·LAN 테스트 통과).
   */
  /** 고빈도 게임 입력(tilt/boost/tap/answer/charge) — 클라 송신 ~20Hz라 여유 있게. */
  HOT_WINDOW_MS: 1000,
  HOT_MAX: 40,
  /** 저빈도 제어 이벤트(join, host 액션, setGameId/setLoserCount, start, reset). */
  CTRL_WINDOW_MS: 10_000,
  CTRL_MAX: 40,
  /** IP별 신규 소켓 연결 레이트(포크밤 방지). 동시 QR 스캔 버스트는 통과하게 넉넉히. */
  CONNECT_WINDOW_MS: 10_000,
  CONNECT_MAX: 60,
} as const;

export const UI = {
  /** Countdown "시작!" badge linger time. */
  FLASH_MS: 700,
  /** Countdown number spring-in duration. */
  SPRING_MS: 220,
  /** Replay-the-same-race delay before re-mounting the renderer. */
  REPLAY_LEAD_MS: 1500,
} as const;

/** Marble color palette assigned in player join order. */
export const MARBLE_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f59e0b',
  '#10b981', '#a855f7',
] as const;
