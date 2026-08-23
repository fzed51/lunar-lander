import { describe, it, expect, vi } from "vitest";
import {
  createRng,
  Scene,
  surfaceEn,
  Vector2,
  type InputSnapshot,
  type InputSource,
} from "@lem/engine";
import {
  explosion,
  gaz,
  opaciteParticule,
  poussiere,
  Particle,
  spawnDebris,
} from "./Particle.ts";
import {
  DEBRIS_CRASH,
  GAZ_PAR_SECONDE_PAR_CRAN,
  MOON_GRAVITY,
  PARTICLE_LIFE,
  PARTICULE_GRAVITE_FACTEUR,
  PARTICULES_MAX,
  POUSSIERE_POSAGE,
} from "../constants.ts";
import { PALETTE } from "../design/palette.ts";
import { Lander } from "./Lander.ts";
import type { Verdict } from "../landing.ts";
import {
  surContact,
  surGaz,
  surMancheSuivante,
  surParticuleMorte,
  surTempsVol,
  surHorsLimites,
} from "../reducers.ts";
import {
  regleContact,
  regleEnchainement,
  regleGaz,
  regleParticules,
  regleTempsDeVol,
} from "../rules.ts";
import { nouvellePartie, type EtatPartie, type Globals } from "../state.ts";
import type { Command, LemEntity, LemEvent } from "../types.ts";

describe("Particle", () => {
  it("avance selon sa vitesse et vieillit du dt", () => {
    const p = new Particle(1, Vector2.ZERO, new Vector2(10, -20));
    const next = p.step(0.5) as Particle;
    expect(next.position.x).toBeCloseTo(5);
    expect(next.position.y).toBeCloseTo(-10);
    expect(next.age).toBeCloseTo(0.5);
  });

  it("ne mute pas la particule d'origine", () => {
    const p = new Particle(1, Vector2.ZERO, new Vector2(10, 0));
    p.step(1);
    expect(p.position.x).toBe(0);
    expect(p.age).toBe(0);
  });
});

describe("spawnDebris", () => {
  it("crée le nombre demandé de particules et rend le prochain id libre", () => {
    const { particles, nextId } = spawnDebris(7, new Vector2(3, 4), 5);
    expect(particles).toHaveLength(5);
    expect(particles.map((p) => p.id)).toEqual([7, 8, 9, 10, 11]);
    expect(nextId).toBe(12);
    expect(particles.every((p) => p.life === PARTICLE_LIFE)).toBe(true);
  });

  it("est reproductible quand on injecte un tirage déterministe", () => {
    const fixed = () => 0.25;
    const a = spawnDebris(1, Vector2.ZERO, 3, fixed);
    const b = spawnDebris(1, Vector2.ZERO, 3, fixed);
    expect(a.particles.map((p) => p.velocity.x)).toEqual(
      b.particles.map((p) => p.velocity.x),
    );
  });
});

// --- Outils du fichier ---

/** Toutes les couleurs de la palette, sous la forme où elles atteignent le canvas. */
const COULEURS_PALETTE = new Set<string>(Object.values(PALETTE));

/** Gravité attendue d'un débris ou d'un grain de poussière. */
const GRAVITE_DEBRIS = MOON_GRAVITY * PARTICULE_GRAVITE_FACTEUR;

/**
 * Source de commandes figée : elle rend le **même** snapshot à chaque sondage,
 * fronts montants compris. Le cran de poussée monte donc jusqu'au maximum et y
 * reste, ce qui fait couler le gaz sans interruption.
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

/** Contexte de règle de tick, clavier vide, une image de 60 Hz. */
const CTX = { input: RIEN.poll(), dt: 1 / 60 };

/**
 * La scène complète de la manche, câblée comme l'écran de jeu : cinq règles de
 * tick, six reducers. `regleGaz` et `regleParticules` en font partie — sans la
 * seconde, aucune particule ne mourrait jamais.
 */
