import { describe, expect, it, vi } from "vitest";
import {
  borne,
  createRng,
  creeCamera,
  Renderer,
  Vector2,
  type Camera,
} from "@lem/engine";
import {
  BIAIS_CAMERA_Y,
  CRANS_MAX,
  DEPART_Y,
  ETOILES_NOMBRE,
  MONDE,
  PIXEL,
  SEUILS_ZOOM,
  TERRAIN_PAS,
  ZOOMS,
} from "../constants.ts";
import { PALETTE } from "../design/palette.ts";
import { Lander } from "../entities/Lander.ts";
import {
  JAUGE_CARBURANT,
  JAUGE_PUISSANCE,
  MARGE_HUD,
} from "./hud.ts";
import { genereTerrain, type Terrain } from "../terrain.ts";
import { explosion, Particle } from "../entities/Particle.ts";
import {
  dessineCiel,
  dessineDrapeau,
  dessineEtoiles,
  dessineFlamme,
  dessineIndicateurCible,
  dessineLem,
  dessineParticules,
  dessinePause,
  dessineReplis,
  dessineTerrain,
  directionIndicateur,
  trancheVisible,
  zoomSuivant,
} from "./draw.ts";
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
 * Faux contexte 2D qui **enregistre** ce qu'on lui pose : chaque rectangle plein
 * avec la couleur en vigueur, et la trace des appels de chemin.
 *
 * C'est ce qui permet de prouver par le comportement — et non par une relecture
 * du source, impossible sans `@types/node` dans ce paquet — qu'aucune couleur
 * hors palette n'atteint le canvas, qu'aucune coordonnée n'est fractionnaire et
 * que rien ne passe par `ctx.fill()` ni `ctx.stroke()`, qui antialiaseraient les
 * diagonales.
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
  readonly effacements: string[] = [];

  fillRect(x: number, y: number, largeur: number, hauteur: number): void {
    this.rects.push({ x, y, largeur, hauteur, couleur: this.fillStyle });
    this.couleurs.add(this.fillStyle);
  }

  clearRect(x: number, y: number, largeur: number, hauteur: number): void {
    this.effacements.push(`${x},${y},${largeur},${hauteur}`);
  }

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

const VUE = { largeur: PIXEL.width, hauteur: PIXEL.height };

const LIMITES_MONDE = {
  xMin: 0,
  xMax: MONDE.largeur,
  yMin: 0,
  yMax: MONDE.hauteur,
};

/** Caméra bornée, comme celle que l'écran de jeu fabrique. */
function camera(x: number, y: number, zoom = 1): Camera {
  return borne(creeCamera(new Vector2(x, y), VUE, zoom), LIMITES_MONDE);
}

const TERRAIN: Terrain = genereTerrain(4242, 0);

/**
 * Un LEM au-dessus de la plateforme cible, penché, moteur au cran 3 : de quoi
 * exercer la rotation, le train et la flamme d'un seul coup.
 */
function lemDeTest(): Lander {
  return new Lander(
    0,
    new Vector2(TERRAIN.cible.x, TERRAIN.cible.y - 40),
    new Vector2(1.5, -2),
    0.35,
    3,
    50,
  );
}

/**
 * Une image complète, dans l'ordre de l'écran de jeu. Sert aux gardes globales :
 * palette, coordonnées entières, déterminisme, absence de tirage aléatoire.
 */
function dessineImage(
  r: Renderer,
  etoiles: readonly Etoile[],
  cam: Camera,
  lem: Lander,
  temps: number,
): void {
  dessineCiel(r);
  dessineEtoiles(r, etoiles, cam);
  dessineTerrain(r, TERRAIN, cam);
  dessineReplis(r, TERRAIN, cam);
  dessineDrapeau(r, TERRAIN.cible, cam, temps);
  dessineLem(r, lem, cam);
  dessineFlamme(r, lem, cam, temps);
  dessineIndicateurCible(r, TERRAIN.cible, cam);
  dessinePause(r);
}

// --- zoomSuivant ---

