// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Renderer, type InputSnapshot } from "@lem/engine";
import { NIVEAUX, PIXEL } from "../constants.ts";
import { PALETTE } from "../design/palette.ts";
import type { Command } from "../types.ts";
import { creeEcranAccueil } from "./home.ts";
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

/** Faux contexte 2D : de quoi instancier un `Renderer` et relire les pixels. */
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
 * Snapshot de commandes, construit à la main. L'écran d'accueil **reçoit** son
 * entrée : il ne sonde jamais le clavier, donc un objet littéral suffit et aucun
 * `KeyboardInput` n'est nécessaire.
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

interface Montage {
  readonly ecran: Ecran;
  readonly ctx: ContexteFactice;
  readonly ui: HTMLElement;
}

let montage: Montage;

/** Écran d'accueil monté sur un `#ui` neuf, mais **pas encore** activé. */
function monte(): Montage {
  document.body.innerHTML = '<div id="ui"></div>';
  const ui = document.querySelector<HTMLElement>("#ui");
  if (!ui) throw new Error("montage : #ui absent");
  const ctx = new ContexteFactice();
  const ecran = creeEcranAccueil({
    renderer: new Renderer(ctx as unknown as CanvasRenderingContext2D),
  });
  return { ecran, ctx, ui };
}

/** Un tick avec les fronts montants donnés. */
function appuie(...fronts: Command[]): void {
  montage.ecran.tick(DT, snapshot(fronts));
}

/** Les étiquettes des trois options, dans l'ordre du DOM. */
function etiquettes(): string[] {
  return [...montage.ui.querySelectorAll(".choix-option")].map(
    (n) => n.textContent ?? "",
  );
}

/** Étiquette de l'option marquée comme choisie. */
function choisie(): string {
  return montage.ui.querySelector(".choix-option.est-choisi")?.textContent ?? "";
}

/**
 * Niveau que l'écran enverrait à l'écran de jeu : on appuie sur Entrée et on
 * consomme la transition. C'est la seule lecture qui compte — c'est celle que le
 * gestionnaire fera.
 */
function niveauLance(): number {
  appuie("confirm");
  const t = montage.ecran.prendTransition();
  if (t?.nom !== "jeu") throw new Error("aucune transition vers le jeu");
  return t.params.niveau;
}

beforeEach(() => {
  montage = monte();
  montage.ecran.entre({ nom: "accueil" });
});

afterEach(() => {
  montage.ecran.sort();
  document.body.innerHTML = "";
});

// --- Contenu de l'écran ---

describe("écran d'accueil — contenu", () => {
  it("affiche le titre, les trois niveaux et les invites", () => {
    const texte = montage.ui.textContent ?? "";
    expect(montage.ui.querySelector(".ecran-titre")?.textContent).toBe("LEM");
    expect(etiquettes()).toEqual(["FACILE", "MOYEN", "DIFFICILE"]);
    expect(texte).toContain("ENTREE");
    expect(texte).toContain("HALL OF FAME");
    expect(texte).toContain("FLECHES");
  });

  it("marque le premier niveau au départ", () => {
    expect(choisie()).toBe("FACILE");
    expect(niveauLance()).toBe(NIVEAUX.facile);
  });
});

// --- Sélection du niveau ---

describe("écran d'accueil — sélection du niveau", () => {
  it("avance d'un cran à droite", () => {
    appuie("tilt-right");
    expect(choisie()).toBe("MOYEN");
    expect(niveauLance()).toBe(NIVEAUX.moyen);
  });

  it("recule d'un cran à gauche", () => {
    appuie("tilt-right");
    appuie("tilt-right");
    appuie("tilt-left");
    expect(choisie()).toBe("MOYEN");
    expect(niveauLance()).toBe(NIVEAUX.moyen);
  });

  it("reste sur FACILE quand on va à gauche depuis FACILE", () => {
    for (let i = 0; i < 3; i++) appuie("tilt-left");
    expect(choisie()).toBe("FACILE");
    expect(niveauLance()).toBe(NIVEAUX.facile);
  });

  it("reste sur DIFFICILE quand on va à droite depuis DIFFICILE", () => {
    // Pas de rebouclage : cinq appuis à droite ne ramènent pas sur FACILE, ce
    // qui ferait passer du plus dur au plus facile d'un seul appui.
    for (let i = 0; i < 5; i++) appuie("tilt-right");
    expect(choisie()).toBe("DIFFICILE");
    expect(niveauLance()).toBe(NIVEAUX.difficile);
  });

  it("retient le niveau choisi d'une partie à l'autre", () => {
    appuie("tilt-right");
    appuie("tilt-right");
    expect(niveauLance()).toBe(NIVEAUX.difficile);
    montage.ecran.sort();
    montage.ecran.entre({ nom: "accueil" });
    expect(choisie()).toBe("DIFFICILE");
    expect(niveauLance()).toBe(NIVEAUX.difficile);
  });
});

// --- Transitions ---

