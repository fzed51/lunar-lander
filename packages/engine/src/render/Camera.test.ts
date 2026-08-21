import { describe, it, expect } from "vitest";
import { Vector2 } from "../math/Vector2.ts";
import {
  type Camera,
  avecCentre,
  avecZoom,
  borne,
  bornesVisibles,
  creeCamera,
  estVisible,
  suit,
  versEcran,
  versEcranPixel,
  versMonde,
} from "./Camera.ts";

const VUE = { largeur: 320, hauteur: 180 } as const;

function cam(centre = new Vector2(100, 50), zoom = 1): Camera {
  return creeCamera(centre, VUE, zoom);
}

describe("creeCamera", () => {
  it("refuse un zoom non entier, nul ou négatif", () => {
    expect(() => creeCamera(Vector2.ZERO, VUE, 2.5)).toThrow(/entier/);
    expect(() => creeCamera(Vector2.ZERO, VUE, 0)).toThrow(/zoom/);
    expect(() => creeCamera(Vector2.ZERO, VUE, -1)).toThrow(/zoom/);
    expect(() => creeCamera(Vector2.ZERO, VUE, Number.NaN)).toThrow(/zoom/);
  });

  it("refuse une vue dégénérée", () => {
    expect(() => creeCamera(Vector2.ZERO, { largeur: 0, hauteur: 180 })).toThrow(
      /vue/,
    );
    expect(() =>
      creeCamera(Vector2.ZERO, { largeur: 320, hauteur: -10 }),
    ).toThrow(/vue/);
  });
});

describe("versEcran / versMonde", () => {
  it("place le centre de la caméra au centre de la vue", () => {
    for (const zoom of [1, 2, 4]) {
      const c = cam(new Vector2(640, 300), zoom);
      const e = versEcran(c, c.centre);
      expect(e.x).toBeCloseTo(VUE.largeur / 2, 10);
      expect(e.y).toBeCloseTo(VUE.hauteur / 2, 10);
    }
  });

  it("fait l'aller-retour monde → écran → monde aux zooms 1, 2 et 4", () => {
    const points = [
      new Vector2(0, 0),
      new Vector2(623.47, -12.5),
      new Vector2(1280, 940.125),
    ];
    for (const zoom of [1, 2, 4]) {
      const c = cam(new Vector2(637.3, 88.9), zoom);
      for (const p of points) {
        const retour = versMonde(c, versEcran(c, p));
        expect(retour.x).toBeCloseTo(p.x, 10);
        expect(retour.y).toBeCloseTo(p.y, 10);
      }
    }
  });

  it("agrandit les écarts par le zoom entier", () => {
    // 10 unités monde à droite du centre : 10 px au zoom 1, 40 px au zoom 4.
    const centre = new Vector2(100, 50);
    const cible = new Vector2(110, 50);
    expect(versEcran(cam(centre, 1), cible).x - VUE.largeur / 2).toBe(10);
    expect(versEcran(cam(centre, 4), cible).x - VUE.largeur / 2).toBe(40);
  });
});

describe("versEcranPixel", () => {
  it("rend des coordonnées entières", () => {
    const c = cam(new Vector2(637.3, 88.9), 2);
    const p = versEcranPixel(c, new Vector2(623.47, -12.5));
    expect(Number.isInteger(p.x)).toBe(true);
    expect(Number.isInteger(p.y)).toBe(true);
  });

  it("reste stable sur deux positions monde très proches", () => {
    const c = cam(new Vector2(100, 50), 1);
    const a = versEcranPixel(c, new Vector2(110.02, 50.01));
    const b = versEcranPixel(c, new Vector2(110.04, 50.03));
    expect(b.x).toBe(a.x);
    expect(b.y).toBe(a.y);
  });

  it("est une fonction pure : deux appels identiques rendent le même pixel", () => {
    const c = cam(new Vector2(637.3, 88.9), 4);
    const monde = new Vector2(623.47, -12.5);
    const a = versEcranPixel(c, monde);
    const b = versEcranPixel(c, monde);
    expect([b.x, b.y]).toEqual([a.x, a.y]);
  });
});

