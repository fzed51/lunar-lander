---
id: T9
titre: Manches, vies, pause, difficulté progressive, score golf
fichiers: packages/game/src/state.ts, packages/game/src/difficulty.ts, packages/game/src/score.ts, packages/game/src/reducers.ts, packages/game/src/rules.ts, packages/game/src/state.test.ts, packages/game/src/difficulty.test.ts, packages/game/src/score.test.ts, packages/game/src/constants.ts
sensible: false
---

# T9 — Manche, vies, difficulté, score

## Objectif

Faire tourner une partie complète en logique pure : 3 vies, des manches qui
s'enchaînent, une pause, une difficulté qui monte doucement jusqu'à un plafond
encore gagnable, et un score de type golf.

## Ce qui existe

- `packages/game/src/terrain.ts` : `genereTerrain(graine, difficulte)`, qui rend
  aussi `depart: { x, sens }` et `replis` (T6).
- `packages/game/src/entities/Lander.ts` : `Lander` (T7).
- `packages/game/src/landing.ts` : `evalueContact`, `horsLimites`, `Verdict` (T8).
- `packages/game/src/events.ts` : `contact`, `hors-limites`, `particle-died` (T8).
- `packages/game/src/rules.ts` : `regleContact` (T8).
- `packages/game/src/types.ts` : `Globals` réduit à `{ nextId }`.
- `@lem/engine` : `Scene` (`onTick` / `on` / `addEffect`), `GameState` immuable,
  `createRng`, `melangeGraine`.
- Asteroids avait un `state.ts` avec `initialState()` ; il a été supprimé. Le
  patron « reducers purs, ids générés par un compteur dans les globals » est
  celui à reprendre.

## À faire

