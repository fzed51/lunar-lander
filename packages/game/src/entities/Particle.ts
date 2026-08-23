/**
 * Particules du jeu : les débris d'une explosion, la poussière soulevée au posé
 * et le gaz de la tuyère.
 *
 * ## Trois usages, une seule entité
 *
 * Les trois fabriques de ce module ne diffèrent que par leur gerbe : nombre,
 * angles, vitesses, teintes, durée de vie et gravité. Une explosion part en
 * éventail complet et retombe, la poussière file à l'horizontale, le gaz sort
 * court et sans poids.
 *
 * ## Aucun tirage deviné
 *
 * Chaque fabrique reçoit son `Rng` : rien ici n'appelle `Math.random`, et aucun
 * générateur ne vit en variable de module. Un `Rng` de module serait un état de
 * simulation caché hors du `GameState`, non reproductible à graine égale
 * puisqu'il dépendrait du nombre de ticks écoulés depuis le début de la manche.
 * C'est l'appelant — un reducer — qui dérive le générateur du compteur
 * `Globals.tiragesParticules`.
 *
 * ## Les débris traversent le relief
 *
 * Choix assumé : une particule ne rebondit pas, n'est pas arrêtée par le sol et
 * ne collisionne avec rien. Elle meurt de sa seule durée de vie. Un débris qui
 * s'enfonce dans la roche disparaît sous le relief, qui est peint par-dessus le
 * fond — donc invisible, et pour un coût nul.
 */

import {
  Vector2,
  type EntityBase,
  type Rng,
  type Steppable,
} from "@lem/engine";
import type { Command } from "../types.ts";
import {
  DEBRIS_CRASH,
  GAZ_PAR_SECONDE_PAR_CRAN,
  MOON_GRAVITY,
  PARTICLE_LIFE,
  PARTICLE_SPEED,
  PARTICULE_GRAVITE_FACTEUR,
  POUSSIERE_POSAGE,
} from "../constants.ts";
import type { CouleurLem } from "../design/palette.ts";

/** Rayon (visuel) d'une particule. */
const PARTICLE_RADIUS = 1;

/**
 * Débris éphémère (explosion, poussière au posage, gaz du moteur). Immuable, ne
 * participe à aucune collision. Porte son `age` (s) : une règle la retire à
 * `age >= life`, et le rendu fait fondre son opacité sur `age/life`.
 */
export class Particle implements EntityBase, Steppable<Particle, Command> {
  readonly kind = "particle" as const;

  constructor(
    readonly id: number,
    readonly position: Vector2,
    readonly velocity: Vector2,
    readonly age: number = 0,
    readonly life: number = PARTICLE_LIFE,
    readonly radius: number = PARTICLE_RADIUS,
    /** Nom d'une couleur de la palette — jamais une valeur littérale. */
    readonly teinte: CouleurLem = "blanc",
    /**
     * Accélération verticale subie (m/s²), vers le bas. À 0 — le défaut — la
     * particule va tout droit : c'est le cas du gaz, qui n'a pas le temps de
     * retomber.
     */
    readonly gravite: number = 0,
  ) {}

  step(dt: number): Particle {
    // Euler semi-implicite : la gravité entre dans la vitesse **avant**
    // l'intégration de la position. À `gravite = 0`, le calcul est au bit près
    // celui d'une trajectoire rectiligne.
    const velocity = this.velocity.add(new Vector2(0, this.gravite * dt));
    return new Particle(
      this.id,
      this.position.add(velocity.scale(dt)),
      velocity,
      this.age + dt,
      this.life,
      this.radius,
      this.teinte,
      this.gravite,
    );
  }
}

/**
 * Opacité d'une particule, **écrêtée dans `[0, 1]`** : pleine à la naissance,
 * nulle à la fin de sa vie.
 *
 * L'écrêtage n'est pas décoratif. `regleParticules` ne retire la particule qu'au
 * tick où son âge a **déjà** dépassé sa durée de vie, donc `1 - age/life` est
 * négatif au moins une image ; et une `life` nulle donnerait un ratio infini.
 * Sans borne, `globalAlpha` recevrait une valeur négative ou `NaN`, et le canvas
 * ignorerait silencieusement tout ce qui suit dans l'image.
 */
