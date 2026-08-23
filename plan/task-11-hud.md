---
id: T11
titre: Tableau de bord chiffré avec seuils colorés
fichiers: packages/game/src/render/hud.ts, packages/game/src/render/hud.test.ts, packages/game/src/screens/game.ts, packages/game/src/state.ts
sensible: false
---

# T11 — HUD

## Objectif

Afficher, pendant le vol, toutes les valeurs qui permettent de décider — en
mètres et mètres par seconde — et signaler par la couleur ce qui sort des seuils
d'atterrissage.

## Ce qui existe

- `design/font.ts` : `dessineTexte` et `mesureTexte`, police 5 × 7 (T1).
  `dessineTexte` prend un `CibleDessin` (interface réduite à `fillRect`), que le
  `Renderer` satisfait.
- `design/palette.ts` : 16 couleurs, dont `blanc`, `grisPale`, `accent`,
  `alerte`, `flammeClaire`, `flammeChaude` (T1).
- `Renderer` avec `fillRect`, `strokeRect`, `drawPixel` (T4). `strokeRect` trace
  son contour **à l'intérieur** de la zone donnée, en quatre `fillRect` et non en
  `ctx.stroke()` : un cadre de jauge de `l × h` occupe donc exactement `l × h`
  pixels, sans demi-pixel qui dépasse.
- `constants.ts` : `SEUIL_VY`, `SEUIL_VX`, `SEUIL_ASSIETTE`, `CRANS_MAX`,
  `MONDE` (T6 à T9).
