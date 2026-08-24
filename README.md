# LEM

Jeu web d'atterrissage lunaire : poser un module LEM sur la Lune, au plus près
d'une cible, avec un carburant compté et une inertie réaliste. Rendu pixel art à
palette limitée.

Monorepo Yarn workspaces : un **moteur de jeu web générique** (`@lem/engine`) et
le **jeu** (`@lem/game`) qui le consomme. Le moteur est repris du projet
`asteroids`.

## Le jeu

- Une partie se joue avec **3 vies** et enchaîne des **manches**. Chaque manche
  génère un nouveau terrain, une nouvelle cible, et refait le plein.
- Une manche est **réussie** si le LEM touche un sol assez plat, assez lentement
  et assez droit : au plus 2 m/s à la descente, 1 m/s de dérive, 10°
  d'inclinaison, 1 m de dénivelé sous le train. Sinon c'est un crash, et une vie
  de moins.
- Le score est un **malus, façon golf** : les points d'une manche sont l'écart
  horizontal au drapeau, en mètres arrondis. **Le plus petit total gagne.**
- La difficulté monte de 0,08 à chaque manche réussie, plafonnée à 2,4 : la
  dérive initiale croît, le réservoir maigrit, le relief se durcit et la
  plateforme rétrécit.
- À la fin, si la partie compte **au moins un posé** et qu'elle entre dans les
  100 meilleures, on saisit un **trigramme** à la manière d'une borne d'arcade.
  Le **hall of fame** est local (`localStorage`), trié par temps de vol
  décroissant puis par points croissants.

Les valeurs de réglage sont toutes dans `packages/game/src/constants.ts`, et
`packages/game/src/reglages.test.ts` tient les invariants qui les rendent
cohérentes entre elles.

## Commandes

```sh
yarn dev        # lance le jeu (Vite)
yarn build      # build de production
yarn test       # tests unitaires (Vitest)
yarn typecheck  # vérification TypeScript
```

## Contrôles

Tout se joue aux **quatre flèches**, plus `Entrée`, `Échap`, `H` et `R`. Ni
souris, ni manette, ni tactile.

| Touche | Écran | Effet |
| --- | --- | --- |
| ← → | accueil | choisir le niveau (facile / moyen / difficile) |
| ← → | jeu | incliner le LEM (assiette) |
| ← → | fin de partie | changer de lettre du trigramme |
| ← → | hall of fame | page précédente / suivante |
| ↑ ↓ | jeu | puissance moteur, **un cran par appui**, 0 à 5, mémorisé |
| ↑ ↓ | fin de partie | faire défiler la lettre (A→Z, en boucle) |
| ↑ ↓ | hall of fame | ligne précédente / suivante |
| Entrée | accueil | lancer la partie |
| Entrée | jeu en pause | reprendre le vol |
| Entrée | fin de partie | valider le trigramme, ou revenir à l'accueil |
| Entrée | hall of fame | revenir à l'accueil |
| Échap | jeu | ouvrir la **pause**, puis abandonner la partie |
| Échap | hall of fame | annuler la remise à zéro, sinon revenir à l'accueil |
| H | accueil | ouvrir le hall of fame |
| R | hall of fame | remise à zéro, **deux appuis** : le second confirme |

La pause suspend le vol et le chronomètre : le temps de vol ne tourne ni en
pause, ni sur le bandeau de fin de manche. Une partie abandonnée est classée
comme les autres, si elle compte au moins un posé.

## Packages

- `packages/engine` — moteur générique : boucle d'exécution, entités, commandes,
  collisions, primitives de rendu canvas, caméra, générateur aléatoire à graine,
  outils de champ d'altitudes. Ne connaît aucun jeu, et ne s'occupe que de la
  **partie jouée**.
- `packages/game` — le jeu : LEM, terrain, règles, écrans, hall of fame, et tout
  le dessin.

Dans `packages/game/src` :

| Fichier | Rôle |
| --- | --- |
| `constants.ts` | **toutes** les valeurs de réglage, et rien d'autre |
| `terrain.ts` | génération du relief, plateforme cible, replis |
| `entities/Lander.ts`, `entities/Particle.ts` | le LEM et sa physique, les particules |
| `landing.ts`, `score.ts`, `difficulty.ts` | verdict du contact, points, montée de la difficulté |
| `state.ts`, `rules.ts`, `reducers.ts`, `events.ts` | l'état d'une partie et sa boucle logique |
| `screens/` | machine à écrans : accueil, jeu, fin de partie, hall of fame |
| `render/` | surface pixel, dessin du monde, HUD, fond animé, étoiles |
| `design/` | palette 16 couleurs et police 5 × 7, source unique canvas + CSS |
| `hof.ts`, `storage.ts`, `trigramme.ts` | classement, persistance `localStorage`, saisie arcade |

## Boucle d'exécution

`état initial → input → move → interact → état final → rendu`

- **input** : `InputSource.poll()` → snapshot des commandes actives / fronts
  montants. Un seul sondage par image, fait par le gestionnaire d'écrans.
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
- Aucun `Math.random` dans la logique : tout tirage passe par le générateur à
  graine du moteur. La seule entropie extérieure d'une partie est le `Date.now()`
  de l'écran d'accueil.

## Moteur générique

`Scene<E, Ev, G, C>` est paramétré par le jeu : entités `E`, événements `Ev`,
globals `G`, commandes `C`. Le moteur n'importe aucun type du jeu ; celui-ci
enregistre ses interactions (`onPair`), règles (`onTick`), reducers (`on`) et
effets (`addEffect`).

## Rendu

Tout est dessiné sur un canvas interne de **320 × 180**, agrandi d'un facteur
**entier** sans lissage. Palette de **16 couleurs** sur le thème « Lune et
espace ». Les écrans hors jeu (accueil, fin de partie, hall of fame) sont en
HTML / CSS, sur un fond animé en canvas, avec le même design system.

## Documentation

- `docs/cahier-des-charges.md` — ce que le jeu doit être, avec les valeurs
  retenues à l'équilibrage.
- `docs/design-system.md` — palette, police, typographie DOM et règles d'emploi.
- `plan/` — le découpage du chantier en 17 tâches.

## Notes

- **Import source-only** : `game` consomme `engine` directement en TypeScript
  (`exports` pointe `./src/index.ts`), sans étape de build. Fonctionne grâce à
  Vite + `moduleResolution: "bundler"`.
- **Timestep** : dt variable (borné). La physique est donc légèrement dépendante
  du framerate.
- `wrap`, `toroidalDelta` et `circlesOverlapToroidal` sont des outils du moteur
  hérités d'un monde torique. Le LEM ne s'en sert pas — le monde a des bords, et
  les franchir perd la manche ; ils restent disponibles pour un autre jeu.