describe("avecCentre / avecZoom", () => {
  it("refuse un zoom non entier, nul ou négatif", () => {
    const c = cam();
    expect(() => avecZoom(c, 2.5)).toThrow(/entier/);
    expect(() => avecZoom(c, 0)).toThrow(/zoom/);
    expect(() => avecZoom(c, -1)).toThrow(/zoom/);
  });

  it("ne mutent pas la caméra d'origine", () => {
    const origine = cam(new Vector2(100, 50), 1);
    const deplacee = avecCentre(origine, new Vector2(700, 400));
    const zoomee = avecZoom(origine, 4);

    expect(origine.centre.x).toBe(100);
    expect(origine.centre.y).toBe(50);
    expect(origine.zoom).toBe(1);
    expect(deplacee.centre.x).toBe(700);
    expect(deplacee.zoom).toBe(1);
    expect(zoomee.zoom).toBe(4);
    expect(zoomee.centre.x).toBe(100);
  });
});

describe("borne", () => {
  const monde = { xMin: 0, xMax: 1280, yMin: -200, yMax: 400 };

  it("colle la vue au bord gauche quand la caméra sort à gauche", () => {
    const borne1 = borne(cam(new Vector2(-500, 0), 1), monde);
    // Demi-vue = 160 px au zoom 1 : le centre ne peut pas descendre sous 160.
    expect(borne1.centre.x).toBe(160);
    expect(bornesVisibles(borne1).xMin).toBe(monde.xMin);
  });

  it("colle la vue au bord droit et tient compte du zoom", () => {
    const borne4 = borne(cam(new Vector2(5000, 0), 4), monde);
    // Demi-vue = 320 / (2 * 4) = 40 unités monde.
    expect(borne4.centre.x).toBe(1240);
    expect(bornesVisibles(borne4).xMax).toBeCloseTo(monde.xMax, 10);
  });

  it("centre l'axe quand le monde est plus étroit que la vue", () => {
    const etroit = { xMin: 0, xMax: 100, yMin: -200, yMax: 400 };
    const c = borne(cam(new Vector2(-500, 0), 1), etroit);
    expect(c.centre.x).toBe(50);
    const vue = bornesVisibles(c);
    // Vide symétrique de part et d'autre du monde.
    expect(50 - vue.xMin).toBeCloseTo(vue.xMax - 50, 10);
  });

  it("traite les deux axes indépendamment", () => {
    // Monde large mais plat : borné en x, centré en y.
    const plat = { xMin: 0, xMax: 1280, yMin: 0, yMax: 100 };
    const c = borne(cam(new Vector2(-500, 900), 1), plat);
    expect(c.centre.x).toBe(160);
    expect(c.centre.y).toBe(50);
  });

  it("laisse la caméra tranquille quand la vue est déjà dedans", () => {
    const c = borne(cam(new Vector2(640, 100), 1), monde);
    expect(c.centre.x).toBe(640);
    expect(c.centre.y).toBe(100);
  });

  it("refuse des limites non finies", () => {
    expect(() =>
      borne(cam(), { xMin: 0, xMax: Number.NaN, yMin: 0, yMax: 10 }),
    ).toThrow(/limites/);
  });
});