function sceneDeManche(source: InputSource<Command>) {
  return new Scene<LemEntity, LemEvent, Globals, Command>({ input: source })
    .onTick(regleContact)
    .onTick(regleTempsDeVol)
    .onTick(regleEnchainement)
    .onTick(regleGaz)
    .onTick(regleParticules)
    .on("contact", surContact)
    .on("hors-limites", surHorsLimites)
    .on("temps-vol", surTempsVol)
    .on("manche-suivante", surMancheSuivante)
    .on("gaz-moteur", surGaz)
    .on("particle-died", surParticuleMorte);
}

/** Partie de référence, dont on remplace les entités et quelques globals. */
function partieAvec(
  entites: readonly LemEntity[],
  patch: Partial<Globals> = {},
): EtatPartie {
  const base = nouvellePartie(0, 4242);
  return {
    ...base,
    entities: entites,
    globals: { ...base.globals, ...patch },
  };
}

/** LEM en vol, moteur au cran maximal, réservoir plein. */
function lemMoteurAllume(): Lander {
  return new Lander(0, new Vector2(400, 200), new Vector2(3, 5), 0.2, 5, 80);
}

/** Les particules d'un état, dans l'ordre où elles y sont rangées. */
function particulesDe(etat: EtatPartie): readonly Particle[] {
  return etat.entities.filter((e): e is Particle => e.kind === "particle");
}

/** Celles qui viennent de naître : le tick qui les crée ne les fait pas vieillir. */
function nouvelles(etat: EtatPartie): readonly Particle[] {
  return particulesDe(etat).filter((p) => p.age === 0);
}

/** Signature au bit près d'une particule : de quoi comparer deux gerbes. */
function signature(p: Particle): string {
  return [
    p.position.x,
    p.position.y,
    p.velocity.x,
    p.velocity.y,
    p.teinte,
    p.life,
    p.gravite,
  ].join(",");
}

/** `nombre` particules de mêmes caractéristiques, ids à partir de 1000. */
function bourrage(nombre: number, age = 0): Particle[] {
  const liste: Particle[] = [];
  for (let i = 0; i < nombre; i++) {
    liste.push(
      new Particle(1000 + i, Vector2.ZERO, Vector2.ZERO, age, PARTICLE_LIFE),
    );
  }
  return liste;
}

/** Verdict de crash ordinaire. */
const VERDICT_CRASH: Verdict = { pose: false, causes: ["trop-vite-vertical"] };

// --- Gravité ---

describe("Particle — gravité", () => {
  it("va tout droit à gravité nulle, exactement comme avant", () => {
    let p = new Particle(1, Vector2.ZERO, new Vector2(10, -20));
    for (let i = 0; i < 10; i++) p = p.step(0.1);
    expect(p.velocity.x).toBe(10);
    expect(p.velocity.y).toBe(-20);
    expect(p.position.x).toBeCloseTo(10, 9);
    expect(p.position.y).toBeCloseTo(-20, 9);
  });

  it("gagne exactement gravite * dt de vitesse verticale par pas", () => {
    const p0 = new Particle(
      1,
      Vector2.ZERO,
      Vector2.ZERO,
      0,
      PARTICLE_LIFE,
      1,
      "blanc",
      MOON_GRAVITY,
    );
    const p1 = p0.step(0.25);
    expect(p1.velocity.y).toBe(MOON_GRAVITY * 0.25);
    expect(p1.velocity.x).toBe(0);
    const p2 = p1.step(0.25);
    expect(p2.velocity.y).toBeCloseTo(MOON_GRAVITY * 0.5, 12);
    // La position intègre la vitesse **déjà** corrigée de la gravité.
    expect(p1.position.y).toBeCloseTo(MOON_GRAVITY * 0.25 * 0.25, 12);
  });

  it("reporte teinte et gravité d'un pas à l'autre", () => {
    const p = new Particle(
      1,
      Vector2.ZERO,
      Vector2.ZERO,
      0,
      0.5,
      2,
      "alerte",
      GRAVITE_DEBRIS,
    ).step(0.1);
    expect(p.teinte).toBe("alerte");
    expect(p.gravite).toBe(GRAVITE_DEBRIS);
    expect(p.radius).toBe(2);
    expect(p.life).toBe(0.5);
  });
});

