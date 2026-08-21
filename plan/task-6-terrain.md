---
id: T6
titre: Génération procédurale du relief lunaire, secteurs accidentés, plateformes
fichiers: packages/game/src/terrain.ts, packages/game/src/terrain.test.ts, packages/game/src/constants.ts
sensible: false
---

# T6 — Terrain procédural

## Objectif

Produire, à partir d'une graine et d'une difficulté, un relief lunaire
déterministe qui mêle secteurs doux et secteurs franchement accidentés, qui porte
une plateforme plate sous le drapeau cible, quelques replis posables ailleurs, et
qui désigne le point de départ du LEM.

## Ce qui existe

- `@lem/engine` fournit `createRng`, `melangeGraine` (T2) et les outils
  `Heightfield` : `surfaceEn`, `penteEn`, `denivele`, `souLeSol`, `penetration`
  (T3). Hors des bornes du champ **et sur les bornes elles-mêmes**, `surfaceEn`
  rend la valeur du bord et `penteEn` rend **0** : le relief est prolongé plat,
  et la pente reste la dérivée exacte de la surface (T3).
- `packages/game/src/constants.ts` porte `PIXEL` et `MOON_GRAVITY`.
- Aucun terrain nulle part.
- Convention de repère (T3) : `y` croît **vers le bas**. Une crête a donc un `y`
  **plus petit** qu'un fond de cratère, et `TERRAIN_Y_MIN` désigne l'altitude la
  plus **haute**. À écrire en tête de fichier : c'est la source d'erreur numéro
  un de la suite du chantier.

## À faire