describe("zoomSuivant", () => {
  it("reste au zoom 1 en haute altitude", () => {
    expect(zoomSuivant(200, 1)).toBe(1);
  });

  it("resserre au zoom 2 sous le seuil d'entrée", () => {
    expect(zoomSuivant(30, 1)).toBe(2);
  });

  it("garde le zoom 2 dans la bande d'hystérésis", () => {
    // 42 est entre `vers2` (40) et `retour1` (44) : ni resserrement, ni retour.
    expect(zoomSuivant(42, 2)).toBe(2);
  });

  it("revient au zoom 1 au-dessus du seuil de retour", () => {
    expect(zoomSuivant(70, 2)).toBe(1);
  });

  it("resserre au zoom 4 à l'approche du sol", () => {
    expect(zoomSuivant(12, 2)).toBe(4);
  });

  it("garde le zoom 4 dans sa bande d'hystérésis", () => {
    // 20 est entre `vers4` (16) et `retour2` (22).
    expect(zoomSuivant(20, 4)).toBe(4);
  });

  it("relâche du zoom 4 au zoom 2 en remontant", () => {
    expect(zoomSuivant(30, 4)).toBe(2);
  });

  it("ne clignote pas à l'altitude exacte du seuil d'entrée du zoom 2", () => {
    // Pile au seuil, le cran courant est **conservé**, quel qu'il soit : c'est
    // l'absence d'aller-retour d'une image à l'autre qui compte, pas le côté sur
    // lequel le seuil tombe. Un cheveu en dessous, on resserre ; jusqu'au seuil
    // de retour, on reste resserré.
    expect(zoomSuivant(SEUILS_ZOOM.vers2, 1)).toBe(1);
    expect(zoomSuivant(SEUILS_ZOOM.vers2, 2)).toBe(2);
    expect(zoomSuivant(SEUILS_ZOOM.vers2 - 0.01, 1)).toBe(2);
    expect(zoomSuivant(SEUILS_ZOOM.retour1, 2)).toBe(2);
  });

  it("ne clignote pas à l'altitude exacte du seuil d'entrée du zoom 4", () => {
    expect(zoomSuivant(SEUILS_ZOOM.vers4, 2)).toBe(2);
    expect(zoomSuivant(SEUILS_ZOOM.vers4, 4)).toBe(4);
    expect(zoomSuivant(SEUILS_ZOOM.vers4 - 0.01, 2)).toBe(4);
    expect(zoomSuivant(SEUILS_ZOOM.retour2, 4)).toBe(4);
  });

  it("converge vers un cran stable, à toute altitude", () => {
    // La garde la plus forte contre le clignotement : à altitude figée, le zoom
    // se stabilise en deux crans au plus, et la même altitude rend ensuite
    // indéfiniment le même cran. Aucune oscillation possible, nulle part.
    for (let altitude = -10; altitude <= 200; altitude += 0.5) {
      for (const depart of ZOOMS) {
        let zoom: number = depart;
        for (let cran = 0; cran < 2; cran++) zoom = zoomSuivant(altitude, zoom);
        expect(zoomSuivant(altitude, zoom)).toBe(zoom);
      }
    }
  });

  it("ne rend jamais autre chose qu'une valeur de ZOOMS", () => {
    const autorises = new Set<number>(ZOOMS);
    for (const depart of [0, 1, 2, 3, 4, 8, Number.NaN]) {
      for (let altitude = -20; altitude <= 300; altitude++) {
        expect(autorises.has(zoomSuivant(altitude, depart))).toBe(true);
      }
    }
  });

  it("n'avance jamais de plus d'un cran par appel", () => {
    // Un saut de 1 à 4 en une image ferait doubler la taille des formes deux
    // fois d'un coup : la descente resterait entière mais l'image sauterait.
    expect(zoomSuivant(2, 1)).toBe(2);
    expect(zoomSuivant(400, 4)).toBe(2);
  });
});

// --- Étoiles ---

