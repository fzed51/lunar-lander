import { describe, it, expect } from "vitest";
import {
  Scene,
  surfaceEn,
  Vector2,
  type InputSnapshot,
  type InputSource,
} from "@lem/engine";
import {
  DELAI_ENCHAINEMENT,
  DEPART_Y,
  LEM,
  MONDE,
  TERRAIN_PAS,
  VIES_INITIALES,
} from "./constants.ts";
import {
  carburantInitial,
  difficulteDe,
  vitesseHorizontaleInitiale,
} from "./difficulty.ts";
import { Lander } from "./entities/Lander.ts";
import { Particle } from "./entities/Particle.ts";
import type { Verdict } from "./landing.ts";
import {
  surAbandon,
  surContact,
  surHorsLimites,
  surMancheSuivante,
  surParticuleMorte,
  surPause,
  surReprise,
  surTempsVol,
} from "./reducers.ts";
import { regleContact, regleEnchainement, regleTempsDeVol } from "./rules.ts";
import {
  nouvelleManche,
  nouvellePartie,
  resultatPartie,
  type EtatPartie,
  type Globals,
} from "./state.ts";
import type { Terrain } from "./terrain.ts";
import type { Command, LemEntity, LemEvent } from "./types.ts";

// --- Outils du fichier ---

/**
 * Source de commandes figée : elle rend le **même** snapshot à chaque sondage,
 * fronts montants compris. C'est plus dur que la réalité — un vrai
 * `KeyboardInput` ne rend un front qu'une fois — et c'est voulu : le LEM figé
 * doit rester immobile même sous une flèche qui se represse à chaque image.
 */
class SourceFigee implements InputSource<Command> {
  constructor(
    private readonly actives: readonly Command[] = [],
    private readonly fronts: readonly Command[] = [],
  ) {}

  poll(): InputSnapshot<Command> {
    return {
      isActive: (c) => this.actives.includes(c) || this.fronts.includes(c),
      justPressed: (c) => this.fronts.includes(c),
    };
  }
}

/** Aucune touche : le cas ordinaire. */
const RIEN = new SourceFigee();

/**
 * Scène de la manche, câblée comme le fera l'écran de jeu (T10) : les trois
 * règles de tick, et les reducers que la scène applique. Les trois reducers de
 * pause n'y sont **pas** : ils vivent de l'autre côté de la frontière.
 */
function sceneDeManche(source: InputSource<Command>) {
  return new Scene<LemEntity, LemEvent, Globals, Command>({ input: source })
    .onTick(regleContact)
    .onTick(regleTempsDeVol)
    .onTick(regleEnchainement)
    .on("contact", surContact)
    .on("hors-limites", surHorsLimites)
    .on("temps-vol", surTempsVol)
    .on("manche-suivante", surMancheSuivante)
    .on("particle-died", surParticuleMorte);
}

/** `n` ticks de `dt` sur la scène. */
function avance(
  scene: Scene<LemEntity, LemEvent, Globals, Command>,
  etat: EtatPartie,
  dt: number,
  n: number,
): EtatPartie {
  let courant = etat;
  for (let i = 0; i < n; i++) courant = scene.tick(courant, dt);
  return courant;
}

/** Coordonnée `y` de la surface du terrain plat de test. */
const SOL = 300;

/**
 * Terrain plat sur toute la largeur du monde, au pas du jeu. Il rend le verdict
 * prévisible : posable partout, aucune aiguille pour heurter la coque.
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

/**
 * Partie de référence, générée une seule fois : elle fournit des globals
 * complets aux états fabriqués à la main.
 */
const PARTIE = nouvellePartie(0, 7);

/** État de vol au-dessus du terrain plat, globals ajustables. */
function etatDeTest(lem: Lander, patch: Partial<Globals> = {}): EtatPartie {
  return {
    entities: [lem],
    time: 0,
    globals: { ...PARTIE.globals, terrain: terrainPlat(), ...patch },
  };
}

/** LEM prêt à se poser proprement : debout, immobile, pieds sur la surface. */
function lemPose(x = 512): Lander {
  return new Lander(0, new Vector2(x, Y_CONTACT), Vector2.ZERO, 0, 0, 100);
}

