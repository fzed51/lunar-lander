---
id: T10
titre: Rendu de l'écran de jeu — relief, LEM, flamme, drapeau, étoiles, zoom entier
fichiers: packages/game/src/render/draw.ts, packages/game/src/render/draw.test.ts, packages/game/src/render/stars.ts, packages/game/src/screens/game.ts, packages/game/src/screens/game.test.ts, packages/game/src/constants.ts, packages/game/src/main.ts, packages/engine/src/render/Renderer.ts
sensible: false
---

# T10 — Rendu de l'écran de jeu

## Objectif

Dessiner la manche à l'écran, en pixel art sur la palette, avec la caméra qui
suit le LEM et un zoom **entier** qui se resserre à l'approche du sol.

## Ce qui existe

- `design/palette.ts` (`PALETTE`, `CouleurLem`) et `design/font.ts`
  (`dessineTexte`) (T1). `dessineTexte` prend un `CibleDessin` — une interface
  structurelle réduite à `fillRect` — et non un `Renderer` ; le `Renderer` la
  satisfait, on lui passe donc `surface.renderer` directement.
- `@lem/engine` : `Camera` (`creeCamera`, la fabrique **validée** à passer plutôt
  qu'un objet littéral, `versEcran`, `versEcranPixel`, `avecCentre`, `avecZoom`
  qui **refuse** un zoom non entier, `borne`, `suit`, `bornesVisibles`,
  `estVisible`) et les primitives `drawPixel`, `fillRect`, `strokeRect`,
  `drawPolyline`, `withClip`, plus l'existant `withTransform` / `withAlpha`
  (T4). Il n'y a **pas** de `withCamera` : le contexte canvas reste à
  l'échelle 1.
- `render/surface.ts` et la machine à écrans avec son snapshot d'entrée unique
  (T5).
- `terrain.ts` (T6), `Lander` (T7), `landing.ts` (T8), `state.ts` avec les statuts
  `vol / pause / pose / crash / fini` (T9). `Globals`, `Statut`, `EtatPartie`,
  `nouvellePartie`, `nouvelleManche`, `ResultatPartie` et `resultatPartie` vivent
  dans `state.ts` ; `types.ts` les ré-exporte, les deux points d'import
  fonctionnent.
- `reducers.ts` (T9) expose `surPause`, `surReprise` et `surAbandon` : trois
  reducers purs **sans** règle de tick associée, volontairement laissés à
  l'appelant. C'est **cet écran** qui les applique.
- `rules.ts` (T9) expose `regleContact`, `regleTempsDeVol` et `regleEnchainement`
  — type commun `RegleManche` — et `reducers.ts` les cinq reducers de scène
  correspondants : `surContact`, `surHorsLimites`, `surTempsVol`,
  `surMancheSuivante`, `surParticuleMorte`. **La `Scene` de cet écran doit
  brancher les trois règles et les cinq reducers** : `temps-vol` et
  `manche-suivante` sont deux événements ajoutés en T9 parce qu'une `TickRule`
  émet sans écrire l'état. Sans leur reducer branché, le chrono ne tourne pas et
  la manche suivante ne démarre jamais.
  **`surParticuleMorte` n'a pour l'instant aucune règle qui l'alimente** — T12
  ajoutera une quatrième règle, `regleParticules`, et c'est **T12**, pas cette
  tâche, qui reviendra brancher cette règle dans la `Scene` créée ici (T12 a
  `screens/game.ts` dans son en-tête `fichiers:` pour ça). Ordre de tâches
  oblige : `regleParticules` n'existe pas encore quand cette fiche s'exécute.
- `Lander` porte un champ `inerte` (posé par le reducer du verdict) et
  court-circuite son `step` quand il est vrai : le LEM figé après un posé ou un
  crash ne bouge plus, même si la scène continue de ticker. Le rendu n'a rien à
  faire de ce champ, sauf à ne pas dessiner de flamme hors de `"vol"` (garde déjà
  écrite plus bas).
