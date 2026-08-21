---
id: T2
titre: Générateur aléatoire à graine dans le moteur
fichiers: packages/engine/src/math/Rng.ts, packages/engine/src/math/Rng.test.ts, packages/engine/src/index.ts
sensible: false
---

# T2 — Générateur aléatoire à graine

## Objectif

Donner au moteur un tirage aléatoire reproductible, pour que terrain et effets
soient identiques à graine identique — et donc testables.

## Ce qui existe

- Aucun générateur dans le moteur. `packages/engine/src/index.ts` exporte
  `Vector2`, `wrap`, `collision`, `Scene`, `GameLoop`, `KeyboardInput`,
  `Renderer`.
- `packages/game/src/entities/Particle.ts:spawnDebris` accepte déjà un paramètre
  `random: () => number` avec `Math.random` par défaut : c'est le point de
  branchement prévu.

## À faire

1. Créer `packages/engine/src/math/Rng.ts`.
2. Exporter l'interface `Rng` :
   - `next(): number` — flottant dans `[0, 1)` ;
   - `range(min: number, max: number): number` — flottant dans `[min, max)` ;
   - `int(min: number, max: number): number` — entier dans `[min, max]`
     **bornes incluses** ;
   - `bool(probabilite?: number): boolean` — défaut `0.5` ;
   - `pick<T>(items: readonly T[]): T` — un élément au hasard ;
   - `signe(): 1 | -1`.
3. Exporter `createRng(graine: number): Rng`, implémenté en **mulberry32** :
   état 32 bits, avancé à chaque `next()`. Choix assumé : rapide, court, suite
   de qualité suffisante pour du relief et des particules.
4. Exporter `melangeGraine(a: number, b: number): number` — mélange de deux
   entiers en une graine 32 bits, sans corrélation visible entre entrées
   voisines. T9 en a besoin pour dériver la graine d'une manche depuis la graine
   de la partie et le numéro de manche. Pas de hachage de chaîne : le partage de
   graine est hors périmètre, on n'écrit pas de code spéculatif.
5. Ajouter les exports dans `packages/engine/src/index.ts`.

## Gardes et cas limites

- Deux générateurs créés avec la même graine rendent **exactement** la même
  suite ; deux graines différentes divergent.
- `graine` non entière ou négative : ramenée à un entier 32 bits non signé
  (`Math.floor` puis `>>> 0`), jamais d'exception.
- `int(3, 3)` rend toujours `3` ; `int` avec `min > max` échange les bornes
  plutôt que de boucler ou de rendre `NaN`.
- `range(min, max)` avec `min === max` rend `min`.
- `pick([])` lève une erreur explicite : un tirage dans le vide est un bug
  d'appelant, pas une valeur.
- `next()` ne rend jamais `1`, ni de `NaN`, ni de négatif — y compris après
  plusieurs centaines de milliers d'appels.
- Aucun état global : deux `Rng` sont indépendants, et l'un n'avance pas l'autre.

## Tests attendus

- Même graine → même suite de 100 valeurs ; graines différentes → suites
  différentes.
- 100 000 tirages de `next()` restent tous dans `[0, 1)`.
- `int(1, 6)` sur 10 000 tirages : toutes les faces sortent, aucune hors bornes.
- `int(3, 3) === 3` ; `int(6, 2)` reste dans `[2, 6]`.
- `bool(0)` est toujours faux, `bool(1)` toujours vrai.
- `pick` sur un tableau d'un élément le rend ; sur un tableau vide, lève.
- Deux instances de même graine restent synchronisées, et l'usage de l'une
  n'affecte pas l'autre.
- `melangeGraine` est déterministe, et `melangeGraine(7, 1)` diffère nettement
  de `melangeGraine(7, 2)` : deux manches consécutives ne doivent pas donner
  deux terrains qui se ressemblent.

## Fini quand

- [ ] `createRng` est exporté par `@lem/engine` et documenté en français.
- [ ] Les tests de déterminisme et de bornes passent.
- [ ] `spawnDebris` de `packages/game/src/entities/Particle.ts` est appelable
      avec `rng.next` sans modification de sa signature.
- [ ] La commande de vérification du README du plan passe au vert.
