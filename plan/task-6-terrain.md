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
   - `AMPLITUDE_INITIALE = 18`, `AMPLITUDE_DECROISSANCE = 0.7` (m ; amplitude
     du déplacement de la **première** itération du point milieu, avant
     modulation par la rugosité, et facteur appliqué ensuite à chaque
     itération). Ce qui se dimensionne ici n'est **pas** la somme des amplitudes
     — la normalisation affine de l'étape 6 ramène de toute façon la surface dans
     la bande de travail sans rien écrêter, donc sans mesa plate — mais le
     **rapport entre la dernière amplitude et les premières** : c'est lui qui
     décide si le relief est tourmenté à l'échelle du train (8 m, deux pas) ou
     seulement à l'échelle du secteur. À 0,55 la dernière itération ne déplaçait
     plus que `18 * 0.55^7` ≈ 0,27 m, soit 0,44 m à `RUGOSITE_ACCIDENTEE`, très
     en dessous de `SEUIL_PLATITUDE` : mesuré, 49 % des abscisses d'un secteur
     accidenté restaient posables, là où le cahier des charges (§5) promet qu'on
     ne peut pas se poser. À 0,70 elle vaut ≈ 1,5 m, soit 2,4 m en accidenté, et
     la mesure descend à 10 % contre 89 % en secteur doux — les secteurs doux
     restant plats grâce à la passe d'adoucissement, qui les écrête à
     `PENTE_MAX_DOUCE` ;
   - `PENTE_MAX_DOUCE = 0.3` (dénivelé maximal par pas dans un secteur doux,
     soit 1,5 m sur 5 m) ;
   - `PICS_PAR_SECTEUR = { min: 2, max: 5 }`, `PIC_HAUTEUR = { min: 12, max: 28 }` ;
   - `CANYON_LARGEUR_ECHANTILLONS = { min: 2, max: 3 }`,
     `CANYON_PROFONDEUR = { min: 20, max: 40 }` ;
   - `TERRAIN_Y_TRAVAIL_MIN = TERRAIN_Y_MIN + PIC_HAUTEUR.max` (298) et
     `TERRAIN_Y_TRAVAIL_MAX = TERRAIN_Y_MAX - CANYON_PROFONDEUR.max` (360) :
     bande dans laquelle vit la surface **avant** la passe de pics et de canyons.
     Les deux marges sont réservées pour que la plus haute aiguille et le plus
     profond canyon tiennent dans `[TERRAIN_Y_MIN, TERRAIN_Y_MAX]` sans être
     rognés : une aiguille écrêtée à la borne, à égalité avec ses voisins, n'est
     plus une aiguille ;
   - `TERRAIN_Y_DEPART = { min: 318, max: 340 }` : intervalle où sont tirées les
     **deux valeurs d'extrémité** de la surface (échantillons 0 et 256). Centré
     dans la bande de travail, pour que le déplacement du point milieu ait de la
     place des deux côtés. Sans cette valeur explicite, l'implémentation part
     d'un bord arbitraire et le budget d'amplitude ci-dessus ne veut plus rien
     dire ;
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
   - `REPLIS = { min: 2, max: 4 }` (**nombre souhaité**, pas garanti : la
     géométrie peut n'offrir qu'une place, voir l'étape 11),
     `REPLI_ECHANTILLONS = { min: 5, max: 7 }`
     (20 à 30 m d'étendue plate, valeurs impaires),
     `REPLI_DISTANCE_PALIERS = [150, 100, 60]` (m de la plateforme cible ; on
     descend d'un palier quand aucun centre n'est admissible, plutôt que de
     rendre une liste vide — l'ancien `REPLI_DISTANCE_MIN = 150` seul était
     parfois géométriquement infaisable ; ces paliers ne servent qu'à la distance
     à la **cible**), `REPLI_MARGE_RACCORD = 30` (m laissés entre les bords
     aplatis de deux replis, l'écart minimal entre leurs centres valant donc
     « largeur aplatie + cette marge » : c'est la contrainte de non-chevauchement
     de l'étape 11.3, plus la place dont le raccord de l'étape 12 a besoin pour
     rattraper la différence d'altitude entre deux plateaux gelés. Réutiliser là
     le palier de la cible réservait 150 m à chaque repli dans un secteur de
     160 m et ramenait un tiers des manches difficiles à un seul plateau de
     secours). L'ancien `REPLI_LARGEUR = { min: 12, max: 16 }`
     en mètres était intenable : un repli de 12 m mal aligné ne couvre que
     2 échantillons, soit 5 m réellement plats pour un train de 8 m ;
   - `PROBA_SECTEUR_ACCIDENTE_BASE = 0.25`,
     `PROBA_SECTEUR_ACCIDENTE_PENTE = 0.15`,
     `PROBA_SECTEUR_ACCIDENTE_MAX = 0.75` ;
   - `DEPART_DISTANCE = { min: 250, max: 400 }` (m de la cible) ;
   - `ECRETAGE_BALAYAGES_MAX = 64` (borne du nombre de balayages d'un écrêtage
     de pente, étapes 8 et 12). Ajoutée au fil de l'implémentation : les gardes
     ci-dessous exigent une borne plutôt qu'un `while` sans issue, et la règle
     « valeurs de réglage centralisées » interdit de l'écrire en dur dans la
     boucle. Mesuré : l'écrêtage converge en 2 ou 3 balayages, la borne ne sert
     que de filet.
   - `DIFFICULTE_MAX` **n'est pas** ajoutée ici : elle appartient à T9 (logique
     de manche). `terrain.test.ts` la redéclare localement à 2,4, avec le
     commentaire qui dit d'où viendra la vraie valeur.
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
   - Deux exports **de plus**, retenus à l'implémentation parce que deux tests
     exigés plus bas n'ont pas d'autre prise, plus le type qu'ils échangent :
     - `Plateau = { centre: number; echantillons: number; y: number }` — une zone
       aplatie décrite en **échantillons** (index du centre, nombre
       d'échantillons impair, valeur `y` commune) ;
     - `construitSurfaceDeBase(graine, difficulte): { rng: Rng; secteurs: SecteurTerrain[]; surface: number[] }`
       — les étapes 1 à 6, pour le test « la surface **avant** la passe de pics
       tient dans la bande de travail ». Elle rend **aussi le `rng` en cours** et
       c'est le vrai chemin d'exécution de `genereTerrain`, pas une copie du
       pipeline : la suite de tirages reste unique, donc le déterminisme est
       celui du jeu et non celui d'un double ;
     - `poseReplis(rng, secteurs, surface, secteurCible, plateauCible): Plateau[]`
       — pour le test du pire cas géométrique, qui doit poser lui-même les
       secteurs et la cible.
3. Algorithme de `genereTerrain`, dans cet ordre exact :
   1. `rng = createRng(graine)`.
   2. Découper en `TERRAIN_SECTEURS` secteurs égaux. Chaque secteur est accidenté
      avec la probabilité
      `min(PROBA_SECTEUR_ACCIDENTE_MAX, BASE + PENTE * difficulte)`, la
      difficulté étant d'abord **assainie** : `Math.max(0, difficulte)`, et 0 si
      elle n'est pas finie. Sans ça une difficulté négative sortirait de la plage
      annoncée par la garde « difficulté hors plage » plus bas ; le même
      assainissement sert à l'étape 10 pour la largeur de plateforme.
   3. **Forcer la mixité**, dans cet ordre :
      1. s'il n'existe **aucun secteur doux d'indice 1 à 6**, basculer en doux un
         secteur tiré au `rng` **parmi les indices 1 à 6**. C'est là, et nulle
         part ailleurs, que l'étape 10 peut poser la plateforme cible : garantir
         « 2 doux sur les 8 » ne garantit rien pour elle, les deux seuls doux
         pouvant être 0 et 7. À `difficulte = 2.4` la probabilité d'un
         accidenté est plafonnée à 0,75 et les six secteurs intérieurs sortent
         tous accidentés environ une manche sur 125 : le cas n'est pas
         théorique. Ce secteur doux intérieur est ensuite **gelé** — les
         bascules suivantes ne le retouchent pas ;
      2. compléter jusqu'à **au moins 2 doux et au moins 2 accidentés** sur les
         8 secteurs, les bascules étant tirées au `rng` parmi les secteurs **non
         gelés**, jamais prises dans l'ordre des indices. Le second doux sert de
         réserve aux replis de l'étape 11.
   4. Construire un **champ de rugosité continu** `rugositeEn(x)` : la valeur du
      secteur (`RUGOSITE_DOUCE` ou `RUGOSITE_ACCIDENTEE`) est portée par son
      **centre**, et interpolée linéairement entre centres voisins. Sans cette
      interpolation, la modulation par secteur ne mord pas : aux trois premières
      itérations du point milieu il n'y a que 1, 2 puis 4 points milieux pour
      8 secteurs, la macro-forme est donc décidée par le seul secteur qui
      possède `x = 640`, et il ne reste plus que 10 m d'amplitude quand la
      modulation devient réellement locale.
   5. Générer la surface par **déplacement du point milieu**, 8 itérations
      (257 échantillons). Les deux valeurs d'extrémité (échantillons 0 et 256)
      sont tirées dans `TERRAIN_Y_DEPART`. Chaque point milieu prend la
      **moyenne de ses deux voisins**, plus un déplacement tiré **uniformément
      dans `[-amplitude, +amplitude]`** et multiplié par `rugositeEn(x du point
      milieu)` ; `amplitude` part de `AMPLITUDE_INITIALE` et est multipliée par
      `AMPLITUDE_DECROISSANCE` à chaque itération. La convention de tirage est
      écrite ici parce que `±amplitude` et `±amplitude / 2` donnent deux reliefs
      d'ampleur double l'un de l'autre, et que tout le dimensionnement de la
      bande en dépend.
   6. **Normalisation dans la bande de travail** : si le minimum ou le maximum de
      la surface sort de `[TERRAIN_Y_TRAVAIL_MIN, TERRAIN_Y_TRAVAIL_MAX]`,
      appliquer **une seule transformation affine** — même décalage et même
      facteur pour tous les échantillons — qui ramène l'étendue dans la bande.
      **Jamais d'écrêtage échantillon par échantillon ici** : un écrêtage colle
      plusieurs voisins sur la même valeur et fabrique une mesa plate, donc
      posable, exactement là où le relief doit être infranchissable ; la
      normalisation préserve la forme et n'aplatit rien.
   7. **Passe de pics et de canyons** sur les secteurs accidentés uniquement :
      `PICS_PAR_SECTEUR` aiguilles d'un seul échantillon remontées de
      `PIC_HAUTEUR`, et un canyon de `CANYON_LARGEUR_ECHANTILLONS` échantillons
      creusé de `CANYON_PROFONDEUR`. Les aiguilles sont tirées **sans remise** et
      confinées aux échantillons **strictement intérieurs** du secteur : deux
      aiguilles sur le même échantillon cumuleraient leur hauteur et sortiraient
      de la bande (`298 − 2 × 28 = 242 m`), et une aiguille posée sur un
      échantillon de frontière déborde sur le secteur voisin — éventuellement
      doux, dont l'adoucissement la raboterait ensuite. Le canyon, lui, peut
      recouvrir une aiguille sans conséquence (`270 + 40` reste dans la bande) :
      c'est assumé et commenté dans le code. C'est cette passe qui donne les crêtes
      déchiquetées et les canyons étroits du cahier des charges ; le déplacement
      de point milieu seul ne produit que du vallonné. Elle passe **après** la
      normalisation, et les marges réservées par `TERRAIN_Y_TRAVAIL_MIN` /
      `TERRAIN_Y_TRAVAIL_MAX` garantissent qu'aucune aiguille ni aucun canyon
      n'a besoin d'être rogné.
   8. **Passe d'adoucissement** sur les secteurs doux : écrêter le dénivelé entre
      échantillons consécutifs à `PENTE_MAX_DOUCE * TERRAIN_PAS`, en plusieurs
      balayages jusqu'à stabilité, bornés par `ECRETAGE_BALAYAGES_MAX`. Sans
      elle, un secteur « doux » peut reposer sur une pente macro de 40°, et il
      n'existe alors aucun sol posable en dehors de la plateforme forcée.
      L'écrêtage porte sur les **suites maximales de secteurs doux adjacents**,
      pas sur chaque secteur pris isolément : l'échantillon de frontière
      appartient aux deux secteurs, donc traité secteur par secteur il est
      déplacé par le second passage après avoir été fixé par le premier, et le
      premier segment du secteur voisin reste non écrêté — ce que le test de
      pente détecte. Par suite maximale, la garantie « pente ≤
      `PENTE_MAX_DOUCE` sur tout secteur doux » tient dès le premier balayage.
   9. **Contrôle de bande** : vérifier qu'aucune valeur n'est sortie de
      `[TERRAIN_Y_MIN, TERRAIN_Y_MAX]`. C'est un **contrôle**, pas une passe de
      mise en forme : après la normalisation de l'étape 6 et les marges
      réservées, aucune valeur ne doit avoir besoin d'être ramenée. Si une valeur
      sort, c'est un réglage à corriger, pas un échantillon à écrêter.
      Implémenté comme une **assertion qui lève**, avec une tolérance flottante
      de `1e-6`, et exécutée **deux fois** : après la passe de pics et de canyons,
      puis après le raccord de l'étape 12. Le `throw` interdit ailleurs dans cette
      fiche l'est pour un cas de jeu *atteignable* (« aucun secteur doux
      intérieur », rendu impossible par construction) ; ici il signale un réglage
      cassé, et c'est le seul moyen d'empêcher l'invariant de se dégrader en
      écrêtage silencieux. Confirmé à l'usage : la mutation « écrêtage au lieu de
      normalisation affine » a bien été attrapée par ce contrôle.
   10. **Plateforme cible** : un secteur **doux d'indice 1 à 6** tiré au `rng`.
       L'étape 3.1 garantit qu'il en existe au moins un, donc **cette étape ne
       peut pas échouer par construction** : elle n'a ni repli, ni `null`, ni
       `throw` à prévoir. Nombre d'échantillons
       `k = max(PLATEFORME_ECHANTILLONS_MIN, PLATEFORME_ECHANTILLONS_BASE - 2 * Math.floor(difficulte / 2))`
       — la difficulté étant **assainie** comme à l'étape 3.2 : appliquée telle
       quelle à une difficulté négative, la formule brute donne
       `9 - 2 * floor(-2,5) = 15` échantillons, soit une plateforme **plus large**
       que la base, là où la garde « difficulté hors plage » veut des largeurs
       dans leurs bornes. On retire **deux** échantillons (10 m) par tranche de 2 points de
       difficulté, ce qui garde `k` impair sans arrondi à rattraper : 9 (40 m)
       jusqu'à la difficulté 2, 7 (30 m) de 2 à 4, puis le plancher de 5 (20 m).
       Tirer l'indice de l'échantillon
       **central** dans le secteur, en gardant `(k - 1) / 2` échantillons de part
       et d'autre à l'intérieur du secteur, puis aplatir ces `k` échantillons à
       la **médiane** de leurs valeurs. Poser `cible.x` sur l'abscisse de
       l'échantillon central, `cible.y` sur la valeur aplatie, et
       `cible.largeur = (k - 1) * TERRAIN_PAS`.
   11. **Replis** : plateaux supplémentaires de `REPLI_ECHANTILLONS` échantillons
       (nombre impair), **jamais plus larges que la plateforme cible**
       (`kr = min(tirage, k)`) pour tenir le « plus étroits » du cahier des charges,
       centrés sur un échantillon et aplatis de la même façon, avec la même
       publication de largeur. Ils rendent vrai le « s'y rabattre est un choix
       sûr mais coûteux » du cahier des charges ; sans eux, le joueur n'a aucune
       alternative et le score n'est plus un arbitrage.
       **Procédé imposé : énumérer d'abord, tirer ensuite.** Aucune boucle
       « je retire jusqu'à trouver une place valide » — les cinq contraintes
       (secteur doux autre que celui de la cible, centre sur un échantillon,
       `(k - 1) / 2` échantillons de marge à l'intérieur du secteur, distance à
       la cible, non-chevauchement) peuvent n'admettre aucune solution, et cette
       boucle-là ne termine alors jamais : l'onglet se figerait en pleine partie.
       1. tirer la largeur en échantillons
          `kr = min(tirage dans REPLI_ECHANTILLONS, k)` — `k` étant celle de la
          cible — puis **construire la liste des échantillons candidats** comme
          centre : secteur doux ≠ secteur de la cible, `(kr - 1) / 2` échantillons
          de marge de part et d'autre à l'intérieur du secteur, distance à
          `cible.x` supérieure au palier de distance courant ;
       2. si la liste est vide, **assouplir la distance** en descendant les
          paliers `REPLI_DISTANCE_PALIERS = [150, 100, 60]` et reconstruire la
          liste. Un repli proche vaut mieux qu'un `replis: []` : le contre-exemple
          existe (deux secteurs doux adjacents, cible collée à la frontière du
          sien, il ne reste que quatre centres admissibles à 150 m alors que deux
          replis non chevauchants en exigent 20 m d'amplitude) ;
       3. tirer **sans remise** `min(tirage dans REPLIS, nombre de candidats)`
          centres dans la liste, en retirant après chaque tirage les candidats
          qui chevaucheraient un repli déjà posé. Le nombre effectif de replis
          est donc `>= 1` et `<= REPLIS.max`, jamais 0 : `REPLIS.min = 2` est un
          **souhait**, pas une garantie géométrique, et c'est écrit dans le code
          à côté de la constante.
   12. **Raccord des bords de plateau** : réappliquer l'écrêtage de pente de
       l'étape 8 **vers l'extérieur seulement**, en gelant les échantillons
       aplatis. L'aplatissement à la médiane vient après la passe
       d'adoucissement, donc il peut laisser une marche de plus de
       `PENTE_MAX_DOUCE * TERRAIN_PAS` entre le dernier échantillon du plateau et
       son voisin — ce qui casse à la fois la promesse « un secteur doux respecte
       `PENTE_MAX_DOUCE` partout » et la lecture visuelle du plateau. Les
       échantillons du plateau ne sont **jamais** retouchés par ce raccord, sinon
       la zone plate se remet à pencher. Borner le nombre de balayages comme à
       l'étape 8 (`ECRETAGE_BALAYAGES_MAX`), et travailler comme elle sur les
       **suites maximales de secteurs doux**, pour la même raison d'échantillon
       de frontière partagé. Puis repasser le contrôle de bande de l'étape 9.
       C'est ce raccord qui impose la distance minimale **entre deux replis** de
       l'étape 11.3 : deux plateaux séparés d'un seul échantillon sont tous deux
       gelés ici, la marche entre leurs bords ne peut plus être redistribuée, et
       le test « un secteur doux respecte `PENTE_MAX_DOUCE` partout » tombe. Avec
       `REPLI_MARGE_RACCORD`, mesuré sur 800 terrains : marche maximale de 1,5 m
       exactement, zéro dépassement.
   13. **Départ** : `depart.x` à une distance tirée dans `DEPART_DISTANCE` de la
       cible, du côté qui laisse la place dans le monde ; `depart.sens` est le
       signe qui va **vers** la cible. La dérive initiale (T9) prend ce signe.
       Sans ça, une manche sur deux commence en s'éloignant du drapeau et le
       score est subi plutôt que piloté.
   14. Renvoyer le `Terrain`.

## Gardes et cas limites

- **Déterminisme** : même graine et même difficulté → terrain identique. C'est la
  garde principale ; sans elle, rien n'est testable.
- **Aucun `Math.random`** dans le fichier. Le test **ne lit pas le source** :
  `packages/game` n'embarque pas `@types/node`, donc `import { readFileSync } from
  "node:fs"` échoue au `typecheck`, et le plan interdit d'ajouter de l'outillage.
  Il remplace `Math.random` par un **piège qui lève** et déroule 100 générations —
  ce qui éprouve le comportement réel de tous les chemins de génération, là où une
  recherche textuelle ne voit que le fichier qu'on lui donne.
- Difficulté hors plage (négative, très grande, `NaN`, `-Infinity`) : elle est
  **assainie avant usage** (`Math.max(0, d)`, non finie → 0) pour la probabilité
  de secteur accidenté **comme** pour la largeur de plateforme. Probabilités et
  largeurs restent dans leurs bornes, la plateforme ne descend pas sous
  `PLATEFORME_ECHANTILLONS_MIN` échantillons — donc jamais sous
  `ETENDUE_PLATE_MIN` — et ne monte jamais au-dessus de
  `PLATEFORME_ECHANTILLONS_BASE`. Test dédié sur −5, `NaN` et `-Infinity`.
- **Étendue plate suffisante** : `cible.largeur` et la largeur de chaque repli
  valent au moins `ETENDUE_PLATE_MIN` (18 m). C'est la garde qui empêche un
  plateau annoncé posable et refusé en `sol-accidente` par `evalueContact` (T8),
  parce que `denivele` sur `[x - 4, x + 4]` mordait sur un voisin non aplati.
- **Aucun secteur doux d'indice 1 à 6** : rendu impossible par l'étape 3.1 de la
  mixité forcée, qui bascule un secteur **intérieur** en doux. La garantie porte
  bien sur l'ensemble réellement utilisé par l'étape 10, et non sur les 8
  secteurs : « 2 doux sur 8 » laissait passer le cas où les deux seuls doux sont
  0 et 7, l'étape 10 tirait alors dans un ensemble vide. Ce chemin ne doit pas
  être « géré » par un `null` ni par un `throw` — un `throw` depuis la
  génération d'une manche fige l'image et se rejoue 60 fois par seconde, la
  `GameLoop` replanifiant la frame avant d'appeler `onTick` — il doit être rendu
  inatteignable par construction.
- Pics et canyons **confinés aux secteurs accidentés** — et, pour les aiguilles,
  aux échantillons **strictement intérieurs** du secteur, tirés **sans remise**
  (voir l'étape 7) : une aiguille au milieu de la plateforme cible rendrait la
  manche ingagnable, une aiguille de frontière déborderait sur un secteur doux, et
  deux aiguilles superposées sortiraient de la bande. La passe de pics tourne
  **avant** l'aplatissement des plateformes, et l'aplatissement a donc le dernier
  mot.
- Plateformes et replis **ne débordent pas** de leur secteur ni du monde, et ne se
  chevauchent pas entre eux. Un secteur fait 32 échantillons : un plateau de 7 en
  tient largement, la contrainte porte sur le tirage de l'échantillon central.
  Le non-chevauchement s'obtient en **retirant les candidats** de la liste après
  chaque tirage (étape 11), jamais en retirant un centre au hasard jusqu'à ce que
  ça tombe bien : cette seconde forme ne termine pas quand la place manque.
- **Au moins un repli**, toujours : le nombre demandé par `REPLIS` peut être
  géométriquement infaisable, le plan l'assume et descend les paliers de
  `REPLI_DISTANCE_PALIERS`. Un `replis: []` silencieux est interdit : il retire
  au joueur l'alternative promise par le cahier des charges, et il passerait
  inaperçu puisqu'un test qui parcourt `replis` est vert sur un tableau vide.
- **Bande respectée sans écrêtage de mise en forme** : aucune valeur hors
  `[TERRAIN_Y_MIN, TERRAIN_Y_MAX]`, y compris après les passes de pics, de
  canyons et d'aplatissement — mais obtenu par la normalisation affine de
  l'étape 6 et les marges de `TERRAIN_Y_TRAVAIL_*`, **pas** par un écrêtage
  échantillon par échantillon. Un écrêtage aux bornes est une passe de mise en
  forme déguisée : il produit des mesas plates et posables dans les secteurs
  accidentés, ce qui contredit le §5 du cahier des charges et vide de son sens le
  levier de difficulté « étroitesse de la plateforme cible » — si le sol est
  posable partout ailleurs, la largeur de la cible ne coûte plus rien.
- `depart.x` reste à plus d'une demi-vue du bord du monde, sinon le LEM
  commence hors limites.
- Le nombre d'échantillons doit valoir exactement `2^8 + 1 = 257`, pour que le
  déplacement du point milieu tombe juste. Test dédié.
- La passe d'adoucissement doit **terminer** : borner le nombre de balayages à
  `ECRETAGE_BALAYAGES_MAX` et vérifier la convergence, plutôt qu'un `while` sans
  issue. Mesuré : 2 ou 3 balayages suffisent.

## Tests attendus

- Deux appels de même graine et même difficulté donnent des surfaces strictement
  égales ; deux graines différentes donnent des surfaces différentes.
- 257 échantillons, pas de 5 m, largeur couverte de 1280 m.
- Toutes les valeurs sont dans `[270, 400]`.
- Au moins 2 secteurs accidentés et 2 secteurs doux, sur 200 graines.
- La cible tombe toujours dans un secteur doux d'indice 1 à 6, et
  `estPosable(terrain, terrain.cible.x)` est **vrai** sur 200 graines — le
  balayage se fait à `DIFFICULTE_MAX` (2,4) **et** à difficulté 0. À difficulté 0
  la probabilité d'un secteur accidenté n'est que de 0,25 : le cas « les six
  secteurs intérieurs sont tous accidentés » n'y sort jamais, et le test passerait
  sans rien éprouver.
- `denivele(hf, cible.x - cible.largeur / 2, cible.x + cible.largeur / 2)` vaut
  **0** : la largeur publiée est l'étendue réellement aplatie, donc les deux
  bornes tombent sur des échantillons plats.
- `cible.largeur >= LEM.largeurTrain + 2 * TERRAIN_PAS` sur 200 graines, et
  `cible.x` tombe exactement sur un échantillon (`(cible.x - hf.x0) % TERRAIN_PAS === 0`).
- **Chaque repli est posable** (`estPosable` vrai en son centre), sur
  200 graines, se trouve à plus du plus petit palier de
  `REPLI_DISTANCE_PALIERS` (60 m) de la cible, et son `denivele` sur sa largeur
  publiée vaut 0. Sur ces mêmes 200 graines, à difficulté 0 **et** à
  `DIFFICULTE_MAX`, `terrain.replis.length >= 1` : sans cette assertion de
  nombre, tous les tests de replis restent verts sur un tableau vide. Ce
  plancher de 1 ne suffit pourtant pas à éprouver le « deux à quatre » du cahier
  des charges : on borne aussi la **proportion**, `replis.length >= 2` dans au
  moins 90 % des 200 graines, à difficulté 0 comme à `DIFFICULTE_MAX`, et l'écart
  entre deux replis est vérifié égal ou supérieur à « largeur aplatie +
  `REPLI_MARGE_RACCORD` ». Sans ces deux bornes, réutiliser le palier de distance
  à la cible comme écart entre replis passe inaperçu, et un tiers des manches
  difficiles n'offre plus qu'un seul plateau de secours.
- **Pire cas des replis, construit à la main** : deux secteurs doux adjacents,
  cible collée à la frontière de son secteur. La génération rend au moins un
  repli, aucun chevauchement, et **termine** — c'est ce cas-là qui bouclait sans
  fin avec un tirage-jusqu'à-ce-que-ça-passe.
- **Aucune mesa aux bornes** : aucune série de plus de 2 échantillons consécutifs
  strictement égaux à `TERRAIN_Y_MIN` ou à `TERRAIN_Y_MAX`, sur 200 graines à
  `DIFFICULTE_MAX`. C'est le test qui interdit le retour de l'écrêtage comme
  outil de mise en forme.
- La surface **avant** la passe de pics et de canyons tient dans
  `[TERRAIN_Y_TRAVAIL_MIN, TERRAIN_Y_TRAVAIL_MAX]`, sur 200 graines : c'est ce
  qui garantit qu'aucune aiguille ni aucun canyon n'est rogné ensuite.
- Un secteur accidenté contient au moins une abscisse **non posable**, et son
  dénivelé moyen est nettement supérieur à celui d'un secteur doux (comparaison
  sur 50 graines). Ces deux assertions ne suffisent pas : `poseAccidents` creuse
  toujours un canyon, qui fournit à lui seul l'abscisse non posable attendue même
  si tout le reste du secteur est plat. On borne donc la **fraction** d'abscisses
  posables d'un secteur accidenté, balayée au mètre avec 10 m de marge par bord
  de secteur, sur 200 graines à difficulté 0 **et** à `DIFFICULTE_MAX` : au plus
  20 % en cumul et 45 % pour le pire secteur, contre un plancher de 70 % côté
  doux — sans ce plancher, durcir le relief au point de rendre tout le monde
  infranchissable passerait pour un progrès.
- Un secteur doux respecte `PENTE_MAX_DOUCE` partout après l'adoucissement **et
  après le raccord des bords de plateau** — y compris sur les deux échantillons
  qui bordent un plateau.
- `depart.x` est à 250–400 m de la cible, et `depart.sens` pointe vers elle.
- Largeur de plateforme : difficulté 0 → 9 échantillons, `cible.largeur === 40` ;
  difficulté 2,4 → 7 échantillons, 30 m ; difficulté 4 → plancher à
  5 échantillons, 20 m. La largeur publiée suit la formule **et** le plancher,
  jamais sous `ETENDUE_PLATE_MIN`, et `k` reste impair.
- Aucun `Math.random` dans la génération : `Math.random` remplacé par un piège
  qui lève, puis 100 générations déroulées. Pas de lecture du source (pas de
  `@types/node` dans `packages/game`).

## Fini quand

- [x] `genereTerrain` est pur, déterministe, sans `Math.random`.
- [x] Le relief mêle du doux **posable** et de l'accidenté **infranchissable**.
- [x] La cible et le point de départ sont garantis **par construction**, pas
      espérés ; au moins un repli l'est aussi, le nombre demandé par `REPLIS`
      étant un souhait.
- [x] Aucun écrêtage aux bornes ne sert de mise en forme : pas de mesa plate dans
      un secteur accidenté.
- [x] Les plateaux sont dimensionnés en **échantillons**, centrés sur un
      échantillon, et la largeur publiée est l'étendue réellement aplatie — au
      moins `LEM.largeurTrain + 2 * TERRAIN_PAS`.
- [x] Les réglages sont dans `constants.ts`, commentés, avec leurs unités.
- [x] La commande de vérification du README du plan passe au vert.