/** LEM qui arrive trop vite : le contact sera un crash. */
function lemCrash(x = 512): Lander {
  return new Lander(0, new Vector2(x, Y_CONTACT), new Vector2(0, 30), 0, 0, 100);
}

/** Le LEM de l'état. Lève plutôt que de rendre un type nullable aux tests. */
function lemDe(etat: EtatPartie): Lander {
  const lem = etat.entities.find((e): e is Lander => e.kind === "lander");
  if (!lem) throw new Error("aucun LEM dans l'état");
  return lem;
}

/** Verdict de posé à l'écart donné. */
function verdictPose(ecart: number): Verdict {
  return { pose: true, ecart };
}

/** Verdict de crash ordinaire. */
const VERDICT_CRASH: Verdict = {
  pose: false,
  causes: ["trop-vite-vertical"],
};

// --- Création de partie ---

describe("nouvellePartie", () => {
  it("part de trois vies, aucun point, chrono à zéro", () => {
    const g = nouvellePartie(0, 42).globals;
    expect(g.vies).toBe(VIES_INITIALES);
    expect(g.statut).toBe("vol");
    expect(g.numeroManche).toBe(1);
    expect(g.manchesReussies).toBe(0);
    expect(g.ecarts).toEqual([]);
    expect(g.tempsDeVol).toBe(0);
    expect(g.tempsManche).toBe(0);
    expect(g.abandonnee).toBe(false);
    expect(g.dernierVerdict).toBeNull();
    expect(g.contactEmisPourManche).toBe(false);
    expect(g.instantStatut).toBe(0);
    expect(g.gazAccu).toBe(0);
  });

  it("largue le LEM au point de départ du terrain, plein fait", () => {
    const etat = nouvellePartie(1, 42);
    const lem = lemDe(etat);
    const terrain = etat.globals.terrain;
    const difficulte = difficulteDe(1, 0);

    expect(lem.position.x).toBe(terrain.depart.x);
    expect(lem.position.y).toBe(DEPART_Y);
    expect(lem.carburant).toBe(carburantInitial(difficulte));
    expect(lem.cran).toBe(0);
    expect(lem.assiette).toBe(0);
    expect(lem.inerte).toBe(false);
  });

  it("oriente la vitesse initiale vers la cible, sans tirage", () => {
    // Le signe est celui de `terrain.depart.sens`, qui pointe vers le drapeau.
    for (const graine of [1, 2, 3, 4, 5, 6]) {
      const etat = nouvellePartie(0, graine);
      const terrain = etat.globals.terrain;
      const lem = lemDe(etat);
      expect(lem.velocity.x).toBe(
        vitesseHorizontaleInitiale(difficulteDe(0, 0), terrain.depart.sens),
      );
      expect(Math.sign(lem.velocity.x)).toBe(
        Math.sign(terrain.cible.x - terrain.depart.x),
      );
      expect(lem.velocity.y).toBe(0);
    }
  });

  it("rejoue le même terrain à graine égale, un autre à graine différente", () => {
    expect(nouvellePartie(0, 99).globals.terrain.hf.surface).toEqual(
      nouvellePartie(0, 99).globals.terrain.hf.surface,
    );
    expect(nouvellePartie(0, 99).globals.terrain.hf.surface).not.toEqual(
      nouvellePartie(0, 100).globals.terrain.hf.surface,
    );
  });
});

