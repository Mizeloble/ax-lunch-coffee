/**
 * Mulberry32 — small, fast, seed-only deterministic PRNG.
 *
 * Shared by every game that needs reproducible randomness from a round seed
 * (same seed → same stream). No global state: each call returns an independent
 * generator. Games stay independent of *each other* by depending on this shared
 * lib rather than copying the implementation around.
 */
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Seed-derived last-resort tie-break rank for fully tied players (e.g. manual
 * players who all score 0). Plain `playerToken` alphabetical order would be
 * fixed for the whole party — the same person loses every single round — so
 * each round shuffles the (sorted, input-order-independent) token list with a
 * seed-derived stream instead: still deterministic per round, different across
 * rounds. The xor keeps this stream separate from the round's main RNG.
 */
export function seededTieRank(seed: number, tokens: readonly string[]): Map<string, number> {
  const rng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  const shuffled = [...tokens].sort();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return new Map(shuffled.map((tk, i) => [tk, i]));
}
