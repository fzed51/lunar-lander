// @vitest-environment happy-dom
import { KeyboardInput, Renderer, type InputSnapshot } from "@lem/engine";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NIVEAUX, PIXEL } from "../constants.ts";
import { CLE_HOF, lisHof, type EntreeHof } from "../hof.ts";
import { KEY_MAP } from "../input/mapping.ts";
import { stockageMemoire, type Stockage } from "../storage.ts";
import type { Command } from "../types.ts";
import { creeEcranHof, LIGNES_VISIBLES } from "./hof.ts";
import type { Ecran } from "./types.ts";

// --- Outils du fichier ---

/** Un pas de temps de 60 images par seconde. */
const DT = 1 / 60;

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly largeur: number;
  readonly hauteur: number;
  readonly couleur: string;
}

/** Faux contexte 2D : de quoi instancier un `Renderer` et compter les peintures. */
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

  fillRect(x: number, y: number, largeur: number, hauteur: number): void {
    this.rects.push({ x, y, largeur, hauteur, couleur: this.fillStyle });
  }

  clearRect(): void {}
  fill(): void {}
  stroke(): void {}
  fillText(): void {}
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

/**
 * Snapshot de commandes, construit à la main. L'écran **reçoit** son entrée : il
 * ne sonde jamais le clavier, donc un objet littéral suffit — sauf là où c'est
 * précisément le vrai clavier qu'on veut éprouver.
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

/** Les 26 lettres, pour fabriquer des trigrammes tous différents. */
const LETTRES = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Trigramme distinct pour chaque index, jusqu'à 676 entrées. */
function trigrammeDe(i: number): string {
  const haut = LETTRES[Math.floor(i / 26) % 26] ?? "A";
  const bas = LETTRES[i % 26] ?? "A";
  return `A${haut}${bas}`;
}

/** Entrée de référence, dont chaque test ne change que ce qui l'intéresse. */
function entree(p: Partial<EntreeHof> = {}): EntreeHof {
  return {
    trigramme: "ABC",
    points: 42,
    tempsDeVol: 125,
    manchesReussies: 2,
    niveauDepart: NIVEAUX.moyen,
    // Sans `Z` ni décalage : la chaîne se lit en heure locale, donc le jour
    // affiché est le même quel que soit le fuseau de la machine qui teste.
    date: "2026-08-23T12:00:00",
    ...p,
  };
}

/**
 * `n` entrées de temps de vol strictement décroissant : le tri du classement
 * conserve alors leur ordre de fabrication, et le rang d'une entrée vaut son
 * index plus un.
 */
function entrees(n: number): readonly EntreeHof[] {
  const liste: EntreeHof[] = [];
  for (let i = 0; i < n; i++) {
    liste.push(
      entree({ trigramme: trigrammeDe(i), tempsDeVol: 1000 - i, points: i }),
    );
  }
  return liste;
}

/** Magasin préchargé avec ces entrées, écrites telles quelles. */
function stockageAvec(liste: readonly EntreeHof[]): Stockage {
  const magasin = stockageMemoire();
  if (liste.length > 0) magasin.ecrit(CLE_HOF, JSON.stringify(liste));
  return magasin;
}

interface Montage {
  readonly ecran: Ecran;
  readonly ui: HTMLElement;
  readonly ctx: ContexteFactice;
  readonly stockage: Stockage;
}

let montage: Montage;

/** Écran du classement monté sur un `#ui` neuf, mais **pas encore** activé. */
function monte(stockage: Stockage): Montage {
  document.body.innerHTML = '<div id="ui"></div>';
  const ui = document.querySelector<HTMLElement>("#ui");
  if (!ui) throw new Error("montage : #ui absent");
  const ctx = new ContexteFactice();
  const ecran = creeEcranHof({
    hote: ui,
    renderer: new Renderer(ctx as unknown as CanvasRenderingContext2D),
    stockage,
  });
  return { ecran, ui, ctx, stockage };
}

/** Monte l'écran sur ces entrées et l'active depuis l'accueil. */
function ouvre(liste: readonly EntreeHof[]): void {
  montage = monte(stockageAvec(liste));
  montage.ecran.entre({ nom: "hof" });
}

/** Un tick avec les fronts montants donnés. */
function appuie(...fronts: Command[]): void {
  montage.ecran.tick(DT, snapshot(fronts));
}

/** Le texte complet de l'écran. */
function texteEcran(): string {
  return montage.ui.textContent ?? "";
}

/** Le classement tel qu'il est stocké après les appuis du test. */
function classement(): readonly EntreeHof[] {
  return lisHof(montage.stockage);
}

