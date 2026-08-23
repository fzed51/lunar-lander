# Chantier — création du jeu LEM

## Contexte

Le dépôt vient d'être créé. Son premier commit (`8c32c9b`) est une **base
saine** : la structure et le moteur du projet voisin `../asteroids` ont été
reprises, le scope des paquets est passé à `@lem/*`, et **tout le code propre à
Asteroids a été retiré** — astéroïdes, balles, vaisseau, vagues, tir,
interactions, règles, sons, dessin du jeu.

Ce qui existe aujourd'hui :

- `packages/engine` — le moteur, **intact** : `GameLoop` (dt variable, limiteur
  60 Hz, clamp 1/30 s), `Scene` (`onPair` / `onTick` / `on` / `addEffect`),
  `GameState` immuable, `Vector2`, `KeyboardInput`, `collision`, `Renderer`
  (primitives canvas 2D). 33 tests.
- `packages/game` — un squelette : `types.ts` (commandes aux quatre flèches,
  union d'entités réduite à `Particle`), `constants.ts` (`PIXEL` 320 × 180,
  `MOON_GRAVITY` 1.62), `entities/Particle.ts` (immuable, fondu par âge, tirage
  injecté), `input/mapping.ts`, `main.ts` (monte le canvas pixel avec un
  agrandissement à facteur entier et affiche un titre). 4 tests.

Il n'y a **aucun jeu** : pas de LEM, pas de terrain, pas d'écran, pas de score,
pas de hall of fame. Ce chantier les crée.

Le **cahier des charges complet et arrêté** est dans
[`docs/cahier-des-charges.md`](../docs/cahier-des-charges.md). Il est la
référence : en cas de doute sur une règle de jeu, c'est lui qui tranche, pas ce
README.

## Cible

À la fin du chantier, `yarn dev` ouvre un jeu jouable où tout ce qui suit est
observable :

1. Un **écran d'accueil** en HTML sur fond animé en canvas : la Terre dans le
   ciel étoilé, le sol lunaire, un drapeau qui ondule. On y choisit son niveau de
   départ (facile / moyen / difficile) aux flèches et on entre dans le hall of
   fame.
2. Une **partie** de 3 vies qui enchaîne des manches. Chaque manche génère un
   terrain lunaire procédural de 1280 m de large : des secteurs doux, des
   secteurs accidentés avec pics et canyons, une plateforme plate portant le
   drapeau cible, un à quatre plateaux de repli (deux à quatre demandés et
   obtenus dans plus de 90 % des manches, un seul garanti par la géométrie —
   voir T6), et un point de départ situé à
   250–400 m de la cible avec une dérive initiale orientée vers elle.
3. Un **LEM** piloté aux quatre flèches : ← / → pour l'assiette, ↑ / ↓ pour la
   puissance moteur sur 6 crans mémorisés. Gravité 1,62 m/s², carburant compté,
   réservoir vide = chute libre. Échap met en pause et propose d'abandonner.
4. Une **caméra** qui suit le LEM, avec un zoom **entier** (×1, ×2, ×4) qui se
   resserre à l'approche du sol et ne clignote pas au seuil.
5. Un **HUD** chiffré : altitude au-dessus du sol, vitesse verticale, vitesse
   horizontale, distance à la cible, carburant, cran de puissance, vies, temps de
   vol, manche, difficulté. Les vitesses changent de couleur avant de sortir des
   seuils.
6. Un **verdict de contact** : posé si `|vy| ≤ 2 m/s`, `|vx| ≤ 1 m/s`,
   `|assiette| ≤ 10°` et dénivelé sous le train `≤ 1 m` ; sinon crash avec
   explosion en particules. Le fuselage collisionne aussi : on ne traverse pas une
   paroi de canyon parce que les pieds sont en l'air.
7. Un **score de type golf** : chaque manche réussie ajoute l'écart
   **horizontal** en mètres entre le **centre du LEM au contact** et le drapeau ;
   le total est la somme, le plus petit est le meilleur. Horizontal, et non
   euclidien : le centre du LEM est à 3,5 m au-dessus de la surface au contact,
   une distance euclidienne rendrait le posé parfait à 0 point impossible.