export function opaciteParticule(p: Particle): number {
  if (p.life <= 0) return 0;
  const restant = 1 - p.age / p.life;
  return restant < 0 ? 0 : restant > 1 ? 1 : restant;
}

/** Gerbe de particules et prochain id libre. Retour commun aux trois fabriques. */
export interface Gerbe {
  readonly particles: readonly Particle[];
  readonly nextId: number;
}

/**
 * Éclate `count` particules autour de `origin`, réparties en éventail dans
 * toutes les directions, vitesse ± 40 % de `PARTICLE_SPEED`. Générateur d'ids
 * pur (rend le prochain id libre). `random` est injecté pour rester
 * reproductible : il sera branché sur le générateur à graine du jeu.
 */
export function spawnDebris(
  startId: number,
  origin: Vector2,
  count: number,
  random: () => number = Math.random,
): { particles: Particle[]; nextId: number } {
  const particles: Particle[] = [];
  let id = startId;
  for (let i = 0; i < count; i++) {
    const angle = random() * Math.PI * 2;
    const speed = PARTICLE_SPEED * (0.6 + 0.8 * random());
    particles.push(new Particle(id++, origin, Vector2.fromAngle(angle, speed)));
  }
  return { particles, nextId: id };
}

// --- Réglages de gerbe ---
//
// Ces valeurs ne pilotent aucune règle de jeu : elles décrivent la **forme** de
// chaque gerbe. Les grandeurs qui, elles, s'équilibrent — nombre de particules,
// débit du gaz, plafond, facteur de gravité — vivent dans `constants.ts`.

/** Gravité subie par un débris ou un grain (m/s²) : la lunaire, modulée. */
const GRAVITE_DEBRIS = MOON_GRAVITY * PARTICULE_GRAVITE_FACTEUR;

/** Teintes d'un débris d'explosion, de la plus chaude à la plus sombre. */
const TEINTES_EXPLOSION: readonly CouleurLem[] = [
  "flammeClaire",
  "flammeChaude",
  "alerte",
];

/** Durée de vie (s) d'un débris : le double de la nominale, la gerbe a le temps
 * de s'ouvrir et de retomber pendant le bandeau de fin de manche. */
const VIE_EXPLOSION = PARTICLE_LIFE * 2;

/** Part de `PARTICLE_SPEED` emportée par un débris : de 60 % à 140 %. */
const EXPLOSION_VITESSE = { min: 0.6, max: 1.4 } as const;

/** Teintes d'un grain de poussière : de la roche pulvérisée, pas du feu. */
const TEINTES_POUSSIERE: readonly CouleurLem[] = ["grisPale", "grisClair"];

/** Écart (rad) à l'horizontale d'un grain : de 3° à 20°, toujours vers le haut. */
const POUSSIERE_ANGLE = { min: 0.05, max: 0.35 } as const;

/** Part de `PARTICLE_SPEED` emportée par un grain : la poussière fuse peu. */
const POUSSIERE_VITESSE = { min: 0.15, max: 0.4 } as const;

/** Teintes d'une bouffée de gaz : le cœur chaud, puis la fumée qui refroidit. */
const TEINTES_GAZ: readonly CouleurLem[] = ["flammeChaude", "grisPale"];

/** Durée de vie (s) d'une bouffée : brève, elle ne traîne pas derrière le LEM. */
const VIE_GAZ = PARTICLE_LIFE * 0.4;

/** Ouverture (rad) du jet de part et d'autre de l'axe de la tuyère, soit 17°. */
const GAZ_DISPERSION = 0.3;

/** Part de `PARTICLE_SPEED` emportée par une bouffée. */
const GAZ_VITESSE = { min: 0.5, max: 1 } as const;

/**
 * Explosion du LEM : `DEBRIS_CRASH` débris en éventail complet, teintés de feu,
 * qui retombent à la gravité lunaire.
 */
