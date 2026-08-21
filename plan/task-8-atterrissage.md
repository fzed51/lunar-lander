---
id: T8
titre: Contact avec le sol, verdict posé ou crash
fichiers: packages/game/src/landing.ts, packages/game/src/landing.test.ts, packages/game/src/events.ts, packages/game/src/types.ts, packages/game/src/constants.ts, docs/cahier-des-charges.md
sensible: true
---

# T8 — Contact et verdict

## Objectif

Décider, au moment où le LEM touche quoi que ce soit, s'il est posé ou détruit,
selon les quatre conditions du cahier des charges — et rendre ce verdict testable
indépendamment du rendu.

## Ce qui existe

- `@lem/engine` fournit `surfaceEn`, `penteEn`, `denivele`, `souLeSol`,
  `penetration` (T3). Aux bornes du champ et au-delà, `penteEn` rend **0** (bord
  plat) : une assiette jugée contre la pente locale à l'extrême bord du monde est
  jugée contre l'horizontale.
- `packages/game/src/terrain.ts` fournit `Terrain`, `estPosable`, et déjà dans
  `constants.ts` la géométrie `LEM = { largeurTrain: 8, hauteur: 7, rayon: 4 }`
  ainsi que `SEUIL_PLATITUDE = 1` (T6).
- `packages/game/src/entities/Lander.ts` fournit `Lander` avec `position`,
  `velocity`, `assiette` (T7).
- `packages/game/src/types.ts` déclare `LemEvent`, réduit à `particle-died`.
- Il n'y a **aucune** règle de tick dans le jeu : `rules.ts` n'existe pas encore,
  et **T8 ne le crée pas** (voir le point 4). `Globals` vaut `{ nextId }` : ni
  terrain, ni statut de manche.

## À faire

1. Ajouter dans `constants.ts` les seuils de vol, avec leurs unités et la mention
   « réglés en T17 » :
   - `SEUIL_VY = 2` (m/s, à la descente) ;
   - `SEUIL_VX = 1` (m/s, valeur absolue) ;
   - `SEUIL_ASSIETTE = Math.PI / 18` (rad, soit 10°).
   `SEUIL_PLATITUDE` et la géométrie du LEM existent déjà (T6) : ne pas les
   redéfinir.
   **Deux constantes de plus, ajoutées à l'implémentation** parce qu'écrites en
   dur dans la règle elles seraient exactement les « nombres magiques
   disséminés » que la centralisation interdit, et qu'aucune fiche ultérieure ne
   les déclare ailleurs :
   - `PLAFOND_Y = 0` (m, coordonnée `y` du haut du monde) — `horsLimites` y
     compare `position.y` ;
   - `COQUE_LARGEUR_EPAULES = 0.75` (fraction de la demi-largeur de train à
     laquelle se trouvent les épaules) — c'est le `0,75` du point 2.