8. Une **fin de partie** qui, si la partie compte **au moins une manche réussie**
   et que son résultat entre dans les 100 meilleurs, demande un trigramme à la
   manière d'une borne d'arcade (↑ ↓ pour la lettre, ← → pour la position, Entrée
   pour valider). Une partie sans aucun posé n'entre **jamais** au classement,
   quel que soit son temps de vol.
9. Un **hall of fame** de 100 entrées en `localStorage`, trié par temps de vol
   total **arrondi à la seconde** décroissant, puis par total de points
   croissant, avec remise à zéro confirmée.

Le tout en **pixel art 320 × 180 agrandi d'un facteur entier**, sur une palette
de **16 couleurs** figée par un design system commun au canvas et au DOM.

## Contraintes

- **Le moteur ne s'occupe que de la partie jouée** et ne connaît aucun type du
  jeu : aucun import de `@lem/game` dans `@lem/engine`. Écrans, menus, hall of
  fame, persistance, design system et **tout le dessin** sont dans le jeu. Le
  moteur dit *quand* dessiner, il ne dessine jamais.
- **Un seul sondage du clavier par image, un seul propriétaire du clavier.**
  `Scene.tick` appelle `input.poll()` en interne et `KeyboardInput.poll()` vide le
  tampon des fronts montants : deux consommateurs dans la même image et le second
  ne voit plus rien. Le gestionnaire d'écrans possède l'unique `KeyboardInput`,
  fait le seul `poll()`, et la `Scene` reçoit un adaptateur qui relit ce
  snapshot. Aucun écran ne crée son propre `KeyboardInput`.
- **Une demande de transition d'écran est consommée, jamais relue.** Les écrans
  sont des instances enregistrées une fois et réactivées par nom : le
  gestionnaire les lit par `prendTransition()`, qui rend la demande **et** la
  remet à `null`, et `sort()` efface toute demande en attente. Une demande
  laissée en place est rejouée au passage suivant, et les quatre écrans défilent
  seuls. Le nom et sa charge utile voyagent dans **une seule union
  discriminée** `Transition`, pas dans un `nom: string` doublé d'un `params`
  optionnel.
- **Le rendu ne consomme aucun tirage aléatoire.** Les scintillements et
  tremblements sont dérivés de `state.time`. Passer un générateur au dessin ferait
  dépendre la suite des tirages du nombre d'images affichées, et le déterminisme
  du terrain et des particules tomberait.
- **Zoom entier et coordonnées entières.** Le zoom ne prend que les valeurs 1, 2
  et 4 ; toute position monde passe par `versEcranPixel` et toute taille est
  multipliée par le zoom. Aucun `ctx.scale` lié à la caméra, aucune coordonnée
  fractionnaire au canvas : c'est ce qui garde la grille de pixels intacte.
- **Le facteur d'agrandissement de la surface se compte en pixels d'écran, pas
  en pixels CSS.** `facteurEchelle` (T5) multiplie la mesure de fenêtre par
  `devicePixelRatio` : c'est l'écran qui affiche les carrés. Un facteur entier en
  pixels CSS donne un nombre fractionnaire de pixels d'écran dès que la densité
  l'est — ×3 à 1,5 dppx fait 4,5 — et `image-rendering: pixelated` duplique alors
  une colonne sur deux plus large que ses voisines. La taille de boîte rendue au
  CSS est donc, elle, possiblement fractionnaire : l'invariant tenu est que son
  produit par la densité soit entier.
- **État immuable** : chaque tick produit un nouveau `GameState`. Les entités ne
  se mutent pas. Les reducers sont purs et idempotents. Aucun état de simulation
  hors du `GameState` — y compris les accumulateurs (débit de particules).
- **Aucun `Math.random` dans la logique de jeu** : tout tirage passe par le
  générateur à graine du moteur. Seule la graine initiale d'une partie vient de
  l'extérieur.
- **TypeScript strict** tel que configuré dans `tsconfig.base.json` :
  `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`,
  `noFallthroughCasesInSwitch`. Pas de `any`, pas de `@ts-ignore`.
- **Français partout** : noms de fichiers en anglais comme aujourd'hui, mais
  commentaires, messages et documentation en français, avec les accents.
