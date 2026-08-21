---
id: T17
titre: Équilibrage des réglages et mise à jour de la documentation
fichiers: packages/game/src/constants.ts, packages/game/src/reglages.test.ts, docs/cahier-des-charges.md, README.md, docs/design-system.md
sensible: false
---

# T17 — Équilibrage et documentation

## Objectif

Rendre le jeu réellement jouable en ajustant les réglages posés à l'aveugle, puis
faire en sorte que la documentation dise ce que le code fait.

## Ce qui existe

Tout le jeu est en place (T1 à T16). Les réglages ont été **posés pour être
plausibles, pas démontrés** — c'est écrit tel quel dans les inconnues du README du
plan :

- `POUSSEE_MAX = 4` m/s², `CONSO_PAR_CRAN = 0.8` u/s/cran, `CRANS_MAX = 5` ;
- `CARBURANT_BASE = 140`, `CARBURANT_PENTE = 25`, `CARBURANT_MIN = 60` ;
- `VH_BASE = 8`, `VH_PENTE = 6`, `VH_MAX = 32` m/s ;
- `PALIER_DIFFICULTE = 0.08`, `DIFFICULTE_MAX = 2.4` ;
- seuils `SEUIL_VY = 2`, `SEUIL_VX = 1`, `SEUIL_ASSIETTE = 10°`,
  `SEUIL_PLATITUDE = 1` m ;
- `DEPART_Y = 120`, `DEPART_DISTANCE = 250–400` m,
  `MONDE = { largeur: 1280, hauteur: 420 }` ;
- `SEUILS_ZOOM = { vers2: 60, retour1: 80, vers4: 25, retour2: 35 }` ;
- `PLATEFORME_LARGEUR_BASE = 24`, plancher 10 m ;
- terrain : `RUGOSITE_DOUCE = 0.15`, `RUGOSITE_ACCIDENTEE = 1.6`,
  `PENTE_MAX_DOUCE = 0.3`, pics et canyons.

## À faire

1. **Jouer** trois parties par niveau et noter, pour chacune : manches réussies,
   carburant restant au posage, écart moyen, durée de manche, et le ressenti sur
   la manœuvrabilité.
2. Vérifier **par le calcul, avant** d'ajuster à l'aveugle, les trois points qui
   décident de la jouabilité :
   - **budget carburant** : le vol stationnaire demande
     `MOON_GRAVITY / POUSSEE_MAX * CRANS_MAX ≈ 2,03` crans, soit ≈ 1,62 u/s ; un
     réservoir de 140 u vaut donc ≈ 86 s de stationnaire. Est-ce la durée de
     manche voulue ?
   - **annulation de la dérive** : tuer une dérive `v` au cran 5 sous une assiette
     `θ` coûte `v / sin θ` unités — soit ≈ 2,9 `v` à 20°, ≈ 1,4 `v` à 45°. À
     difficulté 2,4 : dérive 22,4 m/s, réservoir 80 u, donc ≈ 32 u à 45°.
   - **freinage vertical** depuis `DEPART_Y` : une chute libre de ~150 m atteint
     ≈ 22 m/s, dont le freinage à 2,38 m/s² net coûte ≈ 9 s au cran 5, soit
     ≈ 37 u. Le total (dérive + freinage) doit rester nettement sous le
     réservoir, sinon la manche est perdue d'avance.
3. **Vérifier que `DIFFICULTE_MAX = 2.4` est bien gagnable**, par ce calcul et par
   le jeu. C'est l'arbitrage retenu : la rampe ne doit pas tuer, un joueur
   excellent doit pouvoir enchaîner. Si 2,4 est déjà infranchissable, l'abaisser
   et le dire. Depuis le niveau facile, atteindre le plafond demande
   `2,4 / 0,08 = 30` manches réussies.
4. Ajuster les constantes. **Une seule** valeur à la fois, en notant l'effet
   observé — un changement groupé ne dit rien sur ce qui a agi.
5. Confirmer ou corriger les inconnues chiffrées du README du plan : réglages de
   vol, palier de 0,08, plafond de 2,4, seuils de zoom, contraste de rugosité du
   terrain.
6. Créer `packages/game/src/reglages.test.ts` : les invariants de cohérence (voir
   « Tests attendus »).
7. Reporter les **valeurs finales** dans `docs/cahier-des-charges.md` : les
   sections §3 (pilotage), §4 (physique et seuils), §5 (terrain), §6 (caméra) et
   §8 (difficulté) donnent aujourd'hui des ordres de grandeur ; elles doivent
   donner les valeurs retenues.
8. Mettre `README.md` à jour : retirer le bandeau « base saine, le jeu est un
   squelette », décrire le jeu tel qu'il est, les contrôles définitifs (dont
   Échap et la pause), la structure des paquets, et revoir la note sur `wrap` /
   `toroidalDelta` si ces outils ont bougé.
9. Compléter `docs/design-system.md` avec ce que les écrans ont réellement
   utilisé, notamment la décision prise sur l'inconnue « harmonie canvas / DOM »
   et sur la lisibilité de la police 5 × 7.

## Gardes et cas limites

- **Aucun test affaibli pour faire passer un réglage.** Si un seuil change, c'est
  la valeur attendue du test qui change avec, pas l'assertion qui disparaît. Un
  test mis en `skip` ici est un échec de la tâche.
- **Les valeurs restent dans `constants.ts`** : l'équilibrage ne doit pas semer de
  nombres en dur dans les règles au passage.
- **Le niveau facile doit être gagnable** : au moins une manche réussie sur trois
  tentatives d'un joueur qui découvre le jeu. Sinon ce sont les réglages qui sont
  faux, pas le joueur.
- **Le plafond doit rester franchissable** : c'est l'arbitrage retenu, il faut le
  démontrer par le calcul du point 2, pas par l'intuition.
- **Documentation et code d'accord** : une valeur du cahier des charges qui ne
  correspond plus à `constants.ts` est un mensonge qui survivra au chantier.
- Ne **pas** ajouter de fonctionnalité sous couvert d'équilibrage : le hors
  périmètre du README du plan reste hors périmètre.

## Tests attendus

- Les tests chiffrés de T6 à T10 sont mis à jour avec les valeurs finales et
  restent verts — aucun supprimé, aucun désactivé.
- `reglages.test.ts`, invariants qui rendent tout réglage futur incohérent
  immédiatement visible :
  - le vol stationnaire est possible : `POUSSEE_MAX > MOON_GRAVITY` ;
  - le carburant à `DIFFICULTE_MAX` est strictement positif ;
  - **le carburant à `DIFFICULTE_MAX` couvre le freinage vertical plus
    l'annulation de la dérive à 45°**, avec une marge d'au moins 15 % ;
  - la largeur de plateforme à `DIFFICULTE_MAX` reste supérieure à
    `LEM.largeurTrain` ;
  - les seuils de zoom sont bien ordonnés : `vers4 < retour2 < vers2 < retour1` ;
  - `RUGOSITE_ACCIDENTEE` vaut au moins cinq fois `RUGOSITE_DOUCE`.

## Fini quand

- [ ] Les trois niveaux ont été joués et les réglages ajustés, une valeur à la
      fois.
- [ ] Le niveau facile est gagnable, le plafond de difficulté est démontré
      franchissable par le calcul.
- [ ] `docs/cahier-des-charges.md` porte les valeurs finales, plus des ordres de
      grandeur.
- [ ] `README.md` décrit le jeu fini, sans bandeau de chantier.
- [ ] Les invariants de réglage sont couverts par `reglages.test.ts`.
- [ ] La commande de vérification du README du plan passe au vert.
