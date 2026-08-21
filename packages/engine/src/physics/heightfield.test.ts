import { describe, it, expect } from "vitest";
import { Vector2 } from "../math/Vector2.ts";
import {
  type Heightfield,
  largeur,
  surfaceEn,
  penteEn,
  denivele,
  souLeSol,
  penetration,
} from "./heightfield.ts";

/** Sol plat à y = 10, de x = 0 à x = 30. */
const plat: Heightfield = { x0: 0, pas: 10, surface: [10, 10, 10, 10] };

/**
 * Pente régulière de x = 0 à x = 20 : `y` décroît de 10 par pas de 10, donc une
 * pente de -1 — le sol monte vers la droite à l'écran (`y` croît vers le bas).
 */
const rampe: Heightfield = { x0: 0, pas: 10, surface: [100, 90, 80] };

/** Pic isolé de 30 de haut à x = 20, sur un sol plat à y = 0 (x = 0 à 40). */
const pic: Heightfield = { x0: 0, pas: 10, surface: [0, 0, -30, 0, 0] };

describe("largeur", () => {
  it("couvre les intervalles entre échantillons", () => {
    expect(largeur(plat)).toBe(30);
    expect(largeur(rampe)).toBe(20);
  });
});

describe("surfaceEn", () => {
  it("rend la même valeur partout sur du plat", () => {
    expect(surfaceEn(plat, 0)).toBe(10);
    expect(surfaceEn(plat, 7.5)).toBe(10);
    expect(surfaceEn(plat, 30)).toBe(10);
  });

  it("interpole linéairement au milieu d'un pas", () => {
    expect(surfaceEn(rampe, 0)).toBeCloseTo(100);
    expect(surfaceEn(rampe, 5)).toBeCloseTo(95);
    expect(surfaceEn(rampe, 10)).toBeCloseTo(90);
    expect(surfaceEn(rampe, 12.5)).toBeCloseTo(87.5);
    expect(surfaceEn(rampe, 20)).toBeCloseTo(80);
  });

  it("prolonge à plat hors des bornes, sans extrapoler la pente", () => {
    expect(surfaceEn(rampe, -1000)).toBe(100);
    expect(surfaceEn(rampe, -0.5)).toBe(100);
    expect(surfaceEn(rampe, 1000)).toBe(80);
    expect(surfaceEn(rampe, 20.5)).toBe(80);
  });

  it("tient compte d'un décalage de l'origine", () => {
    const decale: Heightfield = { x0: 100, pas: 4, surface: [0, 8] };
    expect(surfaceEn(decale, 100)).toBe(0);
    expect(surfaceEn(decale, 102)).toBeCloseTo(4);
    expect(surfaceEn(decale, 104)).toBe(8);
    expect(surfaceEn(decale, 99)).toBe(0);
  });
});

describe("penteEn", () => {
  it("vaut 0 sur du plat", () => {
    expect(penteEn(plat, 0)).toBe(0);
    expect(penteEn(plat, 15)).toBe(0);
  });

  it("rend la pente exacte du segment porteur", () => {
    expect(penteEn(rampe, 1)).toBeCloseTo(-1);
    expect(penteEn(rampe, 5)).toBeCloseTo(-1);
    expect(penteEn(rampe, 15)).toBeCloseTo(-1);
  });

  it("change de signe de part et d'autre d'un pic", () => {
    expect(penteEn(pic, 15)).toBeCloseTo(-3);
    expect(penteEn(pic, 25)).toBeCloseTo(3);
  });

  it("vaut 0 hors des bornes, le relief y étant prolongé plat", () => {
    expect(penteEn(rampe, -1)).toBe(0);
    expect(penteEn(rampe, 100)).toBe(0);
  });
});

