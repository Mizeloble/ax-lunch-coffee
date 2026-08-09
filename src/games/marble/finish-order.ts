/**
 * How marbles are ranked when position sampling can't separate them.
 *
 * Both race runners sample discretely — the precompute one records at 120 fps,
 * the live tilt one streams at 60 Hz — so two marbles regularly cross the goal
 * "at the same time" as far as either can tell. Ranking those by array index is
 * the tempting default and the wrong one: index is the room's join order, so the
 * earliest joiner would win every photo finish, every round, forever.
 *
 * The rule instead is: whoever is *deeper* past the goal line got there first
 * within the step, and an exact tie falls to a seed-derived stream. This lives
 * here rather than inline in each runner because it already drifted once — the
 * precompute path was fixed and the live path was not, and nothing in the code
 * connected them.
 */
export type Crossing = {
  /** Marble index (position in `playerOrder`). */
  idx: number;
  /** Y at the moment of sampling. Larger = further past the goal line. */
  y: number;
  /** Draw from the runner's seed-derived tie stream, used only for exact y ties. */
  key: number;
};

/**
 * Best-first ordering for marbles observed crossing on the same step. Returns a
 * new array; the input is left alone. Deliberately independent of the order the
 * caller collected them in, which is the whole point.
 */
export function orderCrossings<T extends Crossing>(crossings: readonly T[]): T[] {
  if (crossings.length <= 1) return [...crossings];
  return [...crossings].sort((a, b) => b.y - a.y || a.key - b.key);
}