// --- Fondu ---

describe("opaciteParticule", () => {
  it("fond linéairement de 1 à 0 sur la durée de vie", () => {
    const at = (age: number): number =>
      opaciteParticule(new Particle(1, Vector2.ZERO, Vector2.ZERO, age, 0.8));
    expect(at(0)).toBe(1);
    expect(at(0.4)).toBeCloseTo(0.5, 12);
    expect(at(0.8)).toBe(0);
  });

  it("écrête dans [0, 1] même quand l'âge dépasse la durée de vie", () => {
    // La particule survit une image de plus que sa vie : `regleParticules` ne la
    // retire qu'au tick suivant. Sans écrêtage, `globalAlpha` recevrait une
    // valeur négative et le canvas ignorerait tout le reste de l'image.
    const vieille = new Particle(1, Vector2.ZERO, Vector2.ZERO, 5, 0.6);
    expect(opaciteParticule(vieille)).toBe(0);
    const negative = new Particle(1, Vector2.ZERO, Vector2.ZERO, -2, 0.6);
    expect(opaciteParticule(negative)).toBe(1);
    const sansVie = new Particle(1, Vector2.ZERO, Vector2.ZERO, 0, 0);
    expect(opaciteParticule(sansVie)).toBe(0);
  });
});

// --- Explosion ---

describe("explosion", () => {
  it("éclate DEBRIS_CRASH débris et rend le prochain id libre", () => {
    const { particles, nextId } = explosion(
      7,
      new Vector2(100, 200),
      createRng(1),
    );
    expect(particles).toHaveLength(DEBRIS_CRASH);
    expect(nextId).toBe(7 + DEBRIS_CRASH);
    expect(particles.map((p) => p.id)).toEqual(
      particles.map((_, i) => 7 + i),
    );
    expect(particles.every((p) => p.position.x === 100)).toBe(true);
  });

  it("est déterministe à graine fixée, différente à graine différente", () => {
    const gerbe = (graine: number): string[] =>
      explosion(1, Vector2.ZERO, createRng(graine)).particles.map(signature);
    expect(gerbe(9)).toEqual(gerbe(9));
    expect(gerbe(9)).not.toEqual(gerbe(10));
  });

  it("part en éventail complet et retombe à la gravité lunaire", () => {
    const { particles } = explosion(1, Vector2.ZERO, createRng(3));
    expect(particles.some((p) => p.velocity.x > 0)).toBe(true);
    expect(particles.some((p) => p.velocity.x < 0)).toBe(true);
    expect(particles.some((p) => p.velocity.y > 0)).toBe(true);
    expect(particles.some((p) => p.velocity.y < 0)).toBe(true);
    expect(particles.every((p) => p.gravite === GRAVITE_DEBRIS)).toBe(true);
  });

  it("ne se teinte que dans la palette", () => {
    for (const p of explosion(1, Vector2.ZERO, createRng(5)).particles) {
      expect(COULEURS_PALETTE.has(PALETTE[p.teinte])).toBe(true);
    }
  });
});

// --- Poussière ---

