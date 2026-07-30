'use client';

import { ko } from '@/lib/i18n';
import { GAME_META, type GameId } from '@/games/types';

/**
 * Compact rules panel for the currently selected game. Visible to both host and
 * guest so everyone knows what's about to happen — especially useful for
 * `marble-cheer` where the pre-charge phase changes how players engage with the
 * start of the round.
 *
 * `bare` drops the card chrome so the same rules can live *inside* the selected
 * GamePicker tile (host) without a card-in-a-card. Guests, who have no picker,
 * keep the standalone card.
 */
export function GameIntro({ gameId, bare }: { gameId: GameId; bare?: boolean }) {
  const lines = ko.gameIntros[gameId];
  const meta = GAME_META[gameId];

  const rules = (
    <ol className="space-y-1.5 text-[13px] leading-relaxed text-zinc-400">
      {lines.map((line, i) => (
        <li key={i} className="flex gap-2">
          <span
            aria-hidden
            className="mt-px flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-white/[0.07] text-[11px] font-bold text-zinc-400"
          >
            {i + 1}
          </span>
          <span>{line}</span>
        </li>
      ))}
    </ol>
  );

  if (bare) return rules;

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-3.5">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-base leading-none">{meta.emoji}</span>
        <span className="text-[14px] font-bold text-zinc-100">{ko.games[gameId]}</span>
        {meta.needsPreCharge && (
          <span className="ml-1 rounded-md bg-amber-400/15 px-1.5 py-0.5 text-[11px] font-bold text-amber-300">
            {ko.charge.badge}
          </span>
        )}
      </div>
      {rules}
    </div>
  );
}
