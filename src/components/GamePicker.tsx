'use client';

import { useState } from 'react';
import { GAME_META, gameCategory, type GameCategory, type GameId } from '@/games/types';
import clsx from 'clsx';
import { ko } from '@/lib/i18n';
import { gameCategoryLabel, gameShortLabel } from '@/lib/game-labels';
import { GameIntro } from './GameIntro';

/**
 * Game selection. Six enabled games no longer fit as a vertical stack of
 * description cards — they push the roster and the loser-count control off
 * screen. Instead:
 *   - unselected games compress into 2-column tiles (the one-line description is
 *     only useful once you've picked),
 *   - the selected game expands full-width and shows `ko.gameIntros[id]` inline,
 *   - a category filter (straight off `GAME_META.category`) keeps the list from
 *     growing taller as games are added,
 *   - 🎲 랜덤 short-circuits the slowest part of a drinking party: deciding.
 */
export function GamePicker({
  selected,
  onSelect,
  disabled,
}: {
  selected: GameId;
  onSelect: (id: GameId) => void;
  disabled?: boolean;
}) {
  const ids = Object.keys(GAME_META) as GameId[];
  const enabledIds = ids.filter((id) => GAME_META[id].enabled);
  const disabledIds = ids.filter((id) => !GAME_META[id].enabled);

  // Only categories that actually have an enabled game get a chip.
  const categories = enabledIds.reduce<GameCategory[]>((acc, id) => {
    const c = gameCategory(id);
    if (!acc.includes(c)) acc.push(c);
    return acc;
  }, []);
  const [filter, setFilter] = useState<GameCategory | null>(null);

  // The selected game always stays visible even when it's outside the filter —
  // otherwise tapping a chip silently hides what's about to be played.
  const visibleIds = enabledIds.filter(
    (id) => filter === null || gameCategory(id) === filter || id === selected,
  );

  const tappable = !disabled;

  function pickRandom() {
    if (!tappable) return;
    const pool = enabledIds.filter((id) => id !== selected);
    if (pool.length === 0) return;
    onSelect(pool[Math.floor(Math.random() * pool.length)]);
  }

  return (
    <div className="space-y-2.5">
      {/* 필터 칩 + 랜덤 — 게임이 8종이 돼도 이 줄 길이는 그대로다. */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
        <button
          type="button"
          disabled={!tappable}
          onClick={pickRandom}
          aria-label={ko.lobby.pickerRandomAria}
          className="shrink-0 rounded-full border border-amber-500/50 bg-amber-500/10 px-3 py-1.5 text-[13px] font-bold text-amber-200 active:scale-[0.98] disabled:opacity-50"
        >
          🎲 {ko.lobby.pickerRandom}
        </button>
        <span aria-hidden className="h-4 w-px shrink-0 bg-white/10" />
        <Chip active={filter === null} onTap={() => setFilter(null)}>
          {ko.lobby.pickerAll(enabledIds.length)}
        </Chip>
        {categories.map((c) => (
          <Chip key={c} active={filter === c} onTap={() => setFilter(c)}>
            {ko.gameCategories[c]}
          </Chip>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {visibleIds.map((id) => {
          const m = GAME_META[id];
          const isSelected = selected === id;
          return (
            <button
              key={id}
              type="button"
              disabled={!tappable}
              aria-pressed={isSelected}
              aria-label={`${ko.games[id]} ${gameShortLabel(id)}`}
              onClick={() => tappable && onSelect(id)}
              className={clsx(
                'relative rounded-2xl border-[1.5px] px-3 py-3 text-left transition-all',
                isSelected
                  ? 'col-span-2 border-amber-500/70 bg-amber-500/10 shadow-[0_0_0_1px_rgba(251,191,36,0.15),0_8px_24px_-12px_rgba(251,191,36,0.5)]'
                  : 'border-white/10 bg-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]',
              )}
            >
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 shrink-0 text-2xl leading-none">{m.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div
                    className={clsx(
                      'truncate text-[15px] font-bold',
                      isSelected ? 'text-amber-200' : 'text-zinc-100',
                    )}
                  >
                    {ko.games[id]}
                  </div>
                  <div
                    className={clsx(
                      'mt-0.5 truncate text-[12px]',
                      isSelected ? 'text-amber-200/70' : 'text-zinc-500',
                    )}
                  >
                    {ko.games.secEstimate(m.estimatedSeconds)} · {gameCategoryLabel(id)}
                  </div>
                </div>
                {isSelected && m.needsPreCharge && (
                  <span className="shrink-0 rounded-md bg-amber-400/20 px-1.5 py-0.5 text-[11px] font-bold text-amber-200">
                    {ko.charge.badge}
                  </span>
                )}
              </div>

              {/* 규칙은 고른 뒤에만 필요한 정보 — 선택된 카드 안에서만 펼친다. */}
              {isSelected && (
                <div className="mt-3 border-t border-amber-500/20 pt-3">
                  <p className="mb-2 text-[13px] font-semibold text-amber-100/90">
                    {ko.gameDesc[id]}
                  </p>
                  <GameIntro gameId={id} bare />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* 준비 중 게임은 각주로 — 점선 카드가 목록 흐름을 끊을 만큼 중요하지 않다. */}
      {disabledIds.length > 0 && (
        <p className="px-1 text-[12px] text-zinc-600">
          <span aria-hidden className="mr-1.5">
            {disabledIds.map((id) => GAME_META[id].emoji).join(' ')}
          </span>
          {ko.lobby.moreGamesComingSoon}
        </p>
      )}
    </div>
  );
}

function Chip({
  active,
  onTap,
  children,
}: {
  active: boolean;
  onTap: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onTap}
      aria-pressed={active}
      className={clsx(
        'shrink-0 rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors',
        active
          ? 'border-white/25 bg-white/[0.12] text-zinc-100'
          : 'border-white/10 bg-transparent text-zinc-500',
      )}
    >
      {children}
    </button>
  );
}