describe("poussiere", () => {
  it("soulève POUSSIERE_POSAGE grains depuis le point de contact", () => {
    const { particles, nextId } = poussiere(
      3,
      new Vector2(50, 300),
      createRng(1),
    );
    expect(particles).toHaveLength(POUSSIERE_POSAGE);
    expect(nextId).toBe(3 + POUSSIERE_POSAGE);
    expect(particles.every((p) => p.position.y === 300)).toBe(true);
  });

  it("file à l'horizontale, jamais en éventail", () => {
    // Un grain rase le sol : sa composante verticale reste franchement plus
    // petite que l'horizontale, et elle pointe vers le haut (`y` vers le bas).
    for (const graine of [1, 2, 3, 4, 5]) {
      for (const p of poussiere(1, Vector2.ZERO, createRng(graine)).particles) {
        expect(Math.abs(p.velocity.y)).toBeLessThan(Math.abs(p.velocity.x));
        expect(p.velocity.y).toBeLessThan(0);
      }
    }
  });

  it("s'écarte des deux côtés du LEM", () => {
    const { particles } = poussiere(1, Vector2.ZERO, createRng(7));
    expect(particles.some((p) => p.velocity.x > 0)).toBe(true);
    expect(particles.some((p) => p.velocity.x < 0)).toBe(true);
  });

  it("reste plus lente qu'une explosion", () => {
    const grains = poussiere(1, Vector2.ZERO, createRng(11)).particles;
    const debris = explosion(1, Vector2.ZERO, createRng(11)).particles;
    const vitesseMax = (liste: readonly Particle[]): number =>
      Math.max(...liste.map((p) => p.velocity.length()));
    expect(vitesseMax(grains)).toBeLessThan(vitesseMax(debris));
  });

  it("ne se teinte qu'en gris de palette", () => {
    for (const p of poussiere(1, Vector2.ZERO, createRng(13)).particles) {
      expect(["grisPale", "grisClair"]).toContain(p.teinte);
      expect(COULEURS_PALETTE.has(PALETTE[p.teinte])).toBe(true);
    }
  });

  it("est déterministe à graine fixée", () => {
    const gerbe = (graine: number): string[] =>
      poussiere(1, Vector2.ZERO, createRng(graine)).particles.map(signature);
    expect(gerbe(21)).toEqual(gerbe(21));
    expect(gerbe(21)).not.toEqual(gerbe(22));
  });
});

// --- Gaz du moteur ---

describe("gaz", () => {
  /** Une seconde de poussée découpée en `pas` images, reste accumulé. */
  function uneSecondeDePoussee(pas: number, cran: number): number {
    const dt = 1 / pas;
    let accu = 0;
    let id = 0;
    let total = 0;
    for (let i = 0; i < pas; i++) {
      const jet = gaz(
        id,
        Vector2.ZERO,
        new Vector2(0, 1),
        cran,
        dt,
        accu,
        createRng(i),
      );
      total += jet.particles.length;
      accu = jet.reste;
      id = jet.nextId;
    }
    return total;
  }

  it("ne dépend pas du framerate : 30 ou 120 images, même débit à ±1", () => {
    const attendu = GAZ_PAR_SECONDE_PAR_CRAN * 3;
    const en30 = uneSecondeDePoussee(30, 3);
    const en120 = uneSecondeDePoussee(120, 3);
    expect(Math.abs(en30 - en120)).toBeLessThanOrEqual(1);
    expect(Math.abs(en30 - attendu)).toBeLessThanOrEqual(1);
    expect(Math.abs(en120 - attendu)).toBeLessThanOrEqual(1);
  });

  it("accumule le reste au lieu de le tronquer", () => {
    // Au cran 5 et à 60 images par seconde, le débit vaut une demi-particule par
    // image : tronquer, c'est n'en produire aucune, jamais.
    const un = gaz(1, Vector2.ZERO, new Vector2(0, 1), 5, 1 / 60, 0, createRng(1));
    expect(un.particles).toHaveLength(0);
    expect(un.reste).toBeCloseTo(0.5, 12);
    const deux = gaz(
      1,
      Vector2.ZERO,
      new Vector2(0, 1),
      5,
      1 / 60,
      un.reste,
      createRng(2),
    );
    expect(deux.particles).toHaveLength(1);
    expect(deux.reste).toBeCloseTo(0, 12);
  });

  it("ne rend jamais un reste hors de [0, 1)", () => {
    let accu = 0;
    for (let i = 0; i < 200; i++) {
      const jet = gaz(
        1,
        Vector2.ZERO,
        new Vector2(0, 1),
        i % 6,
        1 / 90,
        accu,
        createRng(i),
      );
      accu = jet.reste;
      expect(accu).toBeGreaterThanOrEqual(0);
      expect(accu).toBeLessThan(1);
    }
  });

  it("sort dans la direction donnée, sans poids", () => {
    const { particles } = gaz(
      1,
      new Vector2(10, 20),
      new Vector2(0, 1),
      5,
      1,
      0,
      createRng(4),
    );
    expect(particles.length).toBeGreaterThan(0);
    for (const p of particles) {
      expect(p.velocity.y).toBeGreaterThan(0);
      expect(Math.abs(p.velocity.x)).toBeLessThan(p.velocity.y);
      expect(p.gravite).toBe(0);
      expect(p.position.x).toBe(10);
      expect(p.life).toBeLessThan(PARTICLE_LIFE);
    }
  });

  it("ne se teinte que dans la palette", () => {
    const { particles } = gaz(
      1,
      Vector2.ZERO,
      new Vector2(0, 1),
      5,
      1,
      0,
      createRng(6),
    );
    for (const p of particles) {
      expect(COULEURS_PALETTE.has(PALETTE[p.teinte])).toBe(true);
    }
  });

  it("est déterministe à graine fixée", () => {
    const jet = (graine: number): string[] =>
      gaz(
        1,
        Vector2.ZERO,
        new Vector2(0, 1),
        5,
        1,
        0,
        createRng(graine),
      ).particles.map(signature);
    expect(jet(31)).toEqual(jet(31));
    expect(jet(31)).not.toEqual(jet(32));
  });

  it("ne consomme aucun tirage de Math.random", () => {
    const piege = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("Math.random n'a rien à faire dans les particules.");
    });
    try {
      for (let graine = 0; graine < 20; graine++) {
        const rng = createRng(graine);
        explosion(1, Vector2.ZERO, rng);
        poussiere(1, Vector2.ZERO, rng);
        gaz(1, Vector2.ZERO, new Vector2(0, 1), 5, 1, 0, rng);
      }
      expect(piege).not.toHaveBeenCalled();
    } finally {
      piege.mockRestore();
    }
  });
});

