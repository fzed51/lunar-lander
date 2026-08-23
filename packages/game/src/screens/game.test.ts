import { describe, expect, it } from "vitest";
import {
  Renderer,
  type InputSnapshot,
  type InputSource,
} from "@lem/engine";
import {
  BIAIS_CAMERA_Y,
  DELAI_ENCHAINEMENT,
  PIXEL,
  VIES_INITIALES,
  ZOOMS,
} from "../constants.ts";
import { PALETTE } from "../design/palette.ts";
import type { Lander } from "../entities/Lander.ts";
import type { Particle } from "../entities/Particle.ts";
import type { EtatPartie } from "../state.ts";
import type { Command } from "../types.ts";
import { creeEcranJeu, type EcranJeu } from "./game.ts";
import type { Transition } from "./types.ts";

// --- Outils du fichier ---

/** Un pas de temps de 60 images par seconde. */
const DT = 1 / 60;

/**
 * Clavier de test, avec la sémantique du vrai : `sonde()` est **l'unique**
 * sondage de l'image et vide le tampon des fronts montants, et `poll()` — celui
 * que la `Scene` appelle — relit ce même snapshot sans rien reconsommer. C'est
 * exactement ce que fait `GestionnaireEcrans.sourcePartagee()`.
 */
class Clavier implements InputSource<Command> {
  private readonly actives = new Set<Command>();
  private fronts = new Set<Command>();
  private dernier: InputSnapshot<Command> = {
    isActive: () => false,
    justPressed: () => false,
  };

  presse(...commandes: Command[]): void {
    for (const c of commandes) {
      this.actives.add(c);
      this.fronts.add(c);
    }
  }

  relache(...commandes: Command[]): void {
    for (const c of commandes) this.actives.delete(c);
  }

  sonde(): InputSnapshot<Command> {
    const actives = new Set(this.actives);
    const fronts = this.fronts;
    this.fronts = new Set();
    this.dernier = {
      isActive: (c) => actives.has(c),
      justPressed: (c) => fronts.has(c),
    };
    return this.dernier;
  }

  poll(): InputSnapshot<Command> {
    return this.dernier;
  }
}

/** Faux contexte 2D : le strict nécessaire pour instancier un `Renderer`. */
class ContexteFactice {
  fillStyle = "";
  strokeStyle = "";
  globalAlpha = 1;
  lineWidth = 1;
  font = "";
  textAlign = "left";
  textBaseline = "alphabetic";
  readonly canvas = { width: PIXEL.width, height: PIXEL.height };
  readonly couleurs = new Set<string>();
  readonly effacements: string[] = [];
  rects = 0;

