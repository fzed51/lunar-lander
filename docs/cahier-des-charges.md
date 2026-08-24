---
title: LEM — cahier des charges
statut: arrêté pour la v1
date: 2026-08-21
---

# 1. Intention

Jeu web d'atterrissage lunaire : poser un module LEM sur la Lune, au plus près
d'une cible, avec un carburant compté et une inertie réaliste. Rendu pixel art
à palette limitée. Score de type golf — plus l'écart à la cible est petit,
meilleur on est — et hall of fame local de 100 parties.

Le dépôt est un monorepo Yarn workspaces repris de `../asteroids` :

- `@lem/engine` — moteur de jeu web générique, ne connaît aucun jeu ;
- `@lem/game` — le jeu LEM, qui consomme le moteur.

La boucle d'exécution du moteur repris est conservée telle quelle :
`état initial → input → move → interact → état final → rendu`, état immuable,
événements et reducers purs, effets de bord hors état.

# 2. Boucle de jeu

## 2.1 Partie

Une partie se joue avec **3 vies**. Elle enchaîne des **manches** jusqu'à
épuisement des vies :

- chaque manche génère un **nouveau terrain** et une **nouvelle cible** ;
- une manche réussie (atterrissage valide) ne coûte pas de vie ; on enchaîne
  sur la manche suivante, plus difficile ;
- une manche perdue (crash, ou LEM sorti des limites du terrain) coûte une vie ;
- à 0 vie, la partie s'arrête et le score est présenté ;
- le **carburant est refait au plein** au début de chaque manche.

## 2.2 Manche

Le LEM apparaît en haut du terrain avec une altitude de départ, une vitesse
horizontale initiale imposée par la difficulté, une vitesse verticale nulle et
une assiette verticale. Le joueur descend, corrige sa dérive, et pose.

La manche se termine au contact du sol : réussie ou crashée.

# 3. Pilotage

Le jeu se joue **entièrement aux quatre flèches** (plus `Entrée` et `Échap` pour
la navigation dans les écrans, `H` pour ouvrir le hall of fame depuis l'accueil
et `R` pour sa remise à zéro).

| Touche | Effet |
| --- | --- |
| ← | fait pivoter le LEM vers la gauche (assiette) |
| → | fait pivoter le LEM vers la droite (assiette) |
| ↑ | puissance moteur **+1 cran** |
| ↓ | puissance moteur **−1 cran** |
| Échap | met le vol **en pause** : ABANDONNER ou REPRENDRE |

- La **puissance moteur** a **6 états : 0 à 5 crans**. Le cran est **mémorisé** :
  il reste où on l'a mis sans maintenir la touche. ↑ et ↓ agissent sur front
  montant (un appui = un cran), pas en continu.
- La poussée s'applique **selon l'axe du LEM**, donc l'assiette détermine la
  direction : c'est ainsi qu'on annule la dérive horizontale.
- La rotation a une vitesse angulaire constante tant que la flèche est tenue.
- Le moteur ne consomme du carburant qu'aux crans ≥ 1, proportionnellement au
  cran.
- **Réservoir vide** : la poussée devient nulle, le LEM tombe en chute libre. La
  manche n'est pas perdue pour autant — une trajectoire déjà propre peut encore
  aboutir.
- **Pause** : Échap suspend le vol et propose d'abandonner ou de reprendre. Le
  temps de vol **ne tourne pas** en pause. Un abandon termine la partie comme un
  dernier crash : elle est classée si elle compte au moins un posé.

## 3.1 Valeurs retenues

Réglées à l'équilibrage, centralisées dans `packages/game/src/constants.ts`.
Cette colonne et le code disent la même chose : changer l'un sans l'autre est un
mensonge qui survit au chantier.

| Réglage | Valeur | Constante |
| --- | --- | --- |
| Crans de puissance | 0 à 5, mémorisés | `CRANS_MAX = 5` |
| Poussée au cran 5 | **4 m/s²**, soit 2,47 fois la gravité lunaire | `POUSSEE_MAX = 4` |
| Poussée au cran *n* | `n / 5 × 4` m/s², proportionnelle au cran | — |
| Consommation | **0,8 unité par seconde et par cran**, donc 4 u/s au cran 5 | `CONSO_PAR_CRAN = 0.8` |
| Vitesse de rotation | **45°/s**, flèche tenue | `VITESSE_ROTATION = π/4` |
| Assiette maximale | **±90°** : le LEM ne se retourne jamais | `ASSIETTE_MAX = π/2` |

