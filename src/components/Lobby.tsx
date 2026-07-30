'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ko } from '@/lib/i18n';
import { ROOM } from '@/lib/constants';
import { GAME_META } from '@/games/types';
import { useRoomStore } from '@/store/room-store';
import { GamePicker } from './GamePicker';
import { GameIntro } from './GameIntro';
import { Logo } from './Logo';
import { InviteSheet } from './InviteSheet';
import { QRCode } from './QRCode';
import { useInviteActions } from './useInviteActions';
import { TiltPermissionGate } from '@/games/marble-tilt/TiltPermissionGate';
import { AdSlot } from './AdSlot';
import { getSocket } from '@/lib/socket-client';
import { isLiveGame, type GameId } from '@/games/types';
import clsx from 'clsx';

export function Lobby({ inviteUrl, onChangeNickname }: { inviteUrl: string; onChangeNickname: () => void }) {
  const state = useRoomStore((s) => s.state);
  const isHost = useRoomStore((s) => s.isHost);
  const myToken = useRoomStore((s) => s.myToken);
  const router = useRouter();
  const [showInvite, setShowInvite] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [manualValue, setManualValue] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualBusy, setManualBusy] = useState(false);
  // Show a one-off notice when host authority is handed to us (previous host left).
  // Initial host (host from the start) never sees it — only a false→true flip.
  const [promotedNotice, setPromotedNotice] = useState(false);
  const prevIsHost = useRef(isHost);
  useEffect(() => {
    if (isHost && !prevIsHost.current) {
      setPromotedNotice(true);
      const t = setTimeout(() => setPromotedNotice(false), 5000);
      prevIsHost.current = isHost;
      return () => clearTimeout(t);
    }
    prevIsHost.current = isHost;
  }, [isHost]);

  if (!state) return null;

  const me = state.players.find((p) => p.playerToken === myToken);
  const connectedCount = state.players.filter((p) => p.connected).length;
  const someOffline = state.players.some((p) => !p.connected);
  const canStart = isHost && connectedCount >= 2;
  const hostPlayer = state.players.find((p) => p.playerToken === state.hostPlayerToken);
  // 재접속 유예 안내는 실제로 끊긴 사람이 있을 때만 — 유예 시간은 서버 상수와 같은 출처.
  const offlinePlayer = state.players.find((p) => !p.connected);
  const reconnectGraceSec = Math.round(ROOM.RECONNECT_GRACE_MS / 1000);
  const canManageRoster = isHost && (state.status === 'lobby' || state.status === 'result');
  // 실제 폰으로 들어온 참가자(비-manual)가 호스트뿐이면 초대가 다음 행동 —
  // 인라인 QR 카드를 게임 선택보다 먼저 보여준다(랜딩 1단계 약속과 일치).
  // 친구가 한 명이라도 스캔해 들어오면 카드가 사라지고 우상단 초대 버튼만 남는다.
  const needsInvite = isHost && state.players.filter((p) => !p.manual).length < 2;

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
        setShowManual(false);
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
      {/* top bar — 방 코드가 주인공. 술자리에서 제일 자주 소리내어 묻는 값이라
          12px 모노에서 헤더 크기로 올렸다. 우측은 초대 버튼. */}
      <header className="px-4 pt-4 pb-2 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 flex items-center gap-2.5">
          <Logo size={30} className="shrink-0" />
          <div className="min-w-0">
            <div className="text-zinc-500 text-[12px] font-semibold flex items-center gap-1">
              <span>{ko.lobby.roomCodeLabel}</span>
              {isHost && (
                <>
                  <span aria-hidden>·</span>
                  <span>{ko.lobby.hostTag}</span>
                </>
              )}
            </div>
            <div className="font-mono text-[26px] font-extrabold tracking-[0.14em] text-amber-300 leading-tight">
              {state.id}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowInvite(true)}
          className="inline-flex items-center gap-1.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-100 px-3.5 py-2 text-[13px] font-semibold flex-shrink-0 whitespace-nowrap active:scale-[0.98]"
        >
          <svg width={14} height={14} viewBox="0 0 20 20" aria-hidden>
            <rect x={2} y={2} width={6} height={6} fill="currentColor" />
            <rect x={12} y={2} width={6} height={6} fill="currentColor" />
            <rect x={2} y={12} width={6} height={6} fill="currentColor" />
            <rect x={11} y={11} width={3} height={3} fill="currentColor" />
            <rect x={15} y={15} width={3} height={3} fill="currentColor" />
          </svg>
          {ko.lobby.inviteShort}
        </button>
      </header>

      {/* nickname + 내 연결 상태 — 서버는 이미 connected를 뿌리는데 UI엔 없었다. */}
      {me && (
        <div className="px-4 pt-1 text-[13px] text-zinc-400 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>{ko.lobby.nicknameBadge(me.nickname)}</span>
          <button
            type="button"
            onClick={onChangeNickname}
            className="text-amber-200 underline-offset-2 underline decoration-amber-200/40 hover:decoration-amber-200"
          >
            {ko.lobby.changeNickname}
          </button>
          <ConnectionChip connected={me.connected} />
        </div>
      )}

      <section className="px-4 mt-5 space-y-5 flex-1 overflow-auto pb-40">
        {promotedNotice && (
          <div
            role="status"
            className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-200"
          >
            {ko.lobby.becameHost}
          </div>
        )}
        {/* 혼자인 호스트: 초대 QR을 게임 선택보다 먼저 — 다음 행동을 화면이 알려준다 */}
        {needsInvite && <InviteCard url={inviteUrl} />}

        {/* 게스트는 "지금 뭘 기다리는지"가 첫 정보 — 폰을 계속 볼 필요가 없다고 말해준다. */}
        {!isHost && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] px-4 py-3.5">
            <div className="text-[13px] font-extrabold uppercase tracking-[0.12em] text-amber-300">
              {ko.lobby.guestHostTurn}
            </div>
            <p className="mt-1 text-[15px] font-bold text-zinc-100">
              {hostPlayer
                ? ko.lobby.guestHostPicking(hostPlayer.nickname)
                : ko.lobby.guestHostPickingNoName}
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-400">
              {ko.lobby.guestAutoAdvance}
            </p>
          </div>
        )}

        {/* participants — 호스트가 로비에서 계속 보는 건 "몇 명 들어왔나"다. 게임 목록보다 먼저. */}
        <div>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h2 className="text-[15px] font-bold text-zinc-100">
              {ko.lobby.rosterTitle}{' '}
              <span className="text-amber-300 tabular-nums">{connectedCount}</span>
            </h2>
            {someOffline && (
              <span className="text-[13px] text-zinc-500">{ko.lobby.rosterSomeOffline}</span>
            )}
          </div>

          <ul className="grid grid-cols-2 gap-2">
            {state.players.map((p) => {
              const showRemove = canManageRoster && p.manual && p.playerToken !== myToken;
              const isMe = p.playerToken === myToken;
              return (
                <li
                  key={p.playerToken}
                  className={clsx(
                    'rounded-xl px-3 py-2.5 text-[15px] flex items-center gap-2 border list-none',
                    p.connected
                      ? 'bg-zinc-900 border-zinc-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
                      : 'bg-zinc-900/40 border-dashed border-red-500/40',
                  )}
                >
                  <span
                    aria-hidden
                    className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: p.color, boxShadow: `0 0 0 2px ${p.color}33` }}
                  />
                  <span className={clsx('truncate flex-1 min-w-0', !p.connected && 'text-zinc-500')}>
                    {p.nickname}
                  </span>
                  {isMe && (
                    <span className="text-[11px] font-bold text-amber-200 bg-amber-200/10 px-1.5 py-0.5 rounded">
                      {ko.lobby.meBadge}
                    </span>
                  )}
                  {!p.connected && (
                    <span className="shrink-0 rounded bg-red-500/15 px-1.5 py-0.5 text-[11px] font-bold text-red-300">
                      {ko.lobby.disconnected}
                    </span>
                  )}
                  {showRemove && (
                    <button
                      type="button"
                      onClick={() => removeManual(p.playerToken)}
                      aria-label={ko.lobby.removeManualAria(p.nickname)}
                      className="-mr-1 w-7 h-7 rounded-full text-zinc-400 hover:text-rose-300 active:text-rose-400 active:scale-95 flex items-center justify-center text-base leading-none"
                    >
                      ×
                    </button>
                  )}
                </li>
              );
            })}

            {/* dashed inline "+ 폰 없는 사람" — host-only */}
            {canManageRoster && !showManual && (
              <li className="list-none">
                <button
                  type="button"
                  onClick={() => setShowManual(true)}
                  className="w-full h-full rounded-xl px-3 py-2.5 text-[13px] text-zinc-400 border border-dashed border-zinc-700 flex items-center justify-center gap-1.5 hover:text-zinc-200 hover:border-zinc-600 active:scale-[0.98]"
                >
                  + {ko.lobby.addManualShort}
                </button>
              </li>
            )}

            {state.players.length === 0 && !canManageRoster && (
              <li className="col-span-2 text-zinc-500 text-sm">{ko.lobby.waiting}…</li>
            )}
          </ul>

          {/* 끊긴 사람이 있으면 RECONNECT_GRACE_MS 유예를 문구로 — 목록에서 사라질까 봐 불안해진다. */}
          {offlinePlayer && (
            <p className="mt-2 text-[13px] leading-relaxed text-zinc-500">
              {ko.lobby.reconnectGrace(offlinePlayer.nickname, reconnectGraceSec)}
            </p>
          )}

          {/* manual-add input (host) — expanded form */}
          {canManageRoster && showManual && (
            <div className="mt-3">
              <div className="flex gap-2">
                <input
                  autoFocus
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
                    if (e.key === 'Escape') {
                      setShowManual(false);
                      setManualValue('');
                      setManualError(null);
                    }
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
                <button
                  type="button"
                  onClick={() => {
                    setShowManual(false);
                    setManualValue('');
                    setManualError(null);
                  }}
                  className="px-3 py-3 rounded-xl bg-transparent text-zinc-400 text-sm"
                  aria-label={ko.lobby.cancel}
                >
                  ×
                </button>
              </div>
              <p className="mt-1.5 text-xs text-zinc-500">{ko.lobby.addManualHint}</p>
              {manualError && <p className="mt-1 text-xs text-rose-400">{manualError}</p>}
            </div>
          )}
        </div>

        {/* 게임 선택 — 호스트만. 게스트는 규칙만 읽는다. */}
        {isHost ? (
          <>
            <div className="space-y-2.5">
              <h2 className="text-[15px] font-bold text-zinc-100">{ko.lobby.pickerTitle}</h2>
              <GamePicker selected={state.gameId} onSelect={setGameId} />
              {isLiveGame(state.gameId) && <TiltPermissionGate isHost />}
            </div>

            {/* 벌칙 인원은 게임보다 자주 바꾸는 값 — 시작 버튼 바로 위로. 선택 상태는
                빨강(=벌칙)이라 게임 선택(앰버)과 색으로 갈린다. */}
            <div className="space-y-2.5">
              <h2 className="text-[15px] font-bold text-zinc-100">{ko.lobby.loserCountTitle}</h2>
              <div className="flex gap-2">
                {[1, 2, 3].map((n) => {
                  const isSelected = state.loserCount === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setLoserCount(n)}
                      aria-pressed={isSelected}
                      className={clsx(
                        'flex-1 py-3.5 rounded-xl font-bold text-[15px] border-[1.5px] transition-all',
                        isSelected
                          ? 'border-red-500/70 bg-red-500/10 text-red-200 shadow-[0_8px_24px_-12px_rgba(239,68,68,0.5)]'
                          : 'border-white/10 bg-white/[0.04] text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]',
                      )}
                    >
                      {ko.lobby.loserCountUnit(n)}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <div className="space-y-2.5">
            <GameIntro gameId={state.gameId} />
            {isLiveGame(state.gameId) && <TiltPermissionGate isHost={false} />}
            <div className="flex items-center justify-center gap-2 pt-1 text-[13px] text-zinc-500">
              <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
              <span>{ko.lobby.guestWaitingStart}</span>
            </div>
          </div>
        )}

        {/* 대기 시간 광고 — 액션(시작 버튼·게스트 하단 버튼)에서 떨어뜨려 오탭을 막는다 */}
        <AdSlot placement="lobby" width={320} height={50} className="mt-2" />

        {/* 게스트 하단 액션 — 호스트의 스티키 CTA 자리를 대신한다. */}
        {!isHost && (
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowInvite(true)}
              className="rounded-xl border-[1.5px] border-zinc-800 py-3.5 text-[14px] font-semibold text-zinc-300 active:scale-[0.98]"
            >
              {ko.lobby.inviteFriendsShort}
            </button>
            <button
              type="button"
              onClick={() => router.push('/')}
              className="rounded-xl border-[1.5px] border-zinc-800 py-3.5 text-[14px] font-semibold text-zinc-400 active:scale-[0.98]"
            >
              {ko.lobby.leaveRoom}
            </button>
          </div>
        )}
      </section>

      {/* sticky bottom CTA (host only) — 버튼에 게임 이름, 아래 한 줄에 조건 요약 */}
      {isHost && (
        <div className="fixed bottom-0 left-0 right-0 px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-3 bg-gradient-to-t from-[#0b0b10] via-[#0b0b10]/95 to-transparent">
          <button type="button" disabled={!canStart} onClick={start} className="btn-primary">
            {canStart ? ko.lobby.startWithGame(ko.games[state.gameId]) : ko.lobby.needMorePlayers}
          </button>
          {canStart && (
            <p className="mt-1.5 text-center text-[13px] text-zinc-500">
              {ko.lobby.startSummary(
                connectedCount,
                GAME_META[state.gameId].estimatedSeconds,
                state.loserCount,
              )}
            </p>
          )}
        </div>
      )}

      {showInvite && <InviteSheet url={inviteUrl} onClose={() => setShowInvite(false)} />}
    </main>
  );
}