1. Ajouter dans `constants.ts` :
   - `VIES_INITIALES = 3` ;
   - `NIVEAUX = { facile: 0, moyen: 1, difficile: 2 }` ;
   - `PALIER_DIFFICULTE = 0.08` (par manche réussie) ;
   - `DIFFICULTE_MAX = 2.4` — **plafond volontairement gagnable**, vérifié en
     T17 sur le **pire cas** de terrain (plateforme à `TERRAIN_Y_MAX`, donc une
     chute de `TERRAIN_Y_MAX - DEPART_Y = 280` m) et non sur le meilleur ;
   - `VH_BASE = 8`, `VH_PENTE = 6`, `VH_MAX = 32` (m/s) ;
   - `CARBURANT_BASE = 140`, `CARBURANT_PENTE = 18`, `CARBURANT_MIN = 60`. La
     pente est à **18** et non 25 : c'est l'arbitrage retenu pour tenir le
     plafond de 2,4 du cahier des charges. Au pire cas, freiner 280 m de chute
     libre coûte ≈ 51 u (30,1 m/s à annuler à 2,38 m/s² net, à 4 u/s) et annuler
     la dérive de 22,4 m/s à 45° coûte ≈ 32 u, soit ≈ 83 u. Avec une pente de 25
     le réservoir au plafond ne valait que 80 u : la manche était **perdue
     d'avance** sur une plateforme basse. Avec 18, il vaut 96,8 u, soit 17 % de
     marge ;
   - `DEPART_Y = 120` (coordonnée `y` de départ du LEM ; c'est un `y`, pas une
     altitude — l'altitude au-dessus du sol s'en déduit) ;
   - `DELAI_ENCHAINEMENT = 2` (s passées sur l'écran de posé ou de crash).
2. Créer `packages/game/src/difficulty.ts` :
   - `difficulteDe(niveauDepart, manchesReussies)`
     = `min(DIFFICULTE_MAX, niveauDepart + PALIER_DIFFICULTE * manchesReussies)` ;
   - `vitesseHorizontaleInitiale(difficulte, sens: 1 | -1)` — norme
     `min(VH_MAX, VH_BASE + VH_PENTE * difficulte)`, **signe imposé par le
     terrain** (`depart.sens`, qui pointe vers la cible) et non tiré au hasard ;
   - `carburantInitial(difficulte)`
     = `max(CARBURANT_MIN, CARBURANT_BASE - CARBURANT_PENTE * difficulte)`.
3. Créer `packages/game/src/score.ts` :
   - `totalPoints(ecarts: readonly number[]): number` — **somme** des écarts ;
   - `comparePartie(a, b)` — comparateur du hall of fame : temps de vol
     **arrondi à la seconde**, décroissant ; puis total de points croissant.
     L'arrondi est indispensable : le temps de vol est une somme de pas de temps
     flottants, deux parties ne seraient jamais égales et la seconde clé de tri
     ne servirait jamais. Complété et testé en T14.
4. Créer `packages/game/src/state.ts` :
   - `Globals` enrichi : `nextId`, `statut: "vol" | "pause" | "pose" | "crash" | "fini"`,
     `vies`, `niveauDepart`, `manchesReussies`, `numeroManche`,
     `ecarts: readonly number[]`, `tempsDeVol`, `tempsManche`, `terrain`,
     `graine`, `dernierVerdict`, `abandonnee: boolean`, `gazAccu: number`,
     `instantStatut: number`.
     - `instantStatut` est la valeur de `state.time` au moment du **dernier
       changement de statut**. C'est le seul horodatage qui permette de mesurer
       le délai d'enchaînement : `tempsDeVol` et `tempsManche` sont gelés dès
       qu'on quitte `"vol"` (voir les gardes), donc aucun d'eux n'avance pendant
       `pose` ou `crash`. `state.time`, lui, continue d'avancer parce que
       `Scene.tick` l'incrémente à chaque tick et que l'écran de jeu ne suspend
       la scène qu'en `pause` (T10). Mettre ce compteur dans une variable de
       module au lieu du `GameState` casserait la pureté et la reproductibilité.
     - `numeroManche` compte **toutes** les manches jouées, réussies ou non. Il
       est distinct de `manchesReussies` : c'est lui qui dérive la graine du
       terrain. Dériver depuis `manchesReussies`, qui ne bouge pas sur un crash,
       ferait rejouer le terrain à l'identique après chaque échec.
     - `gazAccu` porte le reste fractionnaire du débit de particules de gaz
       (T12). Il vit ici et pas dans une variable de module : un état caché hors
       du `GameState` casse la pureté et rend la partie non reproductible.
   - `nouvellePartie(niveauDepart, graine): GameState<LemEntity, Globals>` ;
   - `nouvelleManche(etat)` — incrémente `numeroManche`, calcule la difficulté,
     génère le terrain avec `melangeGraine(graine, numeroManche)`, place le LEM en
     `(terrain.depart.x, DEPART_Y)` avec la vitesse horizontale initiale du
     `sens` du terrain, remet le plein de carburant, remet `tempsManche` à 0,
     repasse `statut` à `"vol"` et `instantStatut` à `state.time` ;
   - `type ResultatPartie = { manchesReussies, points, tempsDeVol, niveauDepart, abandonnee }`
     et la fonction qui l'extrait d'un `GameState` fini. C'est cette tâche qui
     **enrichit** la variante `{ nom: "fin" }` de `Transition` (T5) avec
     `params: ResultatPartie` — la variante existe déjà, on lui ajoute sa charge
     utile, on ne la crée pas.
5. Créer `packages/game/src/reducers.ts` :
   - `surContact` : posé → `statut = "pose"`, écart ajouté, `manchesReussies + 1` ;
     sinon → `statut = "crash"`, `vies - 1`, et `statut = "fini"` à 0 vie ;
   - `surHorsLimites` : traité comme un crash, cause `hors-limites` ;
   - `surPause` / `surReprise` : bascule `"vol"` ↔ `"pause"` ;
   - `surAbandon` : `statut = "fini"`, `abandonnee = true` ;
   - `surParticuleMorte` : retrait de la particule.
   **Tout reducer qui change `statut` écrit `instantStatut = state.time`** —
   `surContact`, `surHorsLimites`, `surPause`, `surReprise`, `surAbandon`. Sans
   cette écriture, `regleEnchainement` n'a aucun instant de référence et le jeu
   reste bloqué sur le bandeau de fin de manche.
   Tous **idempotents** : rejouer le même événement dans le tick ne change rien
   de plus — y compris `instantStatut`, qui ne bouge pas quand le statut est
   déjà celui visé.
6. Ajouter dans `rules.ts` :
   - `reglePause` : `back` (Échap) sur front montant bascule en `"pause"` ; en
     pause, `confirm` reprend et une seconde pression sur `back` abandonne ;
   - `regleTempsDeVol` : incrémente `tempsDeVol` et `tempsManche` **seulement**
     si `statut === "vol"` ;
   - `regleEnchainement` : quand `statut` vaut `"pose"` ou `"crash"` et que
     `state.time - globals.instantStatut >= DELAI_ENCHAINEMENT`, enchaîne la
     manche suivante s'il reste des vies, sinon `"fini"`. Le délai se mesure sur
     `state.time`, **pas** sur `tempsDeVol` ni `tempsManche` : ces deux-là sont
     gelés hors du vol, le seuil ne serait jamais franchi et la partie
     resterait coincée sur le bandeau de fin de manche.

## Gardes et cas limites

- **Un crash à la dernière vie** met `statut = "fini"`, pas `crash` en boucle.
- **Le contact ne compte qu'une fois** : la garde de T8 s'appuie sur
  `statut === "vol"`. Un test enchaîne cinq ticks au sol et vérifie que `vies` et
  `ecarts` n'ont bougé que d'un cran.
- **Une manche perdue n'ajoute pas d'écart** — sinon le score golf punirait deux
  fois.
- **Rien ne tourne en pause** : ni `tempsDeVol`, ni `tempsManche`, ni la physique.
  Un `statut === "pause"` doit figer le monde, sans quoi la pause devient un
  abri gratuit — et le temps de vol, clé de tri principale du hall of fame, se
  gonflerait à l'arrêt.
- **`tempsDeVol` ne tourne pas** non plus pendant `pose`, `crash` ou `fini`.
  C'est précisément pour ça que l'enchaînement se mesure sur `state.time` et
  `instantStatut`, et pas sur un compteur de manche.
- **`state.time` avance en `pose` et en `crash`** : la scène continue de ticker,
  seule la `pause` la suspend (T10). Si un jour la scène était suspendue aussi
  en `pose` / `crash`, l'enchaînement s'arrêterait avec elle — à écrire en
  commentaire à côté de `regleEnchainement`.
- **Graine dérivée de `numeroManche`** : deux manches d'une même partie n'ont pas
  le même terrain, y compris après un crash ; deux parties de même graine ont
  exactement la même suite de terrains. Test dédié sur un crash suivi d'une
  reprise.
- **Difficulté plafonnée** à `DIFFICULTE_MAX` : quarante manches de plus ne la
  font pas monter, et `carburantInitial` ne descend pas sous `CARBURANT_MIN`.
- **Signe de la vitesse initiale** : imposé par `terrain.depart.sens`, donc
  toujours orienté vers la cible. Aucun tirage aléatoire ici.
- **Abandon** : `abandonnee` est vrai, la partie est terminée, et elle reste
  classable si `manchesReussies >= 1` (T14). Pas d'exploit possible puisque le
  chrono est gelé en pause.
- `totalPoints([])` vaut 0 (aucune manche réussie).
- `comparePartie` est **cohérent** : antisymétrique, transitif, stable sur deux
  parties strictement égales.
- Aucun `Math.random` dans ces fichiers.

## Tests attendus

- `difficulteDe(0, 12)` vaut `0.96` et `difficulteDe(0, 13)` vaut `1.04` : il
  faut treize manches réussies pour franchir un cran — la démonstration chiffrée
  du « palier doux ».
- `difficulteDe(2, 100)` est plafonné à `2.4`.
- `carburantInitial` : 140 à difficulté 0, **96,8** à difficulté 2,4 (pente 18),
  plancher 60 respecté à difficulté 5.
- `vitesseHorizontaleInitiale` : norme conforme, plafond 32, signe **égal** à
  celui passé.
- `totalPoints([12, 0, 45])` vaut 57 ; `totalPoints([])` vaut 0.
- `comparePartie` : temps de vol arrondi plus long d'abord ; à temps arrondi égal
  (120,2 s contre 119,9 s), écart plus petit d'abord ; cohérence sur un tri de
  20 entrées mélangées.
- Un posé : `manchesReussies` +1, écart ajouté, vies inchangées.
- Un crash : vies −1, aucun écart ajouté.
- Crash à la dernière vie : `statut === "fini"`.
- Cinq ticks au sol : un seul décompte.
- `tempsDeVol` gelé en `pause`, `pose`, `crash` et `fini`.
- **Enchaînement** : depuis un `crash` avec des vies restantes, 2 s de ticks
  déclenchent la manche suivante ; 1,9 s de ticks ne la déclenchent pas. Même
  test depuis un `pose`. C'est le test qui prouve que le délai est mesurable.
- `instantStatut` : écrit à `state.time` au passage en `pose` / `crash` /
  `pause` / `fini`, et remis par `nouvelleManche`.
- **Après un crash**, la manche suivante a un terrain différent (graine dérivée
  de `numeroManche`, pas de `manchesReussies`).
- Deux parties de même graine : suite de terrains identique, crash inclus.
- Pause : la position du LEM est identique après 100 ticks en pause.
- Abandon : `statut === "fini"` et `abandonnee === true`.
- Reducers idempotents : appliquer deux fois le même contact ne retire pas deux
  vies.

## Fini quand

- [ ] Une partie complète se déroule en logique pure, testée sans rendu.
- [ ] Les trois niveaux, la montée de 0,08 et le plafond gagnable sont
      implémentés et chiffrés dans les tests.
- [ ] La pause gèle tout, y compris le chrono.
- [ ] Après un posé ou un crash, la manche suivante démarre bien au bout de
      `DELAI_ENCHAINEMENT`, mesuré sur `state.time` et `instantStatut`.
- [ ] Le terrain change après un crash.
- [ ] Le score est la somme des écarts des manches réussies, le plus petit étant
      le meilleur.
- [ ] La commande de vérification du README du plan passe au vert.
