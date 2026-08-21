---
id: T9
titre: Manches, vies, pause, difficulté progressive, score golf
fichiers: packages/game/src/state.ts, packages/game/src/difficulty.ts, packages/game/src/score.ts, packages/game/src/reducers.ts, packages/game/src/rules.ts, packages/game/src/state.test.ts, packages/game/src/difficulty.test.ts, packages/game/src/score.test.ts, packages/game/src/constants.ts, packages/game/src/events.ts, packages/game/src/types.ts, packages/game/src/entities/Lander.ts, packages/game/src/screens/types.ts, packages/game/src/main.ts, packages/game/src/screens/manager.test.ts
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
- `packages/game/src/rules.ts` **n'existe pas** : T8 s'arrête à `landing.ts`,
  `events.ts` et `types.ts`. `regleContact` a besoin du `terrain` et du `statut`
  de la manche, qui n'entrent dans `Globals` qu'ici : c'est donc cette tâche qui
  crée le fichier et la règle.
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
4. Créer `packages/game/src/state.ts`. `Globals`, `Statut` et `EtatPartie` y sont
   **définis** ; `types.ts` les **ré-exporte** au lieu de les déclarer, comme il le
   fait déjà pour `LemEvent` (T8). C'est `state.ts` que désignent les fiches T11,
   T14 et T15 comme domicile de `Globals`, et la ré-export garde `types.ts` comme
   point d'import unique sans casser les imports existants. `EtatPartie` est
   l'alias de `GameState<LemEntity, Globals>` : c'est lui qui revient partout, y
   compris dans les signatures des reducers et de `RegleManche`.
   - `Globals` enrichi : `nextId`, `statut: "vol" | "pause" | "pose" | "crash" | "fini"`,
     `vies`, `niveauDepart`, `manchesReussies`, `numeroManche`,
     `ecarts: readonly number[]`, `tempsDeVol`, `tempsManche`, `terrain`,
     `graine`, `dernierVerdict`, `abandonnee: boolean`, `gazAccu: number`,
     `instantStatut: number`, `contactEmisPourManche: boolean`.
     - `contactEmisPourManche` est la garde « un seul événement de fin de manche »,
       contact **et** sortie du monde confondus. Elle est portée par la **manche**
       et remise à faux par `nouvelleManche`, et non déduite du seul statut : le
       statut repasse à `"vol"` en sortie de pause, ce qui rouvrirait la porte et
       ferait recompter le même atterrissage. Elle ne peut pas non plus vivre dans
       une variable de module — état de simulation hors du `GameState`, interdit,
       et qui survivrait à la manche : après le premier contact de la session,
       plus aucune manche ne se terminerait.
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
     remet `contactEmisPourManche` à **faux**, repasse `statut` à `"vol"` et
     `instantStatut` à `state.time` ;
   - `type ResultatPartie = { manchesReussies, points, tempsDeVol, niveauDepart, abandonnee }`
     et la fonction qui l'extrait d'un `GameState` fini (`resultatPartie(etat)`,
     qui ne juge pas si la partie est finie : c'est l'écran de jeu qui ne publie
     la transition qu'au passage à `"fini"`). C'est cette tâche qui
     **enrichit** la variante `{ nom: "fin" }` de `Transition` (T5) avec
     `params: ResultatPartie` — la variante existe déjà, on lui ajoute sa charge
     utile, on ne la crée pas.
     **Trois fichiers hors de l'en-tête `fichiers:` sont touchés de ce fait**, et
     c'était inévitable : `screens/types.ts` (la variante devient
     `{ nom: "fin"; params: ResultatPartie }` — l'enrichissement est demandé ici
     mais le fichier manquait à la liste), `main.ts` (le bouchon « jeu » doit
     désormais fournir une charge utile : un `RESULTAT_BOUCHON` neutre en attendant
     le vrai écran de T10) et `screens/manager.test.ts`. Ce dernier construisait
     `{ nom: "fin" }` en trois endroits et typait sa `Scene` avec `Globals` en lui
     passant `globals: { nextId: 0 }` : les deux enrichissements le cassaient au
     `typecheck`. Adaptation **strictement mécanique**, commentée sur place — une
     fabrique `versFin()` et un type de globals local minimal `GlobalsScene`.
     Aucune assertion modifiée, aucun test supprimé, désactivé ni affaibli : les
     15 tests de `manager.test.ts` passent inchangés.
