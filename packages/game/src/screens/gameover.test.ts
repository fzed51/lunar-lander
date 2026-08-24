// @vitest-environment happy-dom
import type { InputSnapshot } from "@lem/engine";
import { beforeEach, describe, expect, it } from "vitest";
import { NIVEAUX } from "../constants.ts";
import { CLE_HOF, lisHof, TAILLE_HOF, type EntreeHof } from "../hof.ts";
import type { ResultatPartie } from "../state.ts";
import { stockageMemoire, type Stockage } from "../storage.ts";
import type { Command } from "../types.ts";
import { creeEcranFin } from "./gameover.ts";
import type { Ecran } from "./types.ts";

// --- Outils du fichier ---

/** Un pas de temps de 60 images par seconde. */
const DT = 1 / 60;

/**
 * Snapshot de commandes, construit à la main. L'écran **reçoit** son entrée : il
 * ne sonde jamais le clavier, donc un objet littéral suffit.
 */
function snapshot(
  fronts: readonly Command[] = [],
  actives: readonly Command[] = [],
): InputSnapshot<Command> {
  return {
    justPressed: (c) => fronts.includes(c),
    isActive: (c) => actives.includes(c) || fronts.includes(c),
  };
}

/** Résultat de partie de référence, dont chaque test ne change que ce qui l'intéresse. */
function resultat(p: Partial<ResultatPartie> = {}): ResultatPartie {
  return {
    manchesReussies: 2,
    points: 42,
    tempsDeVol: 125,
    niveauDepart: NIVEAUX.moyen,
    abandonnee: false,
    ...p,
  };
}

interface Montage {
  readonly ecran: Ecran;
  readonly ui: HTMLElement;
  readonly stockage: Stockage;
}

let montage: Montage;

/** Écran de fin monté sur un `#ui` neuf, mais **pas encore** activé. */
function monte(stockage: Stockage = stockageMemoire()): Montage {
  document.body.innerHTML = '<div id="ui"></div>';
  const ui = document.querySelector<HTMLElement>("#ui");
  if (!ui) throw new Error("montage : #ui absent");
  return { ecran: creeEcranFin({ hote: ui, stockage }), ui, stockage };
}

/** Monte l'écran sur un stockage donné et l'active avec ce résultat. */
function ouvre(r: ResultatPartie, stockage?: Stockage): void {
  montage = monte(stockage);
  montage.ecran.entre({ nom: "fin", params: r });
}

/** Un tick avec les fronts montants donnés. */
function appuie(...fronts: Command[]): void {
  montage.ecran.tick(DT, snapshot(fronts));
}

/** Le texte complet de l'écran. */
function texteEcran(): string {
  return montage.ui.textContent ?? "";
}

/** Le bloc de saisie, ou `null` si l'écran n'en propose pas. */
function blocSaisie(): Element | null {
  return montage.ui.querySelector(".trigramme");
}

/** Les trois lettres affichées, dans l'ordre. */
function lettresAffichees(): string {
  return [...montage.ui.querySelectorAll(".trigramme-lettre")]
    .map((n) => n.textContent ?? "")
    .join("");
}

/** Index de la case marquée par le curseur, ou -1. */
function positionCurseur(): number {
  const cases = [...montage.ui.querySelectorAll(".trigramme-case")];
  return cases.findIndex((c) => c.classList.contains("est-actif"));
}

/** Le classement tel qu'il est stocké après les appuis du test. */
function classement(): readonly EntreeHof[] {
  return lisHof(montage.stockage);
}

/** Stockage préchargé avec cent parties longues : le classement est plein. */
function stockagePlein(): Stockage {
  const magasin = stockageMemoire();
  const entrees: EntreeHof[] = [];
  for (let i = 0; i < TAILLE_HOF; i++) {
    entrees.push({
      trigramme: "OLD",
      points: 0,
      tempsDeVol: 1000 + i,
      manchesReussies: 5,
      niveauDepart: NIVEAUX.facile,
      date: "2026-01-01T00:00:00.000Z",
    });
  }
  magasin.ecrit(CLE_HOF, JSON.stringify(entrees));
  return magasin;
}

beforeEach(() => {
  ouvre(resultat());
});