- `state.ts` : `Globals` avec `vies`, `tempsDeVol`, `manchesReussies`, `ecarts`,
  `terrain`, `statut` (T9). **N'a pas** de dotation de carburant : `Lander` ne
  porte que `carburant` (le reste, pas la jauge pleine), et `difficulty.ts`
  (`carburantInitial`) recalcule cette dotation depuis la difficulté mais ne la
  stocke nulle part. Or la dotation dépend de la difficulté de la manche
  (`carburantInitial(difficulteDe(niveauDepart, manchesReussies))`,
  `= 140 - 18 * difficulté`, plancher 60), donc de 60 à 140 selon le niveau et
  la progression — jamais `CARBURANT_BASE = 140` fixe. C'est **cette tâche** qui
  ajoute à `Globals` le champ `readonly carburantInitial: number`, posé par
  `nouvellePartie` et `nouvelleManche` (`state.ts`, T9) au moment où la
  difficulté de la manche est connue. Le poser à l'affichage plutôt qu'à la
  création serait faux dès qu'une manche change de difficulté en cours de
  bandeau de posé (`manchesReussies` incrémenté avant l'affichage du bandeau) :
  le dénominateur bougerait sous le pourcentage affiché.
- L'écran de jeu de T10 appelle déjà le HUD en dernier dans `rend()`.

## À faire

1. Créer `packages/game/src/render/hud.ts`.
2. Fonctions de **formatage pures**, testables sans canvas :
   - `formateAltitude(m: number): string` — entier, suffixe ` M`, largeur fixe de
     4 chiffres avec zéros de tête (`0042 M`), pour que le texte ne bouge pas ;
   - `formateVitesse(v: number): string` — une décimale, signe explicite
     (`+01.4`, `-02.0`) ;
   - `formateTemps(s: number): string` — `M:SS` ;
   - `formateCarburant(u: number, max: number): string` — pourcentage entier.
3. `couleurSeuil(valeur, seuil): CouleurLem` — rend une **clé** de palette, que
   l'appelant convertit en couleur par `PALETTE[cle]` avant de la passer au
   `Renderer`. Aucune fonction de `hud.ts` ne manipule un code hexadécimal. — `accent` quand la valeur est dans
   les clous, `flammeChaude` entre le seuil et 1,5 fois le seuil, `alerte`
   au-delà. Trois paliers, pour que le joueur voie venir.
4. `dessineHud(r, etat)` dispose, en 320 × 180 :
   - **coin haut gauche** : altitude, vitesse verticale, vitesse horizontale.
     Seules les **deux vitesses** portent une couleur de seuil ; l'**altitude**
     s'affiche en `blanc` — `constants.ts` n'a pas de seuil d'altitude, et
     `couleurSeuil(valeur, seuil)` en exige un, et aucune couleur d'alerte n'a
     de sens sur une altitude seule. L'altitude est la hauteur au-dessus du sol
     **sous le LEM** — `surfaceEn(hf, lem.position.x) - lem.position.y` — et non
     une hauteur de monde : c'est cette valeur-là qui décide du contact.
     **L'assiette n'est pas affichée** au HUD malgré `SEUIL_ASSIETTE` cité dans
     « Ce qui existe » : le compte des neuf indicateurs de « Fini quand »
     (3 + 4 + 2 jauges, les vies étant des silhouettes) ne tient que sans elle ;
   - **coin haut droit** : distance à la cible, temps de vol, numéro de manche,
     difficulté à deux décimales. La **distance à la cible** est le même écart
     que celui qui fera le score : l'écart **horizontal**
     `Math.abs(lem.position.x - terrain.cible.x)`, jamais une distance
     euclidienne. Un HUD qui affiche 12 m et un verdict qui compte 13 points
     ferait passer la règle du score pour un bug ;
   - **coin bas gauche** : jauge de carburant horizontale (cadre `grisPale`,
     remplissage `flammeClaire`, `alerte` sous 20 %) plus le pourcentage. Le
     `max` de `formateCarburant(u, max)` est `globals.carburantInitial` — **pas**
     `CARBURANT_BASE` — sans quoi un réservoir plein en difficile (96,8 u)
     s'affiche à 69 % et l'alerte 20 % se déclenche à un niveau de réservoir qui
     n'est pas celui réellement embarqué ;
   - **coin bas droit** : jauge de puissance à 5 barres verticales, barres
     allumées en `flammeClaire`, éteintes en `reliefMoyen` ;
   - **coin bas centre** : vies restantes, dessinées comme autant de petites
     silhouettes de LEM.
5. Ajouter un bandeau de message central quand le statut n'est pas `"vol"` :
   `POSE - ECART nnnn M` ou `CRASH` suivi des causes du verdict, en clair
   (`TROP VITE`, `TROP PENCHE`, `SOL ACCIDENTE`, `HORS LIMITES`). Le posé
   s'affiche en `accent`, le crash en `alerte` — **pas** tout en `alerte` comme
   envisagé : un « POSE » en rouge se lirait comme un échec, alors que `accent`
   est déjà la couleur de la plateforme cible et du drapeau, donc de la
   réussite. Le tiret est un tiret **court** (`-`, pas `—`) : la police bitmap
   n'a pas de cadratin, `glyphesDe` le rendrait en `?`. L'écart est écrit sur
   **quatre** chiffres comme les autres valeurs en mètres (`formateMetres`), pas
   trois : un posé loin du drapeau peut dépasser 999 m, l'écart n'étant borné
   que par la largeur du monde.

## Gardes et cas limites

- **Largeur fixe** : les nombres sont formatés à largeur constante ; un HUD dont
  les colonnes sautent d'un pixel à chaque dizaine est illisible. Test dédié.
- **Débordement de l'écran** : aucune ligne du HUD ne dépasse de 320 × 180, y
  compris avec les valeurs extrêmes (altitude 4 chiffres, vitesse à deux
  chiffres et une décimale, temps supérieur à 9 minutes, difficulté 4,00).
- **Temps supérieur à 59:59** : reste lisible, ne tronque pas les minutes.
- **Valeurs négatives** : altitude jamais négative (écrêtée à 0 pour
  l'affichage) ; les vitesses gardent leur signe.
- **Vitesse verticale montante** : n'est jamais colorée en `alerte`, cohérent
  avec le verdict de T8 qui ne la sanctionne pas.
- **Carburant à 0** : jauge vide, pourcentage `0 %`, pas de `-0 %` ni de barre
  d'un pixel résiduelle.
- **Le dénominateur de la jauge est `globals.carburantInitial`**, jamais
  `CARBURANT_BASE` ni une valeur recalculée à l'affichage : la dotation dépend
  de la difficulté de la manche, pas du niveau facile.
- **Plus de 5 vies** (impossible aujourd'hui, mais l'affichage ne doit pas
  déborder) : au-delà, afficher `x N` plutôt que N silhouettes.
- **Causes multiples** d'un crash : toutes affichées, séparées, tronquées
  proprement si la largeur manque.
- Aucune couleur littérale : tout passe par `PALETTE`.

## Tests attendus

- `formateAltitude(42)` vaut `0042 M` ; `formateAltitude(0)` vaut `0000 M` ;
  `formateAltitude(-3)` vaut `0000 M`.
- `formateVitesse(1.44)` vaut `+01.4` ; `formateVitesse(-2)` vaut `-02.0` ;
  toutes les sorties ont la même longueur.
- `formateTemps(0)` vaut `0:00` ; `formateTemps(65)` vaut `1:05` ;
  `formateTemps(3599)` vaut `59:59`.
- `formateCarburant(0, 140)` vaut `0 %` ; `formateCarburant(140, 140)` vaut
  `100 %` ; `formateCarburant(96.8, 96.8)` vaut `100 %` — le `max` est la
  dotation réelle de la manche, pas `CARBURANT_BASE`.
- `dessineHud` lit `globals.carburantInitial` comme `max` de la jauge, pas une
  constante : test avec une manche en difficulté non nulle, réservoir plein,
  jauge affichée pleine et `100 %`.
- `couleurSeuil` : `accent` sous le seuil, `flammeChaude` à 1,2 fois le seuil,
  `alerte` à 2 fois, et `accent` pour une vitesse montante.
- Largeur totale de chaque bloc de texte, calculée avec `mesureTexte`, tient dans
  320 pixels pour les valeurs extrêmes listées ci-dessus.
- La distance affichée est **égale** à l'écart que rendrait `evalueContact` (T8)
  pour la même position : un test compare les deux sur trois positions.
- Le bandeau de fin de manche écrit `POSE - ECART 0123 M` (tiret court, quatre
  chiffres) sur un posé, et le pose en `accent` ; `CRASH` et ses causes en
  `alerte` sur un crash. Un écart supérieur à 999 m ne perd pas de rang.
- Aucune couleur littérale dans `hud.ts`.

## Fini quand

- [ ] `yarn dev` affiche les neuf indicateurs, lisibles à 320 × 180. **Non
      vérifié à l'œil dans cet environnement** (pas de navigateur) : reste à
      cocher par un humain.
- [x] Les vitesses changent de couleur avant de sortir des seuils, en trois
      paliers.
- [x] Les colonnes ne bougent pas quand les valeurs changent d'ordre de
      grandeur.
- [x] La commande de vérification du README du plan passe au vert.