describe("suit", () => {
  const cible = new Vector2(1000, 0);

  it("ne bouge pas avec dt = 0", () => {
    const c = suit(cam(new Vector2(0, 0), 1), cible, 0, 6);
    expect(c.centre.x).toBe(0);
    expect(c.centre.y).toBe(0);
  });

  it("converge de façon monotone sans jamais dépasser la cible", () => {
    let c = cam(new Vector2(0, 0), 1);
    let precedent = c.centre.x;
    for (let i = 0; i < 200; i++) {
      c = suit(c, cible, 1 / 60, 6);
      expect(c.centre.x).toBeGreaterThan(precedent);
      expect(c.centre.x).toBeLessThanOrEqual(cible.x);
      precedent = c.centre.x;
    }
    expect(c.centre.x).toBeCloseTo(cible.x, 3);
  });

  it("ne dépasse pas la cible même sur un pas de temps énorme", () => {
    const c = suit(cam(new Vector2(0, 0), 1), cible, 10, 6);
    expect(c.centre.x).toBeLessThanOrEqual(cible.x);
    expect(c.centre.x).toBeCloseTo(cible.x, 6);
  });

  it("est indépendante du framerate : un pas de 0,1 s = dix pas de 0,01 s", () => {
    const depart = cam(new Vector2(0, 0), 1);
    const gros = suit(depart, cible, 0.1, 6);
    let fin = depart;
    for (let i = 0; i < 10; i++) fin = suit(fin, cible, 0.01, 6);
    expect(fin.centre.x).toBeCloseTo(gros.centre.x, 9);
  });

  it("ignore une réactivité nulle ou négative et un dt négatif", () => {
    const depart = cam(new Vector2(0, 0), 1);
    expect(suit(depart, cible, 1 / 60, 0).centre.x).toBe(0);
    expect(suit(depart, cible, 1 / 60, -6).centre.x).toBe(0);
    expect(suit(depart, cible, -1, 6).centre.x).toBe(0);
  });
});

describe("bornesVisibles", () => {
  it("couvre la vue centrée sur la caméra", () => {
    const b = bornesVisibles(cam(new Vector2(100, 50), 1));
    expect(b).toEqual({ xMin: -60, xMax: 260, yMin: -40, yMax: 140 });
  });

  it("couvre le quart de l'étendue du zoom 1 au zoom 4", () => {
    const centre = new Vector2(640, 200);
    const un = bornesVisibles(cam(centre, 1));
    const quatre = bornesVisibles(cam(centre, 4));
    expect(quatre.xMax - quatre.xMin).toBeCloseTo((un.xMax - un.xMin) / 4, 10);
    expect(quatre.yMax - quatre.yMin).toBeCloseTo((un.yMax - un.yMin) / 4, 10);
  });

  it("reste juste après un bornage", () => {
    const monde = { xMin: 0, xMax: 1280, yMin: -200, yMax: 400 };
    const c = borne(cam(new Vector2(-500, 5000), 2), monde);
    const b = bornesVisibles(c);
    expect(b.xMin).toBeGreaterThanOrEqual(monde.xMin);
    expect(b.xMax).toBeLessThanOrEqual(monde.xMax);
    expect(b.yMin).toBeGreaterThanOrEqual(monde.yMin);
    expect(b.yMax).toBeLessThanOrEqual(monde.yMax);
  });
});

describe("estVisible", () => {
  const c = cam(new Vector2(100, 50), 1);

  it("est vrai au centre de la vue", () => {
    expect(estVisible(c, c.centre)).toBe(true);
  });

  it("est faux largement dehors", () => {
    expect(estVisible(c, new Vector2(10000, 50))).toBe(false);
    expect(estVisible(c, new Vector2(100, -10000))).toBe(false);
  });

  it("compte le bord comme visible", () => {
    const b = bornesVisibles(c);
    expect(estVisible(c, new Vector2(b.xMin, b.yMin))).toBe(true);
    expect(estVisible(c, new Vector2(b.xMax, b.yMax))).toBe(true);
  });

  it("accepte juste dehors avec une marge", () => {
    const b = bornesVisibles(c);
    const juste = new Vector2(b.xMax + 5, 50);
    expect(estVisible(c, juste)).toBe(false);
    expect(estVisible(c, juste, 10)).toBe(true);
  });

  it("est faux sur un point non fini", () => {
    expect(estVisible(c, new Vector2(Number.NaN, 50))).toBe(false);
  });
});
