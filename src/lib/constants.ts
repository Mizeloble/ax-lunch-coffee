// Single source of truth for time/length thresholds shared between server, store, and components.
// Group by domain. Always include the unit in the name (`_MS`, `_COUNT`).

export const ROOM = {
  /** Drop a room after this much idle time. */
  IDLE_MS: 10 * 60_000,
  /** Hold a disconnected player's slot before evicting (handles tab backgrounding / reconnect). */
  RECONNECT_GRACE_MS: 10_000,
  /** Auto-redirect a stuck `result`-screen tab back to landing after this idle window. */
  IDLE_REDIRECT_MS: 3 * 60_000,
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
} as const;

export const NICKNAME = {
  MAX_LENGTH: 10,
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
