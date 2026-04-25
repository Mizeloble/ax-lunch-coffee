'use client';

import { useEffect, useState } from 'react';

const FLASH_MS = 700; // how long "시작!" lingers before auto-hiding

export function Countdown({ startAt }: { startAt: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [startAt]);

  const diff = startAt - now;

  if (diff > 0) {
    return (
      <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 pointer-events-none">
        <div className="text-9xl font-extrabold text-amber-400">{Math.ceil(diff / 1000)}</div>
      </div>
    );
  }

  if (-diff < FLASH_MS) {
    return (
      <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 pointer-events-none">
        <div className="text-7xl font-extrabold text-amber-400 animate-pulse">시작!</div>
      </div>
    );
  }

  return null;
}
