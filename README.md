# LEM

Jeu web d'atterrissage lunaire : poser un module LEM sur la Lune, au plus près
d'une cible, avec un carburant compté et une inertie réaliste. Rendu pixel art à
palette limitée.

Monorepo Yarn workspaces : un **moteur de jeu web générique** (`@lem/engine`) et
le **jeu** (`@lem/game`) qui le consomme. Le moteur est repris du projet
`asteroids`.

> **État du dépôt** : base saine. Le moteur est en place, le jeu est un
> squelette. Le cahier des charges est dans `plan/cahier-des-charges.md`, le
> découpage du travail dans `plan/`.

## Packages

- `packages/engine` — moteur générique : boucle d'exécution, entités, commandes,
  collisions, primitives de rendu canvas. Ne connaît aucun jeu, et ne s'occupe
  que de la **partie jouée**.
- `packages/game` — le jeu : LEM, terrain, règles, écrans, hall of fame, et tout
  le dessin.

## Boucle d'exécution

`état initial → input → move → interact → état final → rendu`

- **input** : `InputSource.poll()` → snapshot des commandes actives / fronts
  montants.
- **move** : `entity.step(dt, input)` produit une nouvelle entité (immuable).
- **interact** : handlers de paire (collisions) + règles de tick → liste
  d'événements ; ne mute rien.
- **état final** : fold des reducers sur les événements → nouveau `GameState`.
- **rendu** : dessin du state, hors de la boucle logique. Le moteur dit *quand*
  dessiner ; c'est le jeu qui dessine.

Détails :

- dt variable, frame limiter 60 Hz (skip du tick si trop rapproché, sans reset
  de l'horloge), clamp max 1/30 s (anti-tunneling).
- État immuable double-buffer : chaque tick produit un nouveau `GameState`.
- Reducers idempotents : un même événement rejoué dans le tick est sans effet
  (garde `findById`).

## Moteur générique

`Scene<E, Ev, G, C>` est paramétré par le jeu : entités `E`, événements `Ev`,
globals `G`, commandes `C`. Le moteur n'importe aucun type du jeu ; celui-ci
enregistre ses interactions (`onPair`), règles (`onTick`), reducers (`on`) et
effets (`addEffect`).

## Commandes

```sh
yarn dev        # lance le jeu (Vite)
yarn build      # build de production
yarn test       # tests unitaires (Vitest)
yarn typecheck  # vérification TypeScript
```

## Contrôles

- ← / → : assiette du LEM (rotation)
- ↑ / ↓ : puissance moteur, 6 crans mémorisés (0 à 5)
- Entrée : valider — Échap : revenir

## Rendu

Tout est dessiné sur un canvas interne de **320 × 180**, agrandi d'un facteur
**entier** sans lissage. Palette de **16 couleurs** sur le thème « Lune et
espace ». Les écrans hors jeu (accueil, fin de partie, hall of fame) sont en
HTML / CSS, sur un fond animé en canvas, avec le même design system.

## Notes

- **Import source-only** : `game` consomme `engine` directement en TypeScript
  (`exports` pointe `./src/index.ts`), sans étape de build. Fonctionne grâce à
  Vite + `moduleResolution: "bundler"`.
- **Timestep** : dt variable (borné). La physique est donc légèrement dépendante
  du framerate.
- `wrap`, `toroidalDelta` et `circlesOverlapToroidal` sont des outils du moteur
  hérités d'un monde torique. Le LEM ne s'en sert pas ; ils restent disponibles
  pour un autre jeu.
