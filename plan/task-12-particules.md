---
id: T12
titre: Particules rhabillées — explosion, poussière au posage, gaz du moteur
fichiers: packages/game/src/entities/Particle.ts, packages/game/src/entities/Particle.test.ts, packages/game/src/rules.ts, packages/game/src/reducers.ts, packages/game/src/render/draw.ts, packages/game/src/render/draw.test.ts, packages/game/src/constants.ts, packages/game/src/state.ts, packages/game/src/events.ts, packages/game/src/screens/game.ts, packages/game/src/screens/game.test.ts
sensible: false
---

# T12 — Particules

## Objectif

Reprendre le module de particules héritée d'Asteroids et l'adapter à la Lune :
gravité au lieu du monde torique, tirage à graine au lieu de `Math.random`,
palette au lieu du blanc, et trois usages — explosion, poussière, gaz.

## Ce qui existe

- `packages/game/src/entities/Particle.ts` : classe immuable avec `age`, `life`,
  `radius`, `step(dt)` qui avance en ligne droite (le `wrap` torique a déjà été
  retiré au nettoyage), et `spawnDebris(startId, origin, count, random)` avec
  `random` **déjà injectable** — c'est le point de branchement prévu pour le
  `rng`.
- `packages/game/src/entities/Particle.test.ts` : 4 tests **intouchables**
  (déplacement, non-mutation, ids, reproductibilité avec tirage fixe).
- `constants.ts` : `PARTICLE_LIFE = 0.6`, `PARTICLE_SPEED = 40`,
  `MOON_GRAVITY = 1.62`.
- `createRng` (T2), le verdict de contact (T8), les reducers et le statut de
  manche (T9), `draw.ts` et la palette (T1, T10).
- `rules.ts` (T9) ne contient que trois règles de tick (`regleContact`,
  `regleTempsDeVol`, `regleEnchainement`) et **aucune n'émet jamais
  `{ type: "particle-died" }`**, alors que `reducers.ts` a déjà
  `surParticuleMorte` (T9) prêt à le recevoir. Sans émetteur, aucune particule
  n'est jamais retirée de `state.entities` : c'est **cette tâche** qui doit
  fournir la règle manquante, faute de quoi le plafond `PARTICULES_MAX` devient
  un interrupteur définitif après quelques secondes de poussée dans la même
  manche (30 particules/s au cran 5 : `PARTICULES_MAX = 400` atteint en ~13 s),
  après quoi plus aucune particule — gaz, explosion ou poussière — n'apparaît
  jusqu'à la manche suivante.

## À faire

1. Ajouter dans `constants.ts` :
   - `DEBRIS_CRASH = 40` (particules à l'explosion) ;
   - `POUSSIERE_POSAGE = 14` ;
   - `GAZ_PAR_SECONDE_PAR_CRAN = 6` ;
   - `PARTICULE_GRAVITE_FACTEUR = 1` (les débris retombent à la gravité lunaire ;
     réglable pour du gaz plus léger) ;
   - `PARTICULES_MAX = 400` (plafond de particules vivantes) ;
   - `GAZ_BOUCHE = 3` (m, point de sortie du panache dans le repère propre du
     LEM). Cette valeur existait déjà, en dur, dans `FLAMME.bouche` de
     `draw.ts` (T10) : elle est remontée ici pour que le reducer du gaz et le
     dessin de la flamme lisent la même sortie de tuyère. Deux valeurs
     séparées auraient pu diverger et décoller visuellement le panache de la
     flamme.
2. Faire évoluer `Particle` **sans casser les 4 tests existants** :
   - ajouter un champ `readonly teinte: CouleurLem` (défaut `blanc`) et un champ
     `readonly gravite: number` (défaut 0) ;
   - `step(dt)` applique `gravite * dt` à la composante verticale de la vitesse
     avant d'intégrer la position. À `gravite = 0`, le comportement est
     exactement l'actuel — c'est ce qui préserve les tests.
3. **D'où vient le `Rng` passé aux fabriques** : ni `TickContext` (qui ne porte
   que `input` et `dt`) ni `Globals` (qui ne porte, avant cette tâche, aucun
   état de générateur) n'en fournissent un, et un `Rng` mutable ne peut de toute
   façon pas vivre dans un `GameState` immuable. Ajouter à `Globals`
   (`state.ts`) un compteur `readonly tiragesParticules: number`, posé à 0 par
   `nouvellePartie` et `nouvelleManche` (comme `gazAccu`, T9), et **incrémenté
   par chaque reducer qui crée des particules**. Chaque appel à une fabrique
   dérive son générateur par
   `createRng(melangeGraine(melangeGraine(graine, numeroManche), tiragesParticules))`
   — jamais un `Rng` de module ni un `Rng` recréé sans faire avancer ce
   compteur : le premier est un état de simulation caché hors du `GameState`
   (interdit, et non reproductible à graine égale puisqu'il dépendrait du
   nombre de ticks écoulés depuis `entre()`), le second rendrait le tirage
   identique à chaque appel — un panache de gaz figé en un trait de pixels fixe
   sous la tuyère, des explosions superposables d'une manche à l'autre — sans
   qu'aucun test ne le signale, puisque « déterministe à graine fixée » reste
   vrai dans les deux cas.