// --- Mort des particules ---

describe("regleParticules", () => {
  it("n'émet rien tant qu'aucune particule n'a fini sa vie", () => {
    const etat = partieAvec([
      new Particle(1, Vector2.ZERO, Vector2.ZERO, 0, 0.6),
      new Particle(2, Vector2.ZERO, Vector2.ZERO, 0.59, 0.6),
    ]);
    expect(regleParticules(etat, CTX)).toEqual([]);
  });

  it("émet un particle-died par particule dont l'âge atteint sa vie", () => {
    const etat = partieAvec([
      new Particle(1, Vector2.ZERO, Vector2.ZERO, 0.6, 0.6),
      new Particle(2, Vector2.ZERO, Vector2.ZERO, 0.1, 0.6),
      new Particle(3, Vector2.ZERO, Vector2.ZERO, 9, 0.6),
    ]);
    expect(regleParticules(etat, CTX)).toEqual([
      { type: "particle-died", particleId: 1 },
      { type: "particle-died", particleId: 3 },
    ]);
  });

  it("ignore ce qui n'est pas une particule", () => {
    expect(regleParticules(partieAvec([lemMoteurAllume()]), CTX)).toEqual([]);
  });

  it("vide la scène de ses particules en deux secondes", () => {
    // Le test qui prouve que le plafond se libère : sans cette règle, les débris
    // resteraient dans `state.entities` jusqu'à la manche suivante.
    const scene = sceneDeManche(RIEN);
    let etat = partieAvec(
      explosion(1, new Vector2(400, 300), createRng(2)).particles,
    );
    expect(particulesDe(etat).length).toBe(DEBRIS_CRASH);
    for (let i = 0; i < 120; i++) etat = scene.tick(etat, 1 / 60);
    expect(particulesDe(etat)).toEqual([]);
  });
});

// --- Gaz branché sur la manche ---