  fillRect(): void {
    this.rects++;
    this.couleurs.add(this.fillStyle);
  }
  clearRect(x: number, y: number, largeur: number, hauteur: number): void {
    this.effacements.push(`${x},${y},${largeur},${hauteur}`);
  }
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

interface Montage {
  readonly ecran: EcranJeu;
  readonly clavier: Clavier;
  readonly ctx: ContexteFactice;
}

/** Écran de jeu prêt à jouer, sur une partie démarrée. */
function monte(graine = 20250823, niveau: 0 | 1 | 2 = 0): Montage {
  const clavier = new Clavier();
  const ctx = new ContexteFactice();
  const ecran = creeEcranJeu({
    renderer: new Renderer(ctx as unknown as CanvasRenderingContext2D),
    input: clavier,
  });
  ecran.entre({ nom: "jeu", params: { niveau, graine } });
  return { ecran, clavier, ctx };
}

/** `n` images de logique, avec le clavier dans l'état où il est. */
function avance(m: Montage, n: number): void {
  for (let i = 0; i < n; i++) m.ecran.tick(DT, m.clavier.sonde());
}

/** Une image avec ces touches en front montant, relâchées ensuite. */
function appuie(m: Montage, ...commandes: Command[]): void {
  m.clavier.presse(...commandes);
  m.ecran.tick(DT, m.clavier.sonde());
  m.clavier.relache(...commandes);
}

function etatDe(m: Montage): EtatPartie {
  const etat = m.ecran.etat();
  if (!etat) throw new Error("aucune partie en cours");
  return etat;
}

function lemDe(m: Montage): Lander {
  const lem = etatDe(m).entities.find((e) => e.kind === "lander");
  if (!lem) throw new Error("aucun LEM dans la partie");
  return lem;
}

function statutDe(m: Montage): string {
  return etatDe(m).globals.statut;
}

function particulesDe(m: Montage): readonly Particle[] {
  return etatDe(m).entities.filter((e): e is Particle => e.kind === "particle");
}

// --- Démarrage ---

describe("écran de jeu — entrée", () => {
  it("démarre la partie avec le niveau et la graine de la transition", () => {
    const m = monte(1234, 2);
    const g = etatDe(m).globals;
    expect(g.statut).toBe("vol");
    expect(g.niveauDepart).toBe(2);
    expect(g.graine).toBe(1234);
    expect(g.numeroManche).toBe(1);
    expect(g.vies).toBe(VIES_INITIALES);
  });

  it("rejoue exactement la même partie à graine et niveau égaux", () => {
    const a = monte(777, 1);
    const b = monte(777, 1);
    avance(a, 120);
    avance(b, 120);
    expect(lemDe(a).position).toEqual(lemDe(b).position);
    expect(etatDe(a).globals.terrain.hf.surface).toEqual(
      etatDe(b).globals.terrain.hf.surface,
    );
  });

  it("ne demande aucune transition tant que la partie tourne", () => {
    const m = monte();
    avance(m, 60);
    expect(m.ecran.prendTransition()).toBeNull();
  });
});

// --- Caméra ---

describe("écran de jeu — caméra", () => {
  it("suit une cible décalée vers le bas, jamais le LEM seul", () => {
    const m = monte();
    const lem = lemDe(m);
    const cam = m.ecran.camera();
    expect(cam.centre.x).toBeCloseTo(lem.position.x, 6);
    expect(cam.centre.y).toBeCloseTo(lem.position.y + BIAIS_CAMERA_Y, 6);
    // Sans le biais, le sol n'entrerait dans la vue que 60 m plus tard.
    expect(cam.centre.y).not.toBeCloseTo(lem.position.y, 1);
  });

  it("garde le biais pendant la descente", () => {
    const m = monte();
    avance(m, 180);
    const lem = lemDe(m);
    const cam = m.ecran.camera();
    // La caméra traîne un peu derrière sa cible, mais elle reste franchement
    // sous le LEM : le sol est visible avant que le LEM ne l'atteigne.
    expect(cam.centre.y).toBeGreaterThan(
      lem.position.y + BIAIS_CAMERA_Y / cam.zoom - 10,
    );
  });

  it("ne prend jamais qu'un zoom entier autorisé, pendant toute une descente", () => {
    const m = monte();
    const autorises = new Set<number>(ZOOMS);
    for (let i = 0; i < 1500; i++) {
      m.ecran.tick(DT, m.clavier.sonde());
      expect(autorises.has(m.ecran.camera().zoom)).toBe(true);
    }
  });

  it("ne sort jamais du monde", () => {
    const m = monte();
    for (let i = 0; i < 1500; i++) {
      m.ecran.tick(DT, m.clavier.sonde());
      const cam = m.ecran.camera();
      const demiLargeur = PIXEL.width / (2 * cam.zoom);
      const demiHauteur = PIXEL.height / (2 * cam.zoom);
      expect(cam.centre.x).toBeGreaterThanOrEqual(demiLargeur - 1e-9);
      expect(cam.centre.y).toBeGreaterThanOrEqual(demiHauteur - 1e-9);
    }
  });
});

// --- Pause ---

describe("écran de jeu — pause", () => {
  it("ouvre la pause sur back, depuis le vol", () => {
    const m = monte();
    avance(m, 30);
    appuie(m, "back");
    expect(statutDe(m)).toBe("pause");
  });

  it("gèle la physique tant que la pause tient", () => {
    const m = monte();
    avance(m, 30);
    appuie(m, "back");
    expect(statutDe(m)).toBe("pause");

    const avant = lemDe(m);
    const tempsAvant = etatDe(m).globals.tempsDeVol;
    const mancheAvant = etatDe(m).globals.tempsManche;

    // Flèches tenues comprises : rien ne doit bouger, ni l'assiette, ni le cran,
    // ni le carburant. La scène n'est pas tickée du tout.
    m.clavier.presse("tilt-left", "throttle-up");
    avance(m, 100);

    const apres = lemDe(m);
    expect(apres.position).toEqual(avant.position);
    expect(apres.velocity).toEqual(avant.velocity);
    expect(apres.assiette).toBe(avant.assiette);
    expect(apres.cran).toBe(avant.cran);
    expect(apres.carburant).toBe(avant.carburant);
    expect(etatDe(m).globals.tempsDeVol).toBe(tempsAvant);
    expect(etatDe(m).globals.tempsManche).toBe(mancheAvant);
  });

  it("lit toujours l'entrée en pause", () => {
    const m = monte();
    avance(m, 5);
    appuie(m, "back");
    expect(statutDe(m)).toBe("pause");

    let lectures = 0;
    const espion: InputSnapshot<Command> = {
      isActive: () => {
        lectures++;
        return false;
      },
      justPressed: () => {
        lectures++;
        return false;
      },
    };
    m.ecran.tick(DT, espion);
    // La `Scene` n'est pas tickée : ces lectures sont celles de l'écran, et
    // c'est ce qui rend la sortie de pause possible.
    expect(lectures).toBeGreaterThan(0);
  });

  it("reprend sur confirm, et la physique repart dans la même image", () => {
    const m = monte();
    avance(m, 30);
    appuie(m, "back");
    const gele = lemDe(m);

    appuie(m, "confirm");
    expect(statutDe(m)).toBe("vol");
    expect(lemDe(m).position.y).toBeGreaterThan(gele.position.y);
  });

  it("abandonne sur back depuis la pause", () => {
    const m = monte();
    avance(m, 30);
    appuie(m, "back");
    appuie(m, "back");
    const g = etatDe(m).globals;
    expect(g.statut).toBe("fini");
    expect(g.abandonnee).toBe(true);
  });

  it("n'abandonne pas d'un seul back depuis le vol", () => {
    const m = monte();
    avance(m, 30);
    appuie(m, "back");
    expect(statutDe(m)).toBe("pause");
    expect(etatDe(m).globals.abandonnee).toBe(false);
  });

  it("ne met pas en pause depuis le bandeau de fin de manche", () => {
    const m = monte();
    // Chute libre jusqu'au verdict, puis un back pendant le bandeau.
    for (let i = 0; i < 20000 && statutDe(m) === "vol"; i++) {
      m.ecran.tick(DT, m.clavier.sonde());
    }
    expect(statutDe(m)).not.toBe("vol");
    const statutJuge = statutDe(m);
    appuie(m, "back");
    expect(statutDe(m)).toBe(statutJuge);
  });
});

// --- Fin de partie ---

describe("écran de jeu — fin de partie", () => {
  it("publie l'abandon immédiatement, et une seule fois", () => {
    const m = monte();
    avance(m, 30);
    appuie(m, "back");
    appuie(m, "back");

    const demande = m.ecran.prendTransition();
    expect(demande?.nom).toBe("fin");
    if (demande?.nom === "fin") {
      expect(demande.params.abandonnee).toBe(true);
      expect(demande.params.manchesReussies).toBe(0);
    }
    // La demande est consommée, pas relue : un second appel ne rend rien.
    expect(m.ecran.prendTransition()).toBeNull();
    avance(m, 10);
    expect(m.ecran.prendTransition()).toBeNull();
  });

  it("laisse le crash fatal s'afficher avant de publier la fin", () => {
    const m = monte();
    let instantFini: number | null = null;
    let instantDemande: number | null = null;
    let demandes = 0;
    let demande: Transition | null = null;

    for (let i = 0; i < 40000; i++) {
      m.ecran.tick(DT, m.clavier.sonde());
      const etat = etatDe(m);
      if (instantFini === null && etat.globals.statut === "fini") {
        instantFini = etat.time;
      }
      const prise = m.ecran.prendTransition();
      if (prise) {
        demandes++;
        demande = prise;
        if (instantDemande === null) instantDemande = etat.time;
      }
      // Un peu de rab après la demande, pour vérifier qu'elle ne se rejoue pas.
      if (instantDemande !== null && etat.time - instantDemande > 1) break;
    }

    expect(instantFini).not.toBeNull();
    expect(instantDemande).not.toBeNull();
    // Les trois vies ont été perdues, sans écart au score : que des crashes.
    expect(etatDe(m).globals.vies).toBe(0);
    // Le verdict fatal a eu son temps d'affichage, comme un crash non fatal.
    expect((instantDemande ?? 0) - (instantFini ?? 0)).toBeGreaterThanOrEqual(
      DELAI_ENCHAINEMENT - DT,
    );
    expect(demandes).toBe(1);
    expect(demande?.nom).toBe("fin");
    if (demande?.nom === "fin") {
      expect(demande.params.abandonnee).toBe(false);
    }
  });
});

// --- Particules ---

describe("écran de jeu — particules", () => {
  it("crache du gaz sous la tuyère pendant la poussée", () => {
    const m = monte();
    // Cinq fronts montants : le cran monte à son maximum et y reste.
    for (let i = 0; i < 5; i++) appuie(m, "throttle-up");
    avance(m, 60);
    expect(particulesDe(m).length).toBeGreaterThan(0);
    expect(statutDe(m)).toBe("vol");
  });

  it("ne crache rien moteur coupé", () => {
    const m = monte();
    avance(m, 60);
    expect(particulesDe(m)).toEqual([]);
  });

  it("libère toutes ses particules deux secondes après la coupure", () => {
    // La preuve que le plafond se libère : sans `regleParticules` branchée ici,
    // les bouffées resteraient dans `state.entities` jusqu'à la manche suivante.
    const m = monte();
    for (let i = 0; i < 5; i++) appuie(m, "throttle-up");
    avance(m, 60);
    expect(particulesDe(m).length).toBeGreaterThan(0);

    for (let i = 0; i < 5; i++) appuie(m, "throttle-down");
    avance(m, 120);
    expect(particulesDe(m)).toEqual([]);
    expect(statutDe(m)).toBe("vol");
  });

  it("éclate le LEM au verdict de la manche", () => {
    const m = monte();
    for (let i = 0; i < 20000 && statutDe(m) === "vol"; i++) {
      m.ecran.tick(DT, m.clavier.sonde());
    }
    expect(statutDe(m)).not.toBe("vol");
    expect(particulesDe(m).length).toBeGreaterThan(0);
  });

  it("laisse les particules du bord dans la palette", () => {
    const m = monte();
    for (let i = 0; i < 5; i++) appuie(m, "throttle-up");
    avance(m, 60);
    m.ecran.rend();
    const palette = new Set<string>(Object.values(PALETTE));
    expect([...m.ctx.couleurs].filter((c) => !palette.has(c))).toEqual([]);
  });
});

// --- Sortie et rendu ---

describe("écran de jeu — sortie", () => {
  it("efface la couche de jeu en sortant", () => {
    const m = monte();
    avance(m, 10);
    m.ecran.sort();
    expect(m.ctx.effacements).toEqual([`0,0,${PIXEL.width},${PIXEL.height}`]);
  });

  it("efface aussi la demande en attente", () => {
    const m = monte();
    avance(m, 5);
    appuie(m, "back");
    appuie(m, "back");
    m.ecran.sort();
    expect(m.ecran.prendTransition()).toBeNull();
  });

  it("ne dessine plus rien après la sortie", () => {
    const m = monte();
    m.ecran.rend();
    const avant = m.ctx.rects;
    expect(avant).toBeGreaterThan(0);
    m.ecran.sort();
    m.ecran.rend();
    expect(m.ctx.rects).toBe(avant);
  });
});

describe("écran de jeu — rendu", () => {
  it("dessine la manche en couleurs de palette uniquement", () => {
    const m = monte();
    m.clavier.presse("throttle-up");
    avance(m, 120);
    m.ecran.rend();
    const palette = new Set<string>(Object.values(PALETTE));
    expect([...m.ctx.couleurs].filter((c) => !palette.has(c))).toEqual([]);
    expect(m.ctx.rects).toBeGreaterThan(0);
  });

  it("ajoute le voile de pause quand la manche est suspendue", () => {
    const m = monte();
    avance(m, 30);

    const avantVol = m.ctx.rects;
    m.ecran.rend();
    const enVol = m.ctx.rects - avantVol;

    appuie(m, "back");
    const avantPause = m.ctx.rects;
    m.ecran.rend();
    const enPause = m.ctx.rects - avantPause;

    expect(enPause).toBeGreaterThan(enVol);
  });
});