describe("nouvelleManche", () => {
  it("compte une manche de plus et remet ce qui appartient à la manche", () => {
    const depart: EtatPartie = {
      ...PARTIE,
      time: 12,
      globals: {
        ...PARTIE.globals,
        statut: "crash",
        vies: 2,
        manchesReussies: 3,
        ecarts: [4, 9],
        tempsDeVol: 40,
        tempsManche: 11,
        dernierVerdict: VERDICT_CRASH,
        contactEmisPourManche: true,
        instantStatut: 10,
        gazAccu: 0.7,
      },
    };

    const suivante = nouvelleManche(depart);
    const g = suivante.globals;

    expect(g.numeroManche).toBe(2);
    expect(g.statut).toBe("vol");
    expect(g.tempsManche).toBe(0);
    expect(g.contactEmisPourManche).toBe(false);
    expect(g.dernierVerdict).toBeNull();
    expect(g.gazAccu).toBe(0);
    expect(g.instantStatut).toBe(12);

    // Ce qui appartient à la partie ne bouge pas.
    expect(g.vies).toBe(2);
    expect(g.manchesReussies).toBe(3);
    expect(g.ecarts).toEqual([4, 9]);
    expect(g.tempsDeVol).toBe(40);
    expect(g.graine).toBe(PARTIE.globals.graine);
  });

  it("relaie un LEM neuf et laisse les débris de la manche passée derrière", () => {
    const avecDebris: EtatPartie = {
      ...PARTIE,
      entities: [
        ...PARTIE.entities,
        new Particle(50, Vector2.ZERO, Vector2.ZERO),
      ],
    };

    const suivante = nouvelleManche(avecDebris);

    expect(suivante.entities.length).toBe(1);
    const lem = lemDe(suivante);
    expect(lem.id).toBe(PARTIE.globals.nextId);
    expect(lem.inerte).toBe(false);
    expect(lem.position.y).toBe(DEPART_Y);
    expect(suivante.globals.nextId).toBe(PARTIE.globals.nextId + 1);
  });

  it("change de terrain d'une manche à l'autre", () => {
    const deuxieme = nouvelleManche(PARTIE);
    expect(deuxieme.globals.terrain.hf.surface).not.toEqual(
      PARTIE.globals.terrain.hf.surface,
    );
  });

  it("durcit la manche suivante quand des manches ont été réussies", () => {
    const apresTreize: EtatPartie = {
      ...PARTIE,
      globals: { ...PARTIE.globals, manchesReussies: 13 },
    };
    const suivante = nouvelleManche(apresTreize);
    expect(lemDe(suivante).carburant).toBe(carburantInitial(difficulteDe(0, 13)));
    expect(Math.abs(lemDe(suivante).velocity.x)).toBe(
      Math.abs(
        vitesseHorizontaleInitiale(
          difficulteDe(0, 13),
          suivante.globals.terrain.depart.sens,
        ),
      ),
    );
  });
});

// --- Verdict de contact ---

describe("surContact — un posé", () => {
  it("compte la manche, ajoute l'écart et ne coûte aucune vie", () => {
    const etat = etatDeTest(lemPose());
    const apres = surContact(etat, { verdict: verdictPose(12) });

    expect(apres.globals.statut).toBe("pose");
    expect(apres.globals.manchesReussies).toBe(1);
    expect(apres.globals.ecarts).toEqual([12]);
    expect(apres.globals.vies).toBe(VIES_INITIALES);
    expect(apres.globals.contactEmisPourManche).toBe(true);
    expect(apres.globals.dernierVerdict).toEqual(verdictPose(12));
  });

  it("repose les pieds du LEM sur la surface", () => {
    const etat = etatDeTest(
      // Un LEM enfoncé de trois mètres dans le sol au moment du verdict.
      new Lander(0, new Vector2(512, SOL), new Vector2(0, 1.5), 0, 3, 80),
    );
    const apres = surContact(etat, { verdict: verdictPose(12) });
    const lem = lemDe(apres);

    expect(lem.position.y).toBe(
      surfaceEn(apres.globals.terrain.hf, lem.position.x) - LEM.hauteur / 2,
    );
    expect(lem.velocity.x).toBe(0);
    expect(lem.velocity.y).toBe(0);
    expect(lem.cran).toBe(0);
    expect(lem.inerte).toBe(true);
    // Le carburant du contact est celui qu'on publie : il n'est pas remis à zéro.
    expect(lem.carburant).toBe(80);
  });

  it("écrit instantStatut à l'instant du verdict", () => {
    const etat: EtatPartie = { ...etatDeTest(lemPose()), time: 8.25 };
    expect(surContact(etat, { verdict: verdictPose(0) }).globals.instantStatut).toBe(
      8.25,
    );
  });

  it("est idempotent : deux fois le même contact ne compte qu'une manche", () => {
    const etat = etatDeTest(lemPose());
    const une = surContact(etat, { verdict: verdictPose(12) });
    const deux = surContact(une, { verdict: verdictPose(12) });

    expect(deux.globals.manchesReussies).toBe(1);
    expect(deux.globals.ecarts).toEqual([12]);
    expect(deux).toBe(une);
  });
});

