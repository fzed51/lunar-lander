import { describe, it, expect } from "vitest";
import { comparePartie, totalPoints, type CleClassement } from "./score.ts";

describe("totalPoints — somme des écarts", () => {
  it("additionne les écarts des manches réussies", () => {
    expect(totalPoints([12, 0, 45])).toBe(57);
  });

  it("vaut 0 sans aucune manche réussie", () => {
    expect(totalPoints([])).toBe(0);
  });

  it("vaut 0 sur un parcours parfait", () => {
    expect(totalPoints([0, 0, 0])).toBe(0);
  });

  it("ne dépend pas de l'ordre des manches", () => {
    expect(totalPoints([3, 8, 1])).toBe(totalPoints([1, 3, 8]));
  });
});

/** Partie de classement, réduite aux deux clés de tri. */
function partie(tempsDeVol: number, points: number): CleClassement {
  return { tempsDeVol, points };
}

describe("comparePartie — temps de vol d'abord, points ensuite", () => {
  it("classe le temps de vol le plus long en premier", () => {
    expect(comparePartie(partie(200, 50), partie(100, 0))).toBeLessThan(0);
    expect(comparePartie(partie(100, 0), partie(200, 50))).toBeGreaterThan(0);
  });

  it("arrondit le temps de vol à la seconde avant de comparer", () => {
    // 120,2 s et 119,9 s s'arrondissent tous deux à 120 : sans l'arrondi, deux
    // sommes de pas de temps flottants ne seraient jamais égales et la seconde
    // clé de tri ne servirait jamais.
    const long = partie(120.2, 40);
    const court = partie(119.9, 12);
    expect(comparePartie(long, court)).toBeGreaterThan(0);
    expect(comparePartie(court, long)).toBeLessThan(0);
  });

  it("à temps arrondi égal, met le plus petit total de points devant", () => {
    expect(comparePartie(partie(60, 10), partie(60, 30))).toBeLessThan(0);
    expect(comparePartie(partie(60, 30), partie(60, 10))).toBeGreaterThan(0);
  });

  it("rend 0 sur deux parties de mêmes clés", () => {
    expect(comparePartie(partie(60.4, 10), partie(60.1, 10))).toBe(0);
  });

  it("est antisymétrique et transitif sur un tri de vingt entrées mélangées", () => {
    const entrees: CleClassement[] = [];
    for (let i = 0; i < 20; i++) {
      // Temps volontairement fractionnaires, et des ex æquo à l'arrondi.
      entrees.push(partie(30 + (i % 5) * 10 + (i % 3) * 0.4, (i * 7) % 23));
    }

    // Antisymétrie sur toutes les paires.
    for (const a of entrees) {
      for (const b of entrees) {
        // Somme des signes plutôt que comparaison à l'opposé : `-Math.sign(0)`
        // vaut `-0`, que `toBe` distingue de `0`.
        expect(
          Math.sign(comparePartie(a, b)) + Math.sign(comparePartie(b, a)),
        ).toBe(0);
      }
    }

    // Transitivité sur tous les triplets.
    for (const a of entrees) {
      for (const b of entrees) {
        for (const c of entrees) {
          if (comparePartie(a, b) <= 0 && comparePartie(b, c) <= 0) {
            expect(comparePartie(a, c)).toBeLessThanOrEqual(0);
          }
        }
      }
    }

    // Le tri sort une suite ordonnée, et deux mélanges donnent le même ordre de
    // clés : le comparateur ne dépend pas de l'ordre d'entrée.
    const trie = [...entrees].sort(comparePartie);
    for (let i = 1; i < trie.length; i++) {
      const avant = trie[i - 1] as CleClassement;
      const apres = trie[i] as CleClassement;
      expect(comparePartie(avant, apres)).toBeLessThanOrEqual(0);
    }
    const melange = [...entrees].reverse().sort(comparePartie);
    expect(melange.map((e) => [Math.round(e.tempsDeVol), e.points])).toEqual(
      trie.map((e) => [Math.round(e.tempsDeVol), e.points]),
    );
  });
});
