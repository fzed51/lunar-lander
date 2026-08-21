import { describe, it, expect } from "vitest";
import { souLeSol, Vector2 } from "@lem/engine";
import {
  evalueContact,
  horsLimites,
  piedsDuLem,
  pointsDeCoque,
  toucheLeSol,
  type CauseCrash,
  type Verdict,
} from "./landing.ts";
import { Lander } from "./entities/Lander.ts";
import type { Terrain } from "./terrain.ts";
import {
  LEM,
  MONDE,
  SEUIL_ASSIETTE,
  SEUIL_VX,
  SEUIL_VY,
} from "./constants.ts";

/** Radians depuis des degrés, pour écrire les assiettes comme le fait la doc. */
function deg(angle: number): number {
  return (angle * Math.PI) / 180;
}

/**
 * Terrain de test : un champ d'altitudes au pas de 1 m, plus le strict
 * nécessaire pour satisfaire le type `Terrain`.
 *
 * Le pas est **plus fin** que le `TERRAIN_PAS` = 5 m du jeu, et c'est
 * délibéré : à 1 m on place un obstacle entre l'épaule et le pied du LEM, qui
 * ne sont écartés que d'un mètre. Rien dans `landing.ts` ne suppose un pas
 * particulier.
 */
function terrainDe(surface: readonly number[], cibleX = 10): Terrain {
  const hf = { x0: 0, pas: 1, surface };
  return {
    hf,
    secteurs: [],
    cible: { x: cibleX, y: surface[Math.round(cibleX)] ?? 0, largeur: 40 },
    replis: [],
    depart: { x: 0, sens: 1 },
  };
}

/** Coordonnée `y` de la surface du terrain plat de référence. */
const SOL = 300;

/** Terrain plat de 0 à 40 m, drapeau où on le demande. */
function terrainPlat(cibleX = 10): Terrain {
  return terrainDe(new Array<number>(41).fill(SOL), cibleX);
}

/**
 * `y` du centre d'un LEM debout dont les pieds touchent pile la surface plate :
 * le centre est une demi-hauteur au-dessus des pieds.
 */
const Y_CONTACT = SOL - LEM.hauteur / 2;

/** LEM debout, au contact du sol plat, immobile, sauf indication contraire. */
function lem(
  o: {
    x?: number;
    y?: number;
    vx?: number;
    vy?: number;
    assiette?: number;
  } = {},
): Lander {
  return new Lander(
    1,
    new Vector2(o.x ?? 20, o.y ?? Y_CONTACT),
    new Vector2(o.vx ?? 0, o.vy ?? 0),
    o.assiette ?? 0,
  );
}

/** Causes d'un verdict, ou `null` si c'est un posé. Évite un cast par test. */
function causesDe(verdict: Verdict): readonly CauseCrash[] | null {
  return verdict.pose ? null : verdict.causes;
}

describe("piedsDuLem", () => {
  it("place les deux pieds à une demi-largeur de train du centre, une demi-hauteur dessous", () => {
    const [gauche, droit] = piedsDuLem(lem({ x: 20, y: 100 }));
    expect(gauche.x).toBeCloseTo(20 - LEM.largeurTrain / 2, 10);
    expect(droit.x).toBeCloseTo(20 + LEM.largeurTrain / 2, 10);
    expect(gauche.y).toBeCloseTo(100 + LEM.hauteur / 2, 10);
    expect(droit.y).toBeCloseTo(100 + LEM.hauteur / 2, 10);
  });

  it("tourne les pieds de l'assiette : à 90° le train est vertical", () => {
    const [gauche, droit] = piedsDuLem(
      lem({ x: 20, y: 100, assiette: deg(90) }),
    );
    // Les deux pieds partagent la même abscisse et sont écartés d'une largeur
    // de train en `y` : le LEM est couché sur le flanc droit.
    expect(gauche.x).toBeCloseTo(20 - LEM.hauteur / 2, 10);
    expect(droit.x).toBeCloseTo(20 - LEM.hauteur / 2, 10);
    expect(droit.y - gauche.y).toBeCloseTo(LEM.largeurTrain, 10);
  });
});

describe("pointsDeCoque", () => {
  it("rend cinq points : les deux pieds, les deux épaules et le centre", () => {
    const l = lem({ x: 20, y: 100 });
    const points = pointsDeCoque(l);
    expect(points).toHaveLength(5);

    const [piedGauche, piedDroit] = piedsDuLem(l);
    expect(points[0]?.x).toBeCloseTo(piedGauche.x, 10);
    expect(points[1]?.x).toBeCloseTo(piedDroit.x, 10);

    // Épaules : plus rapprochées que les pieds, et **au-dessus** du centre.
    const epauleGauche = points[2];
    const epauleDroite = points[3];
    expect(epauleGauche?.y).toBeCloseTo(100 - LEM.hauteur / 2, 10);
    expect(epauleDroite?.y).toBeCloseTo(100 - LEM.hauteur / 2, 10);
    expect(Math.abs((epauleDroite?.x ?? 0) - 20)).toBeLessThan(
      LEM.largeurTrain / 2,
    );

    // Le centre en fait partie : un fuselage traversé n'est pas un atterrissage.
    expect(points[4]?.x).toBeCloseTo(20, 10);
    expect(points[4]?.y).toBeCloseTo(100, 10);
  });
});

