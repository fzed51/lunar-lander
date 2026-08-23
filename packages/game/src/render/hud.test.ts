import { describe, expect, it, vi } from "vitest";
import { Renderer, Vector2 } from "@lem/engine";
import {
  CARBURANT_BASE,
  CRANS_MAX,
  LEM,
  MONDE,
  PIXEL,
  SEUIL_VX,
  SEUIL_VY,
  TERRAIN_PAS,
} from "../constants.ts";
import { mesureTexte } from "../design/font.ts";
import { PALETTE } from "../design/palette.ts";
import { carburantInitial, difficulteDe } from "../difficulty.ts";
import { Lander } from "../entities/Lander.ts";
import { evalueContact, type CauseCrash, type Verdict } from "../landing.ts";
import {
  nouvelleManche,
  nouvellePartie,
  type EtatPartie,
  type Globals,
} from "../state.ts";
import type { Terrain } from "../terrain.ts";
import {
  couleurSeuil,
  dessineHud,
  distanceCible,
  formateAltitude,
  formateCarburant,
  formateDifficulte,
  formateTemps,
  formateVitesse,
  texteCauses,
  JAUGE_CARBURANT,
  JAUGE_PUISSANCE,
  MARGE_HUD,
} from "./hud.ts";

// --- Outils du fichier ---

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly largeur: number;
  readonly hauteur: number;
  readonly couleur: string;
}

/**
 * Faux contexte 2D qui **enregistre** ce qu'on lui pose. C'est ce qui permet de
 * prouver par le comportement — et non par une relecture du source, impossible
 * sans `@types/node` dans ce paquet — qu'aucune couleur hors palette n'atteint le
 * canvas et qu'aucune ligne du tableau de bord ne déborde de l'écran.
 */
class ContexteFactice {
  fillStyle = "";
  strokeStyle = "";
  globalAlpha = 1;
  lineWidth = 1;
  font = "";
  textAlign = "left";
  textBaseline = "alphabetic";
  readonly canvas = { width: PIXEL.width, height: PIXEL.height };
  readonly rects: Rect[] = [];
  readonly couleurs = new Set<string>();
  readonly chemins: string[] = [];

  fillRect(x: number, y: number, largeur: number, hauteur: number): void {
    this.rects.push({ x, y, largeur, hauteur, couleur: this.fillStyle });
    this.couleurs.add(this.fillStyle);
  }

  clearRect(): void {}

  fill(): void {
    this.couleurs.add(this.fillStyle);
    this.chemins.push("fill");
  }

  stroke(): void {
    this.couleurs.add(this.strokeStyle);
    this.chemins.push("stroke");
  }

  fillText(): void {
    this.chemins.push("fillText");
  }

  save(): void {}
  restore(): void {}
  beginPath(): void {}
  closePath(): void {}
  moveTo(): void {}
  lineTo(): void {}
  rect(): void {}
  clip(): void {}
  arc(): void {}
  translate(): void {}
  rotate(): void {}
}

function creeRendu(): { r: Renderer; ctx: ContexteFactice } {
  const ctx = new ContexteFactice();
  return { r: new Renderer(ctx as unknown as CanvasRenderingContext2D), ctx };
}

/** Toutes les couleurs de la palette, sous la forme où elles atteignent le canvas. */
const COULEURS_PALETTE = new Set<string>(Object.values(PALETTE));

/** Coordonnée `y` de la surface du terrain plat de test. */
const SOL = 300;

/**
 * Terrain plat sur toute la largeur du monde. Il rend l'altitude et le verdict
 * prévisibles : posable partout, aucune aiguille pour heurter la coque.
 */
function terrainPlat(cibleX = 500): Terrain {
  const surface = new Array<number>(MONDE.largeur / TERRAIN_PAS + 1).fill(SOL);
  return {
    hf: { x0: 0, pas: TERRAIN_PAS, surface },
    secteurs: [],
    cible: { x: cibleX, y: SOL, largeur: 40 },
    replis: [],
    depart: { x: 100, sens: 1 },
  };
}

/** `y` du centre d'un LEM debout dont les pieds touchent pile la surface plate. */
const Y_CONTACT = SOL - LEM.hauteur / 2;