2. Créer `packages/game/src/landing.ts` :
   - `piedsDuLem(lem): readonly [Vector2, Vector2]` — les deux pieds, à
     `±largeurTrain / 2` horizontalement et `hauteur / 2` sous le centre, **le
     tout tourné de l'assiette**. C'est cette rotation qui fait qu'un LEM penché
     touche par un seul pied.
   - `pointsDeCoque(lem): readonly Vector2[]` — les deux pieds **plus** les deux
     épaules (`±largeurTrain / 2 * 0,75`, `hauteur / 2` **au-dessus** du centre)
     et le centre, tournés de l'assiette.
   - `toucheLeSol(terrain, lem): boolean` — vrai dès qu'**un point de coque**
     est au niveau du sol ou dessous. Ne pas se limiter aux pieds : un LEM qui
     file à 20 m/s dans une paroi de canyon a les pieds en l'air au-dessus du
     fond et le fuselage dans la roche ; sans les épaules, il traverse la falaise
     sans rien heurter.
   - `type Verdict = { pose: true; ecart: number } | { pose: false; causes: readonly CauseCrash[] }`
     avec `CauseCrash = "trop-vite-vertical" | "trop-vite-lateral" | "trop-penche" | "sol-accidente" | "coque-heurtee" | "hors-limites"`.
   - `evalueContact(terrain, lem): Verdict` — applique les conditions, **accumule
     toutes** les causes d'échec, et pour un posé calcule
     `ecart = Math.round(Math.abs(lem.position.x - terrain.cible.x))` : l'écart
     **horizontal** entre le centre du LEM au moment du contact et le mât du
     drapeau, en mètres.
     - Le **centre**, et non le pied qui touche : sinon l'assiette décalerait le
       score d'un demi-train.
     - **Horizontal seulement**, et non une distance euclidienne : au contact
       sur du plat, le centre est à `LEM.hauteur / 2` = 3,5 m au-dessus de la
       surface, alors que `cible.y` **est** la surface. Une distance euclidienne
       vaudrait donc toujours au moins 3,5 m, `Math.round` en ferait 4, et le
       « score parfait de 0 point » du cahier des charges (§5 et §7) serait
       inatteignable : chaque manche réussie porterait un malus plancher de
       4 points. C'est aussi le sens de « distance au drapeau » pour un score de
       golf : on mesure l'écart au trou sur le terrain, pas l'altitude de la
       balle.
   - `horsLimites(lem): boolean` — vrai si le LEM sort latéralement du monde ou
     passe au-dessus du plafond (`position.y < 0`). **Déclaré avant
     `evalueContact`, parce que `evalueContact` l'appelle.**
   - **Première condition de `evalueContact`, avant toutes les autres** : si
     `horsLimites(lem)` est vrai, le verdict est
     `{ pose: false, causes: ["hors-limites", …] }`, quelles que soient les
     vitesses, l'assiette et la platitude. **Retenu à l'implémentation, à la
     lecture du `…` de cette liste** : hors du monde, la cause `"hors-limites"`
     est empilée puis **les trois critères de vol continuent d'être mesurés et
     accumulés** (vy, vx, assiette sont mesurables partout, et l'accumulation est
     le principe de la tâche), tandis que **les deux critères de sol ne le sont
     pas** — platitude et coque interrogeraient le relief prolongé plat, c'est-à-
     dire la fiction que cette garde existe justement pour ne pas créditer. Deux
     tests couvrent les deux branches. C'est ce qui rend la cause
     `"hors-limites"` du type `CauseCrash` réellement produite par une ligne de
     code, au lieu de figurer dans l'union sans jamais sortir. Sans cette garde,
     un LEM dérivant hors du monde à basse vitesse est déclaré **posé** sur un sol
     qui n'existe pas : hors des bornes du champ, `surfaceEn` prolonge la valeur
     du bord et `penteEn` rend 0, donc `denivele` vaut 0 et la platitude est
     parfaite partout. Le score de golf se retrouverait crédité d'un écart mesuré
     dans le vide.
3. Créer `packages/game/src/events.ts` avec l'union des événements du jeu, dont
   `{ type: "contact"; verdict: Verdict }` et `{ type: "hors-limites" }`. Mettre
   `types.ts` à jour : l'union `LemEvent` est **définie** dans `events.ts` et
   `types.ts` la **ré-exporte** (`export type { LemEvent } from "./events.ts"`).
   Le test existant `screens/manager.test.ts` importe `LemEvent` depuis
   `../types.ts` ; la ré-export garde ce point d'entrée intact sans dupliquer
   l'union. T9 fait pareil pour `Globals`.
4. **Ne pas créer `rules.ts` ici.** `regleContact` a besoin de deux données que
   T8 n'a pas le droit de fabriquer : le `terrain` de la manche et son `statut`,
   qui n'entrent dans `Globals` qu'en T9. La règle, sa garde « une seule fois par
   manche » et ses tests sont donc **entièrement en T9**, dont l'en-tête
   `fichiers:` porte déjà `rules.ts`. T8 s'arrête à `landing.ts`, `events.ts` et
   la mise à jour de `types.ts`. Tranché : la liste « fichiers attendus » du
   prompt de lancement du run mentionnait `rules.ts` en T8 ; **ce sont les fiches
   qui font foi**, et `rules.ts` a bien été créé en T9.
   - **Interdit** : porter le drapeau « contact déjà émis » dans une variable de
     module de `landing.ts` pour se passer des globals. La contrainte « aucun état
     de simulation hors du `GameState` » l'exclut, et l'effet est durable : une
     variable de module survit à la manche, donc après le premier contact de la
     session plus aucune manche ne se termine — et le test des cinq ticks reste
     vert malgré tout.