- `Transition` porte désormais `{ nom: "fin"; params: ResultatPartie }` (T9), et
  `main.ts` publie un `RESULTAT_BOUCHON` neutre depuis le bouchon « jeu » : c'est
  ce bouchon que cet écran remplace, avec un vrai `resultatPartie(etat)`.
- Asteroids avait un `render/draw.ts` qui aiguillait par `kind` ; il a été
  supprimé. Le patron d'aiguillage est à reprendre, le contenu est neuf.
- `packages/game/src/main.ts` est le **seul** fichier qui crée la surface
  (`creeSurface(exige("#game"))`), instancie `GestionnaireEcrans` et enregistre
  les quatre écrans — aujourd'hui quatre bouchons (`bouchonDom` / `bouchonCanvas`).
  Aucune fiche de dessin ne le touchait jusqu'ici : un `screens/game.ts` livré
  sans modifier `main.ts` reste un fichier mort, jamais instancié, et `yarn dev`
  continue d'afficher le bouchon canvas. **C'est cette tâche qui retire le
  bouchon `"jeu"` du registre et enregistre le vrai écran à sa place** :
  `creeEcranJeu({ renderer: surface.renderer, input:
  gestionnaire.sourcePartagee() })`. L'écran reçoit son `Renderer` et sa source
  d'entrée en paramètres de fabrique — il ne crée ni surface ni
  `KeyboardInput` lui-même, et reste ainsi testable avec un faux contexte, sans
  DOM (`creeSurface` lève « contexte 2d indisponible » sous happy-dom, comme
  `surface.test.ts` le contourne déjà).

## À faire

