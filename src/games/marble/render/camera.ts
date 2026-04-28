import { ZOOM_MAX, ZOOM_THRESHOLD } from './constants';

/**
 * Lazygyu-style depth-of-zoom: full zoom inside the threshold band, ramping out
 * with smoothstep so outer track walls don't pop when the leader crosses in.
 */
export function computeZoom(camY: number, zoomY: number): number {
  const dist = Math.abs(zoomY - camY);
  if (dist >= ZOOM_THRESHOLD) return 1;
  // Smoothstep ramp: gentler entry/exit at the threshold edges so outer track walls
  // don't pop out of view abruptly when the leader crosses into the zoom band.
  const u = 1 - dist / ZOOM_THRESHOLD;
  const t = u * u * (3 - 2 * u);
  return 1 + t * (ZOOM_MAX - 1);
}
