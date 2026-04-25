'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ko } from '@/lib/i18n';

export default function LandingPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function createRoom() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/rooms', { method: 'POST' });
      if (!res.ok) throw new Error('failed');
      const { roomId, hostToken } = (await res.json()) as { roomId: string; hostToken: string };
      try {
        sessionStorage.setItem(`coffee:host:${roomId}`, hostToken);
      } catch {}
      router.push(`/r/${roomId}`);
    } catch {
      setBusy(false);
      alert('방 생성에 실패했어요. 다시 시도해주세요.');
    }
  }

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-6 text-center">
      <div className="max-w-sm w-full space-y-10">
        <div className="space-y-2">
          <div className="text-6xl">☕️</div>
          <h1 className="text-3xl font-bold">{ko.app.title}</h1>
          <p className="text-zinc-400 text-sm">{ko.app.subtitle}</p>
        </div>
        <p className="text-zinc-300 text-sm leading-relaxed">{ko.landing.description}</p>
        <button
          type="button"
          onClick={createRoom}
          disabled={busy}
          className="w-full py-4 rounded-2xl bg-amber-400 text-zinc-900 font-bold text-lg disabled:opacity-50 active:scale-[0.98] transition-transform"
        >
          {busy ? '생성 중…' : ko.landing.createRoom}
        </button>
      </div>
    </main>
  );
}