// --- Récapitulatif ---

describe("écran de fin — récapitulatif", () => {
  it("affiche manches, total, temps et niveau", () => {
    const texte = texteEcran();
    expect(texte).toContain("MANCHES REUSSIES 2");
    expect(texte).toContain("TOTAL 042 POINTS");
    expect(texte).toContain("TEMPS DE VOL 2:05");
    expect(texte).toContain("NIVEAU MOYEN");
  });

  it("rappelle que le plus petit score gagne", () => {
    expect(texteEcran()).toContain("MOINS DE POINTS = MIEUX");
  });

  it("distingue l'abandon de l'épuisement des vies", () => {
    expect(montage.ui.querySelector(".ecran-titre")?.textContent).toBe(
      "FIN DE PARTIE",
    );
    ouvre(resultat({ abandonnee: true }));
    expect(montage.ui.querySelector(".ecran-titre")?.textContent).toBe(
      "ABANDON",
    );
  });

  it("reste juste sur une partie vide", () => {
    ouvre(
      resultat({
        manchesReussies: 0,
        points: 0,
        tempsDeVol: 0,
        niveauDepart: NIVEAUX.facile,
      }),
    );
    const texte = texteEcran();
    expect(texte).toContain("MANCHES REUSSIES 0");
    expect(texte).toContain("TOTAL 000 POINTS");
    expect(texte).toContain("TEMPS DE VOL 0:00");
    expect(texte).toContain("NIVEAU FACILE");
  });
});

// --- Budget de hauteur ---

/**
 * Hauteur en pixels de jeu d'un enfant direct de `.ecran-fin`, d'après le
 * design system (`docs/design-system.md`, `src/design/ui.css`) : tailles de
 * police 8 / 16 / 24 / 32 px, `line-height: 1`. Le bloc `.trigramme` est la
 * seule pièce composite : une case fait 32 px de lettre + 8 px de gouttière +
 * 2 px de curseur.
 */
function hauteurEnfant(el: Element): number {
  if (el.classList.contains("ecran-titre")) return 32;
  if (el.classList.contains("ecran-ligne")) return 16;
  if (el.classList.contains("ecran-invite")) return 16;
  if (el.classList.contains("ecran-aide")) return 8;
  if (el.classList.contains("trigramme")) return 32 + 8 + 2;
  throw new Error(`hauteur inconnue pour la classe "${el.className}"`);
}

/**
 * Hauteur totale de la boîte `.ecran-fin`, gouttières et padding de `.ecran`
 * compris (`gap: 8px`, `padding: 8px`). Rejoue à la main l'empilement que le
 * CSS produit, puisque happy-dom ne calcule pas de vraie mise en page : c'est
 * le seul moyen de prouver, dans un test, que rien ne déborde des 180 px de la
 * scène au facteur d'agrandissement 1.
 */
function hauteurBoite(racine: Element): number {
  const enfants = [...racine.children];
  const contenu = enfants.reduce((total, e) => total + hauteurEnfant(e), 0);
  const gouttieres = Math.max(0, enfants.length - 1) * 8;
  const padding = 8 + 8;
  return contenu + gouttieres + padding;
}

describe("écran de fin — budget de hauteur", () => {
  /** Hauteur de la scène en pixels de jeu (`PIXEL.height` de `constants.ts`). */
  const HAUTEUR_SCENE = 180;

  it("tient dans la scène quand la partie est classée", () => {
    ouvre(resultat({ manchesReussies: 1 }));
    const racine = montage.ui.querySelector(".ecran-fin");
    expect(racine).not.toBeNull();
    if (!racine) return;
    expect(hauteurBoite(racine)).toBeLessThanOrEqual(HAUTEUR_SCENE);
  });

  it("tient dans la scène quand la partie n'est pas classée", () => {
    ouvre(resultat({ manchesReussies: 0, tempsDeVol: 9999 }));
    const racine = montage.ui.querySelector(".ecran-fin");
    expect(racine).not.toBeNull();
    if (!racine) return;
    expect(hauteurBoite(racine)).toBeLessThanOrEqual(HAUTEUR_SCENE);
  });
});

// --- Qualification ---

