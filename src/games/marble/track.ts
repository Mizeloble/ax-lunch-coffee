// Conceptual track in normalized coords: x in [0,1], y in [0, height] (top→bottom).
// Pegs are obstacles; on collision (y crosses peg.y while close in x) we nudge horizontal velocity.
// This is a simplified physics-flavored simulation — readable, deterministic, and fun to watch.
// v2 may replace with full box2d-wasm by reusing lazygyu/roulette's track module.

export type Peg = { x: number; y: number; r: number };

const TRACK_HEIGHT = 3.6;
const MARBLE_R = 0.025;
const PEG_R = 0.025;

function buildPegs(): Peg[] {
  const pegs: Peg[] = [];
  const rows = 26;
  // 8 column lattice with half-step zigzag — guarantees marbles always hit something
  const cols = 8;
  const hSpacing = 1 / cols; // 0.125
  const vSpacing = (TRACK_HEIGHT - 0.6) / rows; // ≈ 0.115
  for (let row = 0; row < rows; row++) {
    const yBase = 0.32 + row * vSpacing;
    const xOff = row % 2 === 0 ? hSpacing / 2 : 0; // 0.0625 or 0
    for (let c = 0; c <= cols; c++) {
      const x = xOff + c * hSpacing;
      if (x < 0.04 || x > 0.96) continue;
      pegs.push({ x, y: yBase, r: PEG_R });
    }
  }
  return pegs;
}

export const TRACK = {
  width: 1,
  height: TRACK_HEIGHT,
  startY: 0.06,
  finishY: 3.5,
  marbleRadius: MARBLE_R,
  gravity: 0.6,         // units/s²
  drag: 0.4,            // per-second velocity decay
  maxVy: 0.55,          // terminal velocity cap (prevents tunneling, keeps race coherent)
  maxVx: 0.4,
  pegs: buildPegs(),
};
