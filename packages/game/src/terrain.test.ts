import { describe, it, expect, vi } from "vitest";
import { createRng, denivele, largeur, surfaceEn } from "@lem/engine";
import {
  ETENDUE_PLATE_MIN,
  LEM,
  MONDE,
  PENTE_MAX_DOUCE,
  PIXEL,
  PLATEFORME_ECHANTILLONS_BASE,
  REPLI_DISTANCE_PALIERS,
  REPLI_ECHANTILLONS,
  REPLI_MARGE_RACCORD,
  TERRAIN_PAS,
  TERRAIN_SECTEURS,
  TERRAIN_Y_MAX,
  TERRAIN_Y_MIN,
  TERRAIN_Y_TRAVAIL_MAX,
  TERRAIN_Y_TRAVAIL_MIN,
} from "./constants.ts";
import {
  construitSurfaceDeBase,
  estPosable,
  genereTerrain,
  poseReplis,
  type Plateau,
  type SecteurTerrain,
  type Terrain,
} from "./terrain.ts";

/**
 * Plafond de difficulté visé par l'équilibrage. La constante `DIFFICULTE_MAX`
 * arrive avec la logique de manche (T9) ; la valeur est reprise ici pour que le
 * balayage éprouve dès maintenant le cas dur — à difficulté 0, la probabilité
 * d'un secteur accidenté n'est que de 0,25 et les configurations serrées ne
 * sortent jamais.
 */
const DIFFICULTE_MAX = 2.4;

/** Nombre de graines balayées par les gardes statistiques. */
const GRAINES = 200;

/** Dénivelé maximal toléré entre deux échantillons d'un secteur doux (m). */
const MARCHE_MAX_DOUCE = PENTE_MAX_DOUCE * TERRAIN_PAS;

/**
 * Tolérance flottante des comparaisons de marche. L'écrêtage repose la valeur à
 * exactement `± MARCHE_MAX_DOUCE` de son voisin ; l'écart relu peut manquer la
 * borne du dernier bit.
 */
const EPS = 1e-9;

const ECHANTILLONS_PAR_SECTEUR = (MONDE.largeur / TERRAIN_PAS) / TERRAIN_SECTEURS;

/** Index du secteur qui porte le segment `[i, i + 1]`. */
function secteurDuSegment(i: number): number {
  return Math.min(TERRAIN_SECTEURS - 1, Math.floor(i / ECHANTILLONS_PAR_SECTEUR));
}

/** Index du secteur qui contient l'abscisse `x`. */
function secteurDeX(x: number): number {
  return Math.min(
    TERRAIN_SECTEURS - 1,
    Math.floor(x / (MONDE.largeur / TERRAIN_SECTEURS)),
  );
}

/** Index de l'échantillon d'abscisse `x`. */
function echantillonDeX(x: number): number {
  return Math.round(x / TERRAIN_PAS);
}

/** Bornes en échantillons de la zone aplatie d'un plateau publié. */
function span(plateau: { x: number; largeur: number }): {
  debut: number;
  fin: number;
} {
  const demi = plateau.largeur / TERRAIN_PAS / 2;
  return { debut: echantillonDeX(plateau.x) - demi, fin: echantillonDeX(plateau.x) + demi };
}

describe("genereTerrain — déterminisme", () => {
  it("rend deux fois le même relief pour une même graine et une même difficulté", () => {
    for (const difficulte of [0, DIFFICULTE_MAX]) {
      const a = genereTerrain(1234, difficulte);
      const b = genereTerrain(1234, difficulte);
      expect(a.hf.surface).toStrictEqual(b.hf.surface);
      expect(a.secteurs).toStrictEqual(b.secteurs);
      expect(a.cible).toStrictEqual(b.cible);
      expect(a.replis).toStrictEqual(b.replis);
      expect(a.depart).toStrictEqual(b.depart);
    }
  });

  it("rend des reliefs différents pour deux graines différentes", () => {
    const a = genereTerrain(1, 0);
    const b = genereTerrain(2, 0);
    expect(a.hf.surface).not.toStrictEqual(b.hf.surface);
  });

  it("rend des reliefs différents pour deux difficultés différentes", () => {
    const a = genereTerrain(7, 0);
    const b = genereTerrain(7, DIFFICULTE_MAX);
    expect(a.hf.surface).not.toStrictEqual(b.hf.surface);
  });

  it("ne consomme aucun tirage de Math.random", () => {
    // Le paquet n'embarque pas les types Node : impossible de relire le source
    // au travers de `node:fs` sans ajouter une dépendance d'outillage. On
    // éprouve donc la garde à l'exécution, ce qui vaut mieux qu'une recherche
    // textuelle : `Math.random` est remplacé par un piège, et toute la
    // génération est déroulée sur les deux difficultés extrêmes.
    const piege = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("Math.random n'a rien à faire dans la génération du relief.");
    });
    try {
      for (let graine = 0; graine < 50; graine++) {
        genereTerrain(graine, 0);
        genereTerrain(graine, DIFFICULTE_MAX);
      }
      expect(piege).not.toHaveBeenCalled();
    } finally {
      piege.mockRestore();
    }
  });
});