describe("surContact — un crash", () => {
  it("coûte une vie et n'ajoute aucun écart", () => {
    const apres = surContact(etatDeTest(lemCrash()), { verdict: VERDICT_CRASH });

    expect(apres.globals.statut).toBe("crash");
    expect(apres.globals.vies).toBe(VIES_INITIALES - 1);
    expect(apres.globals.ecarts).toEqual([]);
    expect(apres.globals.manchesReussies).toBe(0);
    expect(apres.globals.contactEmisPourManche).toBe(true);
  });

  it("fige le LEM sur place, sans le recaler sur la surface", () => {
    const etat = etatDeTest(
      new Lander(0, new Vector2(512, SOL + 20), new Vector2(4, 30), 0.3, 5, 60),
    );
    const lem = lemDe(surContact(etat, { verdict: VERDICT_CRASH }));

    expect(lem.position.y).toBe(SOL + 20);
    expect(lem.velocity.x).toBe(0);
    expect(lem.velocity.y).toBe(0);
    expect(lem.cran).toBe(0);
    expect(lem.assiette).toBe(0.3);
    expect(lem.inerte).toBe(true);
  });

  it("termine la partie au crash de la dernière vie", () => {
    const etat = etatDeTest(lemCrash(), { vies: 1 });
    const apres = surContact(etat, { verdict: VERDICT_CRASH });

    expect(apres.globals.vies).toBe(0);
    expect(apres.globals.statut).toBe("fini");
  });

  it("est idempotent : deux fois le même crash ne retire qu'une vie", () => {
    const une = surContact(etatDeTest(lemCrash()), { verdict: VERDICT_CRASH });
    const deux = surContact(une, { verdict: VERDICT_CRASH });

    expect(deux.globals.vies).toBe(VIES_INITIALES - 1);
    expect(deux).toBe(une);
  });
});

describe("surHorsLimites", () => {
  it("est traité comme un crash, LEM figé sur place", () => {
    const etat = etatDeTest(
      new Lander(0, new Vector2(-10, 200), new Vector2(-5, 3), 0, 4, 70),
    );
    const apres = surHorsLimites(etat);
    const lem = lemDe(apres);

    expect(apres.globals.statut).toBe("crash");
    expect(apres.globals.vies).toBe(VIES_INITIALES - 1);
    expect(apres.globals.ecarts).toEqual([]);
    expect(apres.globals.dernierVerdict).toEqual({
      pose: false,
      causes: ["hors-limites"],
    });
    expect(lem.position.x).toBe(-10);
    expect(lem.position.y).toBe(200);
    expect(lem.velocity.x).toBe(0);
    expect(lem.inerte).toBe(true);
  });

  it("ne s'applique pas deux fois", () => {
    const une = surHorsLimites(etatDeTest(lemCrash()));
    expect(surHorsLimites(une)).toBe(une);
    expect(surHorsLimites(une).globals.vies).toBe(VIES_INITIALES - 1);
  });
});

// --- Un seul événement de fin de manche ---