5. Créer `packages/game/src/reducers.ts`. Les reducers se répartissent en deux
   familles, **de part et d'autre de la frontière `Scene.tick`**, et c'est la
   distinction structurante de la tâche :
   - **appliqués par la scène**, sur les événements des règles : `surContact`,
     `surHorsLimites`, `surTempsVol`, `surMancheSuivante`, `surParticuleMorte` ;
   - **appliqués par l'écran de jeu (T10)**, hors de la scène, à chaque image et
     **y compris en pause** : `surPause`, `surReprise`, `surAbandon`. Ces trois-là
     ne sont ni des `TickRule` ni des événements de scène.
   Détail :
   - `surContact` — **no-op si `statut !== "vol"`**. Sinon : posé →
     `statut = "pose"`, écart ajouté, `manchesReussies + 1` ; crash →
     `statut = "crash"`, `vies - 1`, et `statut = "fini"` à 0 vie. Dans les deux
     cas, `contactEmisPourManche = true` et **le LEM est immobilisé** (voir
     ci-dessous) ;
   - `surHorsLimites` — mêmes gardes, traité comme un crash, cause
     `hors-limites`, LEM immobilisé sur place ;
   - **Immobiliser le LEM fait partie du reducer**, ce n'est pas un détail de
     rendu : remplacer l'entité `Lander` par une copie à `velocity` nulle et
     `cran = 0` ; sur un posé, recaler `position.y` à
     `surfaceEn(terrain.hf, position.x) - LEM.hauteur / 2` pour que les pieds
     reposent sur la surface ; sur un crash ou une sortie du monde, figer sur
     place. C'est **le seul endroit du plan** où l'entité peut être figée :
     `Scene.tick` déplace inconditionnellement toutes les entités *avant*
     d'évaluer les règles, et `step(dt, input)` ne reçoit pas les globals, donc
     une entité ne peut pas savoir que la manche est terminée.
     **Le reducer seul ne suffit pas, et c'est l'écart le plus important de la
     tâche** : figée par le seul reducer, l'entité repart au tick suivant,
     `Scene.tick` appelant `step` sur toutes les entités à **chaque** tick. Le LEM
     figé se remettrait à intégrer la gravité, à brûler du carburant et à obéir
     aux flèches, et le test exigé plus bas (« 60 ticks de plus laissent
     `position`, `velocity` et `carburant` strictement identiques, quatre flèches
     tenues ») serait inatteignable — une refige à chaque tick laisserait dériver
     `position.y` sur un crash et le carburant sous une flèche tenue. Retenu :
     un champ `readonly inerte: boolean = false` sur `Lander` (T7) et un
     court-circuit `if (this.inerte) return this;` en tête de `step` ; le reducer
     du verdict pose ce drapeau en figeant le LEM. Le drapeau vit dans l'entité,
     donc dans le `GameState` : aucun état de simulation caché. Sans ce gel, le
     LEM continue pendant les 2 s du bandeau à intégrer la gravité, à brûler du
     carburant et à obéir aux quatre flèches : après un posé à `vy = 2` m/s, 2 s
     de chute lunaire l'enfoncent d'environ 7,2 m — plus que `LEM.hauteur` = 7 —
     il disparaît dans la roche et la caméra de T10, qui le suit, plonge sous le
     relief et passe au zoom 4 ; après un crash à 30 m/s il descend d'environ
     63 m, au-delà de `TERRAIN_Y_MAX`. Et l'état publié en fin de manche porterait
     une position et un carburant qui ne sont plus ceux du contact ;
   - `surPause` — **no-op sauf depuis `"vol"`** ; `surReprise` — **no-op sauf
     depuis `"pause"`** ; `surAbandon` — **no-op sauf depuis `"pause"`**, puis
     `statut = "fini"`, `abandonnee = true`. Pas de bascule ternaire
     `"vol" ↔ "pause"` : pendant les 2 s de `DELAI_ENCHAINEMENT` le statut vaut
     `"pose"` ou `"crash"`, la scène tourne et l'entrée est lue. Un Échap non
     gardé y écrirait `statut = "pause"` **et** réécrirait `instantStatut` :
     `regleEnchainement`, qui ne regarde que `"pose"` et `"crash"`, perdrait sa
     référence et la manche suivante ne démarrerait jamais ;
   - `surTempsVol(etat, { dt })` et `surMancheSuivante(etat)` — **deux reducers
     de plus, non prévus par cette fiche et indispensables** (voir le point 6) :
     le premier ajoute `dt` à `tempsDeVol` et à `tempsManche`, avec la même garde
     `statut === "vol"` que la règle qui l'émet ; le second, gardé sur `"pose"` /
     `"crash"`, appelle `nouvelleManche(etat)` s'il reste des vies et pose
     `"fini"` sinon. Une `TickRule` du moteur ne fait qu'**émettre** :
     `Scene.tick` ne laisse écrire l'état qu'aux reducers, et `step` ne voit pas
     les globals. Sans événement dédié, `regleTempsDeVol` et `regleEnchainement`
     n'ont nulle part où ranger leur effet — le chrono ne tournerait jamais et la
     manche suivante ne démarrerait jamais ;
   - `surParticuleMorte` : retrait de la particule.
   **Tout reducer qui change `statut` écrit `instantStatut = state.time`** —
   `surContact`, `surHorsLimites`, `surPause`, `surReprise`, `surAbandon`. Sans
   cette écriture, `regleEnchainement` n'a aucun instant de référence et le jeu
   reste bloqué sur le bandeau de fin de manche.
   Tous **idempotents**, et pas seulement dans le tick : les gardes de statut
   ci-dessus sont exactement ce qui les rend idempotents **d'un tick à l'autre**,
   puisque `toucheLeSol` et `horsLimites` restent vrais indéfiniment après le
   verdict.