1. Ajouter dans `constants.ts` :
   - `ZOOMS = [1, 2, 4]` (valeurs entières autorisées) ;
   - `SEUILS_ZOOM = { vers2: 40, retour1: 44, vers4: 16, retour2: 22 }` (m
     d'altitude au-dessus du sol). **Les quatre seuils sont bornés par la
     demi-hauteur de vue du zoom visé**, pas seulement les deux d'entrée : la
     caméra est centrée sur le LEM et la vue fait `PIXEL.height` = 180 px, donc
     on voit 90 m sous le LEM au zoom 1, 45 m au zoom 2 et 22,5 m au zoom 4.
     D'où `vers2 <= PIXEL.height / 4` (45), `vers4 <= PIXEL.height / 8` (22,5),
     **et aussi** `retour1 <= PIXEL.height / 4` et `retour2 <= PIXEL.height / 8`
     — c'est le seuil de **retour** qui décide jusqu'à quelle altitude on
     **reste** au zoom serré, donc jusqu'à quelle altitude le sol doit rester
     dans la vue de ce zoom. Avec les anciennes valeurs (60 / 80 et 25 / 35, puis
     60 / 24 pour les seuls seuils de retour), le sol sortait de l'écran soit à
     l'entrée du zoom serré, soit pendant toute la bande d'hystérésis qui suit :
     à 50 m d'altitude au zoom 2 (retour à 60), la surface est 100 px sous le
     centre pour une demi-vue de 90 px. Le joueur perdait le sol de vue en
     remontant, exactement ce que ces valeurs sont censées éviter. Les valeurs
     retenues gardent une hystérésis franche (4 m entre `vers2` et `retour1`,
     6 m entre `vers4` et `retour2`) tout en restant sous la borne de visibilité
     aux deux bouts ;
   - `CAMERA_REACTIVITE = 6` (1/s) ;
   - `BIAIS_CAMERA_Y = 60` (px d'écran, au zoom 1) : décale la cible suivie par
     la caméra **vers le bas** par rapport au centre du LEM, pour élargir la
     bande de sol visible au-dessus du bord bas de l'écran. Sans ce biais, la
     bande visible sous un LEM centré plafonne à `PIXEL.height / 2` = 90 m au
     zoom 1 — or le LEM est largué à `DEPART_Y = 120` au-dessus d'une surface
     qui vit dans `[TERRAIN_Y_MIN, TERRAIN_Y_MAX]` = [270 ; 400], donc à une
     altitude initiale de 150 à 280 m. Sans biais, le sol n'entre dans la vue
     qu'en dessous de ~90 m d'altitude, et chaque manche démarre sur un écran
     de ciel vide pendant les ~13 s de chute libre qui précèdent. Avec le
     biais, la cible suivie devient `(lem.x, lem.y + BIAIS_CAMERA_Y / zoom)` et
     la bande visible sous le LEM passe à 150 m au zoom 1 ;
   - `ETOILES_NOMBRE = 90`, `ETOILES_PARALLAXE = 0.25`.
2. Créer `packages/game/src/render/stars.ts` : champ d'étoiles **fixe**, généré
   une fois par manche depuis le `rng` de la manche (position et une des trois
   teintes `blanc` / `grisPale` / `grisClair`), dessiné en **parallaxe**
   (déplacement réduit par `ETOILES_PARALLAXE`). L'étendue du champ (exportée en
   `ETOILES_ETENDUE`) n'est **pas** celle du monde entier : avec la parallaxe, le
   point de référence des étoiles ne parcourt que `ETOILES_PARALLAXE × MONDE`, et
   tirer les 90 étoiles sur les 1280 m du monde entier n'en aurait jamais montré
   qu'un sixième à l'écran. L'étendue retenue est
   `MONDE.largeur * ETOILES_PARALLAXE + PIXEL.width / 2` en largeur (et l'analogue
   en hauteur, bornée par `TERRAIN_Y_MIN`), toujours comprise dans les bornes du
   monde. `ETOILES_ETENDUE` est exportée pour que le fond animé de l'accueil
   (T13, `render/background.ts`) remette ce même champ à l'échelle de son propre
   canvas, sans caméra.
3. Créer `packages/game/src/render/draw.ts`. Chaque fonction reçoit le `Renderer`
   et des données déjà calculées — **aucune règle de jeu ici**.
   - `zoomSuivant(altitude: number, zoomCourant: number): number` — machine à
     **hystérésis** : passe à 2 sous `vers2`, revient à 1 au-dessus de `retour1`,
     passe à 4 sous `vers4`, revient à 2 au-dessus de `retour2`. Le zoom ne prend
     jamais de valeur intermédiaire. Une interpolation continue placerait les
     bords des formes entre deux colonnes de la grille et ruinerait le pixel art
     pendant toute la descente — c'est le piège de cette tâche.
     **Comparaisons strictes** (`altitude < vers2`, `altitude > retour1`, etc.) :
     à une altitude qui tombe **pile** sur un seuil, le cran courant est
     conservé plutôt que de changer — propriété plus forte que « 2 à 40 m
     depuis 1 », qui n'est vraie qu'approchée par en dessous. C'est cette
     propriété de stabilité au seuil, pas une valeur de sortie précise à un
     seuil pile, que la garde d'hystérésis exige.
     **Un seul cran par appel** : depuis le zoom 1 à 12 m d'altitude, la
     fonction rend 2, pas 4, même si 12 m est déjà sous `vers4`. Le second cran
     est franchi à l'appel suivant, une image plus tard (16 ms). La fiche ne
     tranchait pas ce point ; la raison retenue est que franchir 1 → 4 dans la
     même image doublerait deux fois la taille des formes d'un coup.
   - `dessineCiel(r)` — **bandes** de palette (`espace`, `nuit`), aucun dégradé
     continu.
   - `dessineEtoiles(r, etoiles, cam)`.
   - `dessineTerrain(r, terrain, cam)` — la surface en `drawPolyline` couleur
     `grisClair`, le corps rempli en `reliefMoyen`, un liseré `reliefSombre` sous
     la crête. Ne parcourir que la tranche donnée par `bornesVisibles`, plus un
     échantillon de marge de chaque côté.
   - `dessineDrapeau(r, cible, cam, temps)` — mât et toile qui ondule sur
     4 images, couleur `alerte`, liseré de plateforme en `accent`.
   - `dessineReplis(r, terrain, cam)` — **le terrain entier, pas la seule liste
     `replis`** : `terrain.replis` ne porte que `{ x, largeur }`, l'altitude d'un
     plateau ne se lit que dans `terrain.hf` (`surfaceEn`). Passer la seule liste
     aurait obligé le dessin à recalculer une donnée de règle. Liseré discret en
     `reliefClair`, pour que les plateaux se voient sans crier plus fort que la
     cible.
   - `dessineLem(r, lem, cam)` — corps, train à deux pieds, tuyère, tourné de
     l'assiette.
   - `dessineFlamme(r, lem, cam, temps)` — longueur proportionnelle au cran, cœur
     `flammeClaire`, halo `flammeChaude`, tremblement d'un pixel **dérivé du
     temps** (par exemple `Math.sin(temps * 37)`), jamais d'un générateur
     aléatoire. Passer le `rng` de la manche au rendu ferait dépendre la suite
     des tirages du nombre d'images affichées : les particules et le terrain
     cesseraient d'être reproductibles à graine égale, et toute la contrainte
     « aucun `Math.random` » deviendrait décorative.
   - `dessineIndicateurCible(r, cible, cam)` — flèche au bord de l'écran quand la
     cible est hors champ. La direction retenue est celle du **plus grand
     débord** (`directionIndicateur`), latéral ou vertical : au largage, la cible
     est à 250–400 m de côté (`DEPART_DISTANCE`) contre 0 à 130 m de débord
     vertical avec `BIAIS_CAMERA_Y`, donc l'indicateur pointe le plus souvent
     latéralement à cet instant-là, pas vers le bas — le cas vertical reste géré
     et couvert par un test dès qu'il domine. **L'écrêtage évite aussi le
     tableau de bord, pas seulement les bords du canvas** : la cible est
     toujours hors champ au largage, et une flèche simplement écrêtée aux bords
     de l'écran tombe pile sur la jauge de carburant ou celle de puissance (deux
     jauges pleines qui la couvrent presque entièrement) — défaut constaté après
     revue et corrigé ici. La zone atteignable exclut donc aussi la bande du bas
     (`BANDE_JAUGES`, exportée par `render/hud.ts`) et celle du haut
     (`BAS_BLOC_SUPERIEUR`, idem) : `draw.ts` importe ces deux constantes de
     `hud.ts`, ce qui rend T10 dépendante de T11 pour cette seule fonction. Et
     c'est pour cette raison que `dessineIndicateurCible` se peint **après**
     `dessineHud` dans `rend()` (voir plus bas), et non avant : le tableau de
     bord doit être posé pour que l'écrêtage sache où ne pas empiéter.
   - `dessinePause(r)` — voile sombre plus `PAUSE`, `ENTREE REPRENDRE`,
     `ECHAP ABANDONNER`.
