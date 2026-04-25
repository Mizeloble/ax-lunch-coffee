// Ported from https://github.com/lazygyu/roulette/blob/main/src/physics-box2d.ts
// (MIT, © 2023 LazyGyu). Modified: every Math.random() call replaced with an
// injected seeded RNG so the sim is deterministic given the same seed.
import Box2DFactory from 'box2d-wasm';
import type { StageDef } from './maps';
import type { MapEntity, MapEntityState } from './MapEntity';

export type Rng = () => number; // returns [0,1)

// Cache the WASM bytes across simulations so we don't reload from disk every game.
let cachedWasmBinary: Uint8Array | null = null;
async function loadWasmBinary(): Promise<Uint8Array> {
  if (cachedWasmBinary) return cachedWasmBinary;
  const fs = await import('node:fs/promises');
  const mod = (await import('node:module')) as unknown as { createRequire: (p: string) => NodeRequire };
  const path = await import('node:path');
  const req = mod.createRequire(path.join(process.cwd(), 'package.json'));
  const pkgPath: string = req.resolve('box2d-wasm/dist/umd/Box2D.simd.js');
  const wasmPath = path.join(path.dirname(pkgPath), 'Box2D.simd.wasm');
  cachedWasmBinary = await fs.readFile(wasmPath);
  return cachedWasmBinary;
}

export class Box2dPhysics {
  private rng: Rng;
  private Box2D!: Awaited<ReturnType<typeof Box2DFactory>>;
  private gravity!: Box2D.b2Vec2;
  private world!: Box2D.b2World;

  private marbleMap: { [id: number]: Box2D.b2Body } = {};
  private entities: ({ body: Box2D.b2Body } & MapEntityState)[] = [];

  private deleteCandidates: Box2D.b2Body[] = [];

  constructor(rng: Rng) {
    this.rng = rng;
  }

  async init(): Promise<void> {
    if (typeof window === 'undefined') {
      // Node: feed the WASM binary directly because the bundled loader uses fetch()
      const wasmBinary = await loadWasmBinary();
      // box2d-wasm types are a bit lax; the option is supported by the underlying Emscripten module
      this.Box2D = await Box2DFactory({ wasmBinary } as unknown as Parameters<typeof Box2DFactory>[0]);
    } else {
      this.Box2D = await Box2DFactory();
    }
    this.gravity = new this.Box2D.b2Vec2(0, 10);
    this.world = new this.Box2D.b2World(this.gravity);
  }

  clear(): void {
    this.clearEntities();
  }

  clearMarbles(): void {
    Object.values(this.marbleMap).forEach((body) => {
      this.world.DestroyBody(body);
    });
    this.marbleMap = {};
  }

  createStage(stage: StageDef): void {
    this.createEntities(stage.entities);
  }

  createEntities(entities?: MapEntity[]) {
    if (!entities) return;
    const bodyTypes = {
      static: this.Box2D.b2_staticBody,
      kinematic: this.Box2D.b2_kinematicBody,
    } as const;

    entities.forEach((entity) => {
      const bodyDef = new this.Box2D.b2BodyDef();
      bodyDef.set_type(bodyTypes[entity.type]);
      const body = this.world.CreateBody(bodyDef);

      const fixtureDef = new this.Box2D.b2FixtureDef();
      fixtureDef.set_density(entity.props.density);
      fixtureDef.set_restitution(entity.props.restitution);

      let shape;
      switch (entity.shape.type) {
        case 'box':
          shape = new this.Box2D.b2PolygonShape();
          shape.SetAsBox(entity.shape.width, entity.shape.height, undefined as unknown as Box2D.b2Vec2, entity.shape.rotation);
          fixtureDef.set_shape(shape);
          body.CreateFixture(fixtureDef);
          break;
        case 'polyline':
          for (let i = 0; i < entity.shape.points.length - 1; i++) {
            const p1 = entity.shape.points[i];
            const p2 = entity.shape.points[i + 1];
            const v1 = new this.Box2D.b2Vec2(p1[0], p1[1]);
            const v2 = new this.Box2D.b2Vec2(p2[0], p2[1]);
            const edge = new this.Box2D.b2EdgeShape();
            edge.SetTwoSided(v1, v2);
            body.CreateFixture(edge, 1);
          }
          break;
        case 'circle':
          shape = new this.Box2D.b2CircleShape();
          shape.set_m_radius(entity.shape.radius);
          fixtureDef.set_shape(shape);
          body.CreateFixture(fixtureDef);
          break;
      }

      body.SetAngularVelocity(entity.props.angularVelocity);
      body.SetTransform(new this.Box2D.b2Vec2(entity.position.x, entity.position.y), 0);
      this.entities.push({
        body,
        x: entity.position.x,
        y: entity.position.y,
        angle: 0,
        shape: entity.shape,
        life: entity.props.life ?? -1,
      });
    });
  }

  clearEntities() {
    this.entities.forEach((entity) => {
      this.world.DestroyBody(entity.body);
    });
    this.entities = [];
  }

  createMarble(id: number, x: number, y: number): void {
    const circleShape = new this.Box2D.b2CircleShape();
    circleShape.set_m_radius(0.25);

    const bodyDef = new this.Box2D.b2BodyDef();
    bodyDef.set_type(this.Box2D.b2_dynamicBody);
    bodyDef.set_position(new this.Box2D.b2Vec2(x, y));

    const body = this.world.CreateBody(bodyDef);
    // Seeded RNG instead of Math.random() so density (and therefore the result) is reproducible.
    body.CreateFixture(circleShape, 1 + this.rng());
    body.SetAwake(false);
    body.SetEnabled(false);
    this.marbleMap[id] = body;
  }

  shakeMarble(id: number): void {
    const body = this.marbleMap[id];
    if (body) {
      body.ApplyLinearImpulseToCenter(
        new this.Box2D.b2Vec2(this.rng() * 10 - 5, this.rng() * 10 - 5),
        true,
      );
    }
  }

  hasMarble(id: number): boolean {
    return id in this.marbleMap;
  }

  removeMarble(id: number): void {
    const marble = this.marbleMap[id];
    if (marble) {
      this.world.DestroyBody(marble);
      delete this.marbleMap[id];
    }
  }

  getMarblePosition(id: number): { x: number; y: number; angle: number } {
    const marble = this.marbleMap[id];
    if (marble) {
      const pos = marble.GetPosition();
      return { x: pos.x, y: pos.y, angle: marble.GetAngle() };
    }
    return { x: 0, y: 0, angle: 0 };
  }

  getEntities(): MapEntityState[] {
    return this.entities.map((entity) => ({
      ...entity,
      angle: entity.body.GetAngle(),
    }));
  }

  start(): void {
    for (const key in this.marbleMap) {
      const marble = this.marbleMap[key];
      marble.SetAwake(true);
      marble.SetEnabled(true);
    }
  }

  step(deltaSeconds: number): void {
    this.deleteCandidates.forEach((body) => {
      this.world.DestroyBody(body);
    });
    this.deleteCandidates = [];

    this.world.Step(deltaSeconds, 6, 2);

    for (let i = this.entities.length - 1; i >= 0; i--) {
      const entity = this.entities[i];
      if (entity.life > 0) {
        const edge = entity.body.GetContactList();
        if (edge.contact?.IsTouching()) {
          this.deleteCandidates.push(entity.body);
          this.entities.splice(i, 1);
        }
      }
    }
  }
}