5. Corriger le **§7 de `docs/cahier-des-charges.md`** : « distance du centre du
   LEM au moment du contact au pied du drapeau » devient « **écart horizontal**
   entre le centre du LEM au moment du contact et le mât du drapeau ». Le §5
   promet un « score parfait de 0 point » : avec une distance euclidienne cette
   promesse est fausse dès le premier posé. La documentation et le code doivent
   dire la même règle, et c'est ici qu'on tranche.

## Gardes et cas limites

- **Un seul événement de fin de manche** — contact **comme** sortie du monde. Les
  deux conditions restent vraies indéfiniment : le LEM enfoncé dans le sol y
  reste, et le LEM sorti du monde continue de s'en éloigner. La garde vit en T9
  (drapeau `contactEmisPourManche` dans les globals, plus la garde de statut des
  reducers) et elle porte sur les **deux** branches avec les mêmes mots. `T8` ne
  fournit ici que des prédicats sans mémoire : `toucheLeSol`, `horsLimites`,
  `evalueContact` sont purs et se contentent de répondre sur l'état qu'on leur
  donne.
- **Sortie du monde et contact dans le même tick** : `evalueContact` tranche
  seul, la sortie du monde primant (voir le point 2). Deux événements de fin de
  manche appliqués sur le même état sortiraient un état incohérent —
  `manchesReussies` +1 **et** `vies` −1 — puisque `Scene.tick` replie tous les
  événements produits dans le tick.
- **Contact par une épaule** (paroi de canyon, flanc de pic) : c'est
  automatiquement un crash, cause `coque-heurtee`, sans regarder les vitesses. On
  ne se pose pas sur le côté.
- **Contact exactement sur la surface** : compte comme touché (cohérent avec
  `souLeSol` de T3).
- **LEM penché** : c'est le point de coque le plus bas qui décide du contact, pas
  le centre. Un test avec assiette 45° doit montrer un contact plus tôt qu'à
  assiette 0, à altitude égale.
- **Vitesse verticale vers le haut** au contact (le LEM remonte en frôlant le
  sol) : `SEUIL_VY` ne s'applique qu'à la descente ; une vitesse montante ne peut
  pas être une cause de crash.
- **Platitude** : mesurée sur `LEM.largeurTrain` centrée sur l'abscisse du
  centre, via `denivele`. Un pic plus étroit qu'un pas d'échantillonnage doit
  quand même compter — garanti par le test de `denivele` en T3.
- **Bord du monde** : un contact à moins d'une demi-largeur de train du bord
  mesure la platitude sur un intervalle tronqué ; le comportement de bord plat de
  `surfaceEn` s'applique, et c'est écrit dans le code.
- **Causes cumulées** : un LEM trop rapide *et* trop penché rend deux causes. Un
  verdict qui n'en rend qu'une masque de l'information au joueur.
- `ecart` d'un posé pile sur l'abscisse de la cible vaut **0**, jamais `-0` ni
  `0.0001` : `Math.round(Math.abs(...))` s'en charge. C'est atteignable
  puisqu'on ne mesure que l'axe horizontal.
- `ecart` est un **entier positif ou nul**, jamais négatif : l'écart est une
  valeur absolue, et le score de golf en est une somme.
- Sortie par le haut : le LEM qui monte indéfiniment perd la manche, sinon la
  partie ne finit jamais.

## Tests attendus

- Posé nominal : `vy = 1`, `vx = 0`, assiette 0, sur la plateforme → posé, écart
  égal à l'écart horizontal au drapeau, arrondi.
