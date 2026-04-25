'use client';

import { useState } from 'react';
import { ko } from '@/lib/i18n';
import { QRCode } from './QRCode';

export function InviteSheet({ url, onClose }: { url: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [shareSupported] = useState(() => typeof navigator !== 'undefined' && 'share' in navigator);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // fallback: select+copy
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } finally {
        document.body.removeChild(ta);
      }
    }
  }

  async function share() {
    try {
      await (navigator as Navigator & { share: (data: ShareData) => Promise<void> }).share({
        title: ko.app.title,
        text: '같이 커피내기 하실래요?',
        url,
      });
    } catch {
      /* user cancelled */
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full sm:max-w-sm bg-zinc-900 rounded-t-3xl sm:rounded-3xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">{ko.lobby.invite}</h2>
          <button type="button" onClick={onClose} className="text-zinc-400 px-2 py-1">
            닫기
          </button>
        </div>
        <div className="flex flex-col items-center gap-3">
          <QRCode value={url} size={240} />
          <p className="text-xs text-zinc-400 text-center">{ko.lobby.inviteScan}</p>
          <code className="text-xs text-zinc-500 break-all px-2 text-center">{url}</code>
        </div>
        <div className="grid grid-cols-2 gap-3 pt-1">
          <button
            type="button"
            onClick={copy}
            className="py-3 rounded-xl bg-zinc-800 font-medium active:scale-[0.98]"
          >
            {copied ? '복사됨 ✓' : ko.lobby.copyLink}
          </button>
          <button
            type="button"
            onClick={share}
            disabled={!shareSupported}
            className="py-3 rounded-xl bg-amber-400 text-zinc-900 font-bold disabled:opacity-40 active:scale-[0.98]"
          >
            {ko.lobby.share}
          </button>
        </div>
      </div>
    </div>
  );
}
