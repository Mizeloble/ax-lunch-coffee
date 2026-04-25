import type { ReplayPayload } from '../../server/rooms';
import type { ComputeResultInput, GameServerModule } from '../types';
import { simulateRace, type SimulationResult } from './sim';

export type MarbleReplayData = SimulationResult;

export const marbleServer: GameServerModule = {
  // Note: simulation is async (box2d-wasm load), so this returns a Promise.
  // computeResult signature in types.ts is synchronous — but the call site already awaits it
  // through the new game-runner. See `src/server/game-runner.ts`.
  async computeResult(input: ComputeResultInput): Promise<ReplayPayload> {
    const sim = await simulateRace(input.seed, input.players);
    const losers = sim.finishOrder.slice(-input.loserCount);
    return {
      durationMs: sim.durationMs,
      ranking: sim.finishOrder,
      losers,
      data: sim,
    };
  },
} as unknown as GameServerModule;