4. **Règle de dessin** : toute position monde passe par `versEcranPixel`, et
   toute taille **d'objet du monde** est multipliée par le zoom entier. Aucune
   coordonnée fractionnaire n'atteint le canvas. Restent volontairement en
   pixels d'écran, **non multipliés par le zoom** : l'épaisseur du liseré sous
   la crête, le trait de la crête elle-même, la taille de la flèche de
   l'indicateur, et un pixel d'étoile — ce sont des détails graphiques, pas des
   dimensions du monde, et les agrandir avec le zoom en ferait des pavés à
   l'approche du sol.
5. Créer `packages/game/src/screens/game.ts`, qui implémente `Ecran` (T5), et
   rend un type `EcranJeu extends Ecran` avec **deux lectures seules en plus** :
   `etat(): EtatPartie | null` et `camera(): Camera`. Sans elles, les gardes
   « la pause gèle position, vitesse et `tempsDeVol` » et « la cible suivie vaut
   `lem.y + BIAIS_CAMERA_Y / zoom` » ne se prouveraient qu'en relisant des
   pixels — ce qui testerait le dessin au lieu de la règle. `main.ts` enregistre
   l'écran comme un `Ecran` ordinaire ; seuls les tests se servent du type
   étendu.
   - `entre(t)` : sur la variante `{ nom: "jeu"; params: { niveau, graine } }`
     de `Transition` (T5), démarre une partie via `nouvellePartie(niveau,
     graine)` (T9). Le niveau et la graine viennent **tous les deux** de la
     transition : rien n'est tiré ici.
   - `tick(dt, input)`, dans cet ordre :
     1. **la pause d'abord, à chaque image et y compris en pause** : sur
        `justPressed("back")` appliquer `surPause` si `statut === "vol"` et
        `surAbandon` si `statut === "pause"` ; sur `justPressed("confirm")`
        appliquer `surReprise`. Les reducers portent eux-mêmes leurs gardes de
        statut (T9) ;
     2. **si `statut !== "pause"`** : un `Scene.tick` alimenté par l'adaptateur
        d'entrée partagé du gestionnaire, puis mise à jour de la caméra — `suit`
        vers `(lem.position.x, lem.position.y + BIAIS_CAMERA_Y / zoomCourant)`,
        pas directement vers le LEM (voir `BIAIS_CAMERA_Y` ci-dessus),
        `avecZoom(zoomSuivant(altitude, zoomCourant))`, `borne` sur le monde.
     Autrement dit : **en pause, l'écran n'appelle pas `Scene.tick` mais traite
     quand même la pause.** C'est le seul code du jeu qui lit le clavier en pause,
     et c'est pour ça que l'entrée **et** la sortie de pause vivent ici, du même
     côté de la frontière `Scene.tick`. Une règle de tick le ferait à l'intérieur
     de la scène : elle ne tournerait plus dès la pause posée, le voile
     n'obéirait plus à aucune touche et la partie serait perdue.
   - `rend()` : ciel, étoiles, terrain, replis, drapeau, particules, LEM, flamme,
     HUD (T11), **indicateur de cible**, puis le voile de pause s'il y a lieu.
     L'indicateur passe après le HUD, pas avant : voir la garde ajoutée à
     `dessineIndicateurCible` plus haut sur l'écrêtage qui évite les deux
     jauges.
   - Note la transition `{ nom: "fin", params: résultat de la partie }` quand
     `statut === "fini"` **et** que ce statut est stable depuis
     `DELAI_ENCHAINEMENT`, **ou** que `globals.abandonnee` est vrai (l'abandon
     depuis la pause reste immédiat, il n'y a rien à montrer de plus). Le garde
     temporel est
     `etat.time - globals.instantStatut >= DELAI_ENCHAINEMENT`. **Piège à
     éviter, réel dans le code de T9** : sur la vie fatale, `enregistrePerte`
     (`reducers.ts`) met `statut` directement à `"fini"`, sans passer par
     `"crash"` : si l'écran publie la transition dans le tick même du passage à
     `"fini"`, `GestionnaireEcrans.tick` la consomme aussitôt après et
     `GameLoop.frame` n'appelle `onRender` qu'après `onTick` — la frame du
     verdict fatal n'est **jamais** dessinée, ni son explosion (T12), ni son
     bandeau `CRASH` (T11). C'est la seule des trois fins de manche (deux
     crashes non fatals, puis le crash qui vide la dernière vie) qui saute son
     temps d'affichage si on ne retarde pas la demande. Pendant ce délai, la
     scène continue d'être tickée (aucune règle ne regarde le statut `"fini"`,
     le LEM est `inerte`) : `state.time` avance et les particules s'animent
     normalement. C'est le gestionnaire qui consomme la demande par
     `prendTransition()` (T5). `sort()` remet la case d'attente à `null`, sinon
     un retour ultérieur sur l'écran de jeu rejouerait la demande.
