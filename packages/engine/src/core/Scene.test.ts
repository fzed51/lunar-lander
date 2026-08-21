import { describe, it, expect, vi } from "vitest";
import { Vector2 } from "../math/Vector2.ts";
import type { EntityBase, Steppable } from "./Entity.ts";
import type { GameState } from "./GameState.ts";
import { addEntities, removeEntities } from "./GameState.ts";
import type { InputSnapshot } from "../input/InputSnapshot.ts";
import type { InputSource } from "../input/InputSource.ts";
import { Scene } from "./Scene.ts";

type Cmd = "go";

// Entités factices : un « mover » qui avance, une « cible » immobile.
class Mover implements EntityBase, Steppable<Ent, Cmd> {
  readonly kind = "mover" as const;
  constructor(
    readonly id: number,
    readonly position: Vector2,
    readonly velocity: Vector2,
    readonly radius = 1,
  ) {}
  step(dt: number): Ent {
    return new Mover(this.id, this.position.add(this.velocity.scale(dt)), this.velocity, this.radius);
  }
}
class Target implements EntityBase, Steppable<Ent, Cmd> {
  readonly kind = "target" as const;
  readonly velocity = Vector2.ZERO;
  constructor(
    readonly id: number,
    readonly position: Vector2,
    readonly radius = 1,
  ) {}
  step(): Ent {
    return this;
  }
}
type Ent = Mover | Target;
type Ev = { type: "hit"; targetId: number };
interface G {
  hits: number;
}

const noInput: InputSource<Cmd> = {
  poll: (): InputSnapshot<Cmd> => ({ isActive: () => false, justPressed: () => false }),
};

function state(entities: Ent[]): GameState<Ent, G> {
  return { entities, globals: { hits: 0 }, time: 0 };
}

describe("Scene.tick — phases", () => {
  it("phase move : les entités avancent et le temps progresse", () => {
    const scene = new Scene<Ent, Ev, G, Cmd>({ input: noInput });
    const s0 = state([new Mover(1, Vector2.ZERO, new Vector2(10, 0))]);
    const s1 = scene.tick(s0, 0.5);
    expect(s1.entities[0]!.position.x).toBeCloseTo(5);
    expect(s1.time).toBeCloseTo(0.5);
    // immuable : l'état d'origine inchangé
    expect(s0.entities[0]!.position.x).toBe(0);
  });

  it("interact → événement → reducer (état final)", () => {
    const scene = new Scene<Ent, Ev, G, Cmd>({ input: noInput })
      .onPair("mover", "target", (_m, t) => [{ type: "hit", targetId: t.id }])
      .on("hit", (s, ev) => ({
        ...removeEntities(s, new Set([ev.targetId])),
        globals: { hits: s.globals.hits + 1 },
      }));
    const s0 = state([
      new Mover(1, Vector2.ZERO, Vector2.ZERO),
      new Target(2, Vector2.ZERO),
    ]);
    const s1 = scene.tick(s0, 0.016);
    expect(s1.globals.hits).toBe(1);
    expect(s1.entities.map((e) => e.id)).toEqual([1]);
  });

  it("onPair normalise l'ordre (target,mover trouvé aussi)", () => {
    const seen: string[] = [];
    const scene = new Scene<Ent, Ev, G, Cmd>({ input: noInput }).onPair(
      "mover",
      "target",
      (m, t) => {
        seen.push(`${m.kind}:${t.kind}`);
        return [];
      },
    );
    // ordre inverse dans le tableau d'entités
    scene.tick(state([new Target(2, Vector2.ZERO), new Mover(1, Vector2.ZERO, Vector2.ZERO)]), 0.016);
    expect(seen).toEqual(["mover:target"]);
  });

  it("onTick émet des événements chaque tick", () => {
    const scene = new Scene<Ent, Ev, G, Cmd>({ input: noInput })
      .onTick(() => [{ type: "hit", targetId: 0 }])
      .on("hit", (s) => ({ ...s, globals: { hits: s.globals.hits + 1 } }));
    const s1 = scene.tick(state([]), 0.016);
    expect(s1.globals.hits).toBe(1);
  });

  it("addEffect est appelé après l'état final avec tous les événements", () => {
    const effect = vi.fn();
    const scene = new Scene<Ent, Ev, G, Cmd>({ input: noInput })
      .onTick(() => [{ type: "hit", targetId: 7 }])
      .addEffect(effect);
    scene.tick(state([]), 0.016);
    expect(effect).toHaveBeenCalledOnce();
    expect(effect.mock.calls[0]![0]).toEqual([{ type: "hit", targetId: 7 }]);
  });

  it("reducer idempotent : 2 événements sur la même cible → une seule fois", () => {
    const scene = new Scene<Ent, Ev, G, Cmd>({ input: noInput })
      .onTick(() => [
        { type: "hit", targetId: 2 },
        { type: "hit", targetId: 2 },
      ])
      .on("hit", (s, ev) => {
        // garde d'idempotence : no-op si la cible n'existe plus
        if (!s.entities.some((e) => e.id === ev.targetId)) return s;
        return {
          ...removeEntities(s, new Set([ev.targetId])),
          globals: { hits: s.globals.hits + 1 },
        };
      });
    const s1 = scene.tick(state([new Target(2, Vector2.ZERO)]), 0.016);
    expect(s1.globals.hits).toBe(1);
  });

  it("un handler de paint peut spawner via addEntities", () => {
    const scene = new Scene<Ent, Ev, G, Cmd>({ input: noInput })
      .onTick(() => [{ type: "hit", targetId: 0 }])
      .on("hit", (s) => addEntities(s, [new Target(99, Vector2.ZERO)]));
    const s1 = scene.tick(state([]), 0.016);
    expect(s1.entities.map((e) => e.id)).toEqual([99]);
  });
});
