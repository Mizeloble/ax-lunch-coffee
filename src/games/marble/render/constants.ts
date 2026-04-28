// Render-only tuning constants. Kept separate from `src/lib/constants.ts` because
// these are draw-loop knobs (camera ease, marble radius in meters, fade rates), not
// product-domain knobs.

export const MARBLE_RADIUS = 0.25; // box2d meters, matches lazygyu
export const VIEW_HEIGHT_METERS = 22; // baseline meters of vertical track shown
export const ZOOM_THRESHOLD = 5; // meters from zoomY where the camera starts zooming in (lazygyu)
// Capped at 3× (lazygyu uses 4×) to keep the outer track walls in view longer near the goal.
export const ZOOM_MAX = 3;
export const CAMERA_EASE_RATE = 6; // exponential ease constant — ~150ms time to converge 90%
export const INSET_FADE_RATE = 6; // ~250ms fade-in/out for the inset pane