describe("toucheLeSol", () => {
  it("est faux quand toute la coque est au-dessus de la surface", () => {
    expect(toucheLeSol(terrainPlat(), lem({ y: Y_CONTACT - 10 }))).toBe(false);
  });

  it("est vrai quand un pied est exactement sur la surface", () => {
    expect(toucheLeSol(terrainPlat(), lem({ y: Y_CONTACT }))).toBe(true);
  });

  it("détecte le contact plus tôt à assiette 45° qu'à assiette 0", () => {
    const terrain = terrainPlat();
    // Une altitude où le LEM debout ne touche pas encore : ses pieds sont à
    // 1 m du sol.
    const y = Y_CONTACT - 1;
    expect(toucheLeSol(terrain, lem({ y }))).toBe(false);
    // Penché, le pied bas descend plus bas que la demi-hauteur : il touche.
    expect(toucheLeSol(terrain, lem({ y, assiette: deg(45) }))).toBe(true);
  });

  it("détecte une épaule dans la roche alors que les deux pieds sont libres", () => {
    // Éperon d'un seul échantillon planté à l'abscisse de l'épaule droite : les
    // pieds, plus écartés, passent de part et d'autre.
    const surface = new Array<number>(41).fill(340);
    surface[23] = 320;
    const terrain = terrainDe(surface);
    const l = lem({ x: 20, y: 330 });

    for (const pied of piedsDuLem(l)) {
      expect(souLeSol(terrain.hf, pied)).toBe(false);
    }
    expect(toucheLeSol(terrain, l)).toBe(true);
  });
});

describe("evalueContact — posé", () => {
  it("valide un posé nominal et rend l'écart horizontal au drapeau", () => {
    const verdict = evalueContact(terrainPlat(10), lem({ x: 20, vy: 1 }));
    expect(verdict.pose).toBe(true);
    expect(verdict.pose && verdict.ecart).toBe(10);
  });

  it("rend un écart de 0, et pas -0, pour un posé pile sur la cible", () => {
    const verdict = evalueContact(terrainPlat(20), lem({ x: 20, vy: 1 }));
    // `toBe` distingue 0 de -0 : c'est exactement ce qu'on veut vérifier.
    expect(verdict.pose && verdict.ecart).toBe(0);
  });

  it("mesure un écart indépendant de l'altitude", () => {
    const terrain = terrainPlat(10);
    const bas = evalueContact(terrain, lem({ x: 20, vy: 1 }));
    const haut = evalueContact(terrain, lem({ x: 20, y: 200, vy: 1 }));
    expect(bas.pose && bas.ecart).toBe(10);
    expect(haut.pose && haut.ecart).toBe(10);
  });

  it("mesure l'écart depuis le centre, quel que soit le pied qui touche", () => {
    // L'assiette est prise à la tolérance maximale : à 20° le verdict serait
    // déjà `trop-penche` et il n'y aurait aucun écart à comparer.
    const terrain = terrainPlat(10);
    const droite = evalueContact(
      terrain,
      lem({ x: 20, vy: 1, assiette: SEUIL_ASSIETTE }),
    );
    const gauche = evalueContact(
      terrain,
      lem({ x: 20, vy: 1, assiette: -SEUIL_ASSIETTE }),
    );
    expect(droite.pose && droite.ecart).toBe(10);
    expect(gauche.pose && gauche.ecart).toBe(10);
  });

  it("arrondit l'écart au mètre", () => {
    const terrain = terrainPlat(10);
    expect(
      evalueContact(terrain, lem({ x: 17.4, vy: 1 })),
    ).toEqual({ pose: true, ecart: 7 });
    expect(
      evalueContact(terrain, lem({ x: 2.4, vy: 1 })),
    ).toEqual({ pose: true, ecart: 8 });
  });

  it("tolère une vitesse verticale montante, même élevée", () => {
    // `SEUIL_VY` ne juge que la descente : un LEM qui remonte en frôlant le sol
    // ne se détruit pas.
    const verdict = evalueContact(terrainPlat(), lem({ vy: -8 }));
    expect(verdict.pose).toBe(true);
  });
});

describe("evalueContact — seuils inclusifs", () => {
  it("accepte une descente juste sous le seuil et pile au seuil, refuse juste au-dessus", () => {
    const terrain = terrainPlat();
    expect(evalueContact(terrain, lem({ vy: 1.99 })).pose).toBe(true);
    expect(evalueContact(terrain, lem({ vy: SEUIL_VY })).pose).toBe(true);
    const trop = evalueContact(terrain, lem({ vy: 2.01 }));
    expect(causesDe(trop)).toEqual(["trop-vite-vertical"]);
  });

  it("accepte une dérive pile au seuil, refuse juste au-dessus", () => {
    const terrain = terrainPlat();
    expect(evalueContact(terrain, lem({ vx: SEUIL_VX })).pose).toBe(true);
    expect(evalueContact(terrain, lem({ vx: -SEUIL_VX })).pose).toBe(true);
    expect(causesDe(evalueContact(terrain, lem({ vx: 1.01 })))).toEqual([
      "trop-vite-lateral",
    ]);
  });

  it("accepte une assiette pile au seuil, refuse juste au-dessus", () => {
    const terrain = terrainPlat();
    expect(evalueContact(terrain, lem({ assiette: SEUIL_ASSIETTE })).pose).toBe(
      true,
    );
    expect(
      causesDe(evalueContact(terrain, lem({ assiette: SEUIL_ASSIETTE * 1.01 }))),
    ).toEqual(["trop-penche"]);
  });
});