describe("genereEtoiles", () => {
  it("tire exactement ETOILES_NOMBRE étoiles", () => {
    expect(genereEtoiles(createRng(1)).length).toBe(ETOILES_NOMBRE);
  });

  it("est déterministe à graine fixée", () => {
    expect(genereEtoiles(createRng(99))).toEqual(genereEtoiles(createRng(99)));
  });

  it("rend des ciels différents pour deux graines différentes", () => {
    expect(genereEtoiles(createRng(1))).not.toEqual(genereEtoiles(createRng(2)));
  });

  it("place toutes les étoiles dans les bornes du monde", () => {
    for (const etoile of genereEtoiles(createRng(7))) {
      expect(etoile.x).toBeGreaterThanOrEqual(0);
      expect(etoile.x).toBeLessThanOrEqual(MONDE.largeur);
      expect(etoile.y).toBeGreaterThanOrEqual(0);
      expect(etoile.y).toBeLessThanOrEqual(MONDE.hauteur);
    }
  });

  it("ne prend ses teintes que dans la palette", () => {
    for (const etoile of genereEtoiles(createRng(11))) {
      expect(COULEURS_PALETTE.has(PALETTE[etoile.teinte])).toBe(true);
    }
  });

  it("ne consomme aucun tirage de Math.random", () => {
    const piege = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("Math.random n'a rien à faire dans le champ d'étoiles.");
    });
    try {
      for (let graine = 0; graine < 20; graine++) genereEtoiles(createRng(graine));
      expect(piege).not.toHaveBeenCalled();
    } finally {
      piege.mockRestore();
    }
  });
});

// --- Tranche visible du relief ---

describe("trancheVisible", () => {
  it("ne retient qu'une poignée d'échantillons au zoom 4", () => {
    const cam = camera(640, 300, 4);
    const { premier, dernier } = trancheVisible(TERRAIN.hf, cam);
    const retenus = dernier - premier + 1;
    expect(TERRAIN.hf.surface.length).toBe(257);
    expect(retenus).toBeLessThan(30);
    // La vue couvre 320 / 4 = 80 m, soit 16 pas d'échantillonnage, plus la marge.
    expect(retenus).toBeGreaterThanOrEqual(80 / TERRAIN_PAS);
  });

  it("couvre toute la vue, marge comprise", () => {
    const cam = camera(640, 300, 4);
    const { premier, dernier } = trancheVisible(TERRAIN.hf, cam);
    // Bornes de la vue : 640 ± 40.
    expect(premier * TERRAIN_PAS).toBeLessThan(600);
    expect(dernier * TERRAIN_PAS).toBeGreaterThan(680);
  });

  it("reste dans les bornes du champ aux extrémités du monde", () => {
    const gauche = trancheVisible(TERRAIN.hf, camera(0, 300, 1));
    expect(gauche.premier).toBe(0);
    const droite = trancheVisible(TERRAIN.hf, camera(MONDE.largeur, 300, 1));
    expect(droite.dernier).toBe(TERRAIN.hf.surface.length - 1);
  });
});

// --- Indicateur de cible ---

describe("directionIndicateur", () => {
  it("ne pointe nulle part quand la cible est dans la vue", () => {
    const cam = camera(TERRAIN.cible.x, TERRAIN.cible.y, 1);
    expect(directionIndicateur(cam, TERRAIN.cible)).toBeNull();
  });

  it("pointe vers le bas quand la cible est sous la vue", () => {
    // Même abscisse, cible 200 m plus bas : le seul débord est vertical.
    const cam = creeCamera(new Vector2(500, 100), VUE, 1);
    expect(directionIndicateur(cam, { x: 500, y: 300 })).toBe("bas");
  });

  it("pointe vers le haut quand la cible est au-dessus de la vue", () => {
    const cam = creeCamera(new Vector2(500, 300), VUE, 1);
    expect(directionIndicateur(cam, { x: 500, y: 100 })).toBe("haut");
  });

  it("pointe latéralement quand le débord horizontal est le plus grand", () => {
    const cam = creeCamera(new Vector2(500, 300), VUE, 1);
    expect(directionIndicateur(cam, { x: 900, y: 310 })).toBe("droite");
    expect(directionIndicateur(cam, { x: 100, y: 310 })).toBe("gauche");
  });

  it("garde le débord vertical quand il domine le débord latéral", () => {
    // 20 m de débord à droite contre 200 m en dessous : c'est « bas » qui
    // renseigne, et c'est le cas du largage.
    const cam = creeCamera(new Vector2(500, 100), VUE, 1);
    expect(directionIndicateur(cam, { x: 680, y: 400 })).toBe("bas");
  });
});