describe("écran d'accueil — transitions", () => {
  it("lance une partie avec une graine, tirée à la transition", () => {
    const avant = Date.now();
    appuie("confirm");
    const t = montage.ecran.prendTransition();
    expect(t?.nom).toBe("jeu");
    if (t?.nom !== "jeu") return;
    expect(Number.isInteger(t.params.graine)).toBe(true);
    expect(t.params.graine).toBeGreaterThanOrEqual(avant);
  });

  it("ouvre le hall of fame sur H", () => {
    appuie("hof");
    expect(montage.ecran.prendTransition()).toEqual({ nom: "hof" });
  });

  it("ne demande rien sans appui", () => {
    for (let i = 0; i < 30; i++) appuie();
    expect(montage.ecran.prendTransition()).toBeNull();
  });

  it("ignore une touche Entrée maintenue depuis l'écran précédent", () => {
    // `isActive` sans front montant : l'écran ne doit pas enchaîner deux écrans
    // d'un seul appui tenu.
    for (let i = 0; i < 10; i++) {
      montage.ecran.tick(DT, snapshot([], ["confirm"]));
    }
    expect(montage.ecran.prendTransition()).toBeNull();
  });

  it("ne demande qu'une transition, même en appuyant deux fois", () => {
    appuie("confirm");
    appuie("confirm");
    expect(montage.ecran.prendTransition()?.nom).toBe("jeu");
    expect(montage.ecran.prendTransition()).toBeNull();
  });

  it("ne relance aucune partie à la réactivation qui suit une transition", () => {
    // Le cas qui ferait défiler les écrans tout seuls : la demande consommée
    // par le gestionnaire ne doit pas revenir au passage suivant.
    appuie("confirm");
    expect(montage.ecran.prendTransition()?.nom).toBe("jeu");
    montage.ecran.sort();
    montage.ecran.entre({ nom: "accueil" });
    for (let i = 0; i < 60; i++) appuie();
    expect(montage.ecran.prendTransition()).toBeNull();
  });

  it("oublie une demande jamais appliquée en sortant", () => {
    appuie("confirm");
    montage.ecran.sort();
    expect(montage.ecran.prendTransition()).toBeNull();
    montage.ecran.entre({ nom: "accueil" });
    expect(montage.ecran.prendTransition()).toBeNull();
  });
});

// --- Sortie ---

describe("écran d'accueil — sortie", () => {
  it("vide son hôte et ne réagit plus aux touches", () => {
    montage.ecran.sort();
    expect(montage.ui.children.length).toBe(0);
    expect(montage.ui.textContent).toBe("");
    // Aucun écouteur résiduel, et un écran inerte : un appui à droite hors de
    // l'écran ne doit pas déplacer la sélection derrière le dos du joueur.
    appuie("tilt-right");
    appuie("confirm");
    expect(montage.ecran.prendTransition()).toBeNull();
    montage.ecran.entre({ nom: "accueil" });
    expect(choisie()).toBe("FACILE");
  });

  it("ne laisse rien après plusieurs allers-retours", () => {
    for (let i = 0; i < 3; i++) {
      montage.ecran.sort();
      montage.ecran.entre({ nom: "accueil" });
    }
    expect(montage.ui.querySelectorAll(".ecran-titre").length).toBe(1);
    montage.ecran.sort();
    expect(montage.ui.children.length).toBe(0);
  });
});

// --- Fond animé ---

describe("écran d'accueil — fond animé", () => {
  /** Les pixels d'étoile de la dernière image dessinée. */
  const etoilesRendues = (): string => {
    const teintes = new Set<string>([
      PALETTE.blanc,
      PALETTE.grisPale,
      PALETTE.grisClair,
    ]);
    return montage.ctx.rects
      .filter(
        (p) => p.largeur === 1 && p.hauteur === 1 && teintes.has(p.couleur),
      )
      .map((p) => `${p.x},${p.y},${p.couleur}`)
      .join("|");
  };

  it("dessine le fond sur la couche qu'on lui donne", () => {
    montage.ecran.rend();
    expect(montage.ctx.rects.length).toBeGreaterThan(0);
  });

  it("garde le même ciel d'une ouverture à l'autre", () => {
    montage.ecran.rend();
    const premier = etoilesRendues();
    expect(premier).not.toBe("");
    montage.ecran.sort();
    montage.ecran.entre({ nom: "accueil" });
    montage.ctx.rects.length = 0;
    montage.ecran.rend();
    expect(etoilesRendues()).toBe(premier);
  });

  it("fait avancer le fond avec le temps écoulé, pas avec le nombre d'images", () => {
    // 128 images de 1/512 s et 16 de 1/64 s couvrent le même quart de seconde de
    // fond : la même image doit sortir des deux côtés. Les deux pas sont des
    // puissances de deux, donc les deux sommes sont exactes au bit près — un
    // écart de dessin ne pourrait venir que du comptage des images.
    const image = (): string =>
      montage.ctx.rects
        .map((p) => `${p.x},${p.y},${p.largeur},${p.hauteur},${p.couleur}`)
        .join("|");

    for (let i = 0; i < 128; i++) montage.ecran.tick(1 / 512, snapshot());
    montage.ecran.rend();
    const fin = image();

    montage.ecran.sort();
    montage.ecran.entre({ nom: "accueil" });
    montage.ctx.rects.length = 0;
    for (let i = 0; i < 16; i++) montage.ecran.tick(1 / 64, snapshot());
    montage.ecran.rend();
    expect(image()).toBe(fin);
  });
});