describe("genereTerrain — géométrie du champ", () => {
  const terrain = genereTerrain(42, 0);

  it("compte exactement 2^8 + 1 échantillons", () => {
    expect(terrain.hf.surface).toHaveLength(257);
    expect(Math.log2(terrain.hf.surface.length - 1)).toBe(8);
  });

  it("échantillonne tous les 5 m depuis l'origine du monde", () => {
    expect(terrain.hf.x0).toBe(0);
    expect(terrain.hf.pas).toBe(TERRAIN_PAS);
  });

  it("couvre exactement la largeur du monde", () => {
    expect(largeur(terrain.hf)).toBe(MONDE.largeur);
  });

  it("découpe le monde en secteurs égaux et jointifs", () => {
    expect(terrain.secteurs).toHaveLength(TERRAIN_SECTEURS);
    let attendu = 0;
    for (const secteur of terrain.secteurs) {
      expect(secteur.xDebut).toBe(attendu);
      attendu += MONDE.largeur / TERRAIN_SECTEURS;
      expect(secteur.xFin).toBe(attendu);
    }
    expect(attendu).toBe(MONDE.largeur);
  });

  it("garde toutes les valeurs dans la bande du monde", () => {
    for (const difficulte of [0, DIFFICULTE_MAX]) {
      for (let graine = 0; graine < GRAINES; graine++) {
        const surface = genereTerrain(graine, difficulte).hf.surface;
        expect(Math.min(...surface), `graine ${graine}`).toBeGreaterThanOrEqual(
          TERRAIN_Y_MIN,
        );
        expect(Math.max(...surface), `graine ${graine}`).toBeLessThanOrEqual(
          TERRAIN_Y_MAX,
        );
      }
    }
  });

  it("tient dans la bande de travail avant la passe de pics et de canyons", () => {
    // C'est cette marge qui garantit qu'aucune aiguille ni aucun canyon n'est
    // rogné ensuite : une aiguille écrêtée n'est plus une aiguille.
    for (const difficulte of [0, DIFFICULTE_MAX]) {
      for (let graine = 0; graine < GRAINES; graine++) {
        const surface = construitSurfaceDeBase(graine, difficulte).surface;
        expect(Math.min(...surface), `graine ${graine}`).toBeGreaterThanOrEqual(
          TERRAIN_Y_TRAVAIL_MIN - EPS,
        );
        expect(Math.max(...surface), `graine ${graine}`).toBeLessThanOrEqual(
          TERRAIN_Y_TRAVAIL_MAX + EPS,
        );
      }
    }
  });

  it("ne colle jamais plus de deux échantillons sur une borne de la bande", () => {
    // Garde anti-écrêtage : un écrêtage échantillon par échantillon fabriquerait
    // une mesa plate, donc posable, au milieu d'un secteur accidenté.
    for (let graine = 0; graine < GRAINES; graine++) {
      const surface = genereTerrain(graine, DIFFICULTE_MAX).hf.surface;
      let suite = 0;
      let pireSuite = 0;
      for (const y of surface) {
        if (y === TERRAIN_Y_MIN || y === TERRAIN_Y_MAX) suite++;
        else suite = 0;
        pireSuite = Math.max(pireSuite, suite);
      }
      expect(pireSuite, `graine ${graine}`).toBeLessThanOrEqual(2);
    }
  });
});

