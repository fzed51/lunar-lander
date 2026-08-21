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
  (T3).
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
   - `PLATEFORME_LARGEUR_BASE = 24`, `PLATEFORME_LARGEUR_MIN = 10` ;
   - `REPLIS = { min: 2, max: 4 }`, `REPLI_LARGEUR = { min: 12, max: 16 }`,
     `REPLI_DISTANCE_MIN = 150` (m de la plateforme cible) ;
   - `PROBA_SECTEUR_ACCIDENTE_BASE = 0.25`,
     `PROBA_SECTEUR_ACCIDENTE_PENTE = 0.15`,
     `PROBA_SECTEUR_ACCIDENTE_MAX = 0.75` ;
   - `DEPART_DISTANCE = { min: 250, max: 400 }` (m de la cible).
2. Créer `packages/game/src/terrain.ts` exportant :
   - `SecteurTerrain` : `{ xDebut, xFin, accidente: boolean }` ;
   - `Terrain` : `hf: Heightfield`, `secteurs`, `cible: { x, y, largeur }`,
     `replis: readonly { x, largeur }[]`,
     `depart: { x: number; sens: 1 | -1 }` ;
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
      touchent pas les bords du monde. Largeur
      `max(PLATEFORME_LARGEUR_MIN, PLATEFORME_LARGEUR_BASE - 3 * difficulte)`.
      Aplatir les échantillons couverts à la **médiane** de leurs valeurs, et
      poser la cible au centre.
   10. **Replis** : `REPLIS` plateaux supplémentaires de `REPLI_LARGEUR`, dans
       d'autres secteurs non accidentés, à plus de `REPLI_DISTANCE_MIN` de la
       cible, aplatis de la même façon. Ils rendent vrai le « s'y rabattre est un
       choix sûr mais coûteux » du cahier des charges ; sans eux, le joueur n'a
       aucune alternative et le score n'est plus un arbitrage.
   11. **Départ** : `depart.x` à une distance tirée dans `DEPART_DISTANCE` de la
       cible, du côté qui laisse la place dans le monde ; `depart.sens` est le
       signe qui va **vers** la cible. La dérive initiale (T9) prend ce signe.
       Sans ça, une manche sur deux commence en s'éloignant du drapeau et le
       score est subi plutôt que piloté.
   12. Renvoyer le `Terrain`.

## Gardes et cas limites

- **Déterminisme** : même graine et même difficulté → terrain identique. C'est la
  garde principale ; sans elle, rien n'est testable.
- **Aucun `Math.random`** dans le fichier. Un test lit le source et échoue s'il en
  trouve un.
- Difficulté hors plage (négative, très grande) : probabilités et largeurs
  restent dans leurs bornes, la plateforme ne descend pas sous
  `PLATEFORME_LARGEUR_MIN`.
- **Aucun secteur doux disponible** : impossible par la mixité forcée. Ce chemin
  ne doit pas être « géré » par un `null` : une manche sans plateforme est
  injouable.
- Pics et canyons **confinés aux secteurs accidentés** : une aiguille au milieu
  de la plateforme cible rendrait la manche ingagnable. La passe de pics tourne
  **avant** l'aplatissement des plateformes, et l'aplatissement a donc le dernier
  mot.
- Plateformes et replis **ne débordent pas** de leur secteur ni du monde, et ne se
  chevauchent pas entre eux.
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
- `denivele` sur la largeur de la plateforme vaut 0.
- **Chaque repli est posable** (`estPosable` vrai en son centre), sur
  200 graines, et se trouve à plus de 150 m de la cible.
- Un secteur accidenté contient au moins une abscisse **non posable**, et son
  dénivelé moyen est nettement supérieur à celui d'un secteur doux (comparaison
  sur 50 graines).
- Un secteur doux respecte `PENTE_MAX_DOUCE` partout après l'adoucissement.
- `depart.x` est à 250–400 m de la cible, et `depart.sens` pointe vers elle.
- Difficulté 0 et difficulté 4 : la largeur de plateforme suit la formule et le
  plancher.
- Aucun `Math.random` dans `terrain.ts`.

## Fini quand

- [ ] `genereTerrain` est pur, déterministe, sans `Math.random`.
- [ ] Le relief mêle du doux **posable** et de l'accidenté **infranchissable**.
- [ ] La cible, les replis et le point de départ sont garantis, pas espérés.
- [ ] Les réglages sont dans `constants.ts`, commentés, avec leurs unités.
- [ ] La commande de vérification du README du plan passe au vert.