describe("un seul événement de fin de manche", () => {
  it("cinq ticks au sol ne comptent qu'un posé", () => {
    const scene = sceneDeManche(RIEN);
    const etat = avance(scene, etatDeTest(lemPose()), 1 / 60, 5);

    expect(etat.globals.statut).toBe("pose");
    expect(etat.globals.manchesReussies).toBe(1);
    expect(etat.globals.ecarts).toEqual([12]);
    expect(etat.globals.vies).toBe(VIES_INITIALES);
  });

  it("cinq ticks hors du monde ne coûtent qu'une vie", () => {
    // Sans la garde, un LEM sorti par le côté — qui continue de s'éloigner, donc
    // reste hors limites — perdrait la partie en trois images.
    const scene = sceneDeManche(RIEN);
    const enFuite = new Lander(
      0,
      new Vector2(-10, 200),
      new Vector2(-20, 0),
      0,
      0,
      100,
    );
    const etat = avance(scene, etatDeTest(enFuite), 1 / 60, 5);

    expect(etat.globals.statut).toBe("crash");
    expect(etat.globals.vies).toBe(VIES_INITIALES - 1);
  });

  it("la sortie du monde prime sur le contact dans le même tick", () => {
    // Un LEM sous le sol **et** hors du monde : un seul événement doit sortir, et
    // c'est la sortie du monde — sinon l'état gagnerait une manche réussie et
    // perdrait une vie du même coup.
    const etat = etatDeTest(
      new Lander(0, new Vector2(-2, SOL + 5), Vector2.ZERO, 0, 0, 100),
    );
    const evenements = regleContact(etat, { input: RIEN.poll(), dt: 1 / 60 });

    expect(evenements).toEqual([{ type: "hors-limites" }]);
  });

  it("regleContact se tait dès que la fin de manche a été signalée", () => {
    const etat = etatDeTest(lemPose(), { contactEmisPourManche: true });
    expect(regleContact(etat, { input: RIEN.poll(), dt: 1 / 60 })).toEqual([]);
  });
});

describe("le LEM est figé dès le verdict", () => {
  it("soixante ticks de plus, quatre flèches tenues, ne le bougent pas", () => {
    // Toutes les commandes actives **et** repressées à chaque image : le pire
    // cas. Sans le gel, deux secondes de chute lunaire enfonceraient le LEM de
    // plus que sa propre hauteur, et le réservoir se viderait.
    const source = new SourceFigee(
      ["tilt-left", "tilt-right", "throttle-up", "throttle-down"],
      ["throttle-up"],
    );
    const scene = sceneDeManche(source);

    const auContact = scene.tick(etatDeTest(lemPose()), 1 / 60);
    expect(auContact.globals.statut).toBe("pose");
    const fige = lemDe(auContact);

    const plusTard = avance(scene, auContact, 1 / 60, 60);
    const apres = lemDe(plusTard);

    expect(apres.position.x).toBe(fige.position.x);
    expect(apres.position.y).toBe(fige.position.y);
    expect(apres.velocity.x).toBe(fige.velocity.x);
    expect(apres.velocity.y).toBe(fige.velocity.y);
    expect(apres.carburant).toBe(fige.carburant);
    expect(apres.cran).toBe(0);
    expect(apres.assiette).toBe(fige.assiette);
    // Une entité inerte rend `this` : c'est le même objet, tick après tick.
    expect(apres).toBe(fige);
  });

  it("un crash aussi : la position du verdict est celle qu'on publie", () => {
    const scene = sceneDeManche(RIEN);
    const auContact = scene.tick(etatDeTest(lemCrash()), 1 / 60);
    const fige = lemDe(auContact);

    const plusTard = avance(scene, auContact, 1 / 60, 60);

    expect(lemDe(plusTard)).toBe(fige);
  });
});

// --- Chrono ---

describe("chrono de vol", () => {
  it("avance en vol, sur la partie comme sur la manche", () => {
    const scene = sceneDeManche(RIEN);
    // LEM haut dans le ciel : rien ne vient interrompre la manche.
    const etat = avance(
      scene,
      etatDeTest(new Lander(0, new Vector2(500, 100), Vector2.ZERO, 0, 0, 100)),
      0.5,
      4,
    );

    expect(etat.globals.tempsDeVol).toBeCloseTo(2, 10);
    expect(etat.globals.tempsManche).toBeCloseTo(2, 10);
  });

  it("est gelé en pause, en posé, en crash et en fini", () => {
    const scene = sceneDeManche(RIEN);
    for (const statut of ["pause", "pose", "crash", "fini"] as const) {
      const etat = etatDeTest(
        new Lander(0, new Vector2(500, 100), Vector2.ZERO, 0, 0, 100),
        { statut, tempsDeVol: 40, tempsManche: 5 },
      );
      // Une seconde de ticks : sous `DELAI_ENCHAINEMENT`, donc la manche
      // suivante ne vient pas remettre `tempsManche` à zéro sous nos pieds.
      const apres = avance(scene, etat, 0.25, 4);

      expect(apres.globals.tempsDeVol).toBe(40);
      expect(apres.globals.tempsManche).toBe(5);
    }
  });

  it("regleTempsDeVol n'émet rien hors du vol", () => {
    const ctx = { input: RIEN.poll(), dt: 1 / 60 };
    const enVol = etatDeTest(lemPose());
    expect(regleTempsDeVol(enVol, ctx)).toEqual([
      { type: "temps-vol", dt: 1 / 60 },
    ]);
    for (const statut of ["pause", "pose", "crash", "fini"] as const) {
      expect(regleTempsDeVol(etatDeTest(lemPose(), { statut }), ctx)).toEqual([]);
    }
  });

  it("surTempsVol refuse d'écrire hors du vol", () => {
    const etat = etatDeTest(lemPose(), { statut: "pause", tempsDeVol: 3 });
    expect(surTempsVol(etat, { dt: 0.5 })).toBe(etat);
  });
});

