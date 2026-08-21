import { describe, it, expect } from "vitest";
import { Vector2 } from "../math/Vector2.ts";
import type { EntityBase } from "./Entity.ts";
import {
  type GameState,
  addEntities,
  removeEntities,
  byKind,
  findById,
  withGlobals,
} from "./GameState.ts";

interface Globals {
  score: number;
}
// Union discriminée, comme le fera le jeu — permet à byKind de narrower.
type E = (EntityBase & { kind: "a" }) | (EntityBase & { kind: "b" });

function ent<K extends "a" | "b">(id: number, kind: K): EntityBase & { kind: K } {
  return { id, kind, position: Vector2.ZERO, velocity: Vector2.ZERO, radius: 1 };
}

function state(entities: E[]): GameState<E, Globals> {
  return { entities, globals: { score: 0 }, time: 0 };
}

describe("GameState helpers (immuables)", () => {
  it("addEntities ne mute pas l'état d'origine", () => {
    const s = state([ent(1, "a")]);
    const s2 = addEntities(s, [ent(2, "b")]);
    expect(s.entities).toHaveLength(1);
    expect(s2.entities).toHaveLength(2);
    expect(s2).not.toBe(s);
  });

  it("removeEntities filtre par id sans muter", () => {
    const s = state([ent(1, "a"), ent(2, "b"), ent(3, "a")]);
    const s2 = removeEntities(s, new Set([2]));
    expect(s.entities).toHaveLength(3);
    expect(s2.entities.map((e) => e.id)).toEqual([1, 3]);
  });

  it("addEntities/removeEntities vides renvoient le même objet", () => {
    const s = state([ent(1, "a")]);
    expect(addEntities(s, [])).toBe(s);
    expect(removeEntities(s, new Set())).toBe(s);
  });

  it("byKind filtre par discriminant", () => {
    const s = state([ent(1, "a"), ent(2, "b"), ent(3, "a")]);
    expect(byKind(s, "a").map((e) => e.id)).toEqual([1, 3]);
  });

  it("findById", () => {
    const s = state([ent(1, "a"), ent(2, "b")]);
    expect(findById(s, 2)?.kind).toBe("b");
    expect(findById(s, 9)).toBeUndefined();
  });

  it("withGlobals remplace sans muter", () => {
    const s = state([]);
    const s2 = withGlobals(s, { score: 42 });
    expect(s.globals.score).toBe(0);
    expect(s2.globals.score).toBe(42);
  });
});