describe("evalueContact — causes de crash", () => {
  it("refuse une descente trop rapide", () => {
    expect(causesDe(evalueContact(terrainPlat(), lem({ vy: 5 })))).toEqual([
      "trop-vite-vertical",
    ]);
  });

  it("refuse une dérive latérale trop rapide", () => {
    expect(causesDe(evalueContact(terrainPlat(), lem({ vx: 3 })))).toEqual([
      "trop-vite-lateral",
    ]);
  });

  it("refuse un LEM trop penché", () => {
    expect(
      causesDe(evalueContact(terrainPlat(), lem({ assiette: deg(30), vy: 1 }))),
    ).toEqual(["trop-penche"]);
  });

  it("refuse un sol accidenté sous la largeur du train", () => {
    // Aiguille de 5 m sous le train, entre les deux pieds : le dénivelé dépasse
    // `SEUIL_PLATITUDE` alors que les pieds, eux, reposent bien sur la surface.
    const surface = new Array<number>(41).fill(SOL);
    surface[22] = SOL - 5;
    const terrain = terrainDe(surface);
    const l = lem({ x: 20, vy: 1 });

    expect(toucheLeSol(terrain, l)).toBe(true);
    expect(causesDe(evalueContact(terrain, l))).toEqual(["sol-accidente"]);
  });

  it("refuse un contact par la coque : vol horizontal dans une paroi", () => {
    // Le LEM file à 20 m/s, pieds au-dessus du fond, épaule droite dans
    // l'éperon. Ce test échoue si le contact ne se juge que sous les pieds :
    // `toucheLeSol` serait faux et le LEM traverserait la roche.
    const surface = new Array<number>(41).fill(340);
    surface[23] = 320;
    const terrain = terrainDe(surface);
    const l = lem({ x: 20, y: 330, vx: 20 });

    expect(toucheLeSol(terrain, l)).toBe(true);
    const causes = causesDe(evalueContact(terrain, l));
    expect(causes).toContain("coque-heurtee");
  });

  it("cumule les causes : trop vite et trop penché en rendent deux", () => {
    const causes = causesDe(
      evalueContact(terrainPlat(), lem({ vy: 5, assiette: deg(30) })),
    );
    expect(causes).toHaveLength(2);
    expect(causes).toContain("trop-vite-vertical");
    expect(causes).toContain("trop-penche");
  });
});

describe("horsLimites", () => {
  it("est vrai à gauche du monde", () => {
    expect(horsLimites(lem({ x: -1, y: 200 }))).toBe(true);
  });

  it("est vrai à droite du monde", () => {
    expect(horsLimites(lem({ x: MONDE.largeur + 1, y: 200 }))).toBe(true);
  });

  it("est vrai au-dessus du plafond", () => {
    expect(horsLimites(lem({ x: 640, y: -1 }))).toBe(true);
  });

  it("est faux au milieu du monde et sur les bornes", () => {
    expect(horsLimites(lem({ x: 640, y: 200 }))).toBe(false);
    expect(horsLimites(lem({ x: 0, y: 0 }))).toBe(false);
    expect(horsLimites(lem({ x: MONDE.largeur, y: 200 }))).toBe(false);
  });
});

describe("evalueContact — sortie du monde", () => {
  it("ne déclare jamais posé un LEM hors du monde, même critères de posé réunis", () => {
    // À `x = -50`, `surfaceEn` prolonge la valeur du bord et le dénivelé vaut 0 :
    // sans la garde de sortie du monde, ce LEM serait déclaré posé sur un sol
    // qui n'existe pas, et le score crédité d'un écart mesuré dans le vide.
    const verdict = evalueContact(terrainPlat(10), lem({ x: -50, vy: 1 }));
    expect(verdict.pose).toBe(false);
    expect(causesDe(verdict)).toEqual(["hors-limites"]);
  });

  it("cumule la sortie du monde avec les critères de vol dépassés", () => {
    const causes = causesDe(
      evalueContact(terrainPlat(10), lem({ x: -50, vy: 5, vx: 3 })),
    );
    expect(causes).toEqual([
      "hors-limites",
      "trop-vite-vertical",
      "trop-vite-lateral",
    ]);
  });

  it("ne déclare jamais posé un LEM passé au-dessus du plafond", () => {
    const verdict = evalueContact(terrainPlat(10), lem({ x: 20, y: -1 }));
    expect(causesDe(verdict)).toEqual(["hors-limites"]);
  });
});