- Chaque cause isolément : `vy = 5` → `trop-vite-vertical` ; `vx = 3` →
  `trop-vite-lateral` ; assiette 30° → `trop-penche` ; contact sur un secteur
  accidenté → `sol-accidente`.
- **Vol horizontal dans une paroi** : LEM à assiette 0, `vx = 20`, pieds libres,
  épaule dans la roche → crash `coque-heurtee`. Ce test échoue si
  l'implémentation ne teste que les pieds, et il vérifie **explicitement** que les
  deux pieds sont hors du sol. L'obstacle retenu n'est **pas** une paroi de canyon
  au pas réel de 5 m mais un **éperon d'un seul échantillon sur un champ au pas de
  1 m** : c'est géométriquement obligé, les pieds étant plus écartés (±4 m) et
  plus bas que les épaules (±3 m), devant une paroi en marche d'escalier un pied
  entre toujours dans la roche avant l'épaule. Seul un obstacle plus étroit que le
  train isole le cas « épaule seule dans la roche ».
- Causes cumulées : `vy = 5` et assiette 30° → **deux** causes.
- Juste sous et juste au-dessus du seuil : `vy = 1.99` posé, `vy = 2.01` crashé
  (seuil inclusif, et c'est écrit).
- Vitesse verticale **négative** (montante) élevée : pas de cause
  `trop-vite-vertical`.
- Contact par un seul pied à assiette 45° : détecté plus tôt qu'à assiette 0.
- Posé pile au centre de la plateforme (`lem.position.x === terrain.cible.x`) :
  `ecart === 0`. Ce test échoue si l'implémentation mesure une distance
  euclidienne, puisque le centre du LEM est à 3,5 m au-dessus de la surface.
- L'écart ne dépend **pas de l'altitude** : deux LEM de même abscisse et de `y`
  différents ont le même écart.
- L'écart est mesuré depuis le **centre** : à assiette **±`SEUIL_ASSIETTE`
  (10°)**, deux LEM dont les centres sont au même endroit ont le même écart, quel
  que soit le pied qui touche. La valeur de 20° annoncée d'abord est inutilisable :
  à 20° le verdict est un crash `trop-penche`, il n'y a plus aucun `ecart` à
  comparer. À la tolérance maximale les deux LEM sont **posés**, un par chaque
  pied, et l'égalité des écarts est vérifiable — l'intention tient, la valeur
  change.
- `horsLimites` : vrai à gauche, à droite, au-dessus du plafond ; faux au milieu.
- **`evalueContact` d'un LEM hors du monde n'est jamais posé** : à `x = -50`,
  `vy = 1`, `vx = 0`, assiette 0 — donc tous les critères de posé réunis sur le
  bord prolongé plat — le verdict porte `pose: false` et la cause
  `"hors-limites"`. Ce test échoue si la sortie du monde n'est pas la première
  condition évaluée. Un **second** test tient l'autre moitié de la décision :
  hors du monde avec `vy` et assiette hors seuils, les causes de vol dépassées
  sont bien **accumulées** avec `"hors-limites"`, et ni `"sol-accidente"` ni
  `"coque-heurtee"` n'apparaissent.
- La règle de tick n'est **pas** testée ici : elle n'existe pas encore (T9).

## Fini quand

- [x] `evalueContact` rend un verdict complet, avec toutes les causes.
- [x] La coque entière collisionne, pas seulement les pieds.
- [x] L'écart est l'écart **horizontal** entre le centre du LEM et le drapeau, et
      un posé pile sur la cible vaut bien 0 point.
- [x] Le §7 du cahier des charges dit « écart horizontal » et non « distance » ;
      T11 (distance à la cible du HUD) et T17 (report des valeurs finales)
      emploient la même définition.
- [x] Un LEM hors du monde n'est **jamais** déclaré posé, et `"hors-limites"` est
      une cause réellement produite par `evalueContact`.
- [x] `rules.ts` n'existe toujours pas : aucune règle de tick, aucun drapeau en
      variable de module. La règle et son unicité par manche sont en T9.
- [x] La commande de vérification du README du plan passe au vert.
