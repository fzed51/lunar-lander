import { describe, it, expect } from "vitest";
import { Vector2 } from "./Vector2.ts";

describe("Vector2", () => {
  it("add / sub / scale", () => {
    const a = new Vector2(1, 2);
    const b = new Vector2(3, 4);
    expect(a.add(b)).toEqual(new Vector2(4, 6));
    expect(b.sub(a)).toEqual(new Vector2(2, 2));
    expect(a.scale(2)).toEqual(new Vector2(2, 4));
  });

  it("length / normalize", () => {
    expect(new Vector2(3, 4).length()).toBe(5);
    const n = new Vector2(3, 4).normalize();
    expect(n.length()).toBeCloseTo(1);
    expect(Vector2.ZERO.normalize()).toEqual(Vector2.ZERO);
  });

  it("fromAngle produit un vecteur unitaire dirigé", () => {
    const v = Vector2.fromAngle(0);
    expect(v.x).toBeCloseTo(1);
    expect(v.y).toBeCloseTo(0);
    const up = Vector2.fromAngle(Math.PI / 2, 2);
    expect(up.x).toBeCloseTo(0);
    expect(up.y).toBeCloseTo(2);
  });

  it("rotate de PI/2", () => {
    const r = new Vector2(1, 0).rotate(Math.PI / 2);
    expect(r.x).toBeCloseTo(0);
    expect(r.y).toBeCloseTo(1);
  });

  it("limit clampe la norme mais garde la direction", () => {
    const v = new Vector2(30, 40); // longueur 50
    const l = v.limit(10);
    expect(l.length()).toBeCloseTo(10);
    expect(l.normalize().x).toBeCloseTo(0.6);
    // en dessous du max : inchangé
    expect(new Vector2(3, 4).limit(10)).toEqual(new Vector2(3, 4));
  });

  it("est immuable (add ne modifie pas l'original)", () => {
    const a = new Vector2(1, 1);
    a.add(new Vector2(5, 5));
    expect(a).toEqual(new Vector2(1, 1));
  });
});
