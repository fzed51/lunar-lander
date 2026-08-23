import { describe, expect, it, vi } from "vitest";
import { createRng, Renderer } from "@lem/engine";
import {
  DRAPEAU_PERIODE,
  PIXEL,
  TERRE,
  TERRE_ROTATION,
} from "../constants.ts";
import { PALETTE } from "../design/palette.ts";
import { creteSol, dessineFond, poseDrapeau } from "./background.ts";
import { genereEtoiles, type Etoile } from "./stars.ts";

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
 * canvas, qu'aucune coordonnée n'est fractionnaire, et que rien ne passe par
 * `ctx.fill()` ni `ctx.stroke()`, qui antialiaseraient le disque de la Terre.
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

/** Le ciel de l'accueil : tiré une fois, sur une graine fixe. */
const ETOILES: readonly Etoile[] = genereEtoiles(createRng(19690720));

/** Une image du fond, et les rectangles qu'elle a posés. */
function image(temps: number): Rect[] {
  const { r, ctx } = creeRendu();
  dessineFond(r, temps, ETOILES);
  return ctx.rects;
}

/** Signature des pixels d'une couleur donnée dans une image du fond. */
function empreinte(temps: number, couleur: string): string {
  return image(temps)
    .filter((p) => p.couleur === couleur)
    .map((p) => `${p.x},${p.y},${p.largeur},${p.hauteur}`)
    .join("|");
}

// --- Gardes globales ---

describe("dessineFond — gardes", () => {
  it("ne pose que des couleurs de la palette", () => {
    const hors: string[] = [];
    for (const temps of [0, 0.37, 12.5, 137]) {
      const { r, ctx } = creeRendu();
      dessineFond(r, temps, ETOILES);
      for (const couleur of ctx.couleurs) {
        if (!COULEURS_PALETTE.has(couleur)) hors.push(`${temps}:${couleur}`);
      }
    }
    expect(hors).toEqual([]);
  });

  it("n'envoie aucune coordonnée fractionnaire au canvas", () => {
    const fautifs: string[] = [];
    for (const rect of image(3.14159)) {
      if (
        !Number.isInteger(rect.x) ||
        !Number.isInteger(rect.y) ||
        !Number.isInteger(rect.largeur) ||
        !Number.isInteger(rect.hauteur)
      ) {
        fautifs.push(`${rect.x},${rect.y},${rect.largeur},${rect.hauteur}`);
      }
    }
    expect(fautifs).toEqual([]);
  });

  it("ne peint rien hors du cadre", () => {
    for (const rect of image(7.5)) {
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.largeur).toBeLessThanOrEqual(PIXEL.width);
      expect(rect.y + rect.hauteur).toBeLessThanOrEqual(PIXEL.height);
    }
  });

  it("peint en rectangles pleins, jamais en fill(), stroke() ni fillText()", () => {
    const { r, ctx } = creeRendu();
    dessineFond(r, 1.25, ETOILES);
    expect(ctx.chemins).toEqual([]);
    expect(ctx.rects.length).toBeGreaterThan(0);
  });

  it("rend exactement la même image au même instant", () => {
    const signature = (temps: number): string =>
      image(temps)
        .map((p) => `${p.x},${p.y},${p.largeur},${p.hauteur},${p.couleur}`)
        .join("|");
    expect(signature(4.2)).toBe(signature(4.2));
  });

  it("ne consomme aucun tirage de Math.random, sur cent images", () => {
    const piege = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("Math.random n'a rien à faire dans le fond animé.");
    });
    try {
      for (let i = 0; i < 100; i++) image(i / 60);
      expect(piege).not.toHaveBeenCalled();
    } finally {
      piege.mockRestore();
    }
  });

  it("couvre toute la surface d'un ciel en bandes de palette", () => {
    // Le ciel efface l'image précédente : sans couverture complète, la dernière
    // image de l'écran de jeu resterait visible par bandes.
    const ciel = image(0).filter((p) => p.largeur === PIXEL.width);
    const hauteur = ciel.reduce((somme, p) => somme + p.hauteur, 0);
    expect(hauteur).toBe(PIXEL.height);
    expect(new Set(ciel.map((p) => p.couleur))).toEqual(
      new Set([PALETTE.espace, PALETTE.nuit]),
    );
  });
});

// --- La Terre ---

describe("la Terre du fond", () => {
  it("peint l'océan, les continents, l'atmosphère et la nuit", () => {
    const couleurs = new Set(image(0).map((p) => p.couleur));
    expect(couleurs.has(PALETTE.terreOcean)).toBe(true);
    expect(couleurs.has(PALETTE.terreSol)).toBe(true);
    expect(couleurs.has(PALETTE.terreCiel)).toBe(true);
    expect(couleurs.has(PALETTE.nuit)).toBe(true);
  });

  it("tient dans son disque", () => {
    const globe = image(0).filter(
      (p) =>
        p.couleur === PALETTE.terreOcean ||
        p.couleur === PALETTE.terreSol ||
        p.couleur === PALETTE.terreCiel,
    );
    expect(globe.length).toBeGreaterThan(0);
    for (const p of globe) {
      expect(p.x).toBeGreaterThanOrEqual(TERRE.centre.x - TERRE.rayon);
      expect(p.x + p.largeur).toBeLessThanOrEqual(
        TERRE.centre.x + TERRE.rayon + 1,
      );
      expect(p.y).toBeGreaterThanOrEqual(TERRE.centre.y - TERRE.rayon);
      expect(p.y).toBeLessThanOrEqual(TERRE.centre.y + TERRE.rayon);
    }
  });

  it("fait dériver les continents avec le temps, de façon déterministe", () => {
    const a = empreinte(0, PALETTE.terreSol);
    const b = empreinte(20, PALETTE.terreSol);
    expect(a).not.toBe("");
    expect(b).not.toBe("");
    expect(a).not.toBe(b);
    // Déterminisme : le même instant redonne exactement les mêmes pixels.
    expect(empreinte(20, PALETTE.terreSol)).toBe(b);
  });

  it("tourne assez lentement pour que 20 s ne fassent pas un tour", () => {
    // Garde de réglage : si la période tombait sur 20 s, le test de dérive
    // ci-dessus comparerait deux fois le même instant du cycle et passerait au
    // vert sans rien prouver.
    const periode = 1 / TERRE_ROTATION;
    expect(periode).toBeGreaterThan(20);
    expect(20 % periode).not.toBe(0);
  });

  it("revient au même dessin après un tour complet", () => {
    // Une rotation entière ramène les continents à leur place : la dérive est
    // bien une rotation, pas une déformation qui s'accumule.
    expect(empreinte(1 / TERRE_ROTATION, PALETTE.terreSol)).toBe(
      empreinte(0, PALETTE.terreSol),
    );
  });
});

