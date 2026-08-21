import { Vector2 } from "./Vector2.ts";

/** Modulo positif : ramène `n` dans [0, m). */
function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/**
 * Enroule une position dans un monde torique de dimensions `w`×`h`.
 * Sortir par un bord fait réapparaître par le bord opposé.
 */
export function wrap(p: Vector2, w: number, h: number): Vector2 {
  return new Vector2(mod(p.x, w), mod(p.y, h));
}

/**
 * Plus court vecteur de `a` vers `b` dans un monde torique.
 * Chaque composante est ramenée dans [-dim/2, dim/2) — nécessaire pour
 * détecter les collisions entre entités situées de part et d'autre d'un bord.
 */
export function toroidalDelta(
  a: Vector2,
  b: Vector2,
  w: number,
  h: number,
): Vector2 {
  const dx = mod(b.x - a.x + w / 2, w) - w / 2;
  const dy = mod(b.y - a.y + h / 2, h) - h / 2;
  return new Vector2(dx, dy);
}
