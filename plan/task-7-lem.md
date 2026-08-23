---
id: T7
titre: Entité LEM — assiette, six crans de poussée, carburant, physique
fichiers: packages/game/src/entities/Lander.ts, packages/game/src/entities/Lander.test.ts, packages/game/src/types.ts, packages/game/src/constants.ts, packages/game/src/entities/Particle.ts
sensible: false
---

# T7 — Le LEM

## Objectif

Créer l'entité pilotable : rotation d'assiette, six crans de poussée mémorisés,
consommation de carburant, chute sous la gravité lunaire.

## Ce qui existe

- `packages/game/src/types.ts` : `Command` vaut
  `"tilt-left" | "tilt-right" | "throttle-up" | "throttle-down" | "confirm" | "back"`,
  et `LemEntity` ne contient que `Particle`.
- `packages/game/src/input/mapping.ts` mappe déjà ← → ↑ ↓ Entrée Échap.
- `packages/game/src/entities/Particle.ts` donne le patron d'une entité immuable
  du dépôt : `kind` littéral, constructeur à champs `readonly`, `step` qui rend
  une nouvelle instance.
- `MOON_GRAVITY = 1.62` et la géométrie `LEM = { largeurTrain, hauteur, rayon }`
  sont déjà dans `constants.ts` (squelette et T6).
- `InputSnapshot` expose `isActive(c)` et `justPressed(c)`. Attention : le
  snapshot est produit par **un seul** `poll()` par frame, fait par le
  gestionnaire d'écrans (T5), et la `Scene` le reçoit via un adaptateur. Un
  second `poll()` dans la même frame viderait les fronts montants dont dépend le
  cran de poussée.

## À faire

1. Ajouter dans `constants.ts`, commentés avec leurs unités. La **géométrie**
   `LEM = { largeurTrain: 8, hauteur: 7, rayon: 4 }` existe déjà (posée en T6,
   dont `estPosable` a besoin) : ne pas la redéfinir, seule la dynamique
   s'ajoute ici.
   - `POUSSEE_MAX = 4` (m/s² au cran 5) ;
   - `CRANS_MAX = 5` ;
   - `CONSO_PAR_CRAN = 0.8` (unités de carburant par seconde et par cran) ;
   - `VITESSE_ROTATION = Math.PI / 4` (rad/s, soit 45°/s) ;
   - `ASSIETTE_MAX = Math.PI / 2` (rad).
2. Créer `packages/game/src/entities/Lander.ts` : classe `Lander`, immuable,
   `kind = "lander"`, champs `readonly` :
   `id`, `position`, `velocity`, `assiette` (rad, 0 = debout, positif vers la
   droite), `cran` (entier 0…5), `carburant` (unités), `radius`.
   Tous les champs après `position` ont une valeur par défaut, `carburant`
   compris — il vaut **0** par défaut. **Aucune constante de dotation initiale de
   carburant n'est ajoutée ici** : la dotation dépend de la manche et de la
   difficulté progressive, elle est posée en T9 (`CARBURANT_BASE`,
   `CARBURANT_PENTE`, `CARBURANT_MIN` et `carburantInitial`).
   T9 a ajouté un huitième champ à ce constructeur, `inerte: boolean = false` :
   voir le point 6.
3. `step(dt, input)` applique, dans cet ordre :
   1. **assiette** : `tilt-left` / `tilt-right` tenus font tourner à
      `VITESSE_ROTATION`, écrêtée à `±ASSIETTE_MAX` ;
   2. **cran** : `throttle-up` / `throttle-down` sur **front montant**
      (`justPressed`) font `+1` / `-1`, borné à `[0, CRANS_MAX]` ;
   3. **carburant** : consommation `cran * CONSO_PAR_CRAN * dt`, plancher 0 ;
   4. **poussée** : si `cran > 0` **et** carburant disponible **avant** cette
      consommation, accélération `cran / CRANS_MAX * POUSSEE_MAX` dirigée selon
      l'assiette (l'axe du LEM) ;
   5. **gravité** : `MOON_GRAVITY * dt` ajoutée à la composante verticale, vers
      le bas ;
   6. **position** : intégrée depuis la vitesse mise à jour.