// 로비 인라인 초대 카드 — 흰 배경 패널에 QR(스캔 대비 확보) + 복사/공유.
// InviteSheet(모달)와 같은 액션 로직(useInviteActions) 공유.
function InviteCard({ url }: { url: string }) {
  const { copied, copy, share, shareSupported } = useInviteActions(url);
  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-4 flex flex-col items-center gap-3">
      <div className="text-sm font-bold text-amber-200">{ko.lobby.inviteFirstTitle}</div>
      <QRCode value={url} size={172} />
      <p className="text-xs text-zinc-400 text-center">{ko.lobby.inviteFirstHint}</p>
      <div className={clsx('w-full gap-2 pt-0.5', shareSupported ? 'grid grid-cols-2' : 'flex')}>
        <button
          type="button"
          onClick={copy}
          className="w-full py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-sm font-medium active:scale-[0.98]"
        >
          {copied ? ko.invite.copied : ko.lobby.copyLink}
        </button>
        {shareSupported && (
          <button
            type="button"
            onClick={share}
            className="py-2.5 rounded-xl bg-amber-400 text-zinc-900 text-sm font-bold active:scale-[0.98]"
          >
            {ko.lobby.share}
          </button>
        )}
      </div>
    </div>
  );
}

/** 내 연결 상태 한 눈에 — 서버의 `connected`가 진실이라 낙관적 표시를 하지 않는다. */
function ConnectionChip({ connected }: { connected: boolean }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-semibold',
        connected ? 'bg-emerald-400/10 text-emerald-300' : 'bg-red-500/15 text-red-300',
      )}
    >
      <span
        aria-hidden
        className={clsx(
          'h-1.5 w-1.5 rounded-full',
          connected ? 'bg-emerald-400' : 'bg-red-400 animate-pulse',
        )}
      />
      {connected ? ko.lobby.connected : ko.lobby.disconnected}
    </span>
  );
}
