---
id: T8
titre: Contact avec le sol, verdict posé ou crash
fichiers: packages/game/src/landing.ts, packages/game/src/landing.test.ts, packages/game/src/events.ts, packages/game/src/rules.ts, packages/game/src/constants.ts, docs/cahier-des-charges.md
sensible: true
---

# T8 — Contact et verdict

## Objectif

Décider, au moment où le LEM touche quoi que ce soit, s'il est posé ou détruit,
selon les quatre conditions du cahier des charges — et rendre ce verdict testable
indépendamment du rendu.

## Ce qui existe

- `@lem/engine` fournit `surfaceEn`, `penteEn`, `denivele`, `souLeSol`,
  `penetration` (T3). Aux bornes du champ et au-delà, `penteEn` rend **0** (bord
  plat) : une assiette jugée contre la pente locale à l'extrême bord du monde est
  jugée contre l'horizontale.
- `packages/game/src/terrain.ts` fournit `Terrain`, `estPosable`, et déjà dans
  `constants.ts` la géométrie `LEM = { largeurTrain: 8, hauteur: 7, rayon: 4 }`
  ainsi que `SEUIL_PLATITUDE = 1` (T6).
- `packages/game/src/entities/Lander.ts` fournit `Lander` avec `position`,
  `velocity`, `assiette` (T7).
- `packages/game/src/types.ts` déclare `LemEvent`, réduit à `particle-died`.
- Il n'y a **aucune** règle de tick dans le jeu : `rules.ts` n'existe pas encore.

## À faire

1. Ajouter dans `constants.ts` les seuils de vol, avec leurs unités et la mention
   « réglés en T17 » :
   - `SEUIL_VY = 2` (m/s, à la descente) ;
   - `SEUIL_VX = 1` (m/s, valeur absolue) ;
   - `SEUIL_ASSIETTE = Math.PI / 18` (rad, soit 10°).
   `SEUIL_PLATITUDE` et la géométrie du LEM existent déjà (T6) : ne pas les
   redéfinir.
2. Créer `packages/game/src/landing.ts` :
   - `piedsDuLem(lem): readonly [Vector2, Vector2]` — les deux pieds, à
     `±largeurTrain / 2` horizontalement et `hauteur / 2` sous le centre, **le
     tout tourné de l'assiette**. C'est cette rotation qui fait qu'un LEM penché
     touche par un seul pied.
   - `pointsDeCoque(lem): readonly Vector2[]` — les deux pieds **plus** les deux
     épaules (`±largeurTrain / 2 * 0,75`, `hauteur / 2` **au-dessus** du centre)
     et le centre, tournés de l'assiette.
   - `toucheLeSol(terrain, lem): boolean` — vrai dès qu'**un point de coque**
     est au niveau du sol ou dessous. Ne pas se limiter aux pieds : un LEM qui
     file à 20 m/s dans une paroi de canyon a les pieds en l'air au-dessus du
     fond et le fuselage dans la roche ; sans les épaules, il traverse la falaise
     sans rien heurter.
   - `type Verdict = { pose: true; ecart: number } | { pose: false; causes: readonly CauseCrash[] }`
     avec `CauseCrash = "trop-vite-vertical" | "trop-vite-lateral" | "trop-penche" | "sol-accidente" | "coque-heurtee" | "hors-limites"`.
   - `evalueContact(terrain, lem): Verdict` — applique les conditions, **accumule
     toutes** les causes d'échec, et pour un posé calcule
     `ecart = Math.round(Math.abs(lem.position.x - terrain.cible.x))` : l'écart
     **horizontal** entre le centre du LEM au moment du contact et le mât du
     drapeau, en mètres.
     - Le **centre**, et non le pied qui touche : sinon l'assiette décalerait le
       score d'un demi-train.
     - **Horizontal seulement**, et non une distance euclidienne : au contact
       sur du plat, le centre est à `LEM.hauteur / 2` = 3,5 m au-dessus de la
       surface, alors que `cible.y` **est** la surface. Une distance euclidienne
       vaudrait donc toujours au moins 3,5 m, `Math.round` en ferait 4, et le
       « score parfait de 0 point » du cahier des charges (§5 et §7) serait
       inatteignable : chaque manche réussie porterait un malus plancher de
       4 points. C'est aussi le sens de « distance au drapeau » pour un score de
       golf : on mesure l'écart au trou sur le terrain, pas l'altitude de la
       balle.
   - `horsLimites(lem): boolean` — vrai si le LEM sort latéralement du monde ou
     passe au-dessus du plafond (`position.y < 0`).
3. Créer `packages/game/src/events.ts` avec l'union des événements du jeu, dont
   `{ type: "contact"; verdict: Verdict }` et `{ type: "hors-limites" }`. Mettre
   `types.ts` à jour.
4. Créer `packages/game/src/rules.ts` avec `regleContact`, qui émet `contact` au
   premier tick où `toucheLeSol` est vrai, et `hors-limites` quand `horsLimites`
   l'est.