describe("dessineIndicateurCible", () => {
  it("ne dessine rien quand la cible est visible", () => {
    const { r, ctx } = creeRendu();
    dessineIndicateurCible(r, TERRAIN.cible, camera(TERRAIN.cible.x, TERRAIN.cible.y));
    expect(ctx.rects).toEqual([]);
  });

  it("dessine une flèche dans l'écran quand la cible est hors champ", () => {
    const { r, ctx } = creeRendu();
    dessineIndicateurCible(r, TERRAIN.cible, camera(TERRAIN.cible.x, 100));
    expect(ctx.rects.length).toBeGreaterThan(0);
    for (const rect of ctx.rects) {
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.largeur).toBeLessThanOrEqual(PIXEL.width);
      expect(rect.y + rect.hauteur).toBeLessThanOrEqual(PIXEL.height);
    }
  });

  /**
   * Au largage, la caméra est posée sur `(depart.x, DEPART_Y + BIAIS_CAMERA_Y)`
   * — exactement ce que fabrique `screens/game.ts` à l'entrée dans l'écran de
   * jeu. La cible y est toujours hors champ, en bas et sur un des deux côtés :
   * c'est le cas où la flèche, avant correctif, tombait pile sous la jauge de
   * carburant ou celle de puissance.
   */
  it("ne recouvre aucune des deux jauges du bas quand la caméra est celle du largage", () => {
    const { r, ctx } = creeRendu();
    const camLargage = camera(TERRAIN.depart.x, DEPART_Y + BIAIS_CAMERA_Y);
    dessineIndicateurCible(r, TERRAIN.cible, camLargage);
    expect(ctx.rects.length).toBeGreaterThan(0);

    const jaugeCarburant = {
      x: MARGE_HUD,
      y: PIXEL.height - MARGE_HUD - JAUGE_CARBURANT.hauteur,
      largeur: JAUGE_CARBURANT.largeur,
      hauteur: JAUGE_CARBURANT.hauteur,
    };
    const pas = JAUGE_PUISSANCE.largeurBarre + JAUGE_PUISSANCE.ecart;
    const largeurPuissance = CRANS_MAX * pas - JAUGE_PUISSANCE.ecart;
    const hauteurPuissanceMax = JAUGE_PUISSANCE.hauteurBase + CRANS_MAX - 1;
    const jaugePuissance = {
      x: PIXEL.width - MARGE_HUD - largeurPuissance,
      y: PIXEL.height - MARGE_HUD - hauteurPuissanceMax,
      largeur: largeurPuissance,
      hauteur: hauteurPuissanceMax,
    };

    interface RectSimple {
      readonly x: number;
      readonly y: number;
      readonly largeur: number;
      readonly hauteur: number;
    }

    const chevauche = (a: Rect, b: RectSimple): boolean =>
      a.x < b.x + b.largeur &&
      a.x + a.largeur > b.x &&
      a.y < b.y + b.hauteur &&
      a.y + a.hauteur > b.y;

    for (const rect of ctx.rects) {
      expect(chevauche(rect, jaugeCarburant)).toBe(false);
      expect(chevauche(rect, jaugePuissance)).toBe(false);
    }
  });
});

// --- Flamme ---