// --- Sol lunaire ---

describe("le sol lunaire du fond", () => {
  it("rend une crête entière, déterministe, dans le bas de l'écran", () => {
    for (let x = 0; x < PIXEL.width; x++) {
      const y = creteSol(x);
      expect(Number.isInteger(y)).toBe(true);
      expect(y).toBeGreaterThan(PIXEL.height / 2);
      expect(y).toBeLessThan(PIXEL.height);
      expect(creteSol(x)).toBe(y);
    }
  });

  it("n'est pas plat", () => {
    const hauteurs = new Set<number>();
    for (let x = 0; x < PIXEL.width; x++) hauteurs.add(creteSol(x));
    expect(hauteurs.size).toBeGreaterThan(4);
  });

  it("bouche toute la largeur, corps sombre et liseré clair", () => {
    const sol = image(0).filter(
      (p) =>
        p.couleur === PALETTE.reliefSombre || p.couleur === PALETTE.reliefMoyen,
    );
    const colonnes = new Set(sol.map((p) => p.x));
    expect(colonnes.size).toBe(PIXEL.width);
    const couleurs = new Set(sol.map((p) => p.couleur));
    expect(couleurs).toEqual(
      new Set([PALETTE.reliefSombre, PALETTE.reliefMoyen]),
    );
  });

  it("ne bouge pas avec le temps", () => {
    expect(empreinte(0, PALETTE.reliefSombre)).toBe(
      empreinte(9.5, PALETTE.reliefSombre),
    );
  });
});

// --- Drapeau ---

describe("le drapeau du fond", () => {
  it("rend l'image 0 à t = 0, l'image 1 après un quart de période", () => {
    expect(poseDrapeau(0)).toBe(0);
    expect(poseDrapeau(DRAPEAU_PERIODE / 4)).toBe(1);
    expect(poseDrapeau(0.15)).toBe(1);
    expect(poseDrapeau(DRAPEAU_PERIODE / 2)).toBe(2);
  });

  it("reboucle au bout d'une période", () => {
    expect(poseDrapeau(DRAPEAU_PERIODE)).toBe(0);
    expect(poseDrapeau(0.6)).toBe(0);
    expect(poseDrapeau(DRAPEAU_PERIODE + 0.15)).toBe(1);
  });

  it("fait onduler la toile sur quatre poses distinctes, puis boucle", () => {
    const image1 = DRAPEAU_PERIODE / 4;
    const poses = [
      empreinte(0, PALETTE.alerte),
      empreinte(image1, PALETTE.alerte),
      empreinte(2 * image1, PALETTE.alerte),
      empreinte(3 * image1, PALETTE.alerte),
    ];
    expect(new Set(poses).size).toBe(4);
    expect(empreinte(DRAPEAU_PERIODE, PALETTE.alerte)).toBe(poses[0]);
  });

  it("plante son mât sur la crête du sol", () => {
    const mat = image(0).find(
      (p) => p.couleur === PALETTE.grisPale && p.hauteur > 1,
    );
    expect(mat).toBeDefined();
    const pied = (mat?.y ?? 0) + (mat?.hauteur ?? 0);
    expect(pied).toBe(creteSol(mat?.x ?? 0));
  });
});

// --- Étoiles ---

describe("les étoiles du fond", () => {
  it("pose un pixel par étoile, dans le cadre", () => {
    const teintes = new Set<string>([
      PALETTE.blanc,
      PALETTE.grisPale,
      PALETTE.grisClair,
    ]);
    const etoiles = image(0).filter(
      (p) => p.largeur === 1 && p.hauteur === 1 && teintes.has(p.couleur),
    );
    expect(etoiles.length).toBeGreaterThan(0);
    for (const p of etoiles) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThan(PIXEL.width);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThan(PIXEL.height);
    }
  });

  it("étale le champ sur toute la largeur du cadre", () => {
    // Le champ est remis à l'échelle du canvas, pas enroulé : sans cela la
    // moitié gauche du ciel serait deux fois plus étoilée que la droite.
    const abscisses = image(0)
      .filter((p) => p.largeur === 1 && p.hauteur === 1)
      .map((p) => p.x);
    expect(Math.min(...abscisses)).toBeLessThan(PIXEL.width / 4);
    expect(Math.max(...abscisses)).toBeGreaterThan((3 * PIXEL.width) / 4);
  });

  it("ne dépend pas du temps", () => {
    expect(empreinte(0, PALETTE.blanc)).toBe(empreinte(42, PALETTE.blanc));
  });
});
