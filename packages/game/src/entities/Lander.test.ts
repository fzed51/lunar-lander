import { describe, it, expect } from "vitest";
import { Vector2, type InputSnapshot } from "@lem/engine";
import { Lander, poussee, sansCarburant } from "./Lander.ts";
import type { Command } from "../types.ts";
import {
  ASSIETTE_MAX,
  CONSO_PAR_CRAN,
  CRANS_MAX,
  MOON_GRAVITY,
  POUSSEE_MAX,
  VITESSE_ROTATION,
} from "../constants.ts";

/**
 * Snapshot d'entrée factice. `fronts` liste les commandes tout juste pressées :
 * elles sont aussi actives, comme le rend le vrai `KeyboardInput`.
 */
function entree(
  actives: Command[] = [],
  fronts: Command[] = [],
): InputSnapshot<Command> {
  return {
    isActive: (c) => actives.includes(c) || fronts.includes(c),
    justPressed: (c) => fronts.includes(c),
  };
}

const NEUTRE = entree();

/** LEM debout, réservoir généreux, à l'origine. */
function lem(overrides: Partial<Lander> = {}): Lander {
  return new Lander(
    overrides.id ?? 1,
    overrides.position ?? Vector2.ZERO,
    overrides.velocity ?? Vector2.ZERO,
    overrides.assiette ?? 0,
    overrides.cran ?? 0,
    overrides.carburant ?? 100,
  );
}

describe("Lander — gravité et intégration", () => {
  it("sans poussée, gagne exactement 1,62 × dt de vitesse verticale par pas", () => {
    let l = lem();
    l = l.step(0.5, NEUTRE);
    expect(l.velocity.y).toBeCloseTo(MOON_GRAVITY * 0.5, 10);
    // Position intégrée depuis la vitesse mise à jour.
    expect(l.position.y).toBeCloseTo(MOON_GRAVITY * 0.5 * 0.5, 10);
    l = l.step(0.5, NEUTRE);
    expect(l.velocity.y).toBeCloseTo(MOON_GRAVITY * 1, 10);
  });

  it("ne dérive pas horizontalement quand rien n'est demandé", () => {
    const l = lem().step(0.5, NEUTRE);
    expect(l.velocity.x).toBe(0);
    expect(l.position.x).toBe(0);
  });
});

describe("Lander — poussée", () => {
  it("au cran 5 assiette 0, l'accélération nette vers le haut vaut 2,38 m/s²", () => {
    const l = lem({ cran: CRANS_MAX }).step(1, NEUTRE);
    expect(POUSSEE_MAX - MOON_GRAVITY).toBeCloseTo(2.38, 10);
    expect(l.velocity.y).toBeCloseTo(-(POUSSEE_MAX - MOON_GRAVITY), 10);
  });

  it("dirige la poussée selon l'axe du LEM", () => {
    // Penché à +90°, la tuyère pointe à gauche : toute la poussée part à droite.
    const l = lem({ cran: CRANS_MAX, assiette: ASSIETTE_MAX }).step(1, NEUTRE);
    expect(l.velocity.x).toBeCloseTo(POUSSEE_MAX, 10);
    expect(l.velocity.y).toBeCloseTo(MOON_GRAVITY, 10);
  });

  it("rend la poussée du cran courant, proportionnelle au cran", () => {
    expect(poussee(lem({ cran: 0 }))).toBe(0);
    expect(poussee(lem({ cran: 1 }))).toBeCloseTo(POUSSEE_MAX / CRANS_MAX, 10);
    expect(poussee(lem({ cran: CRANS_MAX }))).toBeCloseTo(POUSSEE_MAX, 10);
  });
});

describe("Lander — cran de poussée", () => {
  it("monte d'un cran sur un front montant", () => {
    const l = lem().step(0.1, entree([], ["throttle-up"]));
    expect(l.cran).toBe(1);
  });

  it("ne bouge pas quand la flèche est seulement maintenue", () => {
    let l = lem();
    for (let i = 0; i < 5; i++) {
      l = l.step(0.1, entree(["throttle-up"]));
    }
    expect(l.cran).toBe(0);
  });

  it("descend d'un cran sur un front montant", () => {
    const l = lem({ cran: 3 }).step(0.1, entree([], ["throttle-down"]));
    expect(l.cran).toBe(2);
  });

  it("est borné à CRANS_MAX vers le haut", () => {
    let l = lem({ cran: CRANS_MAX });
    for (let i = 0; i < 5; i++) {
      l = l.step(0.1, entree([], ["throttle-up"]));
    }
    expect(l.cran).toBe(CRANS_MAX);
  });

  it("est borné à 0 vers le bas", () => {
    let l = lem({ cran: 0 });
    for (let i = 0; i < 5; i++) {
      l = l.step(0.1, entree([], ["throttle-down"]));
    }
    expect(l.cran).toBe(0);
  });

  it("reste entier au fil des pas", () => {
    let l = lem();
    for (let i = 0; i < 3; i++) {
      l = l.step(1 / 60, entree([], ["throttle-up"]));
    }
    expect(Number.isInteger(l.cran)).toBe(true);
    expect(l.cran).toBe(3);
  });
});