/** Les lignes de données de la fenêtre visible, en-tête exclue. */
function lignes(): HTMLElement[] {
  return [
    ...montage.ui.querySelectorAll<HTMLElement>(".hof-ligne:not(.hof-entete)"),
  ];
}

/** Le contenu d'une colonne, pour toutes les lignes visibles. */
function colonne(index: number): string[] {
  return lignes().map(
    (l) => l.querySelectorAll(".hof-col")[index]?.textContent ?? "",
  );
}

/** Les rangs affichés, vides compris. */
function rangs(): string[] {
  return colonne(0);
}

/** Le rang de la première ligne visible. */
function premierRang(): string {
  return rangs()[0] ?? "";
}

/** Le trigramme de la ligne mise en avant, ou `null` s'il n'y en a aucune. */
function trigrammeEnAvant(): string | null {
  const ligne = montage.ui.querySelector(".hof-ligne.est-en-avant");
  return ligne?.querySelectorAll(".hof-col")[1]?.textContent ?? null;
}

/** Nombre d'occurrences d'un texte dans l'écran. */
function occurrences(texte: string): number {
  return texteEcran().split(texte).length - 1;
}

beforeEach(() => {
  ouvre(entrees(30));
});

afterEach(() => {
  montage.ecran.sort();
  document.body.innerHTML = "";
});

// --- Contenu du tableau ---

describe("hall of fame — contenu", () => {
  it("affiche le titre, l'en-tête des colonnes et le rappel des touches", () => {
    const texte = texteEcran();
    expect(montage.ui.querySelector(".hof-titre")?.textContent).toBe(
      "HALL OF FAME",
    );
    expect(
      [...montage.ui.querySelectorAll(".hof-entete .hof-col")].map(
        (c) => c.textContent,
      ),
    ).toEqual(["RG", "TRI", "TEMPS", "PTS", "MAN", "NIVEAU", "DATE"]);
    expect(texte).toContain("R — REMISE A ZERO");
    expect(texte).toContain("ECHAP — RETOUR");
  });

  it("ne monte qu'une fenêtre de lignes, pas tout le classement", () => {
    expect(lignes()).toHaveLength(LIGNES_VISIBLES);
  });

  it("remplit chaque colonne de la première partie", () => {
    ouvre([
      entree({
        trigramme: "ZAP",
        points: 7,
        tempsDeVol: 125,
        manchesReussies: 4,
        niveauDepart: NIVEAUX.difficile,
      }),
    ]);
    const premiere = lignes()[0];
    expect(
      [...(premiere?.querySelectorAll(".hof-col") ?? [])].map(
        (c) => c.textContent,
      ),
    ).toEqual(["1", "ZAP", "2:05", "7", "4", "DIFFICILE", "23/08/2026"]);
  });

  it("classe les parties du plus long vol au plus court", () => {
    ouvre([
      entree({ trigramme: "AAA", tempsDeVol: 10 }),
      entree({ trigramme: "BBB", tempsDeVol: 300 }),
      entree({ trigramme: "CCC", tempsDeVol: 120 }),
    ]);
    expect(colonne(1).slice(0, 3)).toEqual(["BBB", "CCC", "AAA"]);
  });

  it("laisse vides les lignes au-delà de la fin du classement", () => {
    ouvre(entrees(2));
    expect(rangs()).toEqual([
      "1",
      "2",
      ...Array<string>(LIGNES_VISIBLES - 2).fill(""),
    ]);
  });

  it("annonce un classement vide au lieu d'un tableau blanc", () => {
    ouvre([]);
    expect(texteEcran()).toContain("AUCUNE PARTIE ENREGISTREE");
    expect(lignes()).toHaveLength(0);
  });
});

// --- Défilement ---