describe("écran de fin — qui a le droit de saisir un trigramme", () => {
  it("ne propose aucune saisie sans le moindre posé, même après 9 999 s de vol", () => {
    // La garde vit dans `estQualifie` : l'écran ne la contourne pas, et un temps
    // de vol énorme ne rachète pas une partie sans aucun atterrissage.
    ouvre(resultat({ manchesReussies: 0, points: 0, tempsDeVol: 9999 }));
    expect(blocSaisie()).toBeNull();
    expect(texteEcran()).toContain("ENTREE — RETOUR ACCUEIL");
  });

  it("n'écrit rien et rentre à l'accueil quand la partie n'est pas classable", () => {
    ouvre(resultat({ manchesReussies: 0, tempsDeVol: 9999 }));
    appuie("confirm");
    expect(montage.ecran.prendTransition()).toEqual({ nom: "accueil" });
    expect(classement()).toEqual([]);
  });

  it("propose la saisie dès une manche réussie", () => {
    ouvre(resultat({ manchesReussies: 1 }));
    expect(blocSaisie()).not.toBeNull();
    expect(lettresAffichees()).toBe("AAA");
    expect(texteEcran()).toContain("ENTREE VALIDER");
  });

  it("ne propose pas la saisie sur un classement plein et une partie moins bonne", () => {
    ouvre(resultat({ manchesReussies: 1, tempsDeVol: 12 }), stockagePlein());
    expect(blocSaisie()).toBeNull();
    expect(texteEcran()).toContain("ENTREE — RETOUR ACCUEIL");
  });

  it("propose la saisie sur un classement plein quand la partie le mérite", () => {
    ouvre(resultat({ manchesReussies: 1, tempsDeVol: 5000 }), stockagePlein());
    expect(blocSaisie()).not.toBeNull();
  });
});

// --- Saisie du trigramme ---