describe("Lander — carburant", () => {
  it("consomme cran × 0,8 × dt", () => {
    const l = lem({ cran: 3, carburant: 10 }).step(0.5, NEUTRE);
    expect(l.carburant).toBeCloseTo(10 - 3 * CONSO_PAR_CRAN * 0.5, 10);
  });

  it("ne consomme rien au cran 0", () => {
    const l = lem({ cran: 0, carburant: 10 }).step(0.5, NEUTRE);
    expect(l.carburant).toBe(10);
  });

  it("ne descend jamais sous 0", () => {
    let l = lem({ cran: CRANS_MAX, carburant: 0.1 });
    for (let i = 0; i < 5; i++) {
      l = l.step(0.5, NEUTRE);
    }
    expect(l.carburant).toBe(0);
  });

  it("réservoir vide : poussée nulle, chute libre, cran conservé", () => {
    const depart = lem({ cran: CRANS_MAX, carburant: 0 });
    expect(sansCarburant(depart)).toBe(true);
    expect(poussee(depart)).toBe(0);

    const l = depart.step(0.5, NEUTRE);
    expect(l.velocity.y).toBeCloseTo(MOON_GRAVITY * 0.5, 10);
    expect(l.velocity.x).toBe(0);
    expect(l.cran).toBe(CRANS_MAX);
    expect(sansCarburant(l)).toBe(true);
  });

  it("réservoir qui se vide en cours de pas : poussée réduite, carburant à 0 pile", () => {
    // Cran 5 pendant 1 s demande 4 unités ; il n'en reste que 2, soit la
    // moitié : la poussée intégrée est la moitié de la poussée pleine.
    const l = lem({ cran: CRANS_MAX, carburant: 2 }).step(1, NEUTRE);
    expect(l.carburant).toBe(0);
    const delivree = -(l.velocity.y - MOON_GRAVITY);
    expect(delivree).toBeCloseTo(POUSSEE_MAX / 2, 10);
    expect(delivree).toBeLessThan(POUSSEE_MAX);
  });
});

describe("Lander — assiette", () => {
  it("tourne à VITESSE_ROTATION quand une flèche est tenue", () => {
    const droite = lem().step(1, entree(["tilt-right"]));
    expect(droite.assiette).toBeCloseTo(VITESSE_ROTATION, 10);
    const gauche = lem().step(1, entree(["tilt-left"]));
    expect(gauche.assiette).toBeCloseTo(-VITESSE_ROTATION, 10);
  });

  it("ne bouge pas quand les deux flèches sont tenues", () => {
    const l = lem({ assiette: 0.3 }).step(1, entree(["tilt-left", "tilt-right"]));
    expect(l.assiette).toBe(0.3);
  });

  it("bute à ±90° sans se retourner", () => {
    let l = lem();
    for (let i = 0; i < 10; i++) {
      l = l.step(0.5, entree(["tilt-right"]));
    }
    expect(l.assiette).toBeCloseTo(ASSIETTE_MAX, 10);

    let g = lem();
    for (let i = 0; i < 10; i++) {
      g = g.step(0.5, entree(["tilt-left"]));
    }
    expect(g.assiette).toBeCloseTo(-ASSIETTE_MAX, 10);
  });
});

describe("Lander — invariants", () => {
  it("ne mute jamais l'instance d'origine", () => {
    const depart = lem({ cran: 2, carburant: 10 });
    depart.step(1, entree(["tilt-right"], ["throttle-up"]));
    expect(depart.position).toBe(Vector2.ZERO);
    expect(depart.velocity).toBe(Vector2.ZERO);
    expect(depart.assiette).toBe(0);
    expect(depart.cran).toBe(2);
    expect(depart.carburant).toBe(10);
  });

  it("dt = 0 : l'entité rendue est équivalente à l'entrée", () => {
    const depart = lem({
      velocity: new Vector2(3, -4),
      assiette: 0.2,
      cran: 3,
      carburant: 42,
    });
    const l = depart.step(0, entree(["tilt-right"]));
    expect(l.id).toBe(depart.id);
    expect(l.position.x).toBe(depart.position.x);
    expect(l.position.y).toBe(depart.position.y);
    expect(l.velocity.x).toBe(depart.velocity.x);
    expect(l.velocity.y).toBe(depart.velocity.y);
    expect(l.assiette).toBe(depart.assiette);
    expect(l.cran).toBe(depart.cran);
    expect(l.carburant).toBe(depart.carburant);
    expect(l.radius).toBe(depart.radius);
  });

  it("porte le discriminant 'lander'", () => {
    expect(lem().kind).toBe("lander");
  });
});
