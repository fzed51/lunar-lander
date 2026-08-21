import { describe, it, expect } from "vitest";
import { Vector2 } from "../math/Vector2.ts";
import type { EntityBase } from "../core/Entity.ts";
import {
  circlesOverlap,
  circlesOverlapToroidal,
  collisionPairs,
} from "./collision.ts";

function ent(id: number, x: number, y: number, radius: number): EntityBase {
  return { id, kind: "test", position: new Vector2(x, y), velocity: Vector2.ZERO, radius };
}

describe("collision cercle-cercle", () => {
  it("détecte le recouvrement euclidien", () => {
    expect(circlesOverlap(ent(1, 0, 0, 5), ent(2, 8, 0, 5))).toBe(true);
    expect(circlesOverlap(ent(1, 0, 0, 5), ent(2, 11, 0, 5))).toBe(false);
  });

  it("collision à cheval sur un bord : torique vraie, euclidienne fausse", () => {
    const W = 100;
    const H = 100;
    const a = ent(1, 3, 50, 5);
    const b = ent(2, 98, 50, 5); // distance directe 95, torique 5
    expect(circlesOverlap(a, b)).toBe(false);
    expect(circlesOverlapToroidal(W, H)(a, b)).toBe(true);
  });
});

describe("collisionPairs", () => {
  it("retourne chaque paire recouvrante une seule fois", () => {
    const entities = [ent(1, 0, 0, 5), ent(2, 4, 0, 5), ent(3, 100, 0, 5)];
    const pairs = collisionPairs(entities, circlesOverlap);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]![0].id).toBe(1);
    expect(pairs[0]![1].id).toBe(2);
  });
});
