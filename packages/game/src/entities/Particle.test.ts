import { describe, it, expect } from "vitest";
import { Vector2 } from "@lem/engine";
import { Particle, spawnDebris } from "./Particle.ts";
import { PARTICLE_LIFE } from "../constants.ts";

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