/** Partie de référence : elle fournit des globals complets et cohérents. */
const PARTIE = nouvellePartie(0, 7);

/** État de vol au-dessus du terrain plat, entités et globals ajustables. */
function etatDeTest(lem: Lander, patch: Partial<Globals> = {}): EtatPartie {
  return {
    entities: [lem],
    time: 0,
    globals: { ...PARTIE.globals, terrain: terrainPlat(), ...patch },
  };
}

/** LEM ordinaire, 80 m au-dessus du sol plat, moteur au cran 2. */
function lemDeVol(): Lander {
  return new Lander(
    0,
    new Vector2(480, SOL - 80),
    new Vector2(0.5, 1.2),
    0.1,
    2,
    100,
  );
}

/** Rects posés par un tableau de bord complet. */
function rectsDe(etat: EtatPartie): readonly Rect[] {
  const { r, ctx } = creeRendu();
  dessineHud(r, etat);
  return ctx.rects;
}

/** Couleurs posées par un tableau de bord complet. */
function couleursDe(etat: EtatPartie): ReadonlySet<string> {
  const { r, ctx } = creeRendu();
  dessineHud(r, etat);
  return ctx.couleurs;
}

// --- Formatage ---

describe("formateAltitude", () => {
  it("écrit quatre chiffres et le suffixe", () => {
    expect(formateAltitude(42)).toBe("0042 M");
  });

  it("écrit zéro sans le cacher", () => {
    expect(formateAltitude(0)).toBe("0000 M");
  });

  it("écrête les valeurs négatives à zéro", () => {
    // Un LEM enfoncé dans la roche après un crash n'a pas d'altitude négative.
    expect(formateAltitude(-3)).toBe("0000 M");
    expect(formateAltitude(-999)).toBe("0000 M");
  });

  it("garde la même largeur à tous les ordres de grandeur", () => {
    const largeurs = new Set(
      [0, 7, 42, 199, 1234, 9999, 99999].map((m) =>
        mesureTexte(formateAltitude(m)),
      ),
    );
    expect(largeurs.size).toBe(1);
  });
});

describe("formateVitesse", () => {
  it("écrit le signe, deux chiffres et une décimale", () => {
    expect(formateVitesse(1.44)).toBe("+01.4");
    expect(formateVitesse(-2)).toBe("-02.0");
  });

  it("rend toutes ses sorties à la même longueur", () => {
    const valeurs = [0, 0.04, -0.04, 1.44, -2, 12.35, -99.94, 250, -250];
    const longueurs = new Set(valeurs.map((v) => formateVitesse(v).length));
    expect(longueurs).toEqual(new Set([5]));
    const largeurs = new Set(
      valeurs.map((v) => mesureTexte(formateVitesse(v))),
    );
    expect(largeurs.size).toBe(1);
  });

  it("n'écrit jamais un moins qui ne veut rien dire", () => {
    // -0,04 m/s arrondi à la décimale vaut zéro : `-00.0` mentirait sur le sens.
    expect(formateVitesse(-0.04)).toBe("+00.0");
  });
});

describe("formateTemps", () => {
  it("écrit les minutes et les secondes", () => {
    expect(formateTemps(0)).toBe("0:00");
    expect(formateTemps(65)).toBe("1:05");
    expect(formateTemps(3599)).toBe("59:59");
  });

  it("ne tronque pas les minutes au-delà de 59:59", () => {
    expect(formateTemps(3600)).toBe("60:00");
    expect(formateTemps(7325)).toBe("122:05");
  });

  it("n'écrit pas de temps négatif", () => {
    expect(formateTemps(-5)).toBe("0:00");
  });
});

describe("formateCarburant", () => {
  it("écrit un pourcentage entier", () => {
    expect(formateCarburant(0, 140)).toBe("0 %");
    expect(formateCarburant(140, 140)).toBe("100 %");
    expect(formateCarburant(70, 140)).toBe("50 %");
  });

  it("compte sur la dotation réelle de la manche, pas sur CARBURANT_BASE", () => {
    // Réservoir plein au plafond de difficulté : 96,8 u, et c'est 100 %.
    const dotation = carburantInitial(2.4);
    expect(dotation).not.toBe(CARBURANT_BASE);
    expect(formateCarburant(dotation, dotation)).toBe("100 %");
  });

  it("n'écrit ni pourcentage négatif ni dépassement", () => {
    expect(formateCarburant(-1, 140)).toBe("0 %");
    expect(formateCarburant(200, 140)).toBe("100 %");
    expect(formateCarburant(10, 0)).toBe("0 %");
  });
});

