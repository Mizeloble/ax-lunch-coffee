export type Particle = {
  x: number; // world meters
  y: number;
  vx: number; // m/s
  vy: number;
  life: number; // seconds remaining
  totalLife: number;
  color: string;
  size: number; // world meters
  rot: number;
  vrot: number;
  emoji?: string; // when set, render as text instead of confetti rect
};

export type Burst = {
  x: number;
  y: number;
  age: number; // seconds since spawn
  color: string;
  rankLabel: string;
};

export type Pane = {
  // Pixel rect on the canvas
  px: number;
  py: number;
  pw: number;
  ph: number;
  label: string;
  particles: Particle[];
  bursts: Burst[];
  pulse: number; // 0..1, label highlight when finish events happen
  shake: number; // 0..1, screen-shake intensity
  alpha: number; // 0..1, eased visibility — used for inset show/hide transitions
};

export type PlayerInfo = { color: string; nickname: string };