5. Corriger le **§7 de `docs/cahier-des-charges.md`** : « distance du centre du
   LEM au moment du contact au pied du drapeau » devient « **écart horizontal**
   entre le centre du LEM au moment du contact et le mât du drapeau ». Le §5
   promet un « score parfait de 0 point » : avec une distance euclidienne cette
   promesse est fausse dès le premier posé. La documentation et le code doivent
   dire la même règle, et c'est ici qu'on tranche.

## Gardes et cas limites

- **Un seul événement de contact par manche** : la règle ne doit pas émettre
  `contact` à chaque tick pendant que le LEM est enfoncé dans le sol. La garde
  porte sur le statut de la manche (T9), et un test l'éprouve sur plusieurs ticks
  consécutifs.
- **Contact par une épaule** (paroi de canyon, flanc de pic) : c'est
  automatiquement un crash, cause `coque-heurtee`, sans regarder les vitesses. On
  ne se pose pas sur le côté.
- **Contact exactement sur la surface** : compte comme touché (cohérent avec
  `souLeSol` de T3).
- **LEM penché** : c'est le point de coque le plus bas qui décide du contact, pas
  le centre. Un test avec assiette 45° doit montrer un contact plus tôt qu'à
  assiette 0, à altitude égale.
- **Vitesse verticale vers le haut** au contact (le LEM remonte en frôlant le
  sol) : `SEUIL_VY` ne s'applique qu'à la descente ; une vitesse montante ne peut
  pas être une cause de crash.
- **Platitude** : mesurée sur `LEM.largeurTrain` centrée sur l'abscisse du
  centre, via `denivele`. Un pic plus étroit qu'un pas d'échantillonnage doit
  quand même compter — garanti par le test de `denivele` en T3.
- **Bord du monde** : un contact à moins d'une demi-largeur de train du bord
  mesure la platitude sur un intervalle tronqué ; le comportement de bord plat de
  `surfaceEn` s'applique, et c'est écrit dans le code.
- **Causes cumulées** : un LEM trop rapide *et* trop penché rend deux causes. Un
  verdict qui n'en rend qu'une masque de l'information au joueur.
- `ecart` d'un posé pile sur l'abscisse de la cible vaut **0**, jamais `-0` ni
  `0.0001` : `Math.round(Math.abs(...))` s'en charge. C'est atteignable
  puisqu'on ne mesure que l'axe horizontal.
- `ecart` est un **entier positif ou nul**, jamais négatif : l'écart est une
  valeur absolue, et le score de golf en est une somme.
- Sortie par le haut : le LEM qui monte indéfiniment perd la manche, sinon la
  partie ne finit jamais.

## Tests attendus

- Posé nominal : `vy = 1`, `vx = 0`, assiette 0, sur la plateforme → posé, écart
  égal à l'écart horizontal au drapeau, arrondi.
- Chaque cause isolément : `vy = 5` → `trop-vite-vertical` ; `vx = 3` →
  `trop-vite-lateral` ; assiette 30° → `trop-penche` ; contact sur un secteur
  accidenté → `sol-accidente`.
- **Vol horizontal dans une paroi** : LEM à assiette 0, `vx = 20`, pieds
  au-dessus du fond du canyon, épaule dans la paroi → crash `coque-heurtee`. Ce
  test échoue si l'implémentation ne teste que les pieds.
- Causes cumulées : `vy = 5` et assiette 30° → **deux** causes.
- Juste sous et juste au-dessus du seuil : `vy = 1.99` posé, `vy = 2.01` crashé
  (seuil inclusif, et c'est écrit).
- Vitesse verticale **négative** (montante) élevée : pas de cause
  `trop-vite-vertical`.
- Contact par un seul pied à assiette 45° : détecté plus tôt qu'à assiette 0.
- Posé pile au centre de la plateforme (`lem.position.x === terrain.cible.x`) :
  `ecart === 0`. Ce test échoue si l'implémentation mesure une distance
  euclidienne, puisque le centre du LEM est à 3,5 m au-dessus de la surface.
- L'écart ne dépend **pas de l'altitude** : deux LEM de même abscisse et de `y`
  différents ont le même écart.
- L'écart est mesuré depuis le **centre** : à assiette 20°, deux LEM dont les
  centres sont au même endroit ont le même écart, quel que soit le pied qui
  touche.
- `horsLimites` : vrai à gauche, à droite, au-dessus du plafond ; faux au milieu.
- La règle n'émet `contact` qu'une fois sur cinq ticks au sol.

## Fini quand

- [ ] `evalueContact` rend un verdict complet, avec toutes les causes.
- [ ] La coque entière collisionne, pas seulement les pieds.
- [ ] L'écart est l'écart **horizontal** entre le centre du LEM et le drapeau, et
      un posé pile sur la cible vaut bien 0 point.
- [ ] Le §7 du cahier des charges dit « écart horizontal » et non « distance » ;
      T11 (distance à la cible du HUD) et T17 (report des valeurs finales)
      emploient la même définition.
- [ ] Le contact n'est émis qu'une seule fois par manche.
- [ ] La commande de vérification du README du plan passe au vert.