describe("dessineFlamme", () => {
  it("ne dessine rien au cran 0", () => {
    const { r, ctx } = creeRendu();
    const lem = new Lander(0, new Vector2(640, 260), Vector2.ZERO, 0, 0, 50);
    dessineFlamme(r, lem, camera(640, 260), 1.5);
    expect(ctx.rects).toEqual([]);
  });

  it("ne dessine rien réservoir vide", () => {
    const { r, ctx } = creeRendu();
    const lem = new Lander(0, new Vector2(640, 260), Vector2.ZERO, 0, 5, 0);
    dessineFlamme(r, lem, camera(640, 260), 1.5);
    expect(ctx.rects).toEqual([]);
  });

  it("allonge la flamme avec le cran", () => {
    const compte = (cran: number): number => {
      const { r, ctx } = creeRendu();
      const lem = new Lander(0, new Vector2(640, 260), Vector2.ZERO, 0, cran, 50);
      dessineFlamme(r, lem, camera(640, 260), 0);
      return ctx.rects.length;
    };
    expect(compte(1)).toBeLessThan(compte(3));
    expect(compte(3)).toBeLessThan(compte(5));
  });

  it("tremble en fonction du temps, jamais d'un tirage", () => {
    const pixels = (temps: number): string => {
      const { r, ctx } = creeRendu();
      const lem = new Lander(0, new Vector2(640, 260), Vector2.ZERO, 0, 5, 50);
      dessineFlamme(r, lem, camera(640, 260), temps);
      return ctx.rects.map((p) => `${p.x},${p.y}`).join("|");
    };
    // Deux instants pris au creux et à la crête du sinus : l'image bouge.
    expect(pixels(0.04)).not.toBe(pixels(0.13));
    // Le même instant redonne exactement la même image.
    expect(pixels(0.04)).toBe(pixels(0.04));
  });
});

// --- Particules ---

describe("dessineParticules", () => {
  /**
   * Une gerbe d'explosion au **centre du monde** : c'est le seul point que
   * `borne` ne recale à aucun zoom, donc la gerbe tombe au centre de l'écran aux
   * trois crans, sans cas particulier de bord de carte.
   */
  const CENTRE = new Vector2(640, 300);
  const gerbe = explosion(1, CENTRE, createRng(8)).particles;

  it("pose un pixel par particule, en couleurs de palette", () => {
    const { r, ctx } = creeRendu();
    dessineParticules(r, gerbe, camera(CENTRE.x, CENTRE.y));
    expect(ctx.rects.length).toBe(gerbe.length);
    for (const rect of ctx.rects) {
      expect(rect.largeur).toBe(1);
      expect(rect.hauteur).toBe(1);
      expect(COULEURS_PALETTE.has(rect.couleur)).toBe(true);
      expect(Number.isInteger(rect.x)).toBe(true);
      expect(Number.isInteger(rect.y)).toBe(true);
    }
  });

  it("épaissit d'un pixel au zoom serré, sans jamais faire un pavé", () => {
    const cote = (zoom: number): number => {
      const { r, ctx } = creeRendu();
      dessineParticules(r, gerbe, camera(CENTRE.x, CENTRE.y, zoom));
      return Math.max(...ctx.rects.map((p) => p.largeur));
    };
    expect(cote(1)).toBe(1);
    expect(cote(2)).toBe(2);
    // Le zoom 4 ne quadruple pas la particule : c'est un éclat, pas un objet.
    expect(cote(4)).toBe(2);
  });

  it("ne dessine rien d'une particule éteinte", () => {
    const { r, ctx } = creeRendu();
    // Un âge très au-delà de sa vie : l'opacité écrêtée vaut 0, donc rien à
    // peindre. Sans écrêtage, `globalAlpha` recevrait une valeur négative.
    const morte = new Particle(1, CENTRE, Vector2.ZERO, 99, 0.6);
    dessineParticules(r, [morte], camera(CENTRE.x, CENTRE.y));
    expect(ctx.rects).toEqual([]);
  });

  it("ignore les particules hors de la vue", () => {
    const { r, ctx } = creeRendu();
    const loin = new Particle(1, new Vector2(20, 20), Vector2.ZERO);
    dessineParticules(r, [loin], camera(CENTRE.x, CENTRE.y));
    expect(ctx.rects).toEqual([]);
  });

  it("ne passe ni par fill() ni par stroke()", () => {
    const { r, ctx } = creeRendu();
    dessineParticules(r, gerbe, camera(CENTRE.x, CENTRE.y, 2));
    expect(ctx.chemins).toEqual([]);
    expect(ctx.rects.length).toBeGreaterThan(0);
  });

  it("rend exactement les mêmes pixels pour la même gerbe", () => {
    const image = (): string => {
      const { r, ctx } = creeRendu();
      dessineParticules(r, gerbe, camera(CENTRE.x, CENTRE.y, 2));
      return ctx.rects.map((p) => `${p.x},${p.y},${p.couleur}`).join("|");
    };
    expect(image()).toBe(image());
  });
});

