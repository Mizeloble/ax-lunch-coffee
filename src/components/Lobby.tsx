'use client';

import { useState } from 'react';
import { ko } from '@/lib/i18n';
import { useRoomStore } from '@/store/room-store';
import { GamePicker } from './GamePicker';
import { InviteSheet } from './InviteSheet';
import { QRCode } from './QRCode';
import { getSocket } from '@/lib/socket-client';
import type { GameId } from '@/games/types';
import clsx from 'clsx';

export function Lobby({ inviteUrl, onChangeNickname }: { inviteUrl: string; onChangeNickname: () => void }) {
  const state = useRoomStore((s) => s.state);
  const isHost = useRoomStore((s) => s.isHost);
  const myToken = useRoomStore((s) => s.myToken);
  const [showInvite, setShowInvite] = useState(false);
  const [manualValue, setManualValue] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualBusy, setManualBusy] = useState(false);

  if (!state) return null;

  const me = state.players.find((p) => p.playerToken === myToken);
  const connectedCount = state.players.filter((p) => p.connected).length;
  const canStart = isHost && connectedCount >= 2;
  const canManageRoster = isHost && (state.status === 'lobby' || state.status === 'result');

  function setLoserCount(c: number) {
    getSocket().emit('setLoserCount', { count: c });
  }
  function setGameId(id: GameId) {
    getSocket().emit('setGameId', { gameId: id });
  }
  function start() {
    getSocket().emit('start');
  }

  function submitManualAdd() {
    const trimmed = manualValue.trim();
    if (trimmed.length < 1 || trimmed.length > 10) {
      setManualError(ko.lobby.addManualErrors.badNick);
      return;
    }
    setManualBusy(true);
    setManualError(null);
    type AddAck = { ok: true; playerToken: string } | { ok: false; code: string; message: string };
    getSocket().emit('host:addPlayer', { nickname: trimmed }, (res: AddAck) => {
      setManualBusy(false);
      if (res.ok) {
        setManualValue('');
        return;
      }
      const errs = ko.lobby.addManualErrors;
      const msg =
        res.code === 'DUP_NICK' ? errs.duplicate
        : res.code === 'FULL' ? errs.full
        : res.code === 'BAD_NICK' ? errs.badNick
        : res.code === 'BAD_STATE' ? errs.badState
        : errs.generic;
      setManualError(msg);
    });
  }

  function removeManual(playerToken: string) {
    getSocket().emit('host:removePlayer', { playerToken });
  }

  return (
    <main className="min-h-dvh flex flex-col">
      {/* top bar */}
      <header className="px-4 pt-4 pb-2 flex items-center justify-between">
        <div className="text-sm">
          <div className="font-bold text-base">{ko.app.title}</div>
          <div className="text-zinc-500 text-xs">방 {state.id}</div>
        </div>
        <button
          type="button"
          onClick={() => setShowInvite(true)}
          className="rounded-full bg-zinc-800 text-zinc-100 px-3 py-2 text-sm font-medium active:scale-[0.98]"
        >
          📤 {ko.lobby.invite}
        </button>
      </header>

      {/* nickname badge */}
      {me && (
        <div className="px-4 pt-1 text-xs text-zinc-400 flex items-center gap-2">
          <span>{ko.lobby.nicknameBadge(me.nickname)}</span>
          <button type="button" onClick={onChangeNickname} className="text-amber-400 underline-offset-2 hover:underline">
            [{ko.lobby.changeNickname}]
          </button>
        </div>
      )}

      <section className="px-4 mt-4 space-y-5 flex-1 overflow-auto pb-32">
        {/* host: QR; guest: smaller mini QR + waiting message */}
        {isHost ? (
          <div className="flex flex-col items-center gap-2 mt-2">
            <QRCode value={inviteUrl} size={224} />
            <p className="text-xs text-zinc-400">옆자리 동료가 카메라로 찍으면 입장</p>
          </div>
        ) : (
          <div className="rounded-2xl bg-zinc-900 px-4 py-3 text-sm text-zinc-300">
            호스트가 게임을 고르는 중이에요. 같이 기다려요.
          </div>
        )}

        {/* players list */}
        <div>
          <div className="text-xs text-zinc-400 mb-2">
            참가자 {connectedCount}명 {state.players.some((p) => !p.connected) && '(일부 재접속 대기)'}
          </div>

          {canManageRoster && (
            <div className="mb-3">
              <div className="flex gap-2">
                <input
                  inputMode="text"
                  maxLength={10}
                  value={manualValue}
                  onChange={(e) => {
                    setManualValue(e.target.value);
                    if (manualError) setManualError(null);
                  }}
                  placeholder={ko.lobby.addManualPlaceholder}
                  aria-label={ko.lobby.addManualTitle}
                  className="flex-1 min-w-0 px-3 py-3 rounded-xl bg-zinc-800 border border-zinc-700 text-sm focus:outline-none focus:border-amber-400"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !manualBusy) submitManualAdd();
                  }}
                />
                <button
                  type="button"
                  disabled={manualBusy || manualValue.trim().length === 0}
                  onClick={submitManualAdd}
                  className="px-4 py-3 rounded-xl bg-zinc-700 text-zinc-100 text-sm font-bold disabled:opacity-50 active:scale-[0.98]"
                >
                  {ko.lobby.addManualSubmit}
                </button>
              </div>
              <p className="mt-1.5 text-[11px] text-zinc-500">{ko.lobby.addManualHint}</p>
              {manualError && <p className="mt-1 text-xs text-rose-400">{manualError}</p>}
            </div>
          )}

          <ul className="grid grid-cols-2 gap-2">
            {state.players.map((p) => {
              const showRemove = canManageRoster && p.manual && p.playerToken !== myToken;
              return (
                <li
                  key={p.playerToken}
                  className={clsx(
                    'rounded-xl px-3 py-2 text-sm flex items-center gap-2 border',
                    p.connected ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-900/40 border-zinc-800/50 opacity-60',
                  )}
                >
                  <span
                    aria-hidden
                    className="inline-block w-3 h-3 rounded-full shrink-0"
                    style={{ background: p.color }}
                  />
                  <span className="truncate">{p.nickname}</span>
                  {p.playerToken === myToken && <span className="ml-auto text-[10px] text-amber-400">나</span>}
                  {showRemove && (
                    <button
                      type="button"
                      onClick={() => removeManual(p.playerToken)}
                      aria-label={ko.lobby.removeManualAria(p.nickname)}
                      className="ml-auto -mr-1 w-7 h-7 rounded-full text-zinc-400 hover:text-rose-300 active:text-rose-400 active:scale-95 flex items-center justify-center text-base leading-none"
                    >
                      ×
                    </button>
                  )}
                </li>
              );
            })}
            {state.players.length === 0 && (
              <li className="col-span-2 text-zinc-500 text-sm">{ko.lobby.waiting}…</li>
            )}
          </ul>
        </div>

        {/* host controls */}
        {isHost && (
          <>
            <div>
              <div className="text-xs text-zinc-400 mb-2">{ko.lobby.chooseGame}</div>
              <GamePicker selected={state.gameId} onSelect={setGameId} />
            </div>

            <div>
              <div className="text-xs text-zinc-400 mb-2">{ko.lobby.loserCount}</div>
              <div className="flex gap-2">
                {[1, 2, 3].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setLoserCount(n)}
                    className={clsx(
                      'flex-1 py-3 rounded-xl font-bold border',
                      state.loserCount === n
                        ? 'bg-amber-400 text-zinc-900 border-amber-400'
                        : 'bg-zinc-800 text-zinc-200 border-zinc-700',
                    )}
                  >
                    {n}명
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </section>

      {/* sticky bottom CTA (host only) */}
      {isHost && (
        <div className="fixed bottom-0 left-0 right-0 px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-3 bg-gradient-to-t from-[#0b0b10] to-transparent">
          <button
            type="button"
            disabled={!canStart}
            onClick={start}
            className="w-full py-4 rounded-2xl bg-amber-400 text-zinc-900 font-bold text-lg disabled:opacity-50 active:scale-[0.98]"
          >
            {canStart ? ko.lobby.start : ko.lobby.needMorePlayers}
          </button>
        </div>
      )}

      {showInvite && <InviteSheet url={inviteUrl} onClose={() => setShowInvite(false)} />}
    </main>
  );
}