export function explosion(startId: number, origine: Vector2, rng: Rng): Gerbe {
  const particles: Particle[] = [];
  let id = startId;
  for (let i = 0; i < DEBRIS_CRASH; i++) {
    const angle = rng.range(0, Math.PI * 2);
    const vitesse =
      PARTICLE_SPEED * rng.range(EXPLOSION_VITESSE.min, EXPLOSION_VITESSE.max);
    particles.push(
      new Particle(
        id++,
        origine,
        Vector2.fromAngle(angle, vitesse),
        0,
        VIE_EXPLOSION,
        PARTICLE_RADIUS,
        rng.pick(TEINTES_EXPLOSION),
        GRAVITE_DEBRIS,
      ),
    );
  }
  return { particles, nextId: id };
}

/**
 * Poussière soulevée au posé : `POUSSIERE_POSAGE` grains **rasants**, lents, qui
 * s'écartent des pieds à gauche et à droite.
 *
 * Ce n'est pas un éventail : un grain part à quelques degrés au-dessus de
 * l'horizontale, jamais vers le haut ni vers le bas. `y` croît vers le bas, donc
 * un écart **retiré** à 0 (vers la droite) ou **ajouté** à π (vers la gauche)
 * pointe légèrement au-dessus de l'horizon.
 */
export function poussiere(startId: number, origine: Vector2, rng: Rng): Gerbe {
  const particles: Particle[] = [];
  let id = startId;
  for (let i = 0; i < POUSSIERE_POSAGE; i++) {
    const ecart = rng.range(POUSSIERE_ANGLE.min, POUSSIERE_ANGLE.max);
    const angle = rng.signe() === 1 ? -ecart : Math.PI + ecart;
    const vitesse =
      PARTICLE_SPEED * rng.range(POUSSIERE_VITESSE.min, POUSSIERE_VITESSE.max);
    particles.push(
      new Particle(
        id++,
        origine,
        Vector2.fromAngle(angle, vitesse),
        0,
        PARTICLE_LIFE,
        PARTICLE_RADIUS,
        rng.pick(TEINTES_POUSSIERE),
        GRAVITE_DEBRIS,
      ),
    );
  }
  return { particles, nextId: id };
}

/** Une bouffée de gaz, avec le reste fractionnaire à reporter à l'image suivante. */
export interface JetDeGaz extends Gerbe {
  /** Reste du débit non consommé, dans `[0, 1)`. Va dans `Globals.gazAccu`. */
  readonly reste: number;
}

/**
 * Gaz de la tuyère : `GAZ_PAR_SECONDE_PAR_CRAN * cran * dt` particules, **plus**
 * le reste `accu` de l'image précédente. Le nouveau reste repart avec la gerbe.
 *
 * C'est cette accumulation qui rend le panache indépendant du framerate : au
 * cran 5 et à 120 images par seconde, le débit vaut 0,25 particule par image —
 * une troncature par image n'en produirait aucune, jamais.
 *
 * Les bouffées n'ont **pas de gravité** : elles vivent trop peu pour retomber, et
 * un panache qui pleut sous la tuyère se lirait comme une fuite.
 */
export function gaz(
  startId: number,
  origine: Vector2,
  direction: Vector2,
  cran: number,
  dt: number,
  accu: number,
  rng: Rng,
): JetDeGaz {
  const du = GAZ_PAR_SECONDE_PAR_CRAN * cran * dt + accu;
  const combien = Math.max(0, Math.floor(du));
  const axe = Math.atan2(direction.y, direction.x);
  const particles: Particle[] = [];
  let id = startId;
  for (let i = 0; i < combien; i++) {
    const angle = axe + rng.range(-GAZ_DISPERSION, GAZ_DISPERSION);
    const vitesse =
      PARTICLE_SPEED * rng.range(GAZ_VITESSE.min, GAZ_VITESSE.max);
    particles.push(
      new Particle(
        id++,
        origine,
        Vector2.fromAngle(angle, vitesse),
        0,
        VIE_GAZ,
        PARTICLE_RADIUS,
        rng.pick(TEINTES_GAZ),
        0,
      ),
    );
  }
  return { particles, nextId: id, reste: du - combien };
}