describe("regleGaz", () => {
  it("réclame du gaz en vol, moteur allumé et réservoir non vide", () => {
    expect(regleGaz(partieAvec([lemMoteurAllume()]), CTX)).toEqual([
      { type: "gaz-moteur", dt: CTX.dt },
    ]);
  });

  it("se tait moteur coupé, réservoir vide ou LEM inerte", () => {
    const position = new Vector2(400, 200);
    const coupe = new Lander(0, position, Vector2.ZERO, 0, 0, 80);
    const sec = new Lander(0, position, Vector2.ZERO, 0, 5, 0);
    const fige = new Lander(0, position, Vector2.ZERO, 0, 5, 80, undefined, true);
    for (const lem of [coupe, sec, fige]) {
      expect(regleGaz(partieAvec([lem]), CTX)).toEqual([]);
    }
  });

  it("se tait hors du vol", () => {
    for (const statut of ["pause", "pose", "crash", "fini"] as const) {
      expect(regleGaz(partieAvec([lemMoteurAllume()], { statut }), CTX)).toEqual(
        [],
      );
    }
  });
});

describe("surGaz", () => {
  it("crache la bouffée sous la tuyère et avance les deux compteurs", () => {
    const etat = partieAvec([lemMoteurAllume()]);
    const apres = surGaz(etat, { dt: 1 / 30 });
    const jet = particulesDe(apres);

    expect(jet.length).toBe(1);
    expect(apres.globals.nextId).toBe(etat.globals.nextId + 1);
    expect(apres.globals.tiragesParticules).toBe(1);
    // La bouche est sous le LEM, du côté où il penche.
    const bouffee = jet[0] as Particle;
    expect(bouffee.position.y).toBeGreaterThan(200);
    expect(bouffee.gravite).toBe(0);
  });

  it("reporte le reste du débit d'une image à l'autre", () => {
    const un = surGaz(partieAvec([lemMoteurAllume()]), { dt: 1 / 60 });
    expect(particulesDe(un)).toEqual([]);
    expect(un.globals.gazAccu).toBeCloseTo(0.5, 12);
    const deux = surGaz(un, { dt: 1 / 60 });
    expect(particulesDe(deux).length).toBe(1);
    expect(deux.globals.gazAccu).toBeCloseTo(0, 12);
  });

  it("ne recopie pas la même bouffée d'une image à l'autre", () => {
    // Le corollaire du compteur de tirages : deux gerbes de la même manche ne
    // sont pas la même image posée deux fois. Sans lui, le panache serait un
    // trait de pixels fixe sous la tuyère.
    const un = surGaz(partieAvec([lemMoteurAllume()]), { dt: 1 / 30 });
    const deux = surGaz(un, { dt: 1 / 30 });
    const gerbe = nouvelles(deux);
    expect(gerbe.length).toBe(2);
    expect(signature(gerbe[0] as Particle)).not.toBe(
      signature(gerbe[1] as Particle),
    );
  });

  it("ne crache rien hors du vol, moteur coupé ou réservoir vide", () => {
    const sec = new Lander(0, new Vector2(400, 200), Vector2.ZERO, 0, 5, 0);
    for (const etat of [
      partieAvec([lemMoteurAllume()], { statut: "crash" }),
      partieAvec([new Lander(0, new Vector2(400, 200), Vector2.ZERO, 0, 0, 80)]),
      partieAvec([sec]),
      partieAvec([]),
    ]) {
      expect(surGaz(etat, { dt: 1 / 30 })).toBe(etat);
    }
  });
});

// --- Particules du verdict ---

