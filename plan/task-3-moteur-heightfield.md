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
4. Ajouter les exports dans `packages/engine/src/index.ts`.

## Gardes et cas limites

- `x` **hors des bornes** du champ : `surfaceEn` et `penteEn` renvoient la valeur
  du bord le plus proche (comportement de bord plat, pas d'extrapolation
  sauvage), et cette décision est commentée dans le code.
- `pas <= 0` ou `surface.length < 2` : erreur explicite à l'appel, plutôt qu'un
  `NaN` propagé jusqu'au rendu.
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
- Hors bornes à gauche et à droite : valeur du bord, pas d'extrapolation.
- `denivele` : nul sur du plat ; égal à la hauteur du pic quand l'intervalle
  contient un pic isolé ; correct quand l'intervalle est plus étroit qu'un pas.
- `denivele(hf, b, a) === denivele(hf, a, b)`.
- `souLeSol` : faux au-dessus, vrai en dessous, **vrai** exactement sur la
  surface.
- `penetration` vaut 0 au-dessus, la profondeur exacte en dessous.
- `pas` nul, négatif, ou `surface` d'une seule entrée : erreur explicite.

## Fini quand

- [ ] Les six fonctions sont exportées par `@lem/engine`, pures, sans état.
- [ ] La convention « `y` croît vers le bas » est écrite en tête de fichier.
- [ ] Les cas de bord (hors bornes, pic isolé, contact exact) sont couverts par
      des tests.
- [ ] La commande de vérification du README du plan passe au vert.