6. Créer `rules.ts` avec **trois** règles de tick, et **aucune règle de pause**.
   Les trois portent le même type, `RegleManche = TickRule<EtatPartie, LemEvent,
   Command>`, et **n'écrivent rien** : elles émettent. Deux variantes
   d'événement s'ajoutent donc à `events.ts` (T8), non prévues par cette fiche :
   `{ type: "temps-vol"; dt: number }` et `{ type: "manche-suivante" }`, avec
   leurs reducers du point 5. Elles ne viennent pas d'une rencontre entre entités
   mais du déroulement de la manche, et c'est écrit à côté de l'union.
   - `regleContact` (descendue de T8, qui n'avait ni le `terrain` ni le `statut`
     dans ses globals) : n'émet **rien** si `statut !== "vol"` ou si
     `contactEmisPourManche` est vrai. Sinon, **au plus un** événement de fin de
     manche par tick : si `horsLimites(lem)`, `{ type: "hors-limites" }` ; sinon
     si `toucheLeSol(terrain, lem)`, `{ type: "contact", verdict:
     evalueContact(terrain, lem) }`. La sortie du monde **prime** : les deux
     conditions peuvent tomber dans le même tick, et `Scene.tick` replie tous les
     événements produits — les deux reducers s'appliqueraient et l'état sortirait
     incohérent (`manchesReussies` +1 **et** `vies` −1). La garde vaut pour les
     **deux** branches avec les mêmes mots : un LEM sorti par le côté continue de
     s'éloigner, donc `horsLimites` reste vrai, et sans garde la partie se perd
     en trois images (3 → 2 → 1 → 0 vie en 50 ms) ;
   - `regleTempsDeVol` : émet `{ type: "temps-vol", dt: ctx.dt }` **seulement** si
     `statut === "vol"`, et rien sinon. C'est `surTempsVol` qui incrémente
     `tempsDeVol` et `tempsManche` — la règle n'écrit pas l'état ;
   - `regleEnchainement` : quand `statut` vaut `"pose"` ou `"crash"` et que
     `state.time - globals.instantStatut >= DELAI_ENCHAINEMENT`, émet
     `{ type: "manche-suivante" }` ; c'est `surMancheSuivante` qui enchaîne la
     manche suivante s'il reste des vies, sinon pose `"fini"`. Le délai se mesure sur
     `state.time`, **pas** sur `tempsDeVol` ni `tempsManche` : ces deux-là sont
     gelés hors du vol, le seuil ne serait jamais franchi et la partie
     resterait coincée sur le bandeau de fin de manche.
   - **Pas de `reglePause`.** Une `TickRule` est évaluée à l'intérieur de
     `Scene.tick`, et l'écran de jeu ne tick plus la scène dès que
     `statut === "pause"` (T10) : l'entrée de pause et sa sortie se retrouveraient
     de part et d'autre de la frontière, la seule fonction capable de lire
     `confirm` / `back` ne tournerait plus, et le voile « ENTREE REPRENDRE /
     ECHAP ABANDONNER » ne répondrait à rien — partie perdue, seul un
     rechargement de page débloquant le jeu. Le front montant n'est même pas
     récupérable plus tard : `GestionnaireEcrans.tick` sonde le clavier à chaque
     image et `KeyboardInput.poll()` vide le tampon des fronts montants, donc
     chaque appui est consommé puis jeté. **L'entrée et la sortie de pause vivent
     du même côté de la frontière** : ce sont les reducers `surPause`,
     `surReprise` et `surAbandon`, appliqués par l'écran (T10).

