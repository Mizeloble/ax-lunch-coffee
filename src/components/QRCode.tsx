'use client';

import { useEffect, useRef } from 'react';
import QRCodeLib from 'qrcode';

export function QRCode({ value, size = 240 }: { value: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    QRCodeLib.toCanvas(ref.current, value, {
      width: size,
      margin: 1,
      color: { dark: '#0b0b10', light: '#ffffff' },
    }).catch(() => {});
  }, [value, size]);

  return (
    <div className="bg-white p-2 rounded-2xl inline-block">
      <canvas ref={ref} width={size} height={size} className="rounded-md" />
    </div>
  );
}