describe("formateDifficulte", () => {
  it("écrit deux décimales", () => {
    expect(formateDifficulte(0)).toBe("0.00");
    expect(formateDifficulte(2.4)).toBe("2.40");
    expect(formateDifficulte(4)).toBe("4.00");
  });
});

// --- Seuils ---

describe("couleurSeuil", () => {
  it("rend accent dans les clous", () => {
    expect(couleurSeuil(1, SEUIL_VY)).toBe("accent");
    expect(couleurSeuil(SEUIL_VY, SEUIL_VY)).toBe("accent");
  });

  it("avertit entre le seuil et une fois et demie le seuil", () => {
    expect(couleurSeuil(SEUIL_VY * 1.2, SEUIL_VY)).toBe("flammeChaude");
    expect(couleurSeuil(SEUIL_VX * 1.2, SEUIL_VX)).toBe("flammeChaude");
  });

  it("alerte au-delà", () => {
    expect(couleurSeuil(SEUIL_VY * 2, SEUIL_VY)).toBe("alerte");
    expect(couleurSeuil(SEUIL_VX * 5, SEUIL_VX)).toBe("alerte");
  });

  it("ne met jamais en alerte une vitesse montante", () => {
    // `y` croît vers le bas : une vitesse négative est une remontée, et
    // `evalueContact` ne la sanctionne pas non plus.
    expect(couleurSeuil(-3, SEUIL_VY)).toBe("accent");
    expect(couleurSeuil(-50, SEUIL_VY)).toBe("accent");
  });

  it("ne rend que des clés de la palette", () => {
    for (const valeur of [-10, 0, 1, 2, 3, 10]) {
      expect(COULEURS_PALETTE.has(PALETTE[couleurSeuil(valeur, SEUIL_VY)])).toBe(
        true,
      );
    }
  });
});

// --- Distance à la cible ---

describe("distanceCible", () => {
  it("rend exactement l'écart que compte evalueContact", () => {
    const terrain = terrainPlat(500);
    for (const x of [500, 512.4, 487.5]) {
      const lem = new Lander(0, new Vector2(x, Y_CONTACT), Vector2.ZERO, 0, 0, 50);
      const verdict = evalueContact(terrain, lem);
      expect(verdict.pose).toBe(true);
      if (verdict.pose) {
        expect(distanceCible(lem, terrain)).toBe(verdict.ecart);
      }
    }
  });

  it("mesure l'écart horizontal, jamais une distance oblique", () => {
    const terrain = terrainPlat(500);
    // 200 m au-dessus du drapeau, pile à son abscisse : l'écart est nul.
    const lem = new Lander(0, new Vector2(500, SOL - 200), Vector2.ZERO, 0, 0, 50);
    expect(distanceCible(lem, terrain)).toBe(0);
  });
});

// --- Causes de crash ---

describe("texteCauses", () => {
  it("dit une cause en clair", () => {
    expect(texteCauses(["trop-vite-vertical"], 320)).toBe("TROP VITE");
  });

  it("dit toutes les causes quand elles tiennent", () => {
    const texte = texteCauses(["trop-vite-vertical", "trop-penche"], 320);
    expect(texte).toContain("TROP VITE");
    expect(texte).toContain("TROP PENCHE");
  });

  it("tronque proprement, sans dépasser la largeur donnée", () => {
    const toutes: readonly CauseCrash[] = [
      "trop-vite-vertical",
      "trop-vite-lateral",
      "trop-penche",
      "sol-accidente",
      "coque-heurtee",
      "hors-limites",
    ];
    const largeurMax = PIXEL.width - 2 * MARGE_HUD;
    const texte = texteCauses(toutes, largeurMax);
    expect(mesureTexte(texte)).toBeLessThanOrEqual(largeurMax);
    // La troncature est marquée, et la première cause est toujours dite.
    expect(texte.endsWith("...")).toBe(true);
    expect(texte).toContain("TROP VITE");
    // Les libellés retenus sont entiers : on retire des causes, on ne coupe pas
    // au milieu d'un mot.
    expect(texte).toContain("DERIVE LATERALE");
  });

  it("ne dit rien sans cause", () => {
    expect(texteCauses([], 320)).toBe("");
  });
});

