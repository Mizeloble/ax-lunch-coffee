'use client';

import { useEffect, useMemo, useState } from 'react';
import { ko } from '@/lib/i18n';
import { getSocket } from '@/lib/socket-client';
import { loadIdentity, saveIdentity } from '@/lib/nickname-store';
import { useRoomStore, type GameStartPayload, type PublicRoomState, type ResultPayload } from '@/store/room-store';
import { Lobby } from '@/components/Lobby';
import { JoinModal } from '@/components/JoinModal';
import { Countdown } from '@/components/Countdown';
import { ResultScreen } from '@/components/ResultScreen';
import { MarbleRenderer } from '@/games/marble/Renderer';
import type { SimulationResult } from '@/games/marble/sim';

export default function RoomClient({
  roomId,
  forceJoin,
  fresh,
}: {
  roomId: string;
  forceJoin: boolean;
  /** Bypass stored identity — useful for testing with multiple browser windows that share localStorage */
  fresh: boolean;
}) {
  const setMe = useRoomStore((s) => s.setMe);
  const setState = useRoomStore((s) => s.setState);
  const setGameStart = useRoomStore((s) => s.setGameStart);
  const setResult = useRoomStore((s) => s.setResult);
  const state = useRoomStore((s) => s.state);
  const myToken = useRoomStore((s) => s.myToken);
  const gameStart = useRoomStore((s) => s.gameStart);

  const [phase, setPhase] = useState<'connecting' | 'need-nickname' | 'in-room' | 'error'>('connecting');
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [busyJoin, setBusyJoin] = useState(false);
  const [identityNickname, setIdentityNickname] = useState<string>('');
  // Gate the transition from race → result screen behind a tap, so the loser
  // banner / rank card animations have time to land.
  const [resultAcked, setResultAcked] = useState(false);
  // Replay-the-same-race state: when set, the renderer re-mounts with this startAt
  // instead of the original gameStart.startAt. Cleared when the user dismisses to
  // the result screen.
  const [replayStartAt, setReplayStartAt] = useState<number | null>(null);

  const inviteUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/r/${roomId}?join=1`;
  }, [roomId]);

  // Initial wiring: connect socket, listen, attempt join
  useEffect(() => {
    const socket = getSocket();

    const onState = (s: PublicRoomState) => setState(s);
    const onGameStart = (g: GameStartPayload) => setGameStart(g);
    const onResult = (r: ResultPayload) => setResult(r);
    const onErr = ({ message }: { code: string; message: string }) => {
      setErrMsg(message);
      setPhase('error');
    };

    socket.on('state', onState);
    socket.on('game:start', onGameStart);
    socket.on('game:result', onResult);
    socket.on('error', onErr);

    const identity = loadIdentity();
    setIdentityNickname(identity?.nickname ?? '');

    const hostToken = readHostToken(roomId);

    type JoinAck =
      | { ok: true; playerToken: string; isHost: boolean }
      | { ok: false; code: string; message: string };

    function attemptJoin(nickname: string, playerToken?: string) {
      setBusyJoin(true);
      setJoinError(null);
      socket.emit(
        'join',
        { roomId, nickname, playerToken, hostToken },
        (res: JoinAck) => {
          setBusyJoin(false);
          if (!res.ok) {
            setJoinError(res.message);
            // If duplicate or bad nickname, force the modal
            if (res.code === 'DUP_NICK' || res.code === 'BAD_NICK') {
              setPhase('need-nickname');
            } else if (res.code === 'NO_ROOM') {
              setErrMsg(ko.errors.roomNotFound);
              setPhase('error');
            } else if (res.code === 'IN_PROGRESS') {
              setErrMsg(ko.errors.raceInProgress);
              setPhase('error');
            } else {
              setErrMsg(res.message);
              setPhase('error');
            }
            return;
          }
          setMe(res.playerToken, res.isHost);
          saveIdentity(nickname, res.playerToken);
          setPhase('in-room');
        },
      );
    }

    if (fresh) {
      // Force a brand-new identity (testing with shared-localStorage incognito windows, or
      // a user who explicitly wants a different nickname for this room)
      setIdentityNickname('');
      setPhase('need-nickname');
    } else if (identity?.nickname && !forceJoin) {
      attemptJoin(identity.nickname, identity.playerToken);
    } else if (identity?.nickname && forceJoin) {
      // QR scan with stored nickname → still auto-join, no modal
      attemptJoin(identity.nickname, identity.playerToken);
    } else {
      setPhase('need-nickname');
    }

    // expose for the modal callback
    (window as unknown as { __attemptJoin?: typeof attemptJoin }).__attemptJoin = attemptJoin;

    return () => {
      socket.off('state', onState);
      socket.off('game:start', onGameStart);
      socket.off('game:result', onResult);
      socket.off('error', onErr);
      delete (window as unknown as { __attemptJoin?: unknown }).__attemptJoin;
    };
  }, [roomId, forceJoin, fresh, setMe, setState, setGameStart, setResult]);

  function submitNickname(nickname: string) {
    const fn = (window as unknown as { __attemptJoin?: (n: string, p?: string) => void }).__attemptJoin;
    if (fn) fn(nickname);
  }

  // Reset the tap-gate whenever a new game begins. Must run before any early
  // return so hook order stays stable across renders.
  useEffect(() => {
    setResultAcked(false);
    setReplayStartAt(null);
  }, [gameStart?.startAt]);

  if (phase === 'error') {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center px-6 text-center">
        <div className="text-3xl mb-3">😵</div>
        <h1 className="text-lg font-bold">{errMsg ?? '문제가 생겼어요'}</h1>
        <a href="/" className="mt-6 text-sm text-amber-400 underline-offset-2 hover:underline">
          처음으로
        </a>
      </main>
    );
  }

  if (phase === 'connecting' && !state) {
    return (
      <main className="min-h-dvh flex items-center justify-center text-zinc-400">
        연결 중…
      </main>
    );
  }

  // In-room rendering
  const effectiveStartAt = replayStartAt ?? gameStart?.startAt ?? 0;
  const showCountdown = !!gameStart && Date.now() < effectiveStartAt + 200;
  const inResult = state?.status === 'result';
  const replayPlayed = !!gameStart;
  // Keep the marble screen visible after the server flips to 'result' until the
  // user taps through. Players who joined late (no gameStart) skip straight to
  // the result screen since there's no replay to wait on.
  const showGame = replayPlayed && state?.status !== 'lobby' && (!inResult || !resultAcked);
  const showResult = inResult && (resultAcked || !replayPlayed);
  const showResultPrompt = inResult && replayPlayed && !resultAcked;

  function handleReplay() {
    setReplayStartAt(Date.now() + 1500);
    setResultAcked(false);
  }

  return (
    <>
      {state && (state.status === 'lobby' || (!showGame && !showResult)) && (
        <Lobby inviteUrl={inviteUrl} onChangeNickname={() => setPhase('need-nickname')} />
      )}

      {showGame && gameStart && gameStart.gameId === 'marble' && (
        <div className="fixed inset-0 z-20">
          <MarbleRenderer
            key={effectiveStartAt}
            startAt={effectiveStartAt}
            durationMs={gameStart.durationMs}
            replay={gameStart.replay as SimulationResult}
            players={gameStart.players}
            myPlayerToken={myToken}
          />
        </div>
      )}

      {showCountdown && gameStart && <Countdown startAt={effectiveStartAt} />}

      {showResult && <ResultScreen onReplay={handleReplay} />}

      {showResultPrompt && (
        <button
          type="button"
          onClick={() => setResultAcked(true)}
          className="fixed inset-x-0 bottom-6 z-30 mx-auto flex w-fit items-center gap-2 rounded-2xl bg-amber-400 px-8 py-4 text-base font-bold text-zinc-950 shadow-2xl shadow-amber-500/40 ring-1 ring-amber-300/60 transition active:scale-95 animate-pulse"
        >
          {ko.result.tapToContinue} →
        </button>
      )}

      {phase === 'need-nickname' && (
        <JoinModal
          defaultNickname={identityNickname}
          errorMessage={joinError}
          busy={busyJoin}
          onSubmit={submitNickname}
        />
      )}
    </>
  );
}

function readHostToken(roomId: string): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.sessionStorage.getItem(`coffee:host:${roomId}`) ?? undefined;
  } catch {
    return undefined;
  }
}
