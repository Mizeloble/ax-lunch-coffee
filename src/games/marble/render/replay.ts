/**
 * Map wall-clock elapsed (ms) to a fractional frame index.
 *
 * `cumMs[N]` holds cumulative duration at the START of frame N (so `cumMs[0]=0`
 * and `cumMs.length === frameDurations.length + 1`). Built once at mount via:
 *   const cumMs = new Float64Array(frameDurations.length + 1);
 *   for (let i = 0; i < frameDurations.length; i++) cumMs[i+1] = cumMs[i] + frameDurations[i];
 *
 * Returns a value in `[0, totalFrames - 1]`, with the integer part being the
 * current frame and the fraction being the lerp factor toward the next frame.
 * Capped at `lo + 0.9999` to keep the fractional portion strictly less than 1.
 */
export function elapsedToFrameF(
  elapsedMs: number,
  cumMs: Float64Array,
  frameDurations: number[],
  totalFrames: number,
): number {
  if (elapsedMs <= 0) return 0;
  const total = cumMs[cumMs.length - 1];
  if (elapsedMs >= total) return totalFrames - 1;
  // Binary search: largest N with cumMs[N] <= elapsedMs (cumMs[N] is time at start of frame N).
  let lo = 0, hi = cumMs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (cumMs[mid] <= elapsedMs) lo = mid;
    else hi = mid - 1;
  }
  const frameStart = cumMs[lo];
  const frac = (elapsedMs - frameStart) / frameDurations[lo];
  return lo + Math.min(0.9999, frac);
}