describe("hall of fame — défilement", () => {
  it("descend et remonte d'une ligne", () => {
    expect(premierRang()).toBe("1");
    appuie("throttle-down");
    expect(premierRang()).toBe("2");
    appuie("throttle-up");
    expect(premierRang()).toBe("1");
  });

  it("saute d'une page entière à gauche et à droite", () => {
    appuie("tilt-right");
    expect(premierRang()).toBe(String(LIGNES_VISIBLES + 1));
    appuie("tilt-left");
    expect(premierRang()).toBe("1");
  });

  it("ne remonte pas au-dessus de la première ligne", () => {
    for (let i = 0; i < 5; i++) appuie("throttle-up");
    appuie("tilt-left");
    expect(premierRang()).toBe("1");
  });

  it("ne descend pas sous la dernière ligne", () => {
    // 30 entrées, une fenêtre de `LIGNES_VISIBLES` : la dernière page commence
    // au rang 30 − LIGNES_VISIBLES + 1, et pas une ligne plus bas.
    for (let i = 0; i < 60; i++) appuie("throttle-down");
    const dernier = String(30 - LIGNES_VISIBLES + 1);
    expect(premierRang()).toBe(dernier);
    expect(rangs().at(-1)).toBe("30");
    for (let i = 0; i < 5; i++) appuie("tilt-right");
    expect(premierRang()).toBe(dernier);
  });

  it("ne bouge pas quand le classement tient dans une page", () => {
    ouvre(entrees(3));
    for (let i = 0; i < 10; i++) appuie("throttle-down");
    appuie("tilt-right");
    expect(premierRang()).toBe("1");
  });

  it("ne lève pas sur un classement vide", () => {
    ouvre([]);
    expect(() => {
      for (let i = 0; i < 5; i++) {
        appuie("throttle-down");
        appuie("throttle-up");
        appuie("tilt-right");
        appuie("tilt-left");
      }
    }).not.toThrow();
    expect(texteEcran()).toContain("AUCUNE PARTIE ENREGISTREE");
  });
});

// --- Mise en évidence de l'entrée qui vient d'être classée ---

describe("hall of fame — entrée mise en avant", () => {
  it("ne souligne rien quand on arrive de l'accueil", () => {
    expect(trigrammeEnAvant()).toBeNull();
  });

  it("souligne l'entrée reçue et défile jusqu'à elle", () => {
    const liste = entrees(30);
    const vingtieme = liste[19];
    if (!vingtieme) throw new Error("fixture : vingtième entrée absente");
    montage = monte(stockageAvec(liste));
    montage.ecran.entre({ nom: "hof", params: { misEnAvant: vingtieme } });

    expect(trigrammeEnAvant()).toBe(vingtieme.trigramme);
    expect(rangs()).toContain("20");
    expect(
      montage.ui.querySelectorAll(".hof-ligne.est-en-avant"),
    ).toHaveLength(1);
  });

  it("garde la tête du classement quand l'entrée reçue n'y est plus", () => {
    montage = monte(stockageAvec(entrees(30)));
    montage.ecran.entre({
      nom: "hof",
      params: { misEnAvant: entree({ trigramme: "XYZ", tempsDeVol: 3 }) },
    });
    expect(premierRang()).toBe("1");
    expect(trigrammeEnAvant()).toBeNull();
  });

  it("oublie la mise en avant à l'ouverture suivante", () => {
    const liste = entrees(30);
    const troisieme = liste[2];
    if (!troisieme) throw new Error("fixture : troisième entrée absente");
    montage = monte(stockageAvec(liste));
    montage.ecran.entre({ nom: "hof", params: { misEnAvant: troisieme } });
    expect(trigrammeEnAvant()).toBe(troisieme.trigramme);
    montage.ecran.sort();
    montage.ecran.entre({ nom: "hof" });
    expect(trigrammeEnAvant()).toBeNull();
  });

  it("affiche la liste transmise par la transition, pas une relecture du stockage", () => {
    // Le stockage porte un vieux classement ; la transition porte celui que
    // `ajouteAuHof` vient de rendre, forcément différent ici. Si l'écran
    // relisait le stockage au lieu d'utiliser `params.liste`, il afficherait
    // le vieux classement et la partie qu'on vient de valider disparaîtrait
    // de l'écran sans le moindre message.
    const surDisque = entrees(5);
    const fraicheEntree = entree({ trigramme: "NEW", tempsDeVol: 5000 });
    const listeTransmise = [fraicheEntree, ...entrees(3)];
    montage = monte(stockageAvec(surDisque));
    montage.ecran.entre({
      nom: "hof",
      params: { misEnAvant: fraicheEntree, liste: listeTransmise },
    });
    expect(colonne(1).slice(0, listeTransmise.length)).toEqual(
      listeTransmise.map((e) => e.trigramme),
    );
    expect(trigrammeEnAvant()).toBe("NEW");
  });
});

// --- Remise à zéro ---

