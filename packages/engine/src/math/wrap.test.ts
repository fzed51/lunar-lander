import { describe, it, expect } from "vitest";
import { Vector2 } from "./Vector2.ts";
import { wrap, toroidalDelta } from "./wrap.ts";

const W = 100;
const H = 80;

describe("wrap", () => {
  it("laisse une position intérieure inchangée", () => {
    expect(wrap(new Vector2(10, 20), W, H)).toEqual(new Vector2(10, 20));
  });

  it("enroule aux 4 bords", () => {
    expect(wrap(new Vector2(-5, 40), W, H)).toEqual(new Vector2(95, 40)); // gauche → droite
    expect(wrap(new Vector2(105, 40), W, H)).toEqual(new Vector2(5, 40)); // droite → gauche
    expect(wrap(new Vector2(50, -3), W, H)).toEqual(new Vector2(50, 77)); // haut → bas
    expect(wrap(new Vector2(50, 83), W, H)).toEqual(new Vector2(50, 3)); // bas → haut
  });
});

describe("toroidalDelta", () => {
  it("court à l'intérieur", () => {
    expect(toroidalDelta(new Vector2(10, 10), new Vector2(30, 10), W, H)).toEqual(
      new Vector2(20, 0),
    );
  });

  it("prend le chemin court à travers un bord", () => {
    // de x=2 à x=98 : direct = +96, torique = -4
    const d = toroidalDelta(new Vector2(2, 0), new Vector2(98, 0), W, H);
    expect(d.x).toBeCloseTo(-4);
  });
});