- **Aucun asset externe** : ni image, ni police, ni son. Tout est dessiné ou
  généré par le code. Pas de dépendance runtime ajoutée. Pas d'outillage qui
  dépende de la version de Node installée.
- **Aucun son en v1** (décision du cahier des charges).
- **Valeurs de réglage centralisées** dans `packages/game/src/constants.ts` —
  jamais de nombre magique disséminé dans les règles.
- Les tests existants (33 dans le moteur, 4 dans le jeu) sont **intouchables** :
  aucun ne doit être supprimé, désactivé ni affaibli. Après T1–T5 le dépôt en
  comptait 116 dans le moteur et 73 dans le jeu ; **après T6–T9, 116 dans le
  moteur et 224 dans le jeu**, les 37 d'origine inclus et non modifiés. T9 a
  adapté `screens/manager.test.ts` de façon **strictement mécanique** — une
  fabrique `versFin()` pour la charge utile de la variante `fin`, un type de
  globals local — sans toucher une assertion : ses 15 tests passent inchangés.
- **`packages/game` n'a pas `@types/node`** : un test ne peut donc pas lire le
  source d'un fichier (`import { readFileSync } from "node:fs"` échoue au
  `typecheck`), et ajouter la dépendance sortirait du périmètre. Les gardes du
  genre « aucun `Math.random` dans ce fichier », « aucune couleur littérale » se
  prouvent donc par le **comportement** : piège qui lève à la place de
  `Math.random`, faux contexte canvas qui collecte les couleurs posées. Vaut pour
  T6, T9 et surtout T10, dont la fiche prévoyait deux tests de lecture de source.

## Découpage

| Tâche | Fiche | Rôle | Dépend de |
|---|---|---|---|
| T1 | `task-1-design-system.md` | Palette 16 couleurs, police bitmap, tokens canvas + CSS depuis une source unique | — |
| T2 | `task-2-moteur-rng.md` | Générateur aléatoire à graine dans le moteur | — |
| T3 | `task-3-moteur-heightfield.md` | Outils de champ d'altitudes dans le moteur | — |
| T4 | `task-4-moteur-camera-renderer.md` | Caméra à zoom entier, primitives de dessin, clavier robuste au blur et aux raccourcis à modificateur | — |
| T5 | `task-5-surface-et-ecrans.md` | Surface pixel, sondage clavier unique, machine à écrans | T1, T4 |
| T6 | `task-6-terrain.md` | Relief procédural, secteurs accidentés, plateformes, point de départ | T2, T3 |
| T7 | `task-7-lem.md` | Entité LEM : assiette, 6 crans de poussée, carburant, physique | T6 |
| T8 | `task-8-atterrissage.md` | Contact de la coque, verdict posé / crash | T3, T6, T7 |
| T9 | `task-9-manche-score.md` | Manches, vies, pause, difficulté progressive, score golf | T2, T6, T7, T8 |
| T10 | `task-10-rendu-jeu.md` | Dessin de l'écran de jeu : relief, LEM, flamme, drapeau, étoiles, zoom entier | T1, T4, T5, T6, T7, T9 |
| T11 | `task-11-hud.md` | Tableau de bord chiffré avec seuils colorés | T1, T3, T9, T10 |
| T12 | `task-12-particules.md` | Particules rhabillées : explosion, poussière, gaz du moteur | T2, T9, T10 |
| T13 | `task-13-accueil.md` | Écran d'accueil DOM, fond animé, choix du niveau | T1, T5, T10 |
| T14 | `task-14-hof-logique.md` | Stockage et classement du hall of fame, sans écran | T9 |
| T15 | `task-15-fin-de-partie.md` | Récapitulatif et saisie du trigramme à l'arcade | T1, T5, T9, T14 |
| T16 | `task-16-hof-ecran.md` | Écran des 100 meilleures parties, remise à zéro | T1, T5, T13, T14, T15 |
| T17 | `task-17-equilibrage-doc.md` | Équilibrage des réglages et mise à jour de la documentation | tout |

L'ordre du tableau est l'ordre d'exécution : les tâches sont jouées en série.