Deux conséquences chiffrées de ces valeurs, qui décident du rythme d'une manche :

- **vol stationnaire** : il demande `1,62 / 4 × 5 ≈ 2,03` crans, soit ≈ 1,62 u/s.
  Le plein du niveau facile (140 u) vaut donc ≈ 86 s de vol stationnaire, celui du
  plafond de difficulté (96,8 u) ≈ 60 s ;
- **poussée et réservoir vide** : sur le pas de temps où le réservoir se vide, la
  poussée est proportionnée au carburant réellement brûlé, puis tombe à zéro. Le
  cran choisi par le joueur, lui, ne bouge pas.

# 4. Physique

Échelle **physique réaliste**, valeurs affichées en mètres et mètres par
seconde.

- Gravité lunaire : **1,62 m/s²**, constante, verticale.
- Pas d'atmosphère : aucune traînée, aucun vent.
- Intégration semi-implicite sur le `dt` variable borné de la boucle existante
  (limiteur 60 Hz, `dt` plafonné à 1/30 s) : la vitesse reçoit d'abord la poussée
  puis la gravité, et la position est intégrée depuis la vitesse **déjà mise à
  jour**.
- Le monde jouable mesure **1280 × 420 m**. Sortir latéralement, ou franchir le
  plafond `y = 0`, perd la manche.