// --- Dotation de carburant portée par les globals ---

describe("dotation de carburant de la manche", () => {
  it("est posée par nouvellePartie, à la difficulté du niveau choisi", () => {
    const partie = nouvellePartie(2, 99);
    const attendu = carburantInitial(difficulteDe(2, 0));
    expect(partie.globals.carburantInitial).toBe(attendu);
    expect(partie.globals.carburantInitial).not.toBe(CARBURANT_BASE);
  });

  it("est refaite par nouvelleManche, à la difficulté de la manche", () => {
    const depart: EtatPartie = {
      ...PARTIE,
      globals: { ...PARTIE.globals, manchesReussies: 13 },
    };
    const suivante = nouvelleManche(depart);
    expect(suivante.globals.carburantInitial).toBe(
      carburantInitial(difficulteDe(0, 13)),
    );
    // Elle vaut le réservoir plein du LEM neuf : les deux ne peuvent pas diverger.
    const lem = suivante.entities.find((e) => e.kind === "lander");
    expect(lem?.carburant).toBe(suivante.globals.carburantInitial);
  });
});

// --- Jauges ---

describe("dessineHud — jauge de carburant", () => {
  /** Coin haut-gauche du cadre de la jauge. */
  const CADRE = {
    x: MARGE_HUD,
    y: PIXEL.height - MARGE_HUD - JAUGE_CARBURANT.hauteur,
  };
  /** Le rect de remplissage : à l'intérieur du cadre, sur toute sa hauteur utile. */
  const remplissage = (rects: readonly Rect[]): Rect | undefined =>
    rects.find(
      (rect) =>
        rect.x === CADRE.x + 1 &&
        rect.y === CADRE.y + 1 &&
        rect.hauteur === JAUGE_CARBURANT.hauteur - 2,
    );

  it("prend globals.carburantInitial comme dénominateur, pas une constante", () => {
    // Manche en difficulté 2 : la dotation vaut 104 u, pas 140. Réservoir plein,
    // donc jauge pleine — avec CARBURANT_BASE au dénominateur elle serait aux
    // trois quarts.
    const partie = nouvellePartie(2, 4242);
    const dotation = partie.globals.carburantInitial;
    expect(dotation).toBeLessThan(CARBURANT_BASE);
    const pleine = remplissage(rectsDe(partie));
    expect(pleine?.largeur).toBe(JAUGE_CARBURANT.largeur - 2);
    expect(formateCarburant(dotation, dotation)).toBe("100 %");
  });

  it("se vide en proportion du réservoir", () => {
    const dotation = PARTIE.globals.carburantInitial;
    const largeurA = remplissage(
      rectsDe(
        etatDeTest(
          new Lander(0, new Vector2(480, SOL - 80), Vector2.ZERO, 0, 0, dotation / 2),
        ),
      ),
    )?.largeur;
    const largeurB = remplissage(
      rectsDe(
        etatDeTest(
          new Lander(0, new Vector2(480, SOL - 80), Vector2.ZERO, 0, 0, dotation),
        ),
      ),
    )?.largeur;
    expect(largeurA).toBeGreaterThan(0);
    expect(largeurB).toBeGreaterThan(largeurA ?? 0);
  });

  it("ne laisse aucune barre résiduelle réservoir vide", () => {
    const vide = new Lander(0, new Vector2(480, SOL - 80), Vector2.ZERO, 0, 0, 0);
    expect(remplissage(rectsDe(etatDeTest(vide)))).toBeUndefined();
  });
});

