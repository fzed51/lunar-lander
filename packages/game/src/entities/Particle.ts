import {
  Vector2,
  type EntityBase,
  type Steppable,
} from "@lem/engine";
import type { LemEntity, Command } from "../types.ts";
import { PARTICLE_LIFE, PARTICLE_SPEED } from "../constants.ts";

/** Rayon (visuel) d'une particule. */
const PARTICLE_RADIUS = 1;

/**
 * Débris éphémère (explosion, poussière au posage, gaz du moteur). Immuable, ne
 * participe à aucune collision. Porte son `age` (s) : une règle la retire à
 * `age >= life`, et le rendu fait fondre son opacité sur `age/life`.
 */
export class Particle implements EntityBase, Steppable<LemEntity, Command> {
  readonly kind = "particle" as const;

  constructor(
    readonly id: number,
    readonly position: Vector2,
    readonly velocity: Vector2,
    readonly age: number = 0,
    readonly life: number = PARTICLE_LIFE,
    readonly radius: number = PARTICLE_RADIUS,
  ) {}

  step(dt: number): LemEntity {
    return new Particle(
      this.id,
      this.position.add(this.velocity.scale(dt)),
      this.velocity,
      this.age + dt,
      this.life,
      this.radius,
    );
  }
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