- La masse du LEM est traitée comme constante (la consommation de carburant
  n'allège pas le module) : simplification assumée, sans incidence sur le jeu.

## 4.1 Critères d'atterrissage réussi

Les quatre conditions doivent être réunies au contact. Les valeurs sont celles
retenues à l'équilibrage, et les seuils sont **inclusifs** : le contact pile au
seuil est un posé, parce que le joueur lit ces grandeurs sur le HUD et que
refuser une valeur affichée comme conforme serait incompréhensible.

| Condition | Seuil | Constante |
| --- | --- | --- |
| Vitesse verticale **à la descente** | ≤ **2 m/s** | `SEUIL_VY = 2` |
| Vitesse horizontale, en valeur absolue | ≤ **1 m/s** | `SEUIL_VX = 1` |
| Inclinaison de part et d'autre de la verticale | ≤ **10°** | `SEUIL_ASSIETTE = π/18` |
| Dénivelé du sol sous la largeur du train (8 m) | ≤ **1 m** | `SEUIL_PLATITUDE = 1` |

Le seuil de vitesse verticale ne s'applique qu'à la **descente** : un LEM qui
remonte au moment du contact ne s'écrase pas sur le sol par le dessous.

Toute condition non remplie donne un **crash**. Les seuils sont centralisés dans
`packages/game/src/constants.ts` et nulle part ailleurs.

Le contact n'est pas testé seulement sous les pieds : le **fuselage** compte
aussi. Un LEM qui file latéralement dans une paroi de canyon s'y écrase, même si
ses deux pieds sont encore en l'air au-dessus du fond.

# 5. Terrain

- Le sol est un **champ d'altitudes** : une altitude par colonne. Pas de
  surplomb, pas de grotte. La collision se ramène à comparer l'altitude du LEM
  au sol sous ses pieds.
- **Génération procédurale** par déplacement de point milieu, avec une
  **rugosité variable selon les secteurs** : le terrain alterne des zones
  douces et des **zones franchement accidentées** — pics, crêtes déchiquetées,
  canyons étroits — où poser est impossible.
- La génération est **déterministe à partir d'une graine** : même graine, même
  terrain. Aucun `Math.random` direct dans la logique de jeu.
- Le terrain est **plusieurs fois plus large que l'écran**.
- La cible est matérialisée par un **drapeau** planté au milieu d'une
  **plateforme plate garantie**. Poser pile sur la cible donne le score parfait
  de 0 point.
- **Deux à quatre plateaux supplémentaires**, plus étroits, sont forés ailleurs
  sur le terrain : s'y rabattre est un choix sûr mais coûteux en points. Ils sont
  garantis par la génération, pas espérés du hasard. Le nombre demandé est de
  deux à quatre et il est obtenu dans plus de 90 % des manches ; la géométrie ne
  garantit toutefois qu'**un** plateau de secours, parce que les secteurs doux
  disponibles peuvent n'offrir qu'une seule place assez loin de la cible. Un
  terrain sans aucun repli, lui, est impossible.
- Le **point de départ** du LEM est choisi par la génération, à 250–400 m de la
  cible, et le **signe de la dérive initiale** est orienté **vers** elle. Sans
  ça, une manche sur deux commence en s'éloignant du drapeau et le score est
  subi plutôt que piloté.
- Sortir des limites latérales ou monter au-delà d'un plafond d'altitude fait
  perdre la manche.

## 5.1 Valeurs retenues

| Réglage | Valeur | Constante |
| --- | --- | --- |
| Monde jouable | **1280 × 420 m**, plafond à `y = 0` | `MONDE`, `PLAFOND_Y` |
| Pas d'échantillonnage | **5 m**, soit 257 altitudes | `TERRAIN_PAS = 5` |
| Bande de la surface | `y` de **270** (le plus haut) à **400** (le plus bas) | `TERRAIN_Y_MIN`, `TERRAIN_Y_MAX` |
| Secteurs | **8**, de 160 m chacun | `TERRAIN_SECTEURS = 8` |
| Rugosité | **0,15** en secteur doux, **1,6** en accidenté | `RUGOSITE_DOUCE`, `RUGOSITE_ACCIDENTEE` |
| Pente d'un secteur doux | écrêtée à **0,3**, soit 1,5 m par pas | `PENTE_MAX_DOUCE` |
| Part de secteurs accidentés | `0,25 + 0,15 × difficulté`, plafonnée à **0,75** | `PROBA_SECTEUR_ACCIDENTE_*` |
| Plateforme cible | **40 m** aplatis jusqu'à la difficulté 2, **30 m** de 2 à 4, plancher **20 m** | `PLATEFORME_ECHANTILLONS_*` |
| Replis | **2 à 4** souhaités, **20 à 30 m** aplatis, au moins un garanti | `REPLIS`, `REPLI_ECHANTILLONS` |
| Distance de largage à la cible | **250 à 400 m** | `DEPART_DISTANCE` |
| Altitude de largage | `y = 120`, donc 150 à 280 m au-dessus de la surface | `DEPART_Y = 120` |

Le contraste doux / accidenté n'est pas une intention, il est mesuré et borné par
`terrain.test.ts` : sur 200 graines à la difficulté 2,4, **10 % des abscisses d'un
secteur accidenté acceptent le train contre 89 % en secteur doux** ; le test
refuse de dépasser 20 % côté accidenté et de descendre sous 70 % côté doux.
`reglages.test.ts` exige en plus un rapport d'au moins cinq entre les deux
rugosités : deux valeurs voisines rendraient le relief uniforme et le choix du
point de posé n'aurait plus de sens.

Le « deux à quatre plateaux » est tenu dans **plus de 90 %** des manches, mesuré
sur les mêmes graines ; la géométrie ne garantit qu'un plateau de secours.

# 6. Caméra

- La caméra **suit le LEM horizontalement** et verticalement sur le terrain
  large.
- Sous une **altitude seuil**, elle passe en **vue rapprochée** pour juger le
  contact précisément, comme le Lunar Lander d'Atari. Le zoom ne prend que des
  valeurs **entières** (×1, ×2, ×4) et change par sauts, avec une marge
  d'hystérésis pour ne pas clignoter quand on flotte au seuil. Un zoom
  fractionnaire placerait les pixels entre deux colonnes de la grille et
  ruinerait le rendu.
- Un indicateur montre la direction de la cible quand celle-ci est hors champ.

## 6.1 Valeurs retenues

| Réglage | Valeur | Constante |
| --- | --- | --- |
| Zooms | **×1, ×2, ×4**, entiers, sans état intermédiaire | `ZOOMS` |
| Passage au ×2 | sous **40 m** d'altitude, retour au ×1 au-dessus de **44 m** | `SEUILS_ZOOM.vers2`, `.retour1` |
| Passage au ×4 | sous **16 m** d'altitude, retour au ×2 au-dessus de **22 m** | `SEUILS_ZOOM.vers4`, `.retour2` |
| Réactivité du suivi | **6 /s**, lissage exponentiel, jamais de dépassement | `CAMERA_REACTIVITE` |
| Biais vers le bas | **60 px** d'écran au zoom 1 | `BIAIS_CAMERA_Y` |

Les **quatre** seuils, et pas seulement les deux d'entrée, tiennent dans la
demi-vue du zoom visé : 45 m au ×2, 22,5 m au ×4. C'est le seuil de **retour**
qui décide jusqu'à quelle altitude on **reste** au zoom serré en remontant ; un
retour au-delà de sa borne ferait perdre le sol de vue sur toute la bande
d'hystérésis. `reglages.test.ts` tient les deux moitiés de l'invariant.

## 6.2 La fenêtre aveugle du largage, chiffrée

Au largage, le sol est **sous le bord bas de la vue**, et l'écran ne montre que du
ciel pendant plusieurs secondes. Le biais de caméra réduit cette fenêtre, il ne
l'annule pas — c'est l'arbitrage retenu, écrit ici plutôt que prétendre l'écran
plein dès la première image.

- Le LEM est largué à `y = 120`, la caméra le suit avec 60 px de biais : au
  zoom 1, on voit **150 m** sous lui, soit jusqu'à `y = 270` — exactement le
  plafond de la surface.
- Mesuré sur 800 terrains (difficultés 0, 1, 2 et 2,4), la plateforme cible tombe
  entre `y = 307` et `y = 352`. Le relief entre donc dans le cadre après **6,8 à
  10,0 s de chute libre, 8,6 s en médiane** — davantage si le joueur retient sa
  descente au moteur. Sans le biais, la même attente vaudrait 11 à 13 s.
- Pendant cette attente, la **flèche d'indicateur de cible est affichée dès la
  première image** : la cible est hors champ par le bas, l'indicateur pointe vers
  le bas, et le joueur n'est jamais sans repère.
- Les deux leviers qui supprimeraient la fenêtre sont écartés : pousser le biais à
  ≈ 190 px déborderait la vue au zoom 2 (95 m de décalage pour une demi-vue de
  45 m) et collerait le LEM au bord haut pendant toute l'approche ; rapprocher
  `DEPART_Y` du sol changerait la nature de la manche.

# 7. Score

Le score est un **malus** : c'est un écart, **le plus petit gagne**.

- **Points d'une manche réussie** = **écart horizontal** entre le **centre du
  LEM au moment du contact** et le mât du drapeau, en mètres, arrondi à
  l'entier. Un posage exact sur la cible vaut 0. C'est le centre, et non le pied
  qui touche : sinon l'assiette décalerait le score d'un demi-train. Et c'est un
  écart **horizontal**, pas une distance euclidienne : au contact, le centre du
  LEM est à une demi-hauteur de module au-dessus de la surface, soit 3,5 m,
  alors que la cible **est** la surface. Une distance euclidienne vaudrait donc
  toujours au moins 4 points arrondis, et le « score parfait de 0 point » promis
  au §5 serait inatteignable. C'est aussi le sens de « distance au drapeau » pour
  un score de golf : on mesure l'écart au trou sur le terrain, pas l'altitude de
  la balle.
- Une manche perdue n'ajoute pas de points (elle coûte une vie).
- **Score de la partie** = **somme** des écarts **déjà arrondis** de toutes les
  manches réussies. L'arrondi est fait une fois, au contact, et jamais sur le
  total : c'est le nombre affiché à la fin de la manche qui s'ajoute au score.
  Conséquence assumée : une partie longue accumule des points, donc le total
  n'est comparable qu'à temps de vol voisin — d'où le tri du hall of fame (§9).
- **Temps de vol de la partie** = temps de vol cumulé sur toutes les manches,
  réussies ou non. Il ne tourne ni en pause, ni sur l'écran de posé ou de crash :
  seul le vol compte. C'est la clé de tri principale du hall of fame, elle ne
  doit pas pouvoir se gonfler à l'arrêt.

# 8. Difficulté

La difficulté est un **scalaire continu**. Deux paramètres en dépendent, comme
demandé :

1. la **vitesse horizontale initiale** du LEM (elle croît) ;
2. la **quantité de carburant** du réservoir (elle décroît).

La rugosité du terrain et l'étroitesse de la plateforme cible suivent le même
scalaire (§5.1).

L'écran d'accueil propose **trois niveaux de départ — facile, moyen,
difficile** — placés à 0, 1 et 2 sur cette échelle. Chaque manche réussie ajoute
**0,08** : il faut treize manches réussies pour franchir un cran. La montée est
donc très progressive, et partir de facile ne durcit pas la partie avant un long
moment.

| Réglage | Valeur | Constante |
| --- | --- | --- |
| Niveaux de départ | facile **0**, moyen **1**, difficile **2** | `NIVEAUX` |
| Palier par manche réussie | **0,08** | `PALIER_DIFFICULTE` |
| Plafond | **2,4**, atteint en **30 manches réussies** depuis facile | `DIFFICULTE_MAX` |
| Vitesse horizontale au largage | `8 + 6 × difficulté` m/s, plafonnée à **32 m/s** — soit **22,4 m/s** au plafond | `VH_BASE`, `VH_PENTE`, `VH_MAX` |
| Carburant embarqué | `140 − 18 × difficulté` unités, plancher **60** — soit **96,8 u** au plafond | `CARBURANT_BASE`, `CARBURANT_PENTE`, `CARBURANT_MIN` |
| Vies | **3** | `VIES_INITIALES` |

## 8.1 Le plafond est démontré gagnable, au pire cas de terrain

Le plafond de **2,4** n'est pas un pari : il est démontré sur la **chute
maximale**, `TERRAIN_Y_MAX − DEPART_Y = 280 m`, et non sur le terrain le plus
favorable (150 m), qui certifierait un plafond gagnable seulement là où on a de
la chance. Avec les valeurs retenues :

- **freiner la chute** : 280 m de chute libre donnent 30,1 m/s à annuler à
  l'accélération nette `POUSSEE_MAX − MOON_GRAVITY = 2,38 m/s²`, soit 12,7 s au
  cran 5 à 4 u/s → **≈ 50,6 u** ;
- **annuler la dérive** : 22,4 m/s sous une assiette de 45° →
  `22,4 × 4 / (4 × sin 45°)` → **≈ 31,7 u** ;
- **besoin total ≈ 82,3 u** contre un réservoir de **96,8 u** : **17,6 % de
  marge**.

C'est ce calcul, formules complètes et non leur simplification, que tient
l'invariant de `reglages.test.ts`, avec une marge exigée d'au moins 15 %. Il est
sensible à tout déplacement du monde, puisqu'il s'écrit avec `TERRAIN_Y_MAX` et
`DEPART_Y` et non avec une hauteur en dur.

C'est ce qui a fixé `CARBURANT_PENTE` à **18** et non 25 : à 25, le réservoir du
plafond valait 80 u contre 82,3 u de besoin, et la manche était perdue d'avance
sur une plateforme basse. Les deux autres sorties ont été écartées — abaisser le
plafond à 2,0 ne donnait que 14 % de marge (90 u contre 78,9 u), et abaisser
`DEPART_Y` change la nature de la manche.

Un joueur excellent peut donc enchaîner sans mur : c'est l'endurance qui
départage, ce que le tri du hall of fame récompense déjà.

# 9. Hall of fame

- **100 meilleures parties**, conservées dans le navigateur
  (`localStorage`), derrière une petite interface de stockage pour pouvoir
  brancher autre chose plus tard.
- **Condition d'entrée absolue** : une partie où le joueur ne s'est **jamais
  posé** n'entre pas au hall of fame, quel que soit son temps de vol. Il faut au
  moins **une manche réussie**. Sans cette règle, tourner en rond sans jamais
  atterrir suffirait à prendre la première place, puisque le tri principal est le
  temps de vol.
- Tri, dans cet ordre :
  1. **temps de vol total, décroissant** (avoir tenu longtemps est la
     performance première), comparé **arrondi à la seconde** ;
  2. à temps égal, **total de points croissant** (le plus précis passe devant).

  L'arrondi n'est pas cosmétique : le temps de vol est une somme de pas de temps
  flottants, deux parties ne seraient jamais exactement égales, et la seconde
  clé ne servirait donc jamais. Le temps exact reste affiché.
- Chaque entrée retient : trigramme, temps de vol total, total de points, nombre
  de manches réussies, niveau de départ, date.
- **Remise à zéro** depuis l'écran du hall of fame, et **confirmée** : `R` la
  demande, un second `R` l'exécute, `Échap` l'annule. Le jeu n'a pas de souris —
  c'est une touche, pas un bouton — et le seul geste qui détruit des données ne
  peut pas tenir en un appui.
- Le fond de l'écran est **le même que l'accueil** (§10).

## 9.1 Saisie du trigramme

À la fin d'une partie, si elle compte au moins une manche réussie **et** que son
résultat entre dans les 100, le joueur saisit **trois lettres**, **à la manière
d'une borne d'arcade** :

- ↑ / ↓ font défiler la lettre courante (A→Z, en boucle) ;
- ← / → changent de position (bornées, sans rebouclage) ;
- `Entrée` valide.

Sinon, on affiche seulement le récapitulatif, sans saisie.

# 10. Écrans

Quatre écrans, dans une machine à états explicite.

## 10.1 Accueil

- Fond : **la Terre** dans le ciel noir étoilé, le **sol lunaire** au premier
  plan, et un **drapeau qui flotte** (animation en boucle, quelques images).
- **Choix du niveau** de départ (facile / moyen / difficile) aux flèches.
- Bouton / entrée vers le **hall of fame**.
- `Entrée` lance la partie.

## 10.2 Jeu

Vue du terrain, LEM, drapeau cible, HUD. Échap ouvre une **pause** superposée :
ABANDONNER ou REPRENDRE.

## 10.3 Fin de partie

Récapitulatif : manches réussies, total de points, temps de vol, place au hall
of fame le cas échéant, puis saisie du trigramme si qualifié. Retour à
l'accueil.

## 10.4 Hall of fame

Tableau des 100 entrées, même fond que l'accueil, remise à zéro confirmée,
retour. Les cent lignes ne tiennent pas dans 180 px : l'écran en montre **neuf**
à la fois et défile, ligne à ligne aux flèches haut / bas, page entière aux
flèches gauche / droite. La partie qui vient d'être classée est mise en évidence
en arrivant depuis l'écran de fin.

# 11. Rendu

## 11.1 Technique

- Tout est dessiné sur un **canvas interne de 320 × 180**, puis **agrandi ×4
  sans lissage** (1280 × 720, `image-rendering: pixelated`,
  `imageSmoothingEnabled = false`).
- Conséquence : les gros pixels sont réels, texte compris. Une police pixel est
  dessinée ou choisie en conséquence.
- Le jeu s'adapte à la taille de la fenêtre par un facteur d'échelle entier
  (×2, ×3, ×4…), jamais fractionnaire, pour ne jamais casser la grille de
  pixels.

## 11.2 Palette

**16 couleurs, pas une de plus**, sur le thème « Lune et espace » : noir de
l'espace, nuances de gris pour le relief (lumière, mi-tons, ombre portée),
blancs pour les étoiles, le LEM et le texte, jaunes / orangés pour la flamme,
rouge pour le crash et les alertes, bleus et blanc pour la Terre.

La palette et ses règles d'emploi sont figées dans un **design system** rédigé
et codé **avant tout écran de jeu** (première tâche du plan) : c'est lui qui garantit
l'harmonie entre accueil, jeu, fin de partie et hall of fame.

## 11.3 Deux systèmes d'affichage

Les écrans hors jeu n'ont pas à passer par le canvas.

- **Écran de jeu** : tout en **canvas pixel** (terrain, LEM, particules, HUD).
  C'est le seul écran qui a besoin de la boucle de rendu.
- **Accueil, fin de partie, hall of fame** : **HTML et CSS**, pilotés aux
  flèches comme le reste. Un tableau de 100 lignes et un sélecteur de niveau
  sont bien plus simples et plus lisibles en DOM qu'en canvas.
- Le **fond animé** de l'accueil et du hall of fame (Terre, sol lunaire,
  drapeau qui flotte) est un **canvas en arrière-plan**, avec l'interface DOM
  posée par-dessus.