describe("hall of fame — remise à zéro", () => {
  it("demande confirmation au premier appui, sans rien effacer", () => {
    appuie("raz");
    expect(texteEcran()).toContain(
      "R A NOUVEAU POUR CONFIRMER — ECHAP POUR ANNULER",
    );
    expect(classement()).toHaveLength(30);
  });

  it("efface au second appui", () => {
    appuie("raz");
    appuie("raz");
    expect(classement()).toEqual([]);
    expect(texteEcran()).toContain("AUCUNE PARTIE ENREGISTREE");
    expect(texteEcran()).not.toContain("R A NOUVEAU POUR CONFIRMER");
  });

  it("ne confirme pas tout seul sur une touche R maintenue", () => {
    // Trois images : front montant à la première, touche encore enfoncée aux
    // deux suivantes. Un écran qui lirait `raz` à `isActive` viderait le
    // classement dès la deuxième, 16 ms après la demande.
    montage.ecran.tick(DT, snapshot(["raz"]));
    montage.ecran.tick(DT, snapshot([], ["raz"]));
    montage.ecran.tick(DT, snapshot([], ["raz"]));
    expect(classement()).toHaveLength(30);
    expect(occurrences("R A NOUVEAU POUR CONFIRMER")).toBe(1);
  });

  it("annule la confirmation sur Échap, sans quitter l'écran", () => {
    appuie("raz");
    appuie("back");
    expect(classement()).toHaveLength(30);
    expect(texteEcran()).not.toContain("R A NOUVEAU POUR CONFIRMER");
    expect(texteEcran()).toContain("R — REMISE A ZERO");
    expect(montage.ecran.prendTransition()).toBeNull();
    // La confirmation annulée ne se rejoue pas : le R suivant redemande.
    appuie("raz");
    expect(classement()).toHaveLength(30);
    expect(occurrences("R A NOUVEAU POUR CONFIRMER")).toBe(1);
  });

  it("ne garde aucune confirmation en attente d'une visite à l'autre", () => {
    appuie("raz");
    montage.ecran.sort();
    montage.ecran.entre({ nom: "hof" });
    expect(texteEcran()).not.toContain("R A NOUVEAU POUR CONFIRMER");
    // Un R laissé en attente à la visite précédente ne doit pas effacer les
    // cent entrées au retour : celui-ci ne fait que redemander.
    appuie("raz");
    expect(classement()).toHaveLength(30);
    expect(occurrences("R A NOUVEAU POUR CONFIRMER")).toBe(1);
  });
});

// --- Remise à zéro et raccourcis du navigateur ---

describe("hall of fame — R au vrai clavier", () => {
  /** Un appui complet sur une touche, modificateurs compris. */
  function touche(code: string, init: KeyboardEventInit = {}): void {
    window.dispatchEvent(new KeyboardEvent("keydown", { code, ...init }));
    window.dispatchEvent(new KeyboardEvent("keyup", { code, ...init }));
  }

  /** Deux appuis sur `R` avec ces modificateurs, sondés par le vrai clavier. */
  function deuxAppuisR(init: KeyboardEventInit = {}): void {
    const clavier = new KeyboardInput<Command>(KEY_MAP);
    try {
      for (let i = 0; i < 2; i++) {
        touche("KeyR", init);
        montage.ecran.tick(DT, clavier.poll());
      }
    } finally {
      clavier.dispose();
    }
  }

  it("prend deux R nus pour une remise à zéro", () => {
    // Le témoin du test suivant : la touche est bien mappée sur `raz`.
    deuxAppuisR();
    expect(classement()).toEqual([]);
  });

  it("ne prend pas Ctrl+R pour une remise à zéro", () => {
    // `Ctrl+R` recharge la page. Sans le filtre de modificateurs de
    // `KeyboardInput`, le joueur verrait la demande de confirmation, referait
    // `Ctrl+R` en croyant que rien n'a pris, et perdrait tout son classement.
    deuxAppuisR({ ctrlKey: true });
    expect(texteEcran()).not.toContain("R A NOUVEAU POUR CONFIRMER");
    expect(classement()).toHaveLength(30);
  });

  it("ne prend pas Cmd+R pour une remise à zéro", () => {
    deuxAppuisR({ metaKey: true });
    expect(texteEcran()).not.toContain("R A NOUVEAU POUR CONFIRMER");
    expect(classement()).toHaveLength(30);
  });
});

// --- Ce qui sort du stockage ---

