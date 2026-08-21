/**
 * Générateur pseudo-aléatoire à graine.
 *
 * Deux générateurs créés avec la même graine rendent exactement la même suite :
 * c'est ce qui rend le relief du terrain et les gerbes de particules
 * reproductibles, et donc testables. Aucun état global : deux `Rng` sont
 * indépendants, tirer dans l'un n'avance pas l'autre.
 */
export interface Rng {
  /** Flottant dans [0, 1). Ne rend jamais 1, ni NaN, ni de négatif. */
  next(): number;
  /** Flottant dans [min, max). Rend `min` quand `min === max`. */
  range(min: number, max: number): number;
  /** Entier dans [min, max], **bornes incluses**. Échange les bornes si `min > max`. */
  int(min: number, max: number): number;
  /** Vrai avec la probabilité donnée (0.5 par défaut). `bool(0)` est toujours faux, `bool(1)` toujours vrai. */
  bool(probabilite?: number): boolean;
  /** Un élément du tableau, au hasard. Lève si le tableau est vide. */
  pick<T>(items: readonly T[]): T;
  /** `1` ou `-1`, à égale probabilité. */
  signe(): 1 | -1;
}

/**
 * Ramène une valeur quelconque à un entier 32 bits non signé. Une graine
 * fractionnaire, négative ou non finie est acceptée sans exception : elle est
 * simplement normalisée.
 */
function normaliseGraine(valeur: number): number {
  return Number.isFinite(valeur) ? Math.floor(valeur) >>> 0 : 0;
}

/**
 * Avalanche 32 bits (finaliseur de MurmurHash3) : deux entrées voisines
 * ressortent totalement décorrélées.
 */
function avalanche(valeur: number): number {
  let h = valeur >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Mélange deux entiers en une graine 32 bits, sans corrélation visible entre
 * entrées voisines : `melangeGraine(7, 1)` et `melangeGraine(7, 2)` donnent
 * deux suites qui ne se ressemblent pas. Sert à dériver la graine d'une manche
 * depuis la graine de la partie et le numéro de manche.
 */
export function melangeGraine(a: number, b: number): number {
  const premier = avalanche(normaliseGraine(a));
  // 0x9e3779b9 = nombre d'or en 32 bits : brasse les bits de `b` avant le XOR.
  const second = Math.imul(normaliseGraine(b) ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  return avalanche((premier ^ second) >>> 0);
}

/** 2^32, diviseur qui ramène un entier 32 bits non signé dans [0, 1). */
const DEUX_PUISSANCE_32 = 4294967296;

/**
 * Crée un générateur à graine, implémenté en **mulberry32** : un seul mot de
 * 32 bits d'état, avancé à chaque `next()`. Choix assumé — rapide, court, suite
 * de qualité suffisante pour du relief et des particules. Ce n'est pas un
 * générateur cryptographique.
 */
export function createRng(graine: number): Rng {
  let etat = normaliseGraine(graine);

  const next = (): number => {
    etat = (etat + 0x6d2b79f5) >>> 0;
    let t = Math.imul(etat ^ (etat >>> 15), 1 | etat);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / DEUX_PUISSANCE_32;
  };

  const range = (min: number, max: number): number => min + next() * (max - min);

  const int = (min: number, max: number): number => {
    const bas = Math.floor(Math.min(min, max));
    const haut = Math.floor(Math.max(min, max));
    return bas + Math.floor(next() * (haut - bas + 1));
  };

  const bool = (probabilite = 0.5): boolean => next() < probabilite;

  const pick = <T>(items: readonly T[]): T => {
    if (items.length === 0) {
      throw new Error("Rng.pick : tirage impossible dans un tableau vide.");
    }
    // L'index est borné par la longueur : l'élément existe forcément.
    return items[int(0, items.length - 1)] as T;
  };

  const signe = (): 1 | -1 => (next() < 0.5 ? -1 : 1);

  return { next, range, int, bool, pick, signe };
}