4. Ajouter trois fabriques prenant toutes un `Rng` :
   - `explosion(startId, origine, rng)` — `DEBRIS_CRASH` particules en éventail,
     teintes `flammeClaire` / `flammeChaude` / `alerte`, gravité lunaire, rend
     `{ particles, nextId }` ;
   - `poussiere(startId, origine, rng)` — `POUSSIERE_POSAGE` particules à
     trajectoire **rasante** (angles proches de l'horizontale, vitesse faible),
     teintes `grisPale` / `grisClair`, gravité lunaire, rend `{ particles,
     nextId }` ;
   - `gaz(startId, origine, direction, cran, dt, accu, rng)` — nombre de
     particules `GAZ_PAR_SECONDE_PAR_CRAN * cran * dt`, **plus** le reste
     fractionnaire `accu` de la frame précédente ; rend `{ particles, nextId,
     reste }` — **un champ de plus** que les deux fabriques précédentes, parce
     que le reste fractionnaire du débit doit remonter dans `Globals.gazAccu`
     pour la frame suivante. Teintes `flammeChaude` / `grisPale`, gravité
     nulle, durée de vie courte.
     L'accumulateur vit dans `Globals.gazAccu` (T9), **pas** dans une variable de
     module : un état caché hors du `GameState` casse la pureté et rend la partie
     non reproductible à graine égale.
5. Brancher : une règle de tick, `regleGaz`, émet les gaz pendant le vol quand
   `cran > 0` et qu'il reste du carburant. Elle émet une variante nouvelle de
   l'union `LemEvent`, `{ type: "gaz-moteur"; dt: number }`, ajoutée à
   `events.ts` — un fichier absent de la liste initiale de cette tâche mais
   nécessaire : une `TickRule` ne peut émettre qu'une variante de cette union,
   et sans elle le seul moyen d'émettre le gaz aurait été de détourner
   `temps-vol`, un reducer de chrono qui fabriquerait des particules. Le
   reducer de contact, lui, émet `explosion` sur un crash et `poussiere` sur un
   posé.
6. Ajouter à `rules.ts` **deux** règles de tick, pas une seule : `regleGaz` (voir
   point 5) et `regleParticules`, qui pour chaque entité `kind === "particle"`
   dont `age >= life`, émet `{ type: "particle-died", particleId: id }`. Les
   deux sont nécessaires et distinctes : la fiche parlait d'une « quatrième »
   règle en pensant à `regleParticules` seule, mais le gaz en est une autre.
   Avec les trois règles de T9, la manche en compte donc **cinq** au total —
   corriger les commentaires de `rules.ts` et de `screens/game.ts` en
   conséquence. Sans `regleParticules`, `surParticuleMorte` (T9) n'est jamais
   appelé et aucune particule ne meurt jamais (voir « Ce qui existe »
   ci-dessus). **Revenir dans `screens/game.ts` (T10) pour y brancher ces deux
   règles** — c'est pour ça que ce fichier et son test sont dans l'en-tête
   `fichiers:` de cette tâche alors qu'ils n'y sont pas créés : ni `regleGaz` ni
   `regleParticules` n'existaient quand T10 s'est exécutée, elle n'a pu
   brancher que les trois premières.
7. Dessiner les particules dans `draw.ts` en `drawPixel` (un ou deux pixels, pas
   un cercle antialiasé), avec le fondu d'opacité existant sur `age / life`. Les
   gardes de rendu (pixel et non cercle, palette, coordonnées entières, fondu
   écrêté) s'ajoutent à `render/draw.test.ts` — le même fichier que celui où
   vit déjà l'outillage de faux contexte canvas obligatoire côté rendu (T10),
   pas dans `Particle.test.ts` qui n'a pas cet outillage.

## Gardes et cas limites

- **Les 4 tests existants de `Particle.test.ts` restent verts sans être
  modifiés.** C'est la garde qui prouve que l'ajout de la gravité est bien
  rétrocompatible.
- **`spawnDebris` garde sa signature** : le paramètre `random` reste en dernier,
  avec son défaut.
- **Aucun `Math.random`** dans les nouvelles fabriques : le `rng` est passé, pas
  deviné.
- **Gaz indépendant du framerate** : à 30 et à 120 images par seconde, la même
  seconde de poussée au même cran produit le même nombre de particules à une
  unité près. Le reste fractionnaire est **accumulé**, pas tronqué à chaque
  frame — sinon à 120 Hz il n'y a plus de gaz du tout.
- **Plafond** : un nombre maximal de particules vivantes
  (`PARTICULES_MAX = 400`) au-delà duquel on n'en crée plus. Sans plafond, un
  moteur tenu au cran 5 pendant deux minutes fait fondre le framerate. Le
  plafond **ne compte que les particules dont `age < life`** : sans
  `regleParticules` pour les retirer de `state.entities`, le compte inclurait
  des particules mortes et invisibles, et le plafond serait atteint en
  quelques secondes sans jamais se libérer.
- **Fondu** : opacité `1 - age / life`, écrêtée à `[0, 1]` — jamais négative.
- **Particule sous le sol** : les débris ne rebondissent pas et ne sont pas
  arrêtés par le relief (choix assumé, à écrire) ; ils meurent par leur `life`.
- Une explosion à l'exact instant du contact ne doit pas être émise deux fois :
  la garde d'unicité du contact de T8 et T9 la couvre, et un test le confirme.

## Tests attendus

- Les 4 tests existants passent, non modifiés.
- `gravite = 0` : trajectoire rectiligne, identique à l'actuel.
- `gravite = 1.62` : la vitesse verticale gagne exactement `1.62 * dt` par pas.
- `explosion`, `poussiere`, `gaz` sont déterministes à graine fixée.
- **Deux parties de même graine produisent la même suite de particules au bit
  près** (positions, vitesses, teintes) — le test qui prouve que le `Rng` est
  bien dérivé de `tiragesParticules` et non recréé identique à chaque appel.
  Corollaire : deux gaz émis à deux instants différents de la même manche ne
  sont **pas** identiques entre eux.
- `poussiere` produit des trajectoires majoritairement rasantes (angle proche de
  l'horizontale), pas un éventail complet.
- `gaz` : 1 seconde au cran 3, en 30 pas ou en 120 pas, produit le même nombre de
  particules à ±1.
- Plafond respecté : au-delà de `PARTICULES_MAX` vivantes, aucune création.
- Fondu écrêté dans `[0, 1]` même quand `age > life`.
- Un seul jeu de particules d'explosion par crash.
- `regleParticules` émet un `particle-died` par particule dont `age >= life`,
  aucun avant. **Après 2 s sans poussée, plus aucune particule dans
  `state.entities`** — le test qui prouve que le plafond se libère.

## Fini quand

- [ ] Explosion au crash, poussière au posage, gaz sous la tuyère, tous visibles
      dans `yarn dev`. **Non vérifié à l'œil dans cet environnement** (pas de
      navigateur) : prouvé par le comportement — `dessineParticules` pose un
      rect par particule vivante, en couleur de palette, à coordonnées
      entières, et un test vérifie qu'une manche complète sous poussée ne sort
      aucune couleur hors palette. Reste à cocher par un humain.
- [x] Les tests d'origine de `Particle.test.ts` sont intacts et verts.
- [x] Le débit de gaz ne dépend pas du framerate, et le plafond protège le
      framerate.
- [x] La commande de vérification du README du plan passe au vert.