4. Exporter `poussee(lem): number` (m/s² effectivement délivrés, 0 si réservoir
   vide) et `sansCarburant(lem): boolean`.
5. Ajouter `Lander` à l'union `LemEntity` et à `Command` rien de plus (les six
   commandes existantes suffisent).
   **Conséquence non prévue, tranchée à l'implémentation** : élargir `LemEntity`
   casse le `typecheck` de `entities/Particle.ts`, qui déclarait
   `implements Steppable<LemEntity, Command>` et `step(dt): LemEntity`. Avec deux
   variantes dans l'union, `Particle` ne satisfait plus
   `EntityBase & Steppable<Particle, Command>` — ce que le test existant
   `screens/manager.test.ts` exige en typant sa `Scene<Particle, …>`. Correction
   retenue : **auto-typer `Particle`**
   (`implements Steppable<Particle, Command>`, `step(dt): Particle`), conforme au
   commentaire F-borné de `Steppable` dans le moteur, et retirer l'import
   `LemEntity` devenu inutile. `Particle.ts` sort donc de l'en-tête `fichiers:`
   de cette fiche, mais le test existant n'est pas touché.
6. **Ajout de T9 dans ce fichier** : `readonly inerte: boolean = false` en
   dernier paramètre du constructeur, et `if (this.inerte) return this;` en tête
   de `step`. Le gel du LEM après le verdict ne tient pas d'un tick à l'autre sans
   lui — `Scene.tick` appelle `step` sur toutes les entités à **chaque** tick, et
   `step` ne voit pas les globals. Le drapeau vit dans l'entité, donc dans le
   `GameState` : pas d'état de simulation caché. Détail et justification en T9.

## Gardes et cas limites

- **Réservoir vide** : la poussée tombe à 0 et la gravité continue de
  s'appliquer. Le cran affiché **reste** celui choisi par le joueur (le moteur
  ne se coupe pas tout seul dans l'affichage) mais ne produit rien.
- Réservoir qui se vide **au milieu du pas de temps** : on ne délivre pas une
  poussée pleine sur un carburant absent. Choix retenu, à écrire dans le code :
  la poussée du pas est proportionnée au carburant réellement disponible.
- `cran` reste **entier** : jamais 2,5 par accumulation de flottants.
- `justPressed` et non `isActive` pour le cran : maintenir ↑ ne doit pas monter
  de cinq crans en cinq frames. Un test doit échouer si l'implémentation utilise
  `isActive`.
- Les deux flèches d'assiette tenues **en même temps** : les effets s'annulent,
  l'assiette ne bouge pas.
- `dt = 0` : l'entité rendue est équivalente à l'entrée (pas de dérive).
- Écrêtage d'assiette : au-delà de ±90°, le LEM ne se retourne pas ; il bute.
- **Immuabilité** : `step` ne modifie jamais l'instance appelée.

## Tests attendus

- Sans poussée, la vitesse verticale gagne exactement `1.62 * dt` par pas, et la
  position suit.
- Au cran 5, assiette 0, l'accélération nette vers le haut vaut
  `4 - 1.62 = 2.38 m/s²`.
- Le cran monte de 1 sur un `justPressed`, et **ne bouge pas** quand la touche
  est seulement maintenue.
- Le cran est borné : cinq appuis de plus au cran 5 le laissent à 5 ; idem à 0.
- La consommation vaut `cran * 0.8 * dt` et ne descend jamais sous 0.
- Réservoir vide : poussée nulle, chute libre, `sansCarburant` vrai.
- Réservoir qui se vide en cours de pas : la poussée délivrée est inférieure à
  la poussée pleine, et le carburant final est exactement 0.
- Assiette : écrêtée à ±90°, immobile quand les deux flèches sont tenues.
- `step` ne mute pas l'instance d'origine.
- `dt = 0` : aucun changement.

## Fini quand

- [x] `Lander` est immuable, dans l'union `LemEntity`, testé sur tous les cas
      ci-dessus.
- [x] Le cran est piloté au front montant, borné, entier.
- [x] Le réservoir vide coupe la poussée sans figer le reste de la simulation.
- [x] La commande de vérification du README du plan passe au vert.
