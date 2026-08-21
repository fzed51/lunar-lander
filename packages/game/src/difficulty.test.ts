import { describe, it, expect } from "vitest";
import {
  carburantInitial,
  difficulteDe,
  vitesseHorizontaleInitiale,
} from "./difficulty.ts";
import {
  CARBURANT_BASE,
  CARBURANT_MIN,
  DIFFICULTE_MAX,
  NIVEAUX,
  PALIER_DIFFICULTE,
  VH_BASE,
  VH_MAX,
} from "./constants.ts";

describe("difficulteDe — montée par paliers doux", () => {
  it("part du niveau choisi à l'accueil", () => {
    expect(difficulteDe(NIVEAUX.facile, 0)).toBe(0);
    expect(difficulteDe(NIVEAUX.moyen, 0)).toBe(1);
    expect(difficulteDe(NIVEAUX.difficile, 0)).toBe(2);
  });

  it("demande treize manches réussies pour franchir un cran entier", () => {
    // La démonstration chiffrée du palier doux : douze manches ne suffisent pas.
    expect(difficulteDe(0, 12)).toBe(0.96);
    expect(difficulteDe(0, 13)).toBe(1.04);
  });

  it("ajoute exactement un palier par manche réussie", () => {
    expect(difficulteDe(0, 1) - difficulteDe(0, 0)).toBeCloseTo(
      PALIER_DIFFICULTE,
      12,
    );
  });

  it("plafonne à DIFFICULTE_MAX, quel que soit le nombre de manches", () => {
    expect(difficulteDe(2, 100)).toBe(DIFFICULTE_MAX);
    // Quarante manches de plus ne la font pas monter d'un cheveu.
    expect(difficulteDe(2, 140)).toBe(difficulteDe(2, 100));
    expect(difficulteDe(NIVEAUX.difficile, 5)).toBe(DIFFICULTE_MAX);
  });
});

describe("carburantInitial — dotation décroissante, plancher tenu", () => {
  it("donne la dotation de base à difficulté nulle", () => {
    expect(carburantInitial(0)).toBe(CARBURANT_BASE);
  });

  it("vaut 96,8 unités au plafond de difficulté, soit 17 % de marge", () => {
    // Le pire cas de terrain coûte ≈ 83 u : la manche reste gagnable.
    expect(carburantInitial(DIFFICULTE_MAX)).toBeCloseTo(96.8, 10);
  });

  it("ne descend jamais sous le plancher", () => {
    expect(carburantInitial(5)).toBe(CARBURANT_MIN);
    expect(carburantInitial(50)).toBe(CARBURANT_MIN);
  });

  it("décroît quand la difficulté monte", () => {
    expect(carburantInitial(1)).toBeLessThan(carburantInitial(0));
    expect(carburantInitial(2)).toBeLessThan(carburantInitial(1));
  });
});

describe("vitesseHorizontaleInitiale — norme réglée, signe imposé", () => {
  it("part de la vitesse de base à difficulté nulle", () => {
    expect(vitesseHorizontaleInitiale(0, 1)).toBe(VH_BASE);
  });

  it("prend le signe qu'on lui passe, et lui seul", () => {
    // Le signe vient de `terrain.depart.sens`, qui pointe vers la cible : aucun
    // tirage aléatoire ici.
    expect(vitesseHorizontaleInitiale(1, 1)).toBeGreaterThan(0);
    expect(vitesseHorizontaleInitiale(1, -1)).toBeLessThan(0);
    expect(vitesseHorizontaleInitiale(1, -1)).toBe(
      -vitesseHorizontaleInitiale(1, 1),
    );
  });

  it("suit la norme annoncée, plafonnée à VH_MAX", () => {
    expect(Math.abs(vitesseHorizontaleInitiale(DIFFICULTE_MAX, 1))).toBeCloseTo(
      22.4,
      10,
    );
    expect(vitesseHorizontaleInitiale(4, 1)).toBe(VH_MAX);
    expect(vitesseHorizontaleInitiale(10, 1)).toBe(VH_MAX);
    expect(vitesseHorizontaleInitiale(10, -1)).toBe(-VH_MAX);
  });
});