describe("denivele", () => {
  it("est nul sur du plat", () => {
    expect(denivele(plat, 3, 27)).toBe(0);
  });

  it("vaut la hauteur du pic quand l'intervalle le contient", () => {
    expect(denivele(pic, 10, 30)).toBeCloseTo(30);
  });

  it("compte l'unique échantillon intérieur : un pic isolé n'est jamais raté", () => {
    // Les deux bornes interpolées valent -24 : sans l'échantillon du sommet,
    // le dénivelé ressortirait à 0.
    expect(surfaceEn(pic, 18)).toBeCloseTo(-24);
    expect(surfaceEn(pic, 22)).toBeCloseTo(-24);
    expect(denivele(pic, 18, 22)).toBeCloseTo(6);
  });

  it("se calcule sur les seules bornes interpolées quand l'intervalle est plus étroit qu'un pas", () => {
    expect(denivele(rampe, 2, 7)).toBeCloseTo(5);
  });

  it("échange les bornes quand elles sont dans le désordre", () => {
    expect(denivele(pic, 30, 10)).toBe(denivele(pic, 10, 30));
    expect(denivele(rampe, 7, 2)).toBe(denivele(rampe, 2, 7));
  });

  it("est nul sur un intervalle réduit à un point", () => {
    expect(denivele(rampe, 5, 5)).toBe(0);
  });

  it("reste positif quand l'intervalle dépasse les bornes du champ", () => {
    expect(denivele(rampe, -50, 50)).toBeCloseTo(20);
  });
});

describe("souLeSol", () => {
  it("est faux au-dessus de la surface", () => {
    // `y` croît vers le bas : au-dessus, c'est un `y` plus petit.
    expect(souLeSol(plat, new Vector2(15, 9.9))).toBe(false);
    expect(souLeSol(plat, new Vector2(15, -100))).toBe(false);
  });

  it("est vrai exactement sur la surface : le contact compte comme touché", () => {
    expect(souLeSol(plat, new Vector2(15, 10))).toBe(true);
    expect(souLeSol(rampe, new Vector2(5, 95))).toBe(true);
  });

  it("est vrai en dessous de la surface", () => {
    expect(souLeSol(plat, new Vector2(15, 10.1))).toBe(true);
    expect(souLeSol(rampe, { x: 5, y: 200 })).toBe(true);
  });
});

describe("penetration", () => {
  it("vaut 0 au-dessus de la surface et exactement dessus", () => {
    expect(penetration(plat, new Vector2(15, 0))).toBe(0);
    expect(penetration(plat, new Vector2(15, 10))).toBe(0);
  });

  it("rend la profondeur exacte en dessous", () => {
    expect(penetration(plat, new Vector2(15, 12.5))).toBeCloseTo(2.5);
    expect(penetration(rampe, new Vector2(5, 100))).toBeCloseTo(5);
  });
});

describe("champ invalide", () => {
  const messages = /Heightfield/;

  it("refuse un pas nul, négatif ou non fini", () => {
    expect(() => surfaceEn({ x0: 0, pas: 0, surface: [1, 2] }, 0)).toThrow(messages);
    expect(() => surfaceEn({ x0: 0, pas: -5, surface: [1, 2] }, 0)).toThrow(messages);
    expect(() => surfaceEn({ x0: 0, pas: NaN, surface: [1, 2] }, 0)).toThrow(messages);
  });

  it("refuse un champ de moins de deux échantillons", () => {
    expect(() => surfaceEn({ x0: 0, pas: 10, surface: [1] }, 0)).toThrow(messages);
    expect(() => surfaceEn({ x0: 0, pas: 10, surface: [] }, 0)).toThrow(messages);
  });

  it("refuse partout, pas seulement dans surfaceEn", () => {
    const casse: Heightfield = { x0: 0, pas: 0, surface: [1] };
    expect(() => largeur(casse)).toThrow(messages);
    expect(() => penteEn(casse, 0)).toThrow(messages);
    expect(() => denivele(casse, 0, 1)).toThrow(messages);
    expect(() => souLeSol(casse, new Vector2(0, 0))).toThrow(messages);
    expect(() => penetration(casse, new Vector2(0, 0))).toThrow(messages);
  });
});
