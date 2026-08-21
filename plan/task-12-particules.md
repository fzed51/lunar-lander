---
id: T12
titre: Particules rhabillées — explosion, poussière au posage, gaz du moteur
fichiers: packages/game/src/entities/Particle.ts, packages/game/src/entities/Particle.test.ts, packages/game/src/rules.ts, packages/game/src/reducers.ts, packages/game/src/render/draw.ts, packages/game/src/constants.ts
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

## À faire

1. Ajouter dans `constants.ts` :
   - `DEBRIS_CRASH = 40` (particules à l'explosion) ;
   - `POUSSIERE_POSAGE = 14` ;
   - `GAZ_PAR_SECONDE_PAR_CRAN = 6` ;
   - `PARTICULE_GRAVITE_FACTEUR = 1` (les débris retombent à la gravité lunaire ;
     réglable pour du gaz plus léger) ;
   - `PARTICULES_MAX = 400` (plafond de particules vivantes).
2. Faire évoluer `Particle` **sans casser les 4 tests existants** :
   - ajouter un champ `readonly teinte: CouleurLem` (défaut `blanc`) et un champ
     `readonly gravite: number` (défaut 0) ;
   - `step(dt)` applique `gravite * dt` à la composante verticale de la vitesse
     avant d'intégrer la position. À `gravite = 0`, le comportement est
     exactement l'actuel — c'est ce qui préserve les tests.
3. Ajouter trois fabriques, toutes prenant un `Rng` et rendant `{ particles, nextId }` :
   - `explosion(startId, origine, rng)` — `DEBRIS_CRASH` particules en éventail,
     teintes `flammeClaire` / `flammeChaude` / `alerte`, gravité lunaire ;
   - `poussiere(startId, origine, rng)` — `POUSSIERE_POSAGE` particules à
     trajectoire **rasante** (angles proches de l'horizontale, vitesse faible),
     teintes `grisPale` / `grisClair`, gravité lunaire ;
   - `gaz(startId, origine, direction, cran, dt, accu, rng)` — nombre de
     particules `GAZ_PAR_SECONDE_PAR_CRAN * cran * dt`, **plus** le reste
     fractionnaire `accu` de la frame précédente ; rend le nouveau reste avec les
     particules. Teintes `flammeChaude` / `grisPale`, gravité nulle, durée de vie
     courte.
     L'accumulateur vit dans `Globals.gazAccu` (T9), **pas** dans une variable de
     module : un état caché hors du `GameState` casse la pureté et rend la partie
     non reproductible à graine égale.
4. Brancher : une règle de tick émet les gaz pendant le vol quand `cran > 0` et
   qu'il reste du carburant ; le reducer de contact émet `explosion` sur un crash
   et `poussiere` sur un posé.
5. Dessiner les particules dans `draw.ts` en `drawPixel` (un ou deux pixels, pas
   un cercle antialiasé), avec le fondu d'opacité existant sur `age / life`.

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
  moteur tenu au cran 5 pendant deux minutes fait fondre le framerate.
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
- `poussiere` produit des trajectoires majoritairement rasantes (angle proche de
  l'horizontale), pas un éventail complet.
- `gaz` : 1 seconde au cran 3, en 30 pas ou en 120 pas, produit le même nombre de
  particules à ±1.
- Plafond respecté : au-delà de `PARTICULES_MAX` vivantes, aucune création.
- Fondu écrêté dans `[0, 1]` même quand `age > life`.
- Un seul jeu de particules d'explosion par crash.

## Fini quand

- [ ] Explosion au crash, poussière au posage, gaz sous la tuyère, tous visibles
      dans `yarn dev`.
- [ ] Les tests d'origine de `Particle.test.ts` sont intacts et verts.
- [ ] Le débit de gaz ne dépend pas du framerate, et le plafond protège le
      framerate.
- [ ] La commande de vérification du README du plan passe au vert.
