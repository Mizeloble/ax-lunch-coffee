'use client';

import { GAME_META, type GameId } from '@/games/types';
import clsx from 'clsx';
import { ko } from '@/lib/i18n';

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
  return (
    <div className="grid grid-cols-2 gap-2">
      {ids.map((id) => {
        const m = GAME_META[id];
        const isSelected = selected === id;
        const enabled = m.enabled && !disabled;
        return (
          <button
            key={id}
            type="button"
            disabled={!enabled}
            onClick={() => enabled && onSelect(id)}
            className={clsx(
              'relative rounded-2xl px-3 py-4 text-left transition-all border',
              isSelected
                ? 'bg-amber-400 text-zinc-900 border-amber-400'
                : 'bg-zinc-800 text-zinc-200 border-zinc-700',
              !enabled && 'opacity-40',
            )}
          >
            <div className="text-2xl">{m.emoji}</div>
            <div className={clsx('font-bold mt-1', isSelected ? '' : 'text-zinc-100')}>{m.label}</div>
            <div className={clsx('text-[11px] mt-0.5', isSelected ? 'text-zinc-800' : 'text-zinc-400')}>
              {m.enabled ? `~${m.estimatedSeconds}초` : ko.lobby.comingSoon}
            </div>
          </button>
        );
      })}
    </div>
  );
}