6. Dans `main.ts` : retirer le bouchon `"jeu"` du registre et enregistrer
   `creeEcranJeu({ renderer: surface.renderer, input:
   gestionnaire.sourcePartagee() })` à sa place, avant `gestionnaire.active(...)`.
   **Supprimer** `bouchonCanvas` et `RESULTAT_BOUCHON` (et leurs imports
   devenus inutiles), pas seulement les désenregistrer : `noUnusedLocals` fait
   échouer le `typecheck` sur une fonction ou une constante de module devenue
   morte. Les trois autres écrans restent des bouchons tant que T13/T15/T16 ne
   les remplacent pas à leur tour.
7. Ajouter à `Renderer` (`packages/engine/src/render/Renderer.ts`) une primitive
   `efface()` — `ctx.clearRect(0, 0, width, height)`, à la différence de
   `clear(color)` qui est un `fillRect` opaque — et l'appeler en tête du
   `sort()` de `screens/game.ts`. `#fond` est **sous** `#game` dans le DOM et
   `#game` a `background: transparent` : sans effacement à la sortie de l'écran
   de jeu, la dernière image de la partie (ou un `clear` opaque) reste peinte
   sur `#game` et masque tout ce que T13 dessinera sur `#fond` derrière. C'est
   la moitié « jeu » du correctif ; l'autre moitié (fond animé de l'accueil) est
   à T13.

