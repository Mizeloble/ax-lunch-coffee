import { simulateRace } from '../src/games/marble/sim';

const players = ['철수', '영희', '민수', '지영', '동현', '수현'].map((name, i) => ({
  playerToken: `t${i}`,
  nickname: name,
}));

(async () => {
  console.log('Loading box2d-wasm and simulating...');
  const t0 = Date.now();
  const sim = await simulateRace(0xC0FFEE, players);
  const elapsed = Date.now() - t0;

  console.log(`Sim took ${elapsed}ms wall time`);
  console.log('FPS:', sim.fps, 'Duration:', sim.durationMs, 'ms');
  console.log('Frames:', sim.frames.length);
  console.log('Goal Y:', sim.goalY, 'Bounds:', sim.bounds);
  console.log('Static entities:', sim.entities.length);
  const kinematic = sim.entities.filter((e) => e.isKinematic);
  console.log('Kinematic (rotors):', kinematic.length, kinematic.map((k) => `(${k.x.toFixed(1)},${k.y.toFixed(1)} ω=${k.angularVelocity})`).slice(0, 4));

  console.log('Finish order:', sim.finishOrder);
  console.log('');
  console.log('Sample frames (every 1s):');
  for (let i = 0; i < sim.frames.length; i += sim.fps) {
    const f = sim.frames[i];
    const ys = [];
    for (let j = 1; j < f.length; j += 2) ys.push(f[j].toFixed(1));
    console.log(`  t=${(i / sim.fps).toFixed(1)}s  y=[${ys.join(', ')}]`);
  }

  // Per-player finish time
  console.log('');
  console.log('Finish times:');
  for (const tok of sim.finishOrder) {
    const idx = sim.playerOrder.indexOf(tok);
    let f = 0;
    for (; f < sim.frames.length; f++) if (sim.frames[f][idx * 2 + 1] >= sim.goalY) break;
    console.log(`  ${players[idx].nickname}: ${(f / sim.fps).toFixed(1)}s`);
  }

  // Estimate JSON payload size
  const jsonSize = JSON.stringify(sim).length;
  console.log('');
  console.log('Replay JSON size:', (jsonSize / 1024).toFixed(1), 'KB');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