L'harmonie tient au **design system commun** : la palette 16 couleurs et la
police pixel existent en deux formes équivalentes — constantes TypeScript pour
le canvas, variables CSS pour le DOM — générées depuis une **source unique**.
Rendu net garanti côté DOM par `image-rendering: pixelated`, des tailles de
police multiples de la grille et aucune ombre ni dégradé hors palette.

## 11.4 Éléments dessinés

LEM (corps, train d'atterrissage, tuyère), flamme dont la taille suit le cran de
puissance, relief lunaire avec ombrage, drapeau cible, étoiles, Terre, HUD,
explosion, poussière au posage.

# 12. HUD

Tableau de bord **complet et chiffré**, dans les unités réelles :

- altitude (m) ;
- vitesse verticale (m/s), avec signe et repère de seuil ;
- vitesse horizontale (m/s), avec signe et repère de seuil ;
- distance à la cible (m) ;
- carburant (jauge + valeur) ;
- cran de puissance (jauge à 5 barres) ;
- vies restantes ;
- temps de vol ;
- numéro de manche et difficulté courante.

Les indicateurs de vitesse et d'inclinaison changent de couleur quand ils
sortent des seuils d'atterrissage : le joueur sait avant de toucher s'il est
dans les clous.

# 13. Son

**Aucun son dans la v1.** Le module audio synthétisé d'Asteroids est retiré au
nettoyage. Le point pourra être rouvert plus tard.

# 14. Répartition moteur / jeu

Deux règles tranchent tous les cas :

1. **Le moteur organise et outille, le jeu décide et dessine.** Le moteur dit
   *quand* faire le rendu, il ne fait jamais le rendu lui-même. Il ne connaît
   aucun type du jeu.
2. **Le moteur ne s'occupe que de la partie jouée.** Tout ce qui entoure le vol
   — écrans, menus, navigation, hall of fame, persistance — est du ressort du
   jeu et reste hors du moteur.

**`@lem/engine` — la partie jouée, en générique**

- boucle d'exécution (`GameLoop`), `Scene` (interactions par paire, règles de
  tick, reducers, effets), `GameState` immuable, entités — repris tels quels ;
