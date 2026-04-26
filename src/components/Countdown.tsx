'use client';

import { useEffect, useRef, useState } from 'react';
import { haptics } from '@/games/marble/haptics';

const FLASH_MS = 700; // how long "시작!" lingers before auto-hiding

export function Countdown({ startAt }: { startAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  const lastTickRef = useRef<number | null>(null);
  const goFiredRef = useRef(false);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [startAt]);

  useEffect(() => {
    lastTickRef.current = null;
    goFiredRef.current = false;
  }, [startAt]);

  // Fire haptic on each whole-second transition during countdown, and once at GO.
  useEffect(() => {
    const diff = startAt - now;
    if (diff > 0) {
      const sec = Math.ceil(diff / 1000);
      if (lastTickRef.current !== sec) {
        lastTickRef.current = sec;
        haptics.countdownTick();
      }
    } else if (!goFiredRef.current) {
      goFiredRef.current = true;
      haptics.countdownGo();
    }
  }, [now, startAt]);

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