describe("hall of fame — données du stockage", () => {
  it("affiche un trigramme hostile comme du texte, sans exécuter quoi que ce soit", () => {
    ouvre([entree({ trigramme: "<script>alert(1)</script>" })]);
    expect(montage.ui.querySelectorAll("script")).toHaveLength(0);
    expect(texteEcran()).not.toContain("<script>");
    // `lisHof` ramène déjà tout trigramme à trois lettres ; la cellule affiche
    // ce texte-là, et rien d'autre n'a été interprété au passage.
    const cellule = lignes()[0]?.querySelectorAll(".hof-col")[1];
    expect(cellule?.textContent).toMatch(/^[A-Z]{3}$/);
    expect(cellule?.children).toHaveLength(0);
  });

  it("n'écrit jamais Invalid Date pour une date illisible", () => {
    ouvre([entree({ date: "pas une date" })]);
    expect(texteEcran()).not.toContain("Invalid Date");
    expect(texteEcran()).toContain("--/--/----");
  });

  it("n'affiche pas les entrées corrompues du stockage", () => {
    const magasin = stockageMemoire();
    magasin.ecrit(CLE_HOF, "{ pas du JSON");
    montage = monte(magasin);
    montage.ecran.entre({ nom: "hof" });
    expect(texteEcran()).toContain("AUCUNE PARTIE ENREGISTREE");
  });
});

// --- Transitions ---

describe("hall of fame — transitions", () => {
  it("revient à l'accueil sur Échap", () => {
    appuie("back");
    expect(montage.ecran.prendTransition()).toEqual({ nom: "accueil" });
  });

  it("revient à l'accueil sur Entrée", () => {
    appuie("confirm");
    expect(montage.ecran.prendTransition()).toEqual({ nom: "accueil" });
  });

  it("ne demande rien sans appui", () => {
    for (let i = 0; i < 30; i++) appuie();
    expect(montage.ecran.prendTransition()).toBeNull();
  });

  it("ignore une touche Entrée maintenue depuis l'écran précédent", () => {
    for (let i = 0; i < 10; i++) {
      montage.ecran.tick(DT, snapshot([], ["confirm", "back", "raz"]));
    }
    expect(montage.ecran.prendTransition()).toBeNull();
    expect(classement()).toHaveLength(30);
  });

  it("ne demande qu'une transition, même en appuyant deux fois", () => {
    appuie("back");
    appuie("confirm");
    expect(montage.ecran.prendTransition()).toEqual({ nom: "accueil" });
    expect(montage.ecran.prendTransition()).toBeNull();
  });

  it("oublie une demande jamais appliquée en sortant", () => {
    appuie("back");
    montage.ecran.sort();
    expect(montage.ecran.prendTransition()).toBeNull();
    montage.ecran.entre({ nom: "hof" });
    expect(montage.ecran.prendTransition()).toBeNull();
  });
});

// --- Sortie ---

describe("hall of fame — sortie", () => {
  it("vide son hôte et ne réagit plus aux touches", () => {
    montage.ecran.sort();
    expect(montage.ui.children.length).toBe(0);
    expect(montage.ui.textContent).toBe("");
    appuie("raz");
    appuie("raz");
    appuie("throttle-down");
    appuie("confirm");
    expect(montage.ecran.prendTransition()).toBeNull();
    expect(classement()).toHaveLength(30);
  });

  it("repart en tête du classement à l'ouverture suivante", () => {
    appuie("tilt-right");
    expect(premierRang()).toBe(String(LIGNES_VISIBLES + 1));
    montage.ecran.sort();
    montage.ecran.entre({ nom: "hof" });
    expect(premierRang()).toBe("1");
  });

  it("ne laisse rien après plusieurs allers-retours", () => {
    for (let i = 0; i < 3; i++) {
      montage.ecran.sort();
      montage.ecran.entre({ nom: "hof" });
    }
    expect(montage.ui.querySelectorAll(".hof-titre").length).toBe(1);
    montage.ecran.sort();
    expect(montage.ui.children.length).toBe(0);
  });
});

// --- Fond animé ---

describe("hall of fame — fond animé", () => {
  it("dessine le fond sur la couche qu'on lui donne", () => {
    montage.ecran.rend();
    expect(montage.ctx.rects.length).toBeGreaterThan(0);
  });

  it("fait avancer le fond avec le temps écoulé, pas avec le nombre d'images", () => {
    const image = (): string =>
      montage.ctx.rects
        .map((p) => `${p.x},${p.y},${p.largeur},${p.hauteur},${p.couleur}`)
        .join("|");

    for (let i = 0; i < 128; i++) montage.ecran.tick(1 / 512, snapshot());
    montage.ecran.rend();
    const fin = image();

    montage.ecran.sort();
    montage.ecran.entre({ nom: "hof" });
    montage.ctx.rects.length = 0;
    for (let i = 0; i < 16; i++) montage.ecran.tick(1 / 64, snapshot());
    montage.ecran.rend();
    expect(image()).toBe(fin);
  });
});