## Gardes et cas limites

- **Un crash à la dernière vie** met `statut = "fini"`, pas `crash` en boucle.
- **Un seul événement de fin de manche**, contact **et** sortie du monde traités
  avec les mêmes mots : `regleContact` n'émet que depuis `"vol"` et tant que
  `contactEmisPourManche` est faux, et `surContact` comme `surHorsLimites` ne
  s'appliquent que depuis `"vol"`. Deux tests symétriques : cinq ticks au sol ne
  coûtent qu'un décompte, cinq ticks hors du monde qu'une seule vie.
- **Aucun drapeau en variable de module** pour cette garde ni pour aucune autre :
  un état de simulation hors du `GameState` survit à la manche et à la partie.
- **Une manche perdue n'ajoute pas d'écart** — sinon le score golf punirait deux
  fois.
- **Rien ne tourne en pause** : ni `tempsDeVol`, ni `tempsManche`, ni la
  physique. Sans quoi la pause devient un abri gratuit — et le temps de vol, clé
  de tri principale du hall of fame, se gonflerait à l'arrêt. Mais **le gel de la
  physique n'est pas obtenable dans la scène** : `Scene.tick` fait
  `state.entities.map((e) => e.step(dt, input))` sans condition et **avant**
  d'évaluer les règles, et `step` ne reçoit pas les globals. Il est obtenu par
  l'appelant qui ne tick pas — l'écran de jeu (T10) — et c'est **là** qu'il est
  testé. Ce qui est testable ici, et qui doit l'être : `regleTempsDeVol` n'émet
  rien hors de `"vol"`, et les reducers de pause ne touchent à aucune entité.
- **Le LEM est figé dès le verdict**, par `surContact` / `surHorsLimites`, et non
  par une suspension de la scène : la scène doit continuer de ticker en `"pose"`
  et en `"crash"` pour que `state.time` atteigne `DELAI_ENCHAINEMENT`.
- **`tempsDeVol` ne tourne pas** non plus pendant `pose`, `crash` ou `fini`.
  C'est précisément pour ça que l'enchaînement se mesure sur `state.time` et
  `instantStatut`, et pas sur un compteur de manche.
- **`state.time` avance en `pose` et en `crash`** : la scène continue de ticker,
  seule la `pause` la suspend (T10). Si un jour la scène était suspendue aussi
  en `pose` / `crash`, l'enchaînement s'arrêterait avec elle — à écrire en
  commentaire à côté de `regleEnchainement`. Corollaire à écrire aussi : puisque
  la scène tourne, elle continue d'appeler `step` sur toutes les entités, donc le
  LEM **doit** avoir été figé par le reducer du verdict.
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
- Aucun `Math.random` dans ces fichiers. La garde est prouvée par un test
  **fonctionnel**, pas par une lecture des sources : deux déroulés de 300 ticks à
  graine égale donnent un état identique au bit près, et diffèrent à graine
  différente. `packages/game` n'a pas `@types/node`, donc
  `import { readFileSync } from "node:fs"` échoue au `typecheck` (`TS2307`), et
  ajouter la dépendance sort du périmètre. Même arbitrage qu'en T6 ; **à reprendre
  en T10**, dont la fiche prévoit deux tests qui lisent le source de `draw.ts`.