- entrées clavier (`KeyboardInput`), suffisantes pour un jeu tout aux flèches ;
- **primitives de dessin** du `Renderer` (pixel, rectangle, polygone, ligne,
  cercle, texte, transformations, transparence), enrichies de ce qui manque ;
- **caméra** : conversion monde → écran, suivi d'une cible, facteur de zoom ;
- **générateur aléatoire à graine**, reproductible, qui remplace `Math.random`
  dans toute la logique ;
- **outils de champ d'altitudes** : échantillonnage d'une altitude, pente
  locale, test de contact. La *génération* du relief reste au jeu ;
- collisions géométriques génériques déjà présentes.

**`@lem/game` — le jeu et tout ce qui l'entoure**

- LEM et sa physique, génération du terrain, cible, carburant, critères
  d'atterrissage, score, difficulté, particules ;
- **machine à écrans** : quel écran est actif, transitions, qui reçoit le tick
  et le rendu ; les écrans hors jeu sont en DOM (§11.3), seul l'écran de jeu
  passe par la boucle canvas ;
- **surface pixel** : création du canvas 320 × 180, facteur d'échelle entier,
  lissage désactivé, présentation à l'écran ;
- **hall of fame** et sa **persistance** `localStorage`, derrière une petite
  interface de stockage propre au jeu ;