// --- Enchaînement des manches ---

describe("enchaînement de la manche suivante", () => {
  /** État juste après un crash, à `time` 0 : `instantStatut` vaut donc 0. */
  function apresCrash(patch: Partial<Globals> = {}): EtatPartie {
    return surContact(etatDeTest(lemCrash(), patch), {
      verdict: VERDICT_CRASH,
    });
  }

  it("ne part pas avant le délai", () => {
    const scene = sceneDeManche(RIEN);
    // 1,9 s : deux ticks de 0,95 s, en dessous du délai.
    const etat = avance(scene, apresCrash(), 0.95, 2);

    expect(etat.time).toBeCloseTo(1.9, 10);
    expect(etat.globals.statut).toBe("crash");
    expect(etat.globals.numeroManche).toBe(1);
  });

  it("part au délai, depuis un crash, s'il reste des vies", () => {
    const scene = sceneDeManche(RIEN);
    const etat = avance(scene, apresCrash(), 0.5, DELAI_ENCHAINEMENT / 0.5);

    expect(etat.time).toBe(DELAI_ENCHAINEMENT);
    expect(etat.globals.statut).toBe("vol");
    expect(etat.globals.numeroManche).toBe(2);
    expect(etat.globals.vies).toBe(VIES_INITIALES - 1);
    expect(etat.globals.tempsManche).toBe(0);
    expect(etat.globals.contactEmisPourManche).toBe(false);
    expect(etat.globals.instantStatut).toBe(DELAI_ENCHAINEMENT);
    expect(lemDe(etat).inerte).toBe(false);
    expect(lemDe(etat).position.y).toBe(DEPART_Y);
  });

  it("part au délai, depuis un posé", () => {
    const scene = sceneDeManche(RIEN);
    const pose = surContact(etatDeTest(lemPose()), {
      verdict: verdictPose(12),
    });
    const etat = avance(scene, pose, 0.5, DELAI_ENCHAINEMENT / 0.5);

    expect(etat.globals.statut).toBe("vol");
    expect(etat.globals.numeroManche).toBe(2);
    expect(etat.globals.manchesReussies).toBe(1);
    expect(etat.globals.ecarts).toEqual([12]);
  });

  it("donne un terrain différent après un crash", () => {
    // La graine de la manche descend de `numeroManche`, qui compte aussi les
    // manches perdues : sans ça, le même terrain se rejouerait après chaque
    // échec.
    const partie = nouvellePartie(0, 4242);
    const crash = surContact(
      {
        ...partie,
        entities: [lemCrash()],
        globals: { ...partie.globals, terrain: terrainPlat() },
      },
      { verdict: VERDICT_CRASH },
    );
    const suivante = nouvelleManche(crash);

    expect(suivante.globals.numeroManche).toBe(2);
    expect(suivante.globals.manchesReussies).toBe(0);
    expect(suivante.globals.terrain.hf.surface).not.toEqual(
      partie.globals.terrain.hf.surface,
    );
  });

  it("rejoue la même suite de terrains à graine égale, crash inclus", () => {
    /** Suite des reliefs de trois manches, chacune perdue sur un crash. */
    function suiteDeTerrains(graine: number): number[][] {
      let etat = nouvellePartie(0, graine);
      const suite: number[][] = [];
      for (let manche = 0; manche < 3; manche++) {
        suite.push([...etat.globals.terrain.hf.surface]);
        etat = surContact(
          {
            ...etat,
            entities: [lemCrash()],
            globals: { ...etat.globals, terrain: terrainPlat(), vies: 3 },
          },
          { verdict: VERDICT_CRASH },
        );
        etat = nouvelleManche(etat);
      }
      return suite;
    }

    expect(suiteDeTerrains(1234)).toEqual(suiteDeTerrains(1234));
    expect(suiteDeTerrains(1234)).not.toEqual(suiteDeTerrains(1235));
  });

  it("surMancheSuivante ne fait rien hors d'un posé ou d'un crash", () => {
    for (const statut of ["vol", "pause", "fini"] as const) {
      const etat = etatDeTest(lemPose(), { statut });
      expect(surMancheSuivante(etat)).toBe(etat);
    }
  });

  it("termine la partie si le délai s'écoule sans vie restante", () => {
    // Branche défensive : un crash à la dernière vie passe déjà par `"fini"`.
    const etat = etatDeTest(lemCrash(), { statut: "crash", vies: 0 });
    const apres = surMancheSuivante(etat);
    expect(apres.globals.statut).toBe("fini");
    expect(apres.globals.numeroManche).toBe(1);
  });
});