1. Ajouter dans `constants.ts` les réglages du monde et **la géométrie du LEM**,
   commentés avec leurs unités. La géométrie est définie ici, et non en T7, parce
   que `estPosable` en a besoin et que T6 passe avant :
   - `MONDE = { largeur: 1280, hauteur: 420 }` (mètres ; 1 m = 1 px à zoom 1) ;
   - `TERRAIN_PAS = 5` (mètres entre échantillons → 257 échantillons) ;
   - `TERRAIN_Y_MIN = 270`, `TERRAIN_Y_MAX = 400` (bornes de la surface) ;
   - `TERRAIN_SECTEURS = 8` (160 m et 32 échantillons par secteur) ;
   - `LEM = { largeurTrain: 8, hauteur: 7, rayon: 4 }` (mètres) ;
   - `SEUIL_PLATITUDE = 1` (m de dénivelé toléré sous la largeur du train) ;
   - `RUGOSITE_DOUCE = 0.15`, `RUGOSITE_ACCIDENTEE = 1.6` ;
   - `AMPLITUDE_INITIALE = 60`, `AMPLITUDE_DECROISSANCE = 0.55` ;
   - `PENTE_MAX_DOUCE = 0.3` (dénivelé maximal par pas dans un secteur doux,
     soit 1,5 m sur 5 m) ;
   - `PICS_PAR_SECTEUR = { min: 2, max: 5 }`, `PIC_HAUTEUR = { min: 12, max: 28 }` ;
   - `CANYON_LARGEUR_ECHANTILLONS = { min: 2, max: 3 }`,
     `CANYON_PROFONDEUR = { min: 20, max: 40 }` ;
   - **Les plateaux se dimensionnent en échantillons, pas en mètres** : c'est
     l'aplatissement qui porte sur des échantillons, une largeur en mètres mal
     alignée ne couvre pas ce qu'elle annonce. `ETENDUE_PLATE_MIN =
     LEM.largeurTrain + 2 * TERRAIN_PAS` = 18 m est l'étendue **réellement
     plate** minimale à garantir : la largeur du train, plus un échantillon
     entier de marge de chaque côté, pour que `denivele` sur
     `[x - 4, x + 4]` n'interpole jamais vers un voisin non aplati ;
   - `PLATEFORME_ECHANTILLONS_BASE = 9` (soit 40 m d'étendue plate),
     `PLATEFORME_ECHANTILLONS_MIN = 5` (20 m ≥ 18 m) — les deux **impairs**, pour
     que la cible tombe sur l'échantillon du milieu ;
   - `REPLIS = { min: 2, max: 4 }`, `REPLI_ECHANTILLONS = { min: 5, max: 7 }`
     (20 à 30 m d'étendue plate, valeurs impaires), `REPLI_DISTANCE_MIN = 150`
     (m de la plateforme cible). L'ancien `REPLI_LARGEUR = { min: 12, max: 16 }`
     en mètres était intenable : un repli de 12 m mal aligné ne couvre que
     2 échantillons, soit 5 m réellement plats pour un train de 8 m ;
   - `PROBA_SECTEUR_ACCIDENTE_BASE = 0.25`,
     `PROBA_SECTEUR_ACCIDENTE_PENTE = 0.15`,
     `PROBA_SECTEUR_ACCIDENTE_MAX = 0.75` ;
   - `DEPART_DISTANCE = { min: 250, max: 400 }` (m de la cible).
2. Créer `packages/game/src/terrain.ts` exportant :
   - `SecteurTerrain` : `{ xDebut, xFin, accidente: boolean }` ;
   - `Terrain` : `hf: Heightfield`, `secteurs`, `cible: { x, y, largeur }`,
     `replis: readonly { x, largeur }[]`,
     `depart: { x: number; sens: 1 | -1 }`.
     `cible.x` et `repli.x` tombent **exactement sur un échantillon**, et
     `largeur` est l'**étendue réellement aplatie** — `(k - 1) * TERRAIN_PAS`
     pour `k` échantillons aplatis — et non la largeur tirée. Publier la largeur
     nominale mentirait à `estPosable`, au liseré de repli du rendu (T10) et à
     l'invariant de T17, qui compareraient tous une valeur plus grande que la
     zone plate ;
   - `genereTerrain(graine: number, difficulte: number): Terrain` ;
   - `estPosable(terrain, x): boolean` — vrai si
     `denivele(hf, x - LEM.largeurTrain / 2, x + LEM.largeurTrain / 2) <= SEUIL_PLATITUDE`.
3. Algorithme de `genereTerrain`, dans cet ordre exact :
   1. `rng = createRng(graine)`.
   2. Découper en `TERRAIN_SECTEURS` secteurs égaux. Chaque secteur est accidenté
      avec la probabilité
      `min(PROBA_SECTEUR_ACCIDENTE_MAX, BASE + PENTE * difficulte)`.
   3. **Forcer la mixité** : au moins 2 accidentés et 2 doux ; les bascules
      nécessaires sont tirées au `rng`, jamais prises dans l'ordre des indices.
   4. Construire un **champ de rugosité continu** `rugositeEn(x)` : la valeur du
      secteur (`RUGOSITE_DOUCE` ou `RUGOSITE_ACCIDENTEE`) est portée par son
      **centre**, et interpolée linéairement entre centres voisins. Sans cette
      interpolation, la modulation par secteur ne mord pas : aux trois premières
      itérations du point milieu il n'y a que 1, 2 puis 4 points milieux pour
      8 secteurs, la macro-forme est donc décidée par le seul secteur qui
      possède `x = 640`, et il ne reste plus que 10 m d'amplitude quand la
      modulation devient réellement locale.
   5. Générer la surface par **déplacement du point milieu**, 8 itérations
      (257 échantillons), amplitude `AMPLITUDE_INITIALE` multipliée par
      `AMPLITUDE_DECROISSANCE` à chaque itération, chaque déplacement multiplié
      par `rugositeEn(x du point milieu)`.
   6. **Passe de pics et de canyons** sur les secteurs accidentés uniquement :
      `PICS_PAR_SECTEUR` aiguilles d'un seul échantillon remontées de
      `PIC_HAUTEUR`, et un canyon de `CANYON_LARGEUR_ECHANTILLONS` échantillons
      creusé de `CANYON_PROFONDEUR`. C'est cette passe qui donne les crêtes
      déchiquetées et les canyons étroits du cahier des charges ; le déplacement
      de point milieu seul ne produit que du vallonné.
   7. **Passe d'adoucissement** sur les secteurs doux : écrêter le dénivelé entre
      échantillons consécutifs à `PENTE_MAX_DOUCE * TERRAIN_PAS`, en plusieurs
      balayages jusqu'à stabilité. Sans elle, un secteur « doux » peut reposer
      sur une pente macro de 40°, et il n'existe alors aucun sol posable en
      dehors de la plateforme forcée.
   8. Écrêter chaque valeur dans `[TERRAIN_Y_MIN, TERRAIN_Y_MAX]`.
   9. **Plateforme cible** : un secteur **doux** tiré au `rng` parmi ceux qui ne
      touchent pas les bords du monde. Nombre d'échantillons
      `k = max(PLATEFORME_ECHANTILLONS_MIN, PLATEFORME_ECHANTILLONS_BASE - 2 * Math.floor(difficulte / 2))`
      — on retire **deux** échantillons (10 m) par tranche de 2 points de
      difficulté, ce qui garde `k` impair sans arrondi à rattraper : 9 (40 m)
      jusqu'à la difficulté 2, 7 (30 m) de 2 à 4, puis le plancher de 5 (20 m).
      Tirer l'indice de l'échantillon
      **central** dans le secteur, en gardant `(k - 1) / 2` échantillons de part
      et d'autre à l'intérieur du secteur, puis aplatir ces `k` échantillons à la
      **médiane** de leurs valeurs. Poser `cible.x` sur l'abscisse de
      l'échantillon central, `cible.y` sur la valeur aplatie, et
      `cible.largeur = (k - 1) * TERRAIN_PAS`.
   10. **Replis** : `REPLIS` plateaux supplémentaires de `REPLI_ECHANTILLONS`
       échantillons (nombre impair), **jamais plus larges que la plateforme
       cible** (`min(tirage, k)`) pour tenir le « plus étroits » du cahier des
       charges, dans d'autres secteurs non accidentés, à plus de
       `REPLI_DISTANCE_MIN` de la cible, centrés sur un échantillon et aplatis de
       la même façon, avec la même publication de largeur. Ils rendent
       vrai le « s'y rabattre est un choix sûr mais coûteux » du cahier des
       charges ; sans eux, le joueur n'a aucune alternative et le score n'est
       plus un arbitrage.
   11. **Raccord des bords de plateau** : réappliquer l'écrêtage de pente de
       l'étape 7 **vers l'extérieur seulement**, en gelant les échantillons
       aplatis. L'aplatissement à la médiane vient après la passe
       d'adoucissement, donc il peut laisser une marche de plus de
       `PENTE_MAX_DOUCE * TERRAIN_PAS` entre le dernier échantillon du plateau et
       son voisin — ce qui casse à la fois la promesse « un secteur doux respecte
       `PENTE_MAX_DOUCE` partout » et la lecture visuelle du plateau. Les
       échantillons du plateau ne sont **jamais** retouchés par ce raccord, sinon
       la zone plate se remet à pencher. Borner le nombre de balayages comme à
       l'étape 7, puis réécrêter dans `[TERRAIN_Y_MIN, TERRAIN_Y_MAX]`.
   12. **Départ** : `depart.x` à une distance tirée dans `DEPART_DISTANCE` de la
       cible, du côté qui laisse la place dans le monde ; `depart.sens` est le
       signe qui va **vers** la cible. La dérive initiale (T9) prend ce signe.
       Sans ça, une manche sur deux commence en s'éloignant du drapeau et le
       score est subi plutôt que piloté.
   13. Renvoyer le `Terrain`.

## Gardes et cas limites

- **Déterminisme** : même graine et même difficulté → terrain identique. C'est la
  garde principale ; sans elle, rien n'est testable.
- **Aucun `Math.random`** dans le fichier. Un test lit le source et échoue s'il en
  trouve un.
- Difficulté hors plage (négative, très grande) : probabilités et largeurs
  restent dans leurs bornes, la plateforme ne descend pas sous
  `PLATEFORME_ECHANTILLONS_MIN` échantillons, donc jamais sous
  `ETENDUE_PLATE_MIN`.
- **Étendue plate suffisante** : `cible.largeur` et la largeur de chaque repli
  valent au moins `ETENDUE_PLATE_MIN` (18 m). C'est la garde qui empêche un
  plateau annoncé posable et refusé en `sol-accidente` par `evalueContact` (T8),
  parce que `denivele` sur `[x - 4, x + 4]` mordait sur un voisin non aplati.
- **Aucun secteur doux disponible** : impossible par la mixité forcée. Ce chemin
  ne doit pas être « géré » par un `null` : une manche sans plateforme est
  injouable.
- Pics et canyons **confinés aux secteurs accidentés** : une aiguille au milieu
  de la plateforme cible rendrait la manche ingagnable. La passe de pics tourne
  **avant** l'aplatissement des plateformes, et l'aplatissement a donc le dernier
  mot.
- Plateformes et replis **ne débordent pas** de leur secteur ni du monde, et ne se
  chevauchent pas entre eux. Un secteur fait 32 échantillons : un plateau de 7 en
  tient largement, la contrainte porte sur le tirage de l'échantillon central.
- Écrêtage : aucune valeur hors `[TERRAIN_Y_MIN, TERRAIN_Y_MAX]`, y compris après
  les passes de pics, de canyons et d'aplatissement.
- `depart.x` reste à plus d'une demi-vue du bord du monde, sinon le LEM
  commence hors limites.
- Le nombre d'échantillons doit valoir exactement `2^8 + 1 = 257`, pour que le
  déplacement du point milieu tombe juste. Test dédié.
- La passe d'adoucissement doit **terminer** : borner le nombre de balayages et
  vérifier la convergence, plutôt qu'un `while` sans issue.

## Tests attendus

- Deux appels de même graine et même difficulté donnent des surfaces strictement
  égales ; deux graines différentes donnent des surfaces différentes.
- 257 échantillons, pas de 5 m, largeur couverte de 1280 m.
- Toutes les valeurs sont dans `[270, 400]`.
- Au moins 2 secteurs accidentés et 2 secteurs doux, sur 200 graines.
- La cible tombe toujours dans un secteur doux, jamais dans le premier ni le
  dernier, et `estPosable(terrain, terrain.cible.x)` est **vrai** sur
  200 graines.
- `denivele(hf, cible.x - cible.largeur / 2, cible.x + cible.largeur / 2)` vaut
  **0** : la largeur publiée est l'étendue réellement aplatie, donc les deux
  bornes tombent sur des échantillons plats.
- `cible.largeur >= LEM.largeurTrain + 2 * TERRAIN_PAS` sur 200 graines, et
  `cible.x` tombe exactement sur un échantillon (`(cible.x - hf.x0) % TERRAIN_PAS === 0`).
- **Chaque repli est posable** (`estPosable` vrai en son centre), sur
  200 graines, se trouve à plus de 150 m de la cible, et son `denivele` sur sa
  largeur publiée vaut 0.
- Un secteur accidenté contient au moins une abscisse **non posable**, et son
  dénivelé moyen est nettement supérieur à celui d'un secteur doux (comparaison
  sur 50 graines).
- Un secteur doux respecte `PENTE_MAX_DOUCE` partout après l'adoucissement **et
  après le raccord des bords de plateau** — y compris sur les deux échantillons
  qui bordent un plateau.
- `depart.x` est à 250–400 m de la cible, et `depart.sens` pointe vers elle.
- Largeur de plateforme : difficulté 0 → 9 échantillons, `cible.largeur === 40` ;
  difficulté 2,4 → 7 échantillons, 30 m ; difficulté 4 → plancher à
  5 échantillons, 20 m. La largeur publiée suit la formule **et** le plancher,
  jamais sous `ETENDUE_PLATE_MIN`, et `k` reste impair.
- Aucun `Math.random` dans `terrain.ts`.

## Fini quand

- [ ] `genereTerrain` est pur, déterministe, sans `Math.random`.
- [ ] Le relief mêle du doux **posable** et de l'accidenté **infranchissable**.
- [ ] La cible, les replis et le point de départ sont garantis, pas espérés.
- [ ] Les plateaux sont dimensionnés en **échantillons**, centrés sur un
      échantillon, et la largeur publiée est l'étendue réellement aplatie — au
      moins `LEM.largeurTrain + 2 * TERRAIN_PAS`.
- [ ] Les réglages sont dans `constants.ts`, commentés, avec leurs unités.
- [ ] La commande de vérification du README du plan passe au vert.