- **design system** et **tout le dessin** : accueil, jeu, HUD, fin de partie,
  hall of fame.

Le système de particules d'Asteroids est **conservé et rhabillé** avec la
palette : explosion au crash, poussière au posage, gaz du moteur.

# 15. Contraintes de projet

- Reprise de la **structure et du moteur** de `../asteroids` : monorepo Yarn 4
  (`nodeLinker: node-modules`), TypeScript strict, Vite, Vitest, imports du
  moteur en source directe (`exports` → `./src/index.ts`).
- **Nettoyage avant le premier commit** : tout le code propre à Asteroids
  (astéroïdes, balles, vagues, tir, sons, rendu torique du jeu) disparaît du
  dépôt. Le premier commit est une base saine : moteur + squelette de jeu vide.
- Le **moteur reste agnostique du jeu** : aucun import du jeu, aucun type du jeu.
- Commandes du dépôt inchangées : `yarn dev`, `yarn build`, `yarn test`,
  `yarn typecheck`.
- Tests unitaires Vitest sur la logique pure : physique, critères
  d'atterrissage, génération de terrain (déterminisme à graine fixe), score,
  tri du hall of fame, machine à écrans.
- Git : identité **perso** (`git-perso` dans le dépôt), compte `gh` basculé sur
  `fzed51`, dépôt distant `git@github:fzed51/lunar-lander.git`.
- Documentation en français, code et commentaires en français, comme dans
  `../asteroids`.