// --- Pause, reprise, abandon ---

describe("pause, reprise et abandon", () => {
  it("la pause ne s'ouvre que depuis le vol", () => {
    const etat = etatDeTest(lemPose());
    const enPause = surPause(etat);
    expect(enPause.globals.statut).toBe("pause");

    for (const statut of ["pose", "crash", "fini", "pause"] as const) {
      const bloque = etatDeTest(lemPose(), { statut, instantStatut: 3 });
      const apres = surPause({ ...bloque, time: 9 });
      expect(apres.globals.statut).toBe(statut);
      expect(apres.globals.instantStatut).toBe(3);
    }
  });

  it("un Échap pendant le bandeau ne retarde pas la manche suivante", () => {
    // Sans la garde, `surPause` réécrirait `instantStatut` et
    // `regleEnchainement` — qui ne regarde que `"pose"` et `"crash"` — perdrait
    // sa référence : la manche suivante ne démarrerait jamais.
    const scene = sceneDeManche(RIEN);
    let etat = surContact(etatDeTest(lemCrash()), { verdict: VERDICT_CRASH });

    for (let i = 0; i < DELAI_ENCHAINEMENT / 0.5; i++) {
      etat = surPause(etat); // l'appui parasite, ignoré
      etat = scene.tick(etat, 0.5);
    }

    expect(etat.globals.statut).toBe("vol");
    expect(etat.globals.numeroManche).toBe(2);
  });

  it("la reprise ne referme que la pause", () => {
    const enPause = surPause(etatDeTest(lemPose()));
    expect(surReprise(enPause).globals.statut).toBe("vol");

    for (const statut of ["vol", "pose", "crash", "fini"] as const) {
      const etat = etatDeTest(lemPose(), { statut, instantStatut: 3 });
      expect(surReprise(etat)).toBe(etat);
    }
  });

  it("l'abandon ne part que de la pause, et termine la partie", () => {
    const enPause = surPause({ ...etatDeTest(lemPose()), time: 5 });
    const abandon = surAbandon(enPause);

    expect(abandon.globals.statut).toBe("fini");
    expect(abandon.globals.abandonnee).toBe(true);
    expect(abandon.globals.instantStatut).toBe(5);

    for (const statut of ["vol", "pose", "crash", "fini"] as const) {
      const etat = etatDeTest(lemPose(), { statut });
      expect(surAbandon(etat)).toBe(etat);
      expect(surAbandon(etat).globals.abandonnee).toBe(false);
    }
  });

  it("les trois reducers de pause ne touchent à aucune entité", () => {
    const etat = etatDeTest(lemPose());
    const enPause = surPause(etat);
    expect(enPause.entities).toBe(etat.entities);
    expect(surReprise(enPause).entities).toBe(etat.entities);
    expect(surAbandon(enPause).entities).toBe(etat.entities);
  });

  it("écrit instantStatut à chaque changement de statut", () => {
    const enVol: EtatPartie = { ...etatDeTest(lemPose()), time: 4.5 };
    expect(surPause(enVol).globals.instantStatut).toBe(4.5);
    const enPause: EtatPartie = { ...surPause(enVol), time: 6.5 };
    expect(surReprise(enPause).globals.instantStatut).toBe(6.5);
    expect(surAbandon(enPause).globals.instantStatut).toBe(6.5);
  });

  it("une reprise après un posé ne recompte pas la manche", () => {
    // `surPause` refuse déjà de partir d'un `"pose"` : ce test force le statut à
    // `"vol"` pour prouver la **seconde** serrure, `contactEmisPourManche`. Sans
    // elle, le LEM toujours au sol ferait re-signaler le contact et la manche
    // serait comptée deux fois.
    const pose = surContact(etatDeTest(lemPose()), {
      verdict: verdictPose(12),
    });
    const commeSiReprise: EtatPartie = {
      ...pose,
      globals: { ...pose.globals, statut: "vol" },
    };

    const scene = sceneDeManche(RIEN);
    const etat = avance(scene, commeSiReprise, 1 / 60, 10);

    expect(etat.globals.manchesReussies).toBe(1);
    expect(etat.globals.ecarts).toEqual([12]);
    expect(etat.globals.vies).toBe(VIES_INITIALES);
  });
});