## Gardes et cas limites

- **Aucune règle de jeu dans le rendu** : le dessin lit l'état, ne le calcule pas
  et ne le modifie pas. Aucun `dessine*` ne rend autre chose que `void`.
- **Aucun générateur aléatoire consommé au rendu**, ni celui de la manche ni un
  autre. **Attention, tranché en T6 et T9 : un test ne peut pas lire le source.**
  `packages/game` n'embarque pas `@types/node`, donc
  `import { readFileSync } from "node:fs"` échoue au `typecheck` (`TS2307`), et
  ajouter la dépendance sort du périmètre (« pas d'outillage qui dépende de la
  version de Node installée »). La garde se prouve **fonctionnellement** :
  remplacer `Math.random` par un piège qui lève et dessiner N images, et vérifier
  que deux rendus successifs du même état produisent les mêmes pixels. C'est ce
  qui a été fait pour `terrain.ts` (piège sur 100 générations) et pour la logique
  de manche (deux déroulés de 300 ticks identiques au bit près).
- **Ordre de dessin** figé : ciel, étoiles, terrain, replis, drapeau, particules,
  LEM, flamme, HUD, **indicateur de cible**, pause. Un LEM dessiné avant le
  terrain disparaît derrière le relief ; l'indicateur dessiné **avant** le HUD
  tombe sous les jauges au largage (défaut constaté après revue, corrigé — voir
  `dessineIndicateurCible` plus haut).
- **Hystérésis** : un LEM qui flotte exactement à 40 m ne doit pas faire clignoter
  le zoom entre 1 et 2 d'une image à l'autre. C'est tout l'objet des seuils de
  retour à 44 et 22 m, et des comparaisons **strictes** de `zoomSuivant` : pile
  au seuil, le cran courant est conservé, jamais changé.
- **Le sol reste visible entre le saut de zoom et le retour** : à l'altitude de
  bascule comme pendant toute la bande d'hystérésis qui suit, la surface sous
  le LEM doit encore tomber dans la vue du zoom courant — donc jusqu'au seuil
  de **retour**, pas seulement au seuil d'entrée. Contrôle visuel obligatoire
  dans `yarn dev`, en plus de l'invariant chiffré de T17, qui porte désormais
  sur les quatre seuils.
- **Tranche visible seulement** : parcourir le terrain entre les abscisses de
  `bornesVisibles`, avec un échantillon de marge, sinon la crête est coupée net
  au bord de l'écran.
- **Caméra bornée** : la vue ne sort jamais du monde ; au zoom 4 le monde visible
  se réduit et le bornage doit encore tenir.