describe("genereTerrain — mixité des secteurs", () => {
  it("garde au moins 2 secteurs doux et 2 secteurs accidentés", () => {
    for (const difficulte of [0, DIFFICULTE_MAX, 10]) {
      for (let graine = 0; graine < GRAINES; graine++) {
        const secteurs = genereTerrain(graine, difficulte).secteurs;
        const accidentes = secteurs.filter((s) => s.accidente).length;
        expect(accidentes, `graine ${graine}`).toBeGreaterThanOrEqual(2);
        expect(secteurs.length - accidentes, `graine ${graine}`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("garde toujours un secteur doux d'indice intérieur", () => {
    for (const difficulte of [0, DIFFICULTE_MAX, 10]) {
      for (let graine = 0; graine < GRAINES; graine++) {
        const secteurs = genereTerrain(graine, difficulte).secteurs;
        const interieursDoux = secteurs
          .slice(1, TERRAIN_SECTEURS - 1)
          .filter((s) => !s.accidente);
        expect(interieursDoux.length, `graine ${graine}`).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("rend un secteur accidenté nettement plus tourmenté qu'un secteur doux", () => {
    let sommeDoux = 0;
    let nDoux = 0;
    let sommeAccidente = 0;
    let nAccidente = 0;
    for (let graine = 0; graine < 50; graine++) {
      const terrain = genereTerrain(graine, DIFFICULTE_MAX);
      for (let s = 0; s < TERRAIN_SECTEURS; s++) {
        const premier = s * ECHANTILLONS_PAR_SECTEUR;
        let somme = 0;
        for (let i = premier; i < premier + ECHANTILLONS_PAR_SECTEUR; i++) {
          somme += Math.abs(
            (terrain.hf.surface[i + 1] ?? 0) - (terrain.hf.surface[i] ?? 0),
          );
        }
        if (terrain.secteurs[s]?.accidente) {
          sommeAccidente += somme / ECHANTILLONS_PAR_SECTEUR;
          nAccidente++;
        } else {
          sommeDoux += somme / ECHANTILLONS_PAR_SECTEUR;
          nDoux++;
        }
      }
    }
    const moyenneDouce = sommeDoux / nDoux;
    const moyenneAccidentee = sommeAccidente / nAccidente;
    expect(moyenneAccidentee).toBeGreaterThan(moyenneDouce * 10);
  });

  it("laisse dans chaque secteur accidenté au moins une abscisse non posable", () => {
    for (let graine = 0; graine < 50; graine++) {
      const terrain = genereTerrain(graine, DIFFICULTE_MAX);
      for (let s = 0; s < TERRAIN_SECTEURS; s++) {
        if (!terrain.secteurs[s]?.accidente) continue;
        const premier = s * ECHANTILLONS_PAR_SECTEUR;
        let refuse = false;
        for (let i = premier; i <= premier + ECHANTILLONS_PAR_SECTEUR; i++) {
          if (!estPosable(terrain, i * TERRAIN_PAS)) {
            refuse = true;
            break;
          }
        }
        expect(refuse, `graine ${graine}, secteur ${s}`).toBe(true);
      }
    }
  });

  it("rend un secteur accidenté posable au plus sur une petite part de sa largeur", () => {
    // Le test précédent ne suffit pas : `poseAccidents` creuse toujours un
    // canyon, qui fournit à lui seul l'abscisse non posable attendue, même si
    // tout le reste du secteur est plat. C'est exactement ce qui arrivait avec
    // une décroissance d'amplitude de 0,55 : 49 % des abscisses d'un secteur
    // « infranchissable » acceptaient le train, et le §5 du cahier des charges
    // (« zones franchement accidentées où poser est impossible ») était faux.
    //
    // On borne donc la **fraction** d'abscisses posables, balayée au mètre, avec
    // une marge de MARGE_BORD de chaque côté du secteur : les bords sont
    // partagés avec le secteur voisin, qui peut être doux et déteindre.
    // Symétriquement un plancher côté doux, sans quoi durcir le relief au point
    // de rendre tout le monde infranchissable passerait pour un progrès.
    const MARGE_BORD = 10;
    const LARGEUR_SECTEUR = MONDE.largeur / TERRAIN_SECTEURS;
    for (const difficulte of [0, DIFFICULTE_MAX]) {
      let posablesAccidente = 0;
      let totalAccidente = 0;
      let posablesDoux = 0;
      let totalDoux = 0;
      let pireSecteurAccidente = 0;
      let pireGraine = -1;
      for (let graine = 0; graine < GRAINES; graine++) {
        const terrain = genereTerrain(graine, difficulte);
        for (let s = 0; s < TERRAIN_SECTEURS; s++) {
          let posables = 0;
          let total = 0;
          const debut = s * LARGEUR_SECTEUR + MARGE_BORD;
          const fin = (s + 1) * LARGEUR_SECTEUR - MARGE_BORD;
          for (let x = debut; x <= fin; x += 1) {
            total++;
            if (estPosable(terrain, x)) posables++;
          }
          if (terrain.secteurs[s]?.accidente) {
            posablesAccidente += posables;
            totalAccidente += total;
            if (posables / total > pireSecteurAccidente) {
              pireSecteurAccidente = posables / total;
              pireGraine = graine;
            }
          } else {
            posablesDoux += posables;
            totalDoux += total;
          }
        }
      }
      const fractionAccidentee = posablesAccidente / totalAccidente;
      const fractionDouce = posablesDoux / totalDoux;
      expect(
        fractionAccidentee,
        `difficulté ${difficulte} : ${(100 * fractionAccidentee).toFixed(1)} % ` +
          `des abscisses accidentées sont posables`,
      ).toBeLessThanOrEqual(0.2);
      expect(
        pireSecteurAccidente,
        `difficulté ${difficulte}, pire secteur accidenté (graine ${pireGraine})`,
      ).toBeLessThanOrEqual(0.45);
      expect(
        fractionDouce,
        `difficulté ${difficulte} : ${(100 * fractionDouce).toFixed(1)} % ` +
          `des abscisses douces sont posables`,
      ).toBeGreaterThanOrEqual(0.7);
    }
  });

  it("respecte PENTE_MAX_DOUCE partout dans un secteur doux, plateaux raccordés", () => {
    for (const difficulte of [0, DIFFICULTE_MAX]) {
      for (let graine = 0; graine < GRAINES; graine++) {
        const terrain = genereTerrain(graine, difficulte);
        let pireMarche = 0;
        let pireSegment = -1;
        for (let i = 0; i < terrain.hf.surface.length - 1; i++) {
          if (terrain.secteurs[secteurDuSegment(i)]?.accidente) continue;
          const marche = Math.abs(
            (terrain.hf.surface[i + 1] ?? 0) - (terrain.hf.surface[i] ?? 0),
          );
          if (marche > pireMarche) {
            pireMarche = marche;
            pireSegment = i;
          }
        }
        expect(
          pireMarche,
          `graine ${graine}, segment ${pireSegment}`,
        ).toBeLessThanOrEqual(MARCHE_MAX_DOUCE + EPS);
      }
    }
  });

  it("raccorde les deux échantillons qui bordent chaque plateau", () => {
    for (const difficulte of [0, DIFFICULTE_MAX]) {
      for (let graine = 0; graine < GRAINES; graine++) {
        const terrain = genereTerrain(graine, difficulte);
        const plateaux = [terrain.cible, ...terrain.replis];
        for (const plateau of plateaux) {
          const { debut, fin } = span(plateau);
          for (const [dedans, dehors] of [
            [debut, debut - 1],
            [fin, fin + 1],
          ]) {
            const segment = Math.min(dedans as number, dehors as number);
            if (segment < 0 || segment >= terrain.hf.surface.length - 1) continue;
            if (terrain.secteurs[secteurDuSegment(segment)]?.accidente) continue;
            const marche = Math.abs(
              (terrain.hf.surface[segment + 1] ?? 0) -
                (terrain.hf.surface[segment] ?? 0),
            );
            expect(marche, `graine ${graine}, bord ${segment}`).toBeLessThanOrEqual(
              MARCHE_MAX_DOUCE + EPS,
            );
          }
        }
      }
    }
  });
});

describe("genereTerrain — plateforme cible", () => {
  it("tombe toujours dans un secteur doux d'indice intérieur, et y est posable", () => {
    for (const difficulte of [0, DIFFICULTE_MAX]) {
      for (let graine = 0; graine < GRAINES; graine++) {
        const terrain = genereTerrain(graine, difficulte);
        const secteur = secteurDeX(terrain.cible.x);
        expect(secteur, `graine ${graine}`).toBeGreaterThanOrEqual(1);
        expect(secteur, `graine ${graine}`).toBeLessThanOrEqual(TERRAIN_SECTEURS - 2);
        expect(terrain.secteurs[secteur]?.accidente, `graine ${graine}`).toBe(false);
        expect(estPosable(terrain, terrain.cible.x), `graine ${graine}`).toBe(true);
      }
    }
  });

  it("publie l'étendue réellement aplatie : dénivelé nul sur toute sa largeur", () => {
    for (const difficulte of [0, DIFFICULTE_MAX]) {
      for (let graine = 0; graine < GRAINES; graine++) {
        const { hf, cible } = genereTerrain(graine, difficulte);
        const gauche = cible.x - cible.largeur / 2;
        const droite = cible.x + cible.largeur / 2;
        expect(denivele(hf, gauche, droite), `graine ${graine}`).toBe(0);
        expect(surfaceEn(hf, cible.x)).toBe(cible.y);
      }
    }
  });

  it("garde une étendue plate au moins égale à la largeur du train plus deux pas", () => {
    for (const difficulte of [0, DIFFICULTE_MAX, 10]) {
      for (let graine = 0; graine < GRAINES; graine++) {
        const { cible } = genereTerrain(graine, difficulte);
        expect(cible.largeur, `graine ${graine}`).toBeGreaterThanOrEqual(
          ETENDUE_PLATE_MIN,
        );
        expect(ETENDUE_PLATE_MIN).toBe(LEM.largeurTrain + 2 * TERRAIN_PAS);
      }
    }
  });

  it("centre la cible exactement sur un échantillon", () => {
    for (let graine = 0; graine < GRAINES; graine++) {
      const { hf, cible } = genereTerrain(graine, DIFFICULTE_MAX);
      expect((cible.x - hf.x0) % TERRAIN_PAS, `graine ${graine}`).toBe(0);
    }
  });

  it("rétrécit la plateforme par paliers de deux échantillons, jamais sous le plancher", () => {
    // 9 échantillons (40 m) jusqu'à la difficulté 2, 7 (30 m) de 2 à 4, puis le
    // plancher de 5 (20 m) — le compte reste impair, la cible tombe donc bien sur
    // l'échantillon du milieu.
    const attendus: [number, number][] = [
      [0, 40],
      [1.9, 40],
      [2, 30],
      [DIFFICULTE_MAX, 30],
      [4, 20],
      [12, 20],
    ];
    for (const [difficulte, largeurAttendue] of attendus) {
      for (let graine = 0; graine < 20; graine++) {
        const { cible } = genereTerrain(graine, difficulte);
        expect(cible.largeur, `difficulté ${difficulte}`).toBe(largeurAttendue);
        const echantillons = cible.largeur / TERRAIN_PAS + 1;
        expect(echantillons % 2, `difficulté ${difficulte}`).toBe(1);
      }
    }
  });

  it("ne dépasse pas la largeur de base pour une difficulté aberrante", () => {
    const base = (PLATEFORME_ECHANTILLONS_BASE - 1) * TERRAIN_PAS;
    for (const difficulte of [-5, Number.NaN, Number.NEGATIVE_INFINITY]) {
      expect(genereTerrain(3, difficulte).cible.largeur).toBe(base);
    }
  });
});

describe("genereTerrain — replis", () => {
  const palierMin = REPLI_DISTANCE_PALIERS[REPLI_DISTANCE_PALIERS.length - 1] ?? 0;

  it("en pose toujours au moins un, et jamais plus que le maximum souhaité", () => {
    for (const difficulte of [0, DIFFICULTE_MAX]) {
      for (let graine = 0; graine < GRAINES; graine++) {
        const { replis } = genereTerrain(graine, difficulte);
        expect(replis.length, `graine ${graine}`).toBeGreaterThanOrEqual(1);
        expect(replis.length, `graine ${graine}`).toBeLessThanOrEqual(4);
      }
    }
  });

  it("en pose au moins deux dans la grande majorité des manches", () => {
    // `replis.length >= 1` ne suffit pas à tenir le « deux à quatre plateaux
    // supplémentaires » du cahier des charges : le plancher à 1 est un aveu de
    // géométrie, pas un régime normal. Le filtre anti-chevauchement a longtemps
    // réutilisé le palier de distance à la cible (150 m) comme écart minimal
    // entre deux replis ; un secteur ne fait que 160 m, et un tiers des manches
    // difficiles se retrouvait avec un seul plateau de secours.
    for (const difficulte of [0, DIFFICULTE_MAX]) {
      let auMoinsDeux = 0;
      for (let graine = 0; graine < GRAINES; graine++) {
        if (genereTerrain(graine, difficulte).replis.length >= 2) auMoinsDeux++;
      }
      expect(
        auMoinsDeux / GRAINES,
        `difficulté ${difficulte} : ${auMoinsDeux}/${GRAINES} manches ` +
          `offrent au moins deux replis`,
      ).toBeGreaterThanOrEqual(0.9);
    }
  });

  it("espace les replis de leur largeur plus la marge de raccord, pas du palier de cible", () => {
    for (const difficulte of [0, DIFFICULTE_MAX]) {
      for (let graine = 0; graine < GRAINES; graine++) {
        const { replis } = genereTerrain(graine, difficulte);
        for (let a = 0; a < replis.length; a++) {
          for (let b = a + 1; b < replis.length; b++) {
            const un = replis[a];
            const autre = replis[b];
            if (!un || !autre) continue;
            expect(
              Math.abs(un.x - autre.x),
              `graine ${graine}, replis ${a} et ${b}`,
            ).toBeGreaterThanOrEqual(un.largeur + REPLI_MARGE_RACCORD);
          }
        }
      }
    }
  });

  it("les rend posables, plats sur leur largeur publiée et hors de la cible", () => {
    for (const difficulte of [0, DIFFICULTE_MAX]) {
      for (let graine = 0; graine < GRAINES; graine++) {
        const terrain = genereTerrain(graine, difficulte);
        for (const repli of terrain.replis) {
          expect(estPosable(terrain, repli.x), `graine ${graine}`).toBe(true);
          expect(
            denivele(
              terrain.hf,
              repli.x - repli.largeur / 2,
              repli.x + repli.largeur / 2,
            ),
            `graine ${graine}`,
          ).toBe(0);
          expect(
            Math.abs(repli.x - terrain.cible.x),
            `graine ${graine}`,
          ).toBeGreaterThan(palierMin);
          expect(repli.largeur, `graine ${graine}`).toBeGreaterThanOrEqual(
            ETENDUE_PLATE_MIN,
          );
          expect(repli.largeur, `graine ${graine}`).toBeLessThanOrEqual(
            terrain.cible.largeur,
          );
          expect((repli.x - terrain.hf.x0) % TERRAIN_PAS).toBe(0);
          expect(terrain.secteurs[secteurDeX(repli.x)]?.accidente).toBe(false);
        }
      }
    }
  });

  it("ne les fait chevaucher ni entre eux ni avec la cible", () => {
    for (const difficulte of [0, DIFFICULTE_MAX]) {
      for (let graine = 0; graine < GRAINES; graine++) {
        const terrain = genereTerrain(graine, difficulte);
        const spans = [terrain.cible, ...terrain.replis].map(span);
        for (let a = 0; a < spans.length; a++) {
          for (let b = a + 1; b < spans.length; b++) {
            const gauche = spans[a];
            const droite = spans[b];
            if (!gauche || !droite) continue;
            const disjoints =
              gauche.fin < droite.debut || droite.fin < gauche.debut;
            expect(disjoints, `graine ${graine}, plateaux ${a} et ${b}`).toBe(true);
          }
        }
      }
    }
  });
});

describe("poseReplis — pire cas géométrique", () => {
  /** Deux secteurs doux adjacents, tout le reste accidenté. */
  const secteursPireCas = (): SecteurTerrain[] =>
    Array.from({ length: TERRAIN_SECTEURS }, (_, s) => ({
      xDebut: s * (MONDE.largeur / TERRAIN_SECTEURS),
      xFin: (s + 1) * (MONDE.largeur / TERRAIN_SECTEURS),
      accidente: s !== 3 && s !== 4,
    }));

  it("pose au moins un repli sans chevauchement, et termine", () => {
    // Cible collée à la frontière de son secteur : c'est la configuration où un
    // seuil de distance unique n'admettait plus aucun centre, et où un tirage
    // « jusqu'à ce que ça passe » ne terminait jamais.
    const centreCible = 4 * ECHANTILLONS_PAR_SECTEUR - 4;
    const plateauCible: Plateau = { centre: centreCible, echantillons: 9, y: 330 };
    for (let graine = 0; graine < 50; graine++) {
      const surface = new Array<number>(257).fill(330);
      const replis = poseReplis(
        createRng(graine),
        secteursPireCas(),
        surface,
        3,
        plateauCible,
      );
      expect(replis.length, `graine ${graine}`).toBeGreaterThanOrEqual(1);
      for (const repli of replis) {
        expect(repli.echantillons % 2).toBe(1);
        expect(repli.echantillons).toBeLessThanOrEqual(plateauCible.echantillons);
        expect(repli.echantillons).toBeGreaterThanOrEqual(REPLI_ECHANTILLONS.min);
        // Le repli vit dans l'autre secteur doux, à distance du drapeau.
        expect(secteurDeX(repli.centre * TERRAIN_PAS)).toBe(4);
        expect(
          Math.abs(repli.centre - centreCible) * TERRAIN_PAS,
        ).toBeGreaterThan(REPLI_DISTANCE_PALIERS[REPLI_DISTANCE_PALIERS.length - 1] ?? 0);
      }
      for (let a = 0; a < replis.length; a++) {
        for (let b = a + 1; b < replis.length; b++) {
          const un = replis[a];
          const autre = replis[b];
          if (!un || !autre) continue;
          const ecart = Math.abs(un.centre - autre.centre);
          expect(ecart).toBeGreaterThan((un.echantillons + autre.echantillons) / 2 - 1);
        }
      }
    }
  });
});

describe("genereTerrain — point de départ", () => {
  it("largue le LEM à la bonne distance de la cible, dans le monde", () => {
    for (const difficulte of [0, DIFFICULTE_MAX]) {
      for (let graine = 0; graine < GRAINES; graine++) {
        const { depart, cible } = genereTerrain(graine, difficulte);
        const distance = Math.abs(depart.x - cible.x);
        expect(distance, `graine ${graine}`).toBeGreaterThanOrEqual(250);
        expect(distance, `graine ${graine}`).toBeLessThanOrEqual(400);
        expect(depart.x, `graine ${graine}`).toBeGreaterThanOrEqual(PIXEL.width / 2);
        expect(depart.x, `graine ${graine}`).toBeLessThanOrEqual(
          MONDE.largeur - PIXEL.width / 2,
        );
      }
    }
  });

  it("oriente le sens du départ vers la cible", () => {
    for (let graine = 0; graine < GRAINES; graine++) {
      const { depart, cible } = genereTerrain(graine, DIFFICULTE_MAX);
      expect(depart.sens, `graine ${graine}`).toBe(cible.x > depart.x ? 1 : -1);
      expect(Math.sign(cible.x - depart.x), `graine ${graine}`).toBe(depart.sens);
    }
  });
});

describe("estPosable", () => {
  const terrain: Terrain = genereTerrain(9, 0);

  it("accepte le centre de la plateforme cible", () => {
    expect(estPosable(terrain, terrain.cible.x)).toBe(true);
  });

  it("refuse un point où le dénivelé sous le train dépasse le seuil", () => {
    // Le sommet d'une aiguille : le dénivelé sous les 8 m du train y vaut
    // plusieurs mètres.
    let refuse = false;
    for (let i = 0; i < terrain.hf.surface.length; i++) {
      if (!estPosable(terrain, i * TERRAIN_PAS)) {
        refuse = true;
        break;
      }
    }
    expect(refuse).toBe(true);
  });
});