describe("dessineHud — jauge de puissance", () => {
  /** Barres allumées : les seules à porter la couleur de flamme claire. */
  const barresAllumees = (cran: number): number => {
    // Réservoir vide : la jauge de carburant ne peut pas peindre en flamme claire.
    const lem = new Lander(0, new Vector2(480, SOL - 80), Vector2.ZERO, 0, cran, 0);
    return rectsDe(etatDeTest(lem)).filter(
      (rect) =>
        rect.couleur === PALETTE.flammeClaire &&
        rect.largeur === JAUGE_PUISSANCE.largeurBarre,
    ).length;
  };

  it("allume autant de barres que de crans", () => {
    for (let cran = 0; cran <= CRANS_MAX; cran++) {
      expect(barresAllumees(cran)).toBe(cran);
    }
  });

  it("dessine aussi les barres éteintes, pour garder l'échelle", () => {
    const lem = new Lander(0, new Vector2(480, SOL - 80), Vector2.ZERO, 0, 0, 0);
    const eteintes = rectsDe(etatDeTest(lem)).filter(
      (rect) =>
        rect.couleur === PALETTE.reliefMoyen &&
        rect.largeur === JAUGE_PUISSANCE.largeurBarre,
    );
    expect(eteintes.length).toBe(CRANS_MAX);
  });
});

describe("dessineHud — vies", () => {
  const compte = (vies: number): number =>
    rectsDe(etatDeTest(lemDeVol(), { vies })).length;

  it("ajoute une silhouette par vie, toujours la même", () => {
    expect(compte(2) - compte(1)).toBe(compte(3) - compte(2));
    expect(compte(3)).toBeGreaterThan(compte(1));
  });

  it("ne dessine rien à zéro vie", () => {
    expect(compte(0)).toBeLessThan(compte(1));
  });

  it("passe au compte chiffré au-delà de cinq vies", () => {
    // L'affichage ne doit pas déborder si la règle des trois vies change un jour.
    expect(compte(9)).toBeLessThan(compte(5));
  });
});

// --- Bandeau de fin de manche ---

describe("dessineHud — bandeau de fin de manche", () => {
  const VERDICT_POSE: Verdict = { pose: true, ecart: 12 };
  const VERDICT_CRASH: Verdict = {
    pose: false,
    causes: ["trop-vite-vertical", "trop-penche"],
  };

  const enVol = (): number => rectsDe(etatDeTest(lemDeVol())).length;

  it("annonce le posé et son écart", () => {
    const rects = rectsDe(
      etatDeTest(lemDeVol(), { statut: "pose", dernierVerdict: VERDICT_POSE }),
    );
    expect(rects.length).toBeGreaterThan(enVol());
  });

  it("annonce le crash et ses causes", () => {
    const avecCauses = rectsDe(
      etatDeTest(lemDeVol(), { statut: "crash", dernierVerdict: VERDICT_CRASH }),
    ).length;
    const uneSeuleCause = rectsDe(
      etatDeTest(lemDeVol(), {
        statut: "crash",
        dernierVerdict: { pose: false, causes: ["trop-penche"] },
      }),
    ).length;
    expect(avecCauses).toBeGreaterThan(uneSeuleCause);
    expect(uneSeuleCause).toBeGreaterThan(enVol());
  });

  it("distingue le posé du crash par la couleur", () => {
    const pose = couleursDe(
      etatDeTest(lemDeVol(), { statut: "pose", dernierVerdict: VERDICT_POSE }),
    );
    const crash = couleursDe(
      etatDeTest(lemDeVol(), { statut: "crash", dernierVerdict: VERDICT_CRASH }),
    );
    expect(crash.has(PALETTE.alerte)).toBe(true);
    expect(pose.has(PALETTE.accent)).toBe(true);
  });

  it("ne s'affiche pas en pause : le voile de pause a son propre message", () => {
    expect(rectsDe(etatDeTest(lemDeVol(), { statut: "pause" })).length).toBe(
      enVol(),
    );
  });

  it("ne s'affiche pas sur un abandon, qui n'a pas de verdict", () => {
    expect(
      rectsDe(
        etatDeTest(lemDeVol(), {
          statut: "fini",
          abandonnee: true,
          dernierVerdict: null,
        }),
      ).length,
    ).toBe(enVol());
  });

  it("s'affiche sur le crash fatal, qui passe direct à fini", () => {
    // `enregistrePerte` met le statut à `"fini"` sans passer par `"crash"` à la
    // dernière vie : le bandeau doit quand même s'afficher.
    const rects = rectsDe(
      etatDeTest(lemDeVol(), {
        statut: "fini",
        vies: 0,
        dernierVerdict: VERDICT_CRASH,
      }),
    );
    expect(rects.length).toBeGreaterThan(enVol());
  });
});

