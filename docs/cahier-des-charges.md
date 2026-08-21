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

Le jeu se joue **entièrement aux quatre flèches** (plus `Entrée` / `Échap` pour
la navigation dans les écrans).

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

# 4. Physique

Échelle **physique réaliste**, valeurs affichées en mètres et mètres par
seconde.

- Gravité lunaire : **1,62 m/s²**, constante, verticale.
- Pas d'atmosphère : aucune traînée, aucun vent.
- Intégration explicite sur le `dt` variable borné de la boucle existante
  (limiteur 60 Hz, `dt` plafonné à 1/30 s).
- La masse du LEM est traitée comme constante (la consommation de carburant
  n'allège pas le module) : simplification assumée, sans incidence sur le jeu.

## 4.1 Critères d'atterrissage réussi

Les quatre conditions doivent être réunies au contact :

1. vitesse verticale sous seuil (ordre de grandeur : **2 m/s**) ;
2. vitesse horizontale sous seuil (ordre de grandeur : **1 m/s**) ;
3. inclinaison sous seuil (ordre de grandeur : **10°** de la verticale) ;
4. **sol suffisamment plat** sous les pieds du LEM (dénivelé faible sur la
   largeur du train d'atterrissage).

Toute condition non remplie donne un **crash**. Les seuils exacts sont réglés à
l'équilibrage et centralisés dans les constantes du jeu.

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
  garantis par la génération, pas espérés du hasard.
- Le **point de départ** du LEM est choisi par la génération, à 250–400 m de la
  cible, et le **signe de la dérive initiale** est orienté **vers** elle. Sans
  ça, une manche sur deux commence en s'éloignant du drapeau et le score est
  subi plutôt que piloté.
- Sortir des limites latérales ou monter au-delà d'un plafond d'altitude fait
  perdre la manche.

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

# 7. Score

Le score est un **malus** : c'est un écart, **le plus petit gagne**.

- **Points d'une manche réussie** = distance du **centre du LEM au moment du
  contact** au pied du drapeau, en mètres, arrondie à l'entier. Un posage exact
  sur la cible vaut 0. C'est le centre, et non le pied qui touche : sinon
  l'assiette décalerait le score d'un demi-train.
- Une manche perdue n'ajoute pas de points (elle coûte une vie).
- **Score de la partie** = **somme** des écarts de toutes les manches réussies.
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

La rugosité du terrain et l'étroitesse de la plateforme cible peuvent suivre le
même scalaire.

L'écran d'accueil propose **trois niveaux de départ — facile, moyen,
difficile** — placés à 0, 1 et 2 sur cette échelle. Chaque manche réussie ajoute
**0,08** : il faut treize manches réussies pour franchir un cran. La montée est
donc très progressive, et partir de facile ne durcit pas la partie avant un long
moment.

La difficulté est **plafonnée à un niveau encore gagnable**, retenu à **2,4** et
vérifié à l'équilibrage : au-delà d'environ 2,5, le carburant ne suffit plus à la
fois à annuler la dérive initiale et à freiner la chute, et la manche serait
perdue d'avance. Un joueur excellent peut donc enchaîner sans mur : c'est
l'endurance qui départage, ce que le tri du hall of fame récompense déjà.

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
- Bouton de **remise à zéro** dans l'écran du hall of fame.
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

Tableau des 100 entrées, même fond que l'accueil, remise à zéro, retour.

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
