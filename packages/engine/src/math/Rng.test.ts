import { describe, it, expect } from "vitest";
import { createRng, melangeGraine } from "./Rng.ts";

/** Tire `n` valeurs successives, pour comparer des suites entières. */
function suite(graine: number, n: number): number[] {
  const rng = createRng(graine);
  return Array.from({ length: n }, () => rng.next());
}

/** Nombre de bits qui diffèrent entre deux entiers 32 bits. */
function bitsDifferents(a: number, b: number): number {
  let x = (a ^ b) >>> 0;
  let compte = 0;
  while (x !== 0) {
    compte += x & 1;
    x >>>= 1;
  }
  return compte;
}

describe("createRng — déterminisme", () => {
  it("rend la même suite de 100 valeurs à graine égale", () => {
    expect(suite(1234, 100)).toEqual(suite(1234, 100));
  });

  it("diverge sur deux graines différentes", () => {
    expect(suite(1234, 100)).not.toEqual(suite(1235, 100));
  });

  it("garde deux instances de même graine synchronisées et indépendantes", () => {
    const a = createRng(42);
    const b = createRng(42);
    expect(a.next()).toBe(b.next());

    // Tirer 5 fois dans `a` ne doit pas faire avancer `b`.
    const attendus = [a.next(), a.next(), a.next(), a.next(), a.next()];
    expect([b.next(), b.next(), b.next(), b.next(), b.next()]).toEqual(attendus);
  });

  it("accepte une graine fractionnaire ou négative sans lever", () => {
    expect(() => createRng(-7.5).next()).not.toThrow();
    expect(suite(-1, 5)).toEqual(suite(4294967295, 5));
    expect(suite(3.9, 5)).toEqual(suite(3, 5));
  });

  it("expose un `next` détachable, utilisable comme `() => number`", () => {
    const rng = createRng(9);
    const tirer: () => number = rng.next;
    const detache = [tirer(), tirer(), tirer()];
    expect(detache).toEqual(suite(9, 3));
  });
});

describe("createRng — bornes", () => {
  it("garde 100 000 tirages de next() dans [0, 1)", () => {
    const rng = createRng(2024);
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    let horsBornes = 0;
    for (let i = 0; i < 100_000; i++) {
      const v = rng.next();
      if (Number.isNaN(v) || v < 0 || v >= 1) horsBornes++;
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    expect(horsBornes).toBe(0);
    expect(min).toBeGreaterThanOrEqual(0);
    expect(max).toBeLessThan(1);
  });

  it("sort toutes les faces d'un dé sans jamais dépasser les bornes", () => {
    const rng = createRng(7);
    const vus = new Set<number>();
    for (let i = 0; i < 10_000; i++) {
      const face = rng.int(1, 6);
      expect(Number.isInteger(face)).toBe(true);
      expect(face).toBeGreaterThanOrEqual(1);
      expect(face).toBeLessThanOrEqual(6);
      vus.add(face);
    }
    expect([...vus].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("rend toujours la borne quand int() est appelé sur un intervalle nul", () => {
    const rng = createRng(11);
    for (let i = 0; i < 50; i++) {
      expect(rng.int(3, 3)).toBe(3);
    }
  });

  it("échange les bornes de int() quand min > max", () => {
    const rng = createRng(13);
    for (let i = 0; i < 200; i++) {
      const v = rng.int(6, 2);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(6);
    }
  });

  it("range() reste dans [min, max) et rend min sur un intervalle nul", () => {
    const rng = createRng(17);
    for (let i = 0; i < 1_000; i++) {
      const v = rng.range(-2, 5);
      expect(v).toBeGreaterThanOrEqual(-2);
      expect(v).toBeLessThan(5);
    }
    expect(rng.range(4, 4)).toBe(4);
  });
});

describe("createRng — bool, pick, signe", () => {
  it("rend toujours faux avec bool(0) et toujours vrai avec bool(1)", () => {
    const rng = createRng(21);
    for (let i = 0; i < 500; i++) {
      expect(rng.bool(0)).toBe(false);
      expect(rng.bool(1)).toBe(true);
    }
  });

  it("tire les deux issues avec bool() par défaut", () => {
    const rng = createRng(23);
    const vus = new Set<boolean>();
    for (let i = 0; i < 100; i++) {
      vus.add(rng.bool());
    }
    expect(vus.size).toBe(2);
  });

  it("rend l'unique élément d'un tableau d'un seul élément", () => {
    const rng = createRng(29);
    for (let i = 0; i < 50; i++) {
      expect(rng.pick(["seul"])).toBe("seul");
    }
  });

  it("ne tire que des éléments du tableau", () => {
    const rng = createRng(31);
    const items = ["a", "b", "c"] as const;
    const vus = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const v = rng.pick(items);
      expect(items).toContain(v);
      vus.add(v);
    }
    expect(vus.size).toBe(3);
  });

  it("lève sur un tirage dans le vide", () => {
    const rng = createRng(37);
    expect(() => rng.pick([])).toThrow(/vide/);
  });

  it("ne rend que 1 ou -1, et les deux sortent", () => {
    const rng = createRng(41);
    const vus = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const s = rng.signe();
      expect(Math.abs(s)).toBe(1);
      vus.add(s);
    }
    expect([...vus].sort()).toEqual([-1, 1]);
  });
});

describe("melangeGraine", () => {
  it("est déterministe", () => {
    expect(melangeGraine(7, 1)).toBe(melangeGraine(7, 1));
    expect(melangeGraine(0, 0)).toBe(melangeGraine(0, 0));
  });

  it("rend un entier 32 bits non signé", () => {
    for (const [a, b] of [
      [0, 0],
      [-3, 12],
      [1.7, 2.9],
      [4294967295, 4294967295],
    ] as const) {
      const g = melangeGraine(a, b);
      expect(Number.isInteger(g)).toBe(true);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(4294967295);
    }
  });

  it("décorrèle deux manches consécutives", () => {
    const manche1 = melangeGraine(7, 1);
    const manche2 = melangeGraine(7, 2);
    expect(manche1).not.toBe(manche2);
    // Une avalanche correcte change environ la moitié des 32 bits.
    expect(bitsDifferents(manche1, manche2)).toBeGreaterThanOrEqual(8);
    expect(suite(manche1, 20)).not.toEqual(suite(manche2, 20));
  });

  it("n'est pas symétrique : (a, b) et (b, a) donnent des graines différentes", () => {
    expect(melangeGraine(7, 1)).not.toBe(melangeGraine(1, 7));
  });
});