// --- Gardes globales ---

describe("dessineHud — gardes", () => {
  /**
   * Les états les plus extrêmes que le tableau de bord puisse rencontrer :
   * altitude à quatre chiffres, vitesses à deux chiffres et une décimale, temps
   * au-delà de l'heure, manche à deux chiffres, difficulté au plafond, cinq causes
   * de crash, réservoir vide.
   */
  const EXTREMES: readonly EtatPartie[] = [
    etatDeTest(lemDeVol()),
    etatDeTest(
      new Lander(
        0,
        new Vector2(0, SOL - 9999),
        new Vector2(-99.9, 99.9),
        1.2,
        CRANS_MAX,
        0,
      ),
      {
        statut: "crash",
        vies: 9,
        tempsDeVol: 7325,
        numeroManche: 99,
        niveauDepart: 2,
        manchesReussies: 30,
        dernierVerdict: {
          pose: false,
          causes: [
            "trop-vite-vertical",
            "trop-vite-lateral",
            "trop-penche",
            "sol-accidente",
            "coque-heurtee",
          ],
        },
      },
    ),
    etatDeTest(
      new Lander(0, new Vector2(MONDE.largeur, Y_CONTACT), Vector2.ZERO, 0, 0, 140),
      { statut: "pose", dernierVerdict: { pose: true, ecart: 1234 } },
    ),
  ];

  it("ne pose que des couleurs de la palette", () => {
    const hors: string[] = [];
    for (const etat of EXTREMES) {
      for (const couleur of couleursDe(etat)) {
        if (!COULEURS_PALETTE.has(couleur)) hors.push(couleur);
      }
    }
    expect(hors).toEqual([]);
  });

  it("ne déborde jamais de 320 × 180, valeurs extrêmes comprises", () => {
    const fautifs: string[] = [];
    for (const etat of EXTREMES) {
      for (const rect of rectsDe(etat)) {
        if (
          rect.x < 0 ||
          rect.y < 0 ||
          rect.x + rect.largeur > PIXEL.width ||
          rect.y + rect.hauteur > PIXEL.height
        ) {
          fautifs.push(`${rect.x},${rect.y},${rect.largeur},${rect.hauteur}`);
        }
      }
    }
    expect(fautifs).toEqual([]);
  });

  it("n'envoie aucune coordonnée fractionnaire au canvas", () => {
    const fautifs: string[] = [];
    for (const etat of EXTREMES) {
      for (const rect of rectsDe(etat)) {
        if (
          !Number.isInteger(rect.x) ||
          !Number.isInteger(rect.y) ||
          !Number.isInteger(rect.largeur) ||
          !Number.isInteger(rect.hauteur)
        ) {
          fautifs.push(`${rect.x},${rect.y},${rect.largeur},${rect.hauteur}`);
        }
      }
    }
    expect(fautifs).toEqual([]);
  });

  it("peint en rectangles pleins, jamais en fill(), stroke() ni fillText()", () => {
    const { r, ctx } = creeRendu();
    for (const etat of EXTREMES) dessineHud(r, etat);
    expect(ctx.chemins).toEqual([]);
    expect(ctx.rects.length).toBeGreaterThan(0);
  });

  it("rend exactement les mêmes pixels pour le même état", () => {
    const image = (etat: EtatPartie): string =>
      rectsDe(etat)
        .map((p) => `${p.x},${p.y},${p.largeur},${p.hauteur},${p.couleur}`)
        .join("|");
    for (const etat of EXTREMES) expect(image(etat)).toBe(image(etat));
  });

  it("ne consomme aucun tirage de Math.random", () => {
    const piege = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("Math.random n'a rien à faire dans le tableau de bord.");
    });
    try {
      for (let i = 0; i < 100; i++) {
        const etat = EXTREMES[i % EXTREMES.length] as EtatPartie;
        const { r } = creeRendu();
        dessineHud(r, etat);
      }
      expect(piege).not.toHaveBeenCalled();
    } finally {
      piege.mockRestore();
    }
  });

  it("ne dessine ni jauge ni chiffre de vol sans LEM", () => {
    const sansLem: EtatPartie = { ...etatDeTest(lemDeVol()), entities: [] };
    expect(rectsDe(sansLem).length).toBeLessThan(
      rectsDe(etatDeTest(lemDeVol())).length,
    );
  });

  it("garde les colonnes immobiles quand les valeurs changent d'ordre de grandeur", () => {
    /** Bord droit du bloc haut gauche : il ne dépend que des largeurs fixes. */
    const bordDroitGauche = (etat: EtatPartie): number =>
      Math.max(
        ...rectsDe(etat)
          .filter((rect) => rect.y < 40 && rect.x < PIXEL.width / 2)
          .map((rect) => rect.x + rect.largeur),
      );
    /** Bord gauche du bloc haut droit, aligné à droite. */
    const bordGaucheDroite = (etat: EtatPartie): number =>
      Math.min(
        ...rectsDe(etat)
          .filter((rect) => rect.y < 40 && rect.x > PIXEL.width / 2)
          .map((rect) => rect.x),
      );

    const petit = etatDeTest(
      new Lander(0, new Vector2(499, SOL - 7), new Vector2(0.4, 1.1), 0, 1, 50),
      { tempsDeVol: 9, numeroManche: 1 },
    );
    const grand = etatDeTest(
      new Lander(0, new Vector2(0, SOL - 9999), new Vector2(-99.9, 99.9), 0, 1, 50),
      { tempsDeVol: 7325, numeroManche: 99 },
    );

    expect(bordDroitGauche(petit)).toBe(bordDroitGauche(grand));
    expect(bordGaucheDroite(petit)).toBe(bordGaucheDroite(grand));
  });

  it("tient chaque bloc de texte dans la largeur de l'écran", () => {
    const largeurMax = PIXEL.width - 2 * MARGE_HUD;
    const blocs = [
      `ALT ${formateAltitude(9999)}`,
      `VY ${formateVitesse(-99.9)}`,
      `VX ${formateVitesse(99.9)}`,
      `CIBLE ${formateAltitude(9999)}`,
      `TPS ${formateTemps(7325)}`,
      "MANCHE 99",
      `DIFF ${formateDifficulte(4)}`,
      "100 %",
    ];
    for (const bloc of blocs) {
      expect(mesureTexte(bloc)).toBeLessThanOrEqual(largeurMax);
    }
    // Le bandeau est écrit à l'échelle 2 : il tient encore, centré.
    expect(
      mesureTexte(`POSE - ECART ${formateAltitude(1234)}`, { echelle: 2 }),
    ).toBeLessThanOrEqual(largeurMax);
  });

  it("colore les vitesses selon leur seuil, pas au hasard", () => {
    const couleursVol = (vy: number, vx: number): ReadonlySet<string> =>
      couleursDe(
        etatDeTest(
          new Lander(
            0,
            new Vector2(480, SOL - 80),
            new Vector2(vx, vy),
            0,
            0,
            PARTIE.globals.carburantInitial,
          ),
        ),
      );
    // Dans les clous : aucune couleur d'alerte ni d'avertissement au tableau.
    const sages = couleursVol(SEUIL_VY / 2, SEUIL_VX / 2);
    expect(sages.has(PALETTE.alerte)).toBe(false);
    expect(sages.has(PALETTE.flammeChaude)).toBe(false);
    // Franchement hors des clous : l'alerte apparaît.
    expect(couleursVol(SEUIL_VY * 3, 0).has(PALETTE.alerte)).toBe(true);
    // Sur le palier intermédiaire : l'avertissement, sans alerte.
    const avertis = couleursVol(SEUIL_VY * 1.2, 0);
    expect(avertis.has(PALETTE.flammeChaude)).toBe(true);
    expect(avertis.has(PALETTE.alerte)).toBe(false);
  });
});
