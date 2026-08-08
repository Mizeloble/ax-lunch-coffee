import { clearCharge, getRoom, publicRoomState, touch, type RoomState } from '../rooms';
import { GAME } from '../../lib/constants';
import { runRound } from './standard';
import type { IO } from './shared';

/**
 * Pre-game tap-charging phase used by games with `needsPreCharge` (currently
 * marble-cheer). Broadcasts an aggregate `charge:state` every CHARGE_TICK_MS so
 * clients can render gauges, then runs the round with chargeRatios derived from
 * each player's tap total. Manual (no-phone) players default to a neutral 50%.
 */
export function startChargingPhase(io: IO, room: RoomState) {
  const endsAt = Date.now() + GAME.CHARGE_MS;
  room.status = 'charging';

  const tickTimer = setInterval(() => {
    if (!room.charge) return;
    const totals: Record<string, number> = {};
    for (const [token, count] of room.charge.counts) totals[token] = count;
    io.to(room.id).emit('charge:state', { totals, cap: GAME.CHARGE_TAP_CAP });
  }, GAME.CHARGE_TICK_MS);

  const finishTimer = setTimeout(async () => {
    // Clear on the way out too: every path that leaves `charging` already calls
    // `clearCharge`, so this is unreachable today — but if it ever isn't, the
    // 250ms tick interval would run for the life of the process against a dead
    // room, with `charge:tick` still accepting input.
    if (!getRoom(room.id) || room.status !== 'charging') {
      clearCharge(room);
      return;
    }

    const counts = room.charge?.counts ?? new Map<string, number>();
    clearCharge(room);

    const chargeRatios: Record<string, number> = {};
    for (const p of room.players.values()) {
      if (p.manual) {
        chargeRatios[p.playerToken] = GAME.CHARGE_MANUAL_DEFAULT;
      } else {
        const c = counts.get(p.playerToken) ?? 0;
        chargeRatios[p.playerToken] = Math.min(c, GAME.CHARGE_TAP_CAP) / GAME.CHARGE_TAP_CAP;
      }
    }

    // The `start` handler wraps its round runners in try/catch precisely so a
    // throw can't leave the room stuck half-started — but this call runs from a
    // timer, long outside that scope. Repeat the guard here or marble-cheer is
    // the one game where a failed round strands everyone on the countdown.
    try {
      await runRound(io, room, chargeRatios);
    } catch (err) {
      console.error('charge → runRound failed', room.id, err);
      if (getRoom(room.id)) {
        room.status = 'lobby';
        io.to(room.id).emit('state', publicRoomState(room));
      }
    }
    // Totals freeze a beat *after* the countdown ends so the clients' final
    // cumulative flush — always in flight at endsAt — still counts. `charge:tick`
    // itself needs no deadline check: it only requires `room.charge`, which this
    // timer is what clears. Tapping stops at endsAt client-side (the button
    // disables), so the extra window admits packets, not extra taps.
  }, GAME.CHARGE_MS + GAME.CHARGE_TAIL_MS);

  room.charge = { endsAt, counts: new Map(), tickTimer, finishTimer };
  touch(room);
  io.to(room.id).emit('state', publicRoomState(room));
  io.to(room.id).emit('charge:start', { endsAt });
  // Send an immediate empty state so clients render gauges from t=0 without a 250ms gap.
  io.to(room.id).emit('charge:state', { totals: {}, cap: GAME.CHARGE_TAP_CAP });
}
