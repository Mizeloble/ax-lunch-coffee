/**
 * Who the race reveal should stage as losers, and when.
 *
 * Extracted from the renderer because getting it wrong is invisible until the
 * result screen contradicts the race: the reveal used to hard-code "dead last",
 * so with a penalty count of 2–3 everyone else saw a neutral "N등 골인!" card and
 * was then flipped to loser at the result.
 *
 * Pure — same inputs, same output. `finishOrder` is the server's authoritative
 * order (stragglers appended last), never recomputed here.
 */
export type LoserStaging = {
  /** The penalty set, worst first. */
  loserTokens: string[];
  /** Whose crossing seals the set: the last player who is safe. Undefined if nobody is. */
  lastSafeToken: string | undefined;
};

export function resolveLosers(
  finishOrder: readonly string[],
  loserCount: number,
): LoserStaging {
  // Someone always survives — mirrors the server's `effectiveLoserCount` clamp so
  // the reveal can't claim a whole-field wipeout the ranking doesn't back up.
  const n = Math.max(1, Math.min(loserCount, finishOrder.length - 1));
  if (finishOrder.length === 0) return { loserTokens: [], lastSafeToken: undefined };
  return {
    loserTokens: finishOrder.slice(-n).reverse(),
    lastSafeToken: finishOrder[finishOrder.length - n - 1],
  };
}