- **Le sol reste visible en début de manche** : au largage (`DEPART_Y`), le
  relief est hors champ tant que la chute n'a pas ramené l'altitude sous
  `PIXEL.height / 2 + BIAIS_CAMERA_Y` (zoom 1). En dessous, `dessineIndicateurCible`
  signale la cible dans la direction de son plus grand débord — **le plus
  souvent latéralement** au largage, puisque la cible est à 250–400 m de côté
  (`DEPART_DISTANCE`) contre 0 à 130 m de débord vertical avec le biais de
  caméra ; le cas vertical (flèche vers le bas) reste géré et testé dès qu'il
  domine. Contrôle visuel obligatoire dans `yarn dev` : à l'instant du largage,
  le joueur doit voir soit le relief, soit une flèche qui l'indique — jamais un
  écran vide sans repère. **Non vérifié à l'œil dans cet environnement** (pas
  de navigateur) : remplacé par deux sondes chiffrées retirées après coup — sur
  7 graines et 3000 images sous poussée, le sol ne sort jamais de la vue au
  zoom courant en dessous du seuil de retour ; et au largage, l'altitude vaut
  199 à 224 m sur 5 graines, confirmant que le relief est hors champ et que
  c'est bien l'indicateur qui sert de repère à cet instant. Reste à confirmer
  à l'œil : allure du LEM, de la flamme, du drapeau et du ciel.
- **L'entrée et la sortie de pause sont du même côté de la frontière** : les
  trois reducers de pause sont appliqués par cet écran, jamais par une
  `TickRule`. Corollaire : la pause n'est **pas** un simple « on saute le tick »,
  c'est « on saute le tick **et** on continue de lire l'entrée ».
- **La pause gèle la physique parce que la scène ne tourne pas** : `Scene.tick`
  déplace toutes les entités avant d'évaluer les règles et `step` ne voit pas les
  globals, donc aucune règle ni aucun reducer ne peut geler le monde. La
  responsabilité est ici, et le test qui la prouve aussi.
- **Flamme** : rien à dessiner au cran 0, réservoir vide, ou statut différent de
  `"vol"`. Une flamme sur un LEM crashé est un mensonge visuel.
- **Palette** : aucune couleur littérale dans `draw.ts` ni `stars.ts`. Le test ne
  peut **pas** lire le source (voir ci-dessus, pas de `@types/node`) : à défaut, il
  vérifie que toutes les couleurs posées sur le contexte canvas appartiennent à
  `PALETTE` — un faux contexte qui enregistre les `fillStyle` / `strokeStyle`
  reçus, puis comparaison à la palette. C'est plus fort qu'une recherche de `#`
  suivi de six chiffres hexadécimaux : une couleur en `rgb()` passait au travers.
- **Étoiles** : générées une fois par manche, jamais dans la boucle de rendu —
  sinon elles scintillent au hasard à chaque image.
- Cible visible : l'indicateur ne s'affiche **pas**.

## Tests attendus

- `zoomSuivant` : 1 à 200 m depuis 1 ; 2 à 30 m depuis 1 ; **encore 2** à 42 m
  depuis 2 (hystérésis, entre `vers2` = 40 et `retour1` = 44) ; 1 à 70 m depuis
  2 ; 4 à 12 m depuis 2 ; **encore 4** à 20 m depuis 4 (entre `vers4` = 16 et
  `retour2` = 22) ; 2 à 30 m depuis 4. Aucune sortie hors de `ZOOMS`. **Stabilité
  pile au seuil** : à exactement 40 m depuis 1, le zoom reste 1 ; à exactement
  40 m depuis 2, le zoom reste 2 — aucune oscillation à la valeur du seuil,
  propriété vérifiée sur toute la plage d'altitudes, en plus des sept cas
  chiffrés ci-dessus. **Un cran par appel** : depuis 1 à 12 m d'altitude, le
  zoom rendu est 2, pas 4.
- Génération des étoiles : déterministe à graine fixée, `ETOILES_NOMBRE` étoiles,
  toutes dans les bornes du monde, teintes prises dans la palette.
- Aucune couleur littérale, aucun `rng`, aucun `Math.random` dans `draw.ts` ni
  `stars.ts` — prouvé par le **comportement** (faux contexte qui collecte les
  couleurs, piège sur `Math.random`), pas par une lecture des sources : voir la
  garde correspondante.
