---
id: T3
titre: Outils de champ d'altitudes dans le moteur
fichiers: packages/engine/src/physics/heightfield.ts, packages/engine/src/physics/heightfield.test.ts, packages/engine/src/index.ts
sensible: false
---

# T3 — Champ d'altitudes

## Objectif

Donner au moteur les outils génériques pour interroger un relief décrit par des
altitudes échantillonnées : altitude en un point, pente locale, dénivelé sur un
segment, test de contact. La **génération** du relief n'est pas ici (T6).

## Ce qui existe

- `packages/engine/src/physics/collision.ts` ne sait faire que du cercle contre
  cercle (`circlesOverlap`, `circlesOverlapToroidal`, `collisionPairs`).
- Aucune notion de sol dans le moteur.
- Repère : `y` croît **vers le bas** (repère canvas). Une altitude de terrain est
  donc stockée comme une **coordonnée `y` de surface**, et « plus haut » veut
  dire « `y` plus petit ». Ce point doit être écrit noir sur blanc dans le
  fichier, c'est la source d'erreur numéro un de la suite du chantier.

## À faire

1. Créer `packages/engine/src/physics/heightfield.ts`.
2. Exporter le type `Heightfield` :
   - `readonly x0: number` — abscisse du premier échantillon ;
   - `readonly pas: number` — écart constant entre deux échantillons ;
   - `readonly surface: readonly number[]` — coordonnée `y` de la surface à
     chaque échantillon, au moins 2 entrées.
3. Exporter les fonctions pures :
   - `largeur(hf): number` — étendue horizontale couverte ;
   - `surfaceEn(hf, x): number` — `y` de la surface en `x`, par **interpolation
     linéaire** entre les deux échantillons encadrants ;
   - `penteEn(hf, x): number` — dérivée locale (sans unité, `dy/dx`) ;
   - `denivele(hf, xa, xb): number` — écart entre le point le plus haut et le
     plus bas de la surface sur `[xa, xb]`, en tenant compte des échantillons
     intermédiaires et des deux bornes interpolées ;
   - `souLeSol(hf, point): boolean` — vrai si `point.y >= surfaceEn(hf, point.x)` ;
   - `penetration(hf, point): number` — profondeur d'enfoncement, `0` si le
     point est au-dessus de la surface.
   Le nom `souLeSol` porte une faute d'orthographe (« sous le sol » donnerait
   `sousLeSol`). Elle est **conservée volontairement** : le nom est écrit à
   l'identique dans `task-6-terrain.md` et `task-8-atterrissage.md`, et le
   corriger ici seul casserait le contrat que ces tâches attendent. À renommer en
   une passe globale — plan et code ensemble — ou pas du tout.
   Le paramètre `point` est typé par une forme structurale locale
   `type Point = { readonly x: number; readonly y: number }`, **non exportée**, et
   non par `Vector2` : elle accepte un `Vector2` du moteur comme un littéral,
   sans ajouter au moteur un export public que personne n'a demandé.
4. Ajouter les exports dans `packages/engine/src/index.ts`.

## Gardes et cas limites

- `x` **hors des bornes** du champ : le relief est prolongé **plat**, pas
  extrapolé. `surfaceEn` rend donc la valeur du bord le plus proche, et
  `penteEn` rend **`0`** — y compris **sur** les bornes elles-mêmes. La
  formulation initiale (« `surfaceEn` et `penteEn` renvoient la valeur du bord »)
  se contredisait : la pente doit rester la dérivée de `surfaceEn`, et une
  surface constante hors bornes n'a pas d'autre pente cohérente que 0. Rendre la
  pente du dernier segment ferait mentir la paire surface / pente. Décision
  commentée dans le code et couverte par un test.
- `pas <= 0`, `pas` **non fini**, ou `surface.length < 2` : erreur explicite à
  l'appel, plutôt qu'un `NaN` propagé jusqu'au rendu. Le garde de finitude est
  indispensable et non décoratif : `NaN <= 0` est **faux**, donc un `pas` à `NaN`
  passait le seul contrôle `pas <= 0` et propageait des `NaN` jusqu'au rendu —
  exactement ce que cette garde veut empêcher.
- `denivele(hf, xa, xb)` avec `xa > xb` : bornes échangées.
- `denivele` sur un intervalle plus étroit que `pas` : calcul sur les deux bornes
  interpolées uniquement, sans oublier qu'il n'y a pas d'échantillon dedans.
- `denivele` sur un intervalle qui contient exactement un échantillon : cet
  échantillon **compte** — c'est le cas d'un pic isolé, celui-là même qui doit
  faire refuser un atterrissage.
- Point exactement sur la surface : `souLeSol` est **vrai** (le contact compte
  comme touché), `penetration` vaut 0.
- `noUncheckedIndexedAccess` est actif : tout accès `surface[i]` doit être gardé,
  pas forcé par un `!` de complaisance sans justification.

## Tests attendus

- Sur un champ plat, `surfaceEn` rend la même valeur partout et `penteEn` vaut 0.
- Sur une pente régulière, `surfaceEn` interpole correctement au milieu d'un pas
  et `penteEn` rend la pente exacte.
- Hors bornes à gauche et à droite : `surfaceEn` rend la valeur du bord,
  `penteEn` rend 0. Pas d'extrapolation.
- `denivele` : nul sur du plat ; égal à la hauteur du pic quand l'intervalle
  contient un pic isolé ; correct quand l'intervalle est plus étroit qu'un pas.
- `denivele(hf, b, a) === denivele(hf, a, b)`.
- `souLeSol` : faux au-dessus, vrai en dessous, **vrai** exactement sur la
  surface.
- `penetration` vaut 0 au-dessus, la profondeur exacte en dessous.
- `pas` nul, négatif, **non fini**, ou `surface` d'une seule entrée : erreur
  explicite.

## Fini quand

- [x] Les six fonctions sont exportées par `@lem/engine`, pures, sans état.
- [x] La convention « `y` croît vers le bas » est écrite en tête de fichier.
- [x] Les cas de bord (hors bornes, pic isolé, contact exact) sont couverts par
      des tests (`heightfield.test.ts` : 24 tests).
- [x] La commande de vérification du README du plan passe au vert.