describe("particules du verdict", () => {
  it("éclate le LEM au crash, une seule fois", () => {
    const etat = partieAvec([lemMoteurAllume()]);
    const une = surContact(etat, { verdict: VERDICT_CRASH });

    expect(particulesDe(une).length).toBe(DEBRIS_CRASH);
    expect(une.globals.nextId).toBe(etat.globals.nextId + DEBRIS_CRASH);
    expect(une.globals.tiragesParticules).toBe(1);

    // La garde d'unicité du contact couvre l'explosion : le second appel est un
    // no-op, il ne double pas la gerbe.
    const deux = surContact(une, { verdict: VERDICT_CRASH });
    expect(deux).toBe(une);
    expect(particulesDe(deux).length).toBe(DEBRIS_CRASH);
  });

  it("éclate aussi le LEM sorti du monde", () => {
    const apres = surHorsLimites(partieAvec([lemMoteurAllume()]));
    expect(particulesDe(apres).length).toBe(DEBRIS_CRASH);
  });

  it("soulève la poussière au niveau du sol, sous les pieds", () => {
    const etat = partieAvec([lemMoteurAllume()]);
    const apres = surContact(etat, { verdict: { pose: true, ecart: 3 } });
    const grains = particulesDe(apres);
    const sol = surfaceEn(etat.globals.terrain.hf, 400);

    expect(grains.length).toBe(POUSSIERE_POSAGE);
    expect(grains.every((p) => p.position.y === sol)).toBe(true);
    expect(grains.every((p) => p.position.x === 400)).toBe(true);
    expect(apres.globals.tiragesParticules).toBe(1);
  });

  it("laisse le LEM figé du verdict au milieu de sa gerbe", () => {
    const apres = surContact(partieAvec([lemMoteurAllume()]), {
      verdict: VERDICT_CRASH,
    });
    const lem = apres.entities.find((e): e is Lander => e.kind === "lander");
    expect(lem?.inerte).toBe(true);
    expect(apres.entities.length).toBe(1 + DEBRIS_CRASH);
  });
});

// --- Plafond ---

describe("plafond de particules", () => {
  it("ne crée plus rien au-delà de PARTICULES_MAX vivantes", () => {
    const plein = partieAvec([lemMoteurAllume(), ...bourrage(PARTICULES_MAX)]);
    expect(surGaz(plein, { dt: 1 / 30 })).toBe(plein);

    const auCrash = surContact(plein, { verdict: VERDICT_CRASH });
    expect(particulesDe(auCrash).length).toBe(PARTICULES_MAX);
    // Aucun tirage consommé : le compteur ne bouge pas non plus.
    expect(auCrash.globals.tiragesParticules).toBe(0);
    expect(auCrash.globals.nextId).toBe(plein.globals.nextId);
  });

  it("crée encore juste sous le plafond", () => {
    const presque = partieAvec([
      lemMoteurAllume(),
      ...bourrage(PARTICULES_MAX - 1),
    ]);
    expect(particulesDe(surGaz(presque, { dt: 1 / 30 })).length).toBe(
      PARTICULES_MAX,
    );
  });

  it("ne compte pas les particules mortes dans le plafond", () => {
    // Sans cette distinction, le plafond serait atteint en quelques secondes de
    // poussée et ne se libérerait plus jamais dans la manche.
    const mortes = partieAvec([
      lemMoteurAllume(),
      ...bourrage(PARTICULES_MAX, PARTICLE_LIFE),
    ]);
    const apres = surGaz(mortes, { dt: 1 / 30 });
    expect(apres).not.toBe(mortes);
    expect(nouvelles(apres).length).toBe(1);
  });
});

// --- Reproductibilité ---

describe("suite de particules d'une partie", () => {
  /** Signature de toutes les particules nées pendant quatre secondes de poussée. */
  function suite(graine: number): string[] {
    const scene = sceneDeManche(new SourceFigee([], ["throttle-up"]));
    let etat = nouvellePartie(0, graine);
    const vues: string[] = [];
    for (let i = 0; i < 240; i++) {
      etat = scene.tick(etat, 1 / 60);
      for (const p of nouvelles(etat)) vues.push(signature(p));
    }
    return vues;
  }

  it("rejoue la même suite au bit près à graine égale", () => {
    const attendue = suite(2026);
    expect(attendue.length).toBeGreaterThan(20);
    expect(suite(2026)).toEqual(attendue);
  });

  it("ne rejoue pas la même suite pour une autre graine", () => {
    expect(suite(2026)).not.toEqual(suite(2027));
  });

  it("ne produit pas deux fois la même bouffée dans la même manche", () => {
    // Le test qui distingue « générateur dérivé du compteur de tirages » de
    // « générateur recréé identique à chaque appel » : les deux sont
    // déterministes à graine fixée, seul le premier fait un panache vivant.
    const vues = suite(2026);
    expect(new Set(vues).size).toBe(vues.length);
  });
});