describe("écran de fin — saisie du trigramme", () => {
  beforeEach(() => {
    ouvre(resultat({ manchesReussies: 3 }));
  });

  it("fait défiler la lettre courante en boucle", () => {
    appuie("throttle-up");
    expect(lettresAffichees()).toBe("BAA");
    appuie("throttle-down");
    appuie("throttle-down");
    expect(lettresAffichees()).toBe("ZAA");
  });

  it("déplace le curseur, borné aux trois lettres", () => {
    expect(positionCurseur()).toBe(0);
    appuie("tilt-right");
    expect(positionCurseur()).toBe(1);
    for (let i = 0; i < 4; i++) appuie("tilt-right");
    expect(positionCurseur()).toBe(2);
    for (let i = 0; i < 4; i++) appuie("tilt-left");
    expect(positionCurseur()).toBe(0);
  });

  it("n'écrit que sur la lettre sous le curseur", () => {
    appuie("throttle-up");
    appuie("tilt-right");
    appuie("throttle-up");
    appuie("throttle-up");
    expect(lettresAffichees()).toBe("BCA");
  });

  it("enregistre la partie sous le trigramme saisi", () => {
    appuie("throttle-up");
    appuie("tilt-right");
    appuie("throttle-down");
    appuie("confirm");
    const liste = classement();
    expect(liste).toHaveLength(1);
    expect(liste[0]?.trigramme).toBe("BZA");
    expect(liste[0]?.points).toBe(42);
    expect(liste[0]?.tempsDeVol).toBe(125);
    expect(liste[0]?.manchesReussies).toBe(3);
    expect(liste[0]?.niveauDepart).toBe(NIVEAUX.moyen);
    expect(liste[0]?.date).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("accepte AAA sans qu'on touche à une flèche", () => {
    appuie("confirm");
    expect(classement()[0]?.trigramme).toBe("AAA");
  });

  it("part au classement en montrant l'entrée qui vient d'être écrite", () => {
    appuie("throttle-up");
    appuie("confirm");
    const t = montage.ecran.prendTransition();
    expect(t?.nom).toBe("hof");
    if (t?.nom !== "hof") return;
    expect(t.params?.misEnAvant.trigramme).toBe("BAA");
    expect(t.params?.misEnAvant.tempsDeVol).toBe(125);
  });

  it("transmet au classement la liste déjà écrite, pas une invitation à la relire", () => {
    // `ajouteAuHof` rend la liste qu'il vient d'écrire ; c'est elle qui doit
    // voyager dans la transition. Si l'écran du classement relit le stockage
    // de son côté au lieu de s'en servir, un stockage qui diverge entre les
    // deux appels (quota, navigation privée) ferait disparaître la partie
    // qu'on vient de valider sans le moindre message.
    appuie("throttle-up");
    appuie("confirm");
    const t = montage.ecran.prendTransition();
    expect(t?.nom).toBe("hof");
    if (t?.nom !== "hof") return;
    expect(t.params?.liste).toEqual(classement());
    expect(t.params?.liste?.some((e) => e.trigramme === "BAA")).toBe(true);
  });

  it("n'écrit qu'une entrée sur deux Entrée consécutifs", () => {
    appuie("confirm");
    appuie("confirm");
    appuie("confirm");
    expect(classement()).toHaveLength(1);
    expect(montage.ecran.prendTransition()?.nom).toBe("hof");
    expect(montage.ecran.prendTransition()).toBeNull();
  });

  it("ignore une touche Entrée maintenue depuis l'écran de jeu", () => {
    // `isActive` sans front montant : l'appui qui a servi ailleurs ne doit pas
    // valider un trigramme que le joueur n'a pas eu le temps de voir.
    for (let i = 0; i < 30; i++) {
      montage.ecran.tick(DT, snapshot([], ["confirm"]));
    }
    expect(classement()).toEqual([]);
    expect(montage.ecran.prendTransition()).toBeNull();
  });

  it("ne demande rien sans appui", () => {
    for (let i = 0; i < 30; i++) appuie();
    expect(montage.ecran.prendTransition()).toBeNull();
    expect(classement()).toEqual([]);
  });
});

// --- Sortie ---

describe("écran de fin — sortie", () => {
  it("vide son hôte et ne réagit plus aux touches", () => {
    ouvre(resultat({ manchesReussies: 1 }));
    appuie("throttle-up");
    montage.ecran.sort();
    expect(montage.ui.children.length).toBe(0);
    expect(montage.ui.textContent).toBe("");
    appuie("throttle-up");
    appuie("tilt-right");
    appuie("confirm");
    expect(montage.ecran.prendTransition()).toBeNull();
    expect(classement()).toEqual([]);
  });

  it("repart de AAA à l'activation suivante", () => {
    ouvre(resultat({ manchesReussies: 1 }));
    appuie("throttle-up");
    appuie("tilt-right");
    expect(lettresAffichees()).toBe("BAA");
    montage.ecran.sort();
    montage.ecran.entre({
      nom: "fin",
      params: resultat({ manchesReussies: 1 }),
    });
    expect(lettresAffichees()).toBe("AAA");
    expect(positionCurseur()).toBe(0);
  });

  it("oublie une demande jamais appliquée en sortant", () => {
    // Sans cet oubli, un retour ultérieur sur l'écran renverrait au classement
    // tout seul, sans qu'on touche une touche.
    ouvre(resultat({ manchesReussies: 1 }));
    appuie("confirm");
    montage.ecran.sort();
    expect(montage.ecran.prendTransition()).toBeNull();
    montage.ecran.entre({
      nom: "fin",
      params: resultat({ manchesReussies: 1 }),
    });
    expect(montage.ecran.prendTransition()).toBeNull();
    for (let i = 0; i < 10; i++) appuie();
    expect(montage.ecran.prendTransition()).toBeNull();
  });

  it("ne laisse rien après plusieurs allers-retours", () => {
    for (let i = 0; i < 3; i++) {
      montage.ecran.sort();
      montage.ecran.entre({ nom: "fin", params: resultat() });
    }
    expect(montage.ui.querySelectorAll(".ecran-titre").length).toBe(1);
    montage.ecran.sort();
    expect(montage.ui.children.length).toBe(0);
  });

  it("ne peint rien sur la couche de jeu", () => {
    // L'écran est entièrement en HTML : il ne reçoit aucun `Renderer` et son
    // rendu ne doit pas lever pour autant.
    expect(() => {
      montage.ecran.rend();
    }).not.toThrow();
  });
});