## Tests attendus

- `difficulteDe(0, 12)` vaut `0.96` et `difficulteDe(0, 13)` vaut `1.04` : il
  faut treize manches réussies pour franchir un cran — la démonstration chiffrée
  du « palier doux ».
- `difficulteDe(2, 100)` est plafonné à `2.4`.
- `carburantInitial` : 140 à difficulté 0, **96,8** à difficulté 2,4 (pente 18)
  — comparé avec `toBeCloseTo(96.8, 10)` et non `toBe`, `140 - 18 * 2.4` valant
  `96.80000000000001` en flottant : la valeur du cahier des charges est bien 96,8,
  c'est la comparaison qui tolère le dernier bit —,
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
- Cinq ticks au sol : un seul décompte. **Cinq ticks hors du monde : une seule
  vie perdue** — le test symétrique, sans lequel une sortie de carte coûte la
  partie en trois images.
- **Le LEM est figé après le verdict** : après un contact, 60 ticks de plus
  laissent `position`, `velocity` et `carburant` strictement identiques, quatre
  flèches tenues ou non.
- **Posé recalé** : après un posé, les pieds du LEM reposent sur la surface
  (`position.y === surfaceEn(hf, x) - LEM.hauteur / 2`).
- `tempsDeVol` gelé en `pause`, `pose`, `crash` et `fini`.
- **Enchaînement** : depuis un `crash` avec des vies restantes, 2 s de ticks
  déclenchent la manche suivante ; 1,9 s de ticks ne la déclenchent pas. Même
  test depuis un `pose`. C'est le test qui prouve que le délai est mesurable.
- `instantStatut` : écrit à `state.time` au passage en `pose` / `crash` /
  `pause` / `fini`, et remis par `nouvelleManche`.
- **Après un crash**, la manche suivante a un terrain différent (graine dérivée
  de `numeroManche`, pas de `manchesReussies`).
- Deux parties de même graine : suite de terrains identique, crash inclus.
- Pause, gardes de statut : `surPause` depuis `"pose"` puis depuis `"crash"` ne
  change **ni** `statut` **ni** `instantStatut`, et l'enchaînement part quand même
  à 2 s ; `surReprise` depuis `"pause"` ramène `"vol"` ; `surReprise` depuis
  `"vol"` ou `"pose"` ne fait rien ; `surAbandon` hors `"pause"` ne fait rien.
- Séquence posé → pause → reprise : rien n'est recompté (un seul écart, un seul
  `manchesReussies`), grâce à `contactEmisPourManche`.
- Le gel de la **physique** en pause est testé en T10, sur l'écran de jeu : il
  n'est pas atteignable depuis cette tâche, qui ne possède ni `screens/game.ts`
  ni son test.
- Abandon : `statut === "fini"` et `abandonnee === true`.
- Reducers idempotents : appliquer deux fois le même contact ne retire pas deux
  vies.

## Fini quand

- [x] Une partie complète se déroule en logique pure, testée sans rendu.
- [x] Les trois niveaux, la montée de 0,08 et le plafond gagnable sont
      implémentés et chiffrés dans les tests.
- [x] L'entrée **et** la sortie de pause vivent du même côté de la frontière
      `Scene.tick` : trois reducers purs, aucune règle de tick. Depuis `"pause"`,
      `confirm` reprend et `back` abandonne.
- [x] Le chrono est gelé hors du vol ; le gel de la physique est la charge de
      l'appelant (T10).
- [x] Un seul événement de fin de manche par manche, contact **et** sortie du
      monde, et le LEM est figé dès le verdict.
- [x] Après un posé ou un crash, la manche suivante démarre bien au bout de
      `DELAI_ENCHAINEMENT`, mesuré sur `state.time` et `instantStatut`.
- [x] Le terrain change après un crash.
- [x] Le score est la somme des écarts des manches réussies, le plus petit étant
      le meilleur.
- [x] La commande de vérification du README du plan passe au vert.