// --- Particules et résultat ---

describe("surParticuleMorte", () => {
  it("retire la particule et laisse le reste en place", () => {
    const etat: EtatPartie = {
      ...etatDeTest(lemPose()),
      entities: [
        lemPose(),
        new Particle(7, Vector2.ZERO, Vector2.ZERO),
        new Particle(8, Vector2.ZERO, Vector2.ZERO),
      ],
    };

    const apres = surParticuleMorte(etat, { particleId: 7 });

    expect(apres.entities.map((e) => e.id)).toEqual([0, 8]);
  });
});

describe("resultatPartie", () => {
  it("publie le bilan d'une partie finie", () => {
    const etat = etatDeTest(lemPose(), {
      statut: "fini",
      niveauDepart: 1,
      manchesReussies: 3,
      ecarts: [12, 0, 45],
      tempsDeVol: 137.25,
      abandonnee: false,
    });

    expect(resultatPartie(etat)).toEqual({
      manchesReussies: 3,
      points: 57,
      tempsDeVol: 137.25,
      niveauDepart: 1,
      abandonnee: false,
    });
  });

  it("marque une partie abandonnée, qui reste classable", () => {
    const abandon = surAbandon(
      surPause(etatDeTest(lemPose(), { manchesReussies: 2, ecarts: [3, 4] })),
    );
    const resultat = resultatPartie(abandon);

    expect(resultat.abandonnee).toBe(true);
    expect(resultat.points).toBe(7);
    expect(resultat.manchesReussies).toBe(2);
  });
});

// --- Contrainte de reproductibilité ---

describe("aucun tirage caché", () => {
  it("deux parties de même graine se déroulent à l'identique", () => {
    /**
     * Trois cents ticks de chute libre, poussée tenue au cran, jusqu'au contact
     * et au-delà : de quoi traverser un verdict, un bandeau et une manche
     * suivante. Le moindre `Math.random` ou état caché ferait diverger les deux.
     */
    function deroule(graine: number): string {
      const scene = sceneDeManche(
        new SourceFigee(["tilt-right"], ["throttle-up"]),
      );
      const etat = avance(scene, nouvellePartie(1, graine), 1 / 60, 300);
      const lem = lemDe(etat);
      return JSON.stringify({
        statut: etat.globals.statut,
        vies: etat.globals.vies,
        manche: etat.globals.numeroManche,
        ecarts: etat.globals.ecarts,
        tempsDeVol: etat.globals.tempsDeVol,
        position: [lem.position.x, lem.position.y],
        velocity: [lem.velocity.x, lem.velocity.y],
        carburant: lem.carburant,
        surface: etat.globals.terrain.hf.surface,
      });
    }

    expect(deroule(2026)).toBe(deroule(2026));
    expect(deroule(2026)).not.toBe(deroule(2027));
  });
});
