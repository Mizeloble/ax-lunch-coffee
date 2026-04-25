'use client';

import { useEffect, useState } from 'react';

export function Countdown({ startAt }: { startAt: number }) {
  const [n, setN] = useState(() => Math.max(0, Math.ceil((startAt - Date.now()) / 1000)));

  useEffect(() => {
    const tick = () => setN(Math.max(0, Math.ceil((startAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [startAt]);

  if (n <= 0) {
    return (
      <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 pointer-events-none">
        <div className="text-7xl font-extrabold text-amber-400 animate-pulse">시작!</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 pointer-events-none">
      <div className="text-9xl font-extrabold text-amber-400">{n}</div>
    </div>
  );
}