- **Biais de caméra** : `zoomSuivant` mis à part, la cible suivie par la caméra
  vaut `lem.position.y + BIAIS_CAMERA_Y / zoom`, jamais `lem.position.y` seul —
  test dédié sur la position de caméra rendue pour un LEM donné.
- `dessineIndicateurCible` pointe vers le bas quand la cible est sous la vue
  et que ce débord domine (cas vertical), en plus des cas latéraux déjà
  couverts. **Ne recouvre aucune des deux jauges du bas** quand la caméra est
  celle du largage (`(depart.x, DEPART_Y + BIAIS_CAMERA_Y)`) : aucun rectangle
  de la flèche ne chevauche le cadre de la jauge de carburant ni celui de la
  jauge de puissance — test qui a fait apparaître, puis corrigé, le défaut
  constaté après revue.
- Tranche visible : sur 257 échantillons et une caméra centrée à 640 m au zoom 4,
  le nombre d'échantillons retenus est très inférieur à 257 et couvre la vue plus
  la marge.
- L'écran de jeu demande `"fin"` quand le statut passe à `fini`, et rien avant.
  Après un `prendTransition()`, un second appel rend `null` : la demande ne se
  rejoue pas.
- `sort()` appelle `renderer.efface()` : sur un faux contexte qui trace les
  appels, `clearRect` est invoqué avec les dimensions pleines du canvas.
- **Crash fatal** : depuis la dernière vie, au tick où `statut` passe à
  `"fini"`, l'écran ne demande **rien** pendant `DELAI_ENCHAINEMENT`, puis
  demande `"fin"` une seule fois — même délai que pour un `"pose"` ou un
  `"crash"` non fatal. Abandon depuis la pause : la demande part immédiatement,
  sans attendre.
- **La pause gèle la physique** : 100 appels de `ecran.tick(dt, snapshot)` en
  pause laissent la position, la vitesse et le `tempsDeVol` du LEM strictement
  inchangés — flèches tenues comprises. C'est le test que T9 ne pouvait pas
  écrire : au niveau de la scène, il n'aurait prouvé qu'une chose, qu'un état
  qu'on ne tick pas ne change pas.
- **La pause a une sortie** : depuis `"vol"`, un `justPressed("back")` passe en
  `"pause"` ; depuis `"pause"`, un `justPressed("confirm")` ramène `"vol"` et la
  physique repart ; depuis `"pause"`, un `justPressed("back")` met
  `statut === "fini"` et `abandonnee === true`. Ces trois-là échouent si la pause
  est traitée dans une règle de tick.
- **En pause, l'écran lit toujours l'entrée** : `tick` consulte le snapshot même
  quand `Scene.tick` est sauté.

## Fini quand

- [ ] `yarn dev` montre un terrain lunaire, un LEM qui tombe, une flamme qui suit
      le cran, un drapeau qui ondule, un ciel étoilé en parallaxe. **Non
      vérifié à l'œil dans cet environnement** (pas de navigateur) : voir la
      garde « Le sol reste visible en début de manche » pour les sondes
      chiffrées substituées. Reste à cocher par un humain via `yarn dev`.
- [x] La caméra suit le LEM et le zoom saute par crans entiers, sans clignoter au
      seuil — prouvé par les tests de `zoomSuivant` (hystérésis et stabilité pile
      au seuil).
- [x] Aucune coordonnée fractionnaire n'atteint le canvas.
- [x] Le rendu ne consomme aucun tirage aléatoire.
- [x] La pause s'ouvre **et** se ferme : Entrée reprend, Échap abandonne, la
      physique est gelée pendant tout ce temps.
- [x] Le crash sur la dernière vie s'affiche (explosion, bandeau) pendant
      `DELAI_ENCHAINEMENT` avant le passage à l'écran de fin, comme les crashes
      non fatals.
- [x] Quitter l'écran de jeu efface `#game` : aucun résidu de la partie ne
      recouvre le fond animé d'un autre écran.
- [x] La commande de vérification du README du plan passe au vert.