**T1 à T9 sont faites.** Les fondations (T1–T5) : design system (palette générée,
police bitmap 5 × 7), `Rng` et `heightfield` dans le moteur, `Camera` et les cinq
primitives de dessin, `KeyboardInput` corrigé, surface pixel et machine à écrans
avec ses quatre bouchons. Le gameplay (T6–T9) : `terrain.ts` (relief procédural,
secteurs, plateforme cible, replis, départ), `entities/Lander.ts` (assiette, six
crans, carburant, gravité), `landing.ts` (coque, verdict, causes de crash),
`events.ts`, `state.ts` (partie, manche, `Globals`, `ResultatPartie`),
`difficulty.ts`, `score.ts`, `rules.ts` (trois règles de tick) et `reducers.ts`
(cinq reducers de scène, trois reducers de pause appliqués par l'écran).

**Rien n'est encore dessiné** : le bouchon canvas de `main.ts` reste en place, il
n'y a ni `screens/game.ts`, ni `render/draw.ts`, ni HUD. C'est le run C.

Les fiches T1 à T9 ont été mises à jour avec les signatures et les valeurs
réellement retenues — les lire avant d'attaquer T10. Trois écarts du run B
touchent directement la suite : les tests ne peuvent pas lire les sources (voir
les contraintes), `Transition` porte maintenant `params: ResultatPartie` sur sa
variante `fin`, et `Lander` porte un champ `inerte` qui gèle son `step` après le
verdict.

La logique du hall of fame (T14) passe **avant** les deux écrans qui l'utilisent
(T15, T16). C'est volontaire : faire les écrans d'abord obligerait à inventer une
injection de dépendance qui ne servirait qu'à contourner l'ordre des tâches.

## Inconnues à lever

- [x] **Lisibilité de la police bitmap 5 × 7** dans le HUD à 320 × 180. ~~Levée
      en T1 en dessinant la table complète et en affichant une ligne de test ; si
      c'est illisible, passer à 4 × 6 condensé ou 6 × 8, et le dire dans le report
      de fin.~~ **Levée en T1 : la table 5 × 7 est conservée**, ni repli en 4 × 6
      condensé, ni passage en 6 × 8. Contrôle visuel fait sur
      `ALTITUDE 0000 M`, puis sur les bouchons de T5 (échelle 2 pour un titre,
      échelle 1 pour une invite). La confirmation définitive viendra du HUD
      complet en T11, mais rien n'oblige à changer de grille.
- [ ] **Harmonie canvas / DOM sans police de fichier.** T1 tranche : police
      bitmap maison pour le canvas, `monospace` système à tailles multiples de
      8 px pour le DOM. Si l'écart visuel est trop fort, T13 peut rendre les
      titres DOM dans un petit canvas et le signaler.
      État après T5 : les deux typographies coexistent réellement à l'écran
      (bouchons DOM à 32 / 16 px sur `#ui`, bouchon `jeu` à la police bitmap sur
      `#game`) et la typographie DOM est posée sur la règle `#ui` de `style.css`
      — pas en variables CSS, faute de besoin. Rien de bloquant constaté ;
      l'arbitrage final reste à T13, écran complet sous les yeux.
- [ ] **Jouabilité des réglages chiffrés** (poussée max 4,0 m/s², consommation
      0,8 u/s par cran, réservoirs 140 / 122 / 104 u avec
      `CARBURANT_PENTE = 18`, dérive initiale 8 / 14 / 20 m/s). Posés pour être
      jouables, pas démontrés. T17 les réajuste et reporte les valeurs finales
      dans le cahier des charges.
      État après T9 : toutes ces valeurs sont dans `constants.ts` telles
      qu'annoncées, aucune n'a été retouchée à l'implémentation, et `Lander` comme
      `difficulty.ts` les respectent au chiffre près dans leurs tests. Mais rien
      n'est encore **joué** : il n'y a pas d'écran de jeu, donc pas une seconde de
      manette. L'inconnue reste entière.
- [ ] **Plafond de difficulté à 2,4** : l'arbitrage retenu veut qu'il reste
      **franchissable**, donc que le carburant y suffise encore à annuler la
      dérive et à freiner la chute — sur le **pire** terrain (chute de
      `TERRAIN_Y_MAX - DEPART_Y = 280` m), pas sur le meilleur. Tranché dans le
      plan : on garde 2,4 et on passe `CARBURANT_PENTE` de 25 à 18, ce qui donne
      96,8 u au plafond contre ≈ 83 u de besoin (marge 17 %). T17 le vérifie par
      le calcul et par le jeu.
      État après T9 : `DIFFICULTE_MAX = 2.4` et `CARBURANT_PENTE = 18` sont dans
      `constants.ts`, et `difficulty.test.ts` chiffre le réservoir au plafond —
      `toBeCloseTo(96.8, 10)`, `140 - 18 * 2.4` valant `96.80000000000001` en
      flottant. Le calcul de besoin (≈ 83 u) n'est **pas** encore vérifié par un
      test, et la vérification « par le jeu » attend l'écran. Inconnue toujours
      ouverte.
- [ ] **Contraste de rugosité du terrain** (`RUGOSITE_DOUCE = 0,15` contre
      `RUGOSITE_ACCIDENTEE = 1,6`, plus la passe de pics et de canyons) : le
      relief doit vraiment offrir des secteurs infranchissables et des secteurs
      posables. Vérifié statistiquement en T6, réajusté à l'œil en T17.
      `AMPLITUDE_INITIALE` est passée de 60 à 18 pour que la surface tienne dans
      la bande sans écrêtage — un écrêtage aux bornes fabriquait des mesas plates
      donc posables au milieu des secteurs accidentés. Cette baisse seule a rendu
      le relief trop plat à l'échelle du train : 49 % des abscisses d'un secteur
      accidenté acceptaient encore le LEM. `AMPLITUDE_DECROISSANCE` est donc
      passée de 0,55 à 0,70, ce qui remonte la dernière itération du point milieu
      de 0,27 à 1,5 m sans toucher à la macro-forme (la normalisation affine
      ramène de toute façon la surface dans la bande). Mesuré sur 200 graines à
      difficulté 2,4 : 10 % d'abscisses posables en secteur accidenté contre
      89 % en secteur doux, et `terrain.test.ts` borne désormais ces deux
      fractions.
- [ ] **Seuils de zoom et hystérésis** (40 / 60 et 16 / 24 m) : assez larges pour
      ne pas clignoter, assez serrés pour que la vue rapprochée arrive à temps,
      et **bornés par la demi-hauteur de vue du zoom visé** (45 m au zoom 2,
      22,5 m au zoom 4) pour que le sol ne sorte pas de l'écran au moment du
      saut. Réglés en T17.

## Vérification

Commande qui doit passer au vert à la fin de chaque tâche, depuis la racine du
dépôt :

```
yarn typecheck && yarn test && yarn build
```

Les tâches qui produisent du visuel (T5, T10 à T16) ajoutent un contrôle à la
main : `yarn dev`, puis vérifier à l'écran ce que dit la section « Fini quand » de
la fiche.

## Hors périmètre

- **Aucun son.** Le module audio d'Asteroids a été retiré ; on ne le remet pas.
- **Pas de manette, pas de tactile, pas de souris** : le jeu se joue aux quatre
  flèches, plus Entrée, Échap, `H` et `R`.
- **Pas de sauvegarde en ligne** ni de classement partagé : le hall of fame est
  local. On se contente d'une interface de stockage propre, sans client réseau.
- **Pas d'export / import** du hall of fame.
- **Pas de publication npm du moteur** : l'import reste en source directe.
- **Pas de refonte du moteur existant** : `GameLoop`, `Scene`, `GameState`,
  `Vector2` et `collision` ne sont pas retouchés. `KeyboardInput` ne reçoit que
  **deux** corrections, toutes deux en T4 : l'écouteur `blur`, et l'**ignorance
  des `keydown` porteurs de `ctrlKey`, `metaKey` ou `altKey`** — sans quoi
  `Cmd+R` ne recharge pas la page et vaut un appui sur la commande `raz` du hall
  of fame. On ajoute des outils à côté.
- **Pas de multi-résolution fractionnaire** : l'agrandissement est entier **en
  pixels d'écran** (la boîte CSS, elle, peut mesurer 2,666… px par pixel de jeu
  sur un écran à 1,5 dppx), et si la fenêtre est plus petite que 320 × 180 on
  reste au facteur 1.
- **Pas de mode replay** ni de partage de graine, même si le générateur à graine
  le permettrait.