// --- Gardes globales du rendu ---

describe("rendu de l'écran de jeu — gardes", () => {
  const etoiles = genereEtoiles(createRng(3));

  it("ne pose que des couleurs de la palette", () => {
    const hors: string[] = [];
    for (const zoom of ZOOMS) {
      const { r, ctx } = creeRendu();
      dessineImage(r, etoiles, camera(TERRAIN.cible.x, TERRAIN.cible.y, zoom), lemDeTest(), 1.25);
      for (const couleur of ctx.couleurs) {
        if (!COULEURS_PALETTE.has(couleur)) hors.push(`${zoom}:${couleur}`);
      }
    }
    expect(hors).toEqual([]);
  });

  it("n'envoie aucune coordonnée fractionnaire au canvas", () => {
    const fautifs: string[] = [];
    for (const zoom of ZOOMS) {
      const { r, ctx } = creeRendu();
      dessineImage(r, etoiles, camera(TERRAIN.cible.x, TERRAIN.cible.y, zoom), lemDeTest(), 1.25);
      for (const rect of ctx.rects) {
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
    dessineImage(r, etoiles, camera(TERRAIN.cible.x, TERRAIN.cible.y), lemDeTest(), 1.25);
    expect(ctx.chemins).toEqual([]);
    expect(ctx.rects.length).toBeGreaterThan(0);
  });

  it("rend exactement les mêmes pixels pour le même état", () => {
    const image = (): string => {
      const { r, ctx } = creeRendu();
      dessineImage(r, etoiles, camera(TERRAIN.cible.x, TERRAIN.cible.y, 2), lemDeTest(), 1.25);
      return ctx.rects
        .map((p) => `${p.x},${p.y},${p.largeur},${p.hauteur},${p.couleur}`)
        .join("|");
    };
    expect(image()).toBe(image());
  });

  it("ne consomme aucun tirage de Math.random, sur cent images", () => {
    // La garde se prouve à l'exécution : le paquet n'embarque pas les types
    // Node, un test ne peut pas relire le source. `Math.random` est remplacé par
    // un piège et cent images sont dessinées, aux trois zooms.
    const piege = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("Math.random n'a rien à faire dans le rendu.");
    });
    try {
      for (let i = 0; i < 100; i++) {
        const zoom = ZOOMS[i % ZOOMS.length] as number;
        const { r } = creeRendu();
        dessineImage(
          r,
          etoiles,
          camera(TERRAIN.cible.x, TERRAIN.cible.y, zoom),
          lemDeTest(),
          i / 60,
        );
      }
      expect(piege).not.toHaveBeenCalled();
    } finally {
      piege.mockRestore();
    }
  });

  it("peint le ciel sur toute la surface, en bandes de palette", () => {
    const { r, ctx } = creeRendu();
    dessineCiel(r);
    const hauteurTotale = ctx.rects.reduce((somme, p) => somme + p.hauteur, 0);
    expect(hauteurTotale).toBe(PIXEL.height);
    expect(ctx.rects.every((p) => p.largeur === PIXEL.width)).toBe(true);
    expect(new Set(ctx.rects.map((p) => p.couleur))).toEqual(
      new Set([PALETTE.espace, PALETTE.nuit]),
    );
  });

  it("garde les étoiles dans l'écran et à un pixel", () => {
    const { r, ctx } = creeRendu();
    dessineEtoiles(r, etoiles, camera(640, 300));
    expect(ctx.rects.length).toBeGreaterThan(0);
    for (const rect of ctx.rects) {
      expect(rect.largeur).toBe(1);
      expect(rect.hauteur).toBe(1);
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.x).toBeLessThan(PIXEL.width);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeLessThan(PIXEL.height);
    }
  });

  it("décale les étoiles moins vite que le relief", () => {
    const positionEtoile = (x: number): number => {
      const { r, ctx } = creeRendu();
      dessineEtoiles(r, [{ x: 60, y: 40, teinte: "blanc" }], camera(x, 300));
      return ctx.rects[0]?.x ?? Number.NaN;
    };
    const a = positionEtoile(500);
    const b = positionEtoile(600);
    // 100 m de caméra ne déplacent l'étoile que d'un quart de cela.
    expect(a - b).toBe(25);
  });

  it("ne parcourt pas tout le relief pour une vue resserrée", () => {
    const compte = (zoom: number): number => {
      const { r, ctx } = creeRendu();
      dessineTerrain(r, TERRAIN, camera(640, 300, zoom));
      return ctx.rects.length;
    };
    expect(compte(4)).toBeLessThan(compte(1));
  });

  it("dessine le drapeau, le mât et le liseré de plateforme", () => {
    const { r, ctx } = creeRendu();
    dessineDrapeau(r, TERRAIN.cible, camera(TERRAIN.cible.x, TERRAIN.cible.y), 0);
    const couleurs = new Set(ctx.rects.map((p) => p.couleur));
    expect(couleurs.has(PALETTE.accent)).toBe(true);
    expect(couleurs.has(PALETTE.grisPale)).toBe(true);
    expect(couleurs.has(PALETTE.alerte)).toBe(true);
  });

  it("fait onduler la toile sur quatre images, puis boucle", () => {
    const toile = (temps: number): string => {
      const { r, ctx } = creeRendu();
      dessineDrapeau(r, TERRAIN.cible, camera(TERRAIN.cible.x, TERRAIN.cible.y), temps);
      return ctx.rects
        .filter((p) => p.couleur === PALETTE.alerte)
        .map((p) => `${p.x},${p.y}`)
        .join("|");
    };
    // Une image dure 1/8 s : quatre poses distinctes, puis la première revient.
    const poses = [toile(0), toile(0.125), toile(0.25), toile(0.375)];
    expect(new Set(poses).size).toBe(4);
    expect(toile(0.5)).toBe(poses[0]);
  });

  it("dessine le voile de pause et ses trois lignes", () => {
    const { r, ctx } = creeRendu();
    dessinePause(r);
    const voile = ctx.rects.find(
      (p) => p.largeur === PIXEL.width && p.hauteur === PIXEL.height,
    );
    expect(voile?.couleur).toBe(PALETTE.espace);
    const couleurs = new Set(ctx.rects.map((p) => p.couleur));
    expect(couleurs.has(PALETTE.blanc)).toBe(true);
    expect(couleurs.has(PALETTE.grisPale)).toBe(true);
  });

  it("tourne le LEM avec son assiette", () => {
    const silhouette = (assiette: number): string => {
      const { r, ctx } = creeRendu();
      const lem = new Lander(0, new Vector2(640, 260), Vector2.ZERO, assiette, 0, 50);
      dessineLem(r, lem, camera(640, 260, 2));
      return ctx.rects.map((p) => `${p.x},${p.y}`).join("|");
    };
    expect(silhouette(0)).not.toBe(silhouette(0.6));
  });

  it("agrandit le LEM avec le zoom", () => {
    const surface = (zoom: number): number => {
      const { r, ctx } = creeRendu();
      const lem = new Lander(0, new Vector2(640, 260), Vector2.ZERO, 0, 0, 50);
      dessineLem(r, lem, camera(640, 260, zoom));
      return ctx.rects.reduce((somme, p) => somme + p.largeur * p.hauteur, 0);
    };
    expect(surface(2)).toBeGreaterThan(surface(1));
    expect(surface(4)).toBeGreaterThan(surface(2));
  });
});
