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
- `CARBURANT_BASE = 140`, `CARBURANT_PENTE = 18`, `CARBURANT_MIN = 60` ;
- `VH_BASE = 8`, `VH_PENTE = 6`, `VH_MAX = 32` m/s ;
- `PALIER_DIFFICULTE = 0.08`, `DIFFICULTE_MAX = 2.4` ;
- seuils `SEUIL_VY = 2`, `SEUIL_VX = 1`, `SEUIL_ASSIETTE = 10°`,
  `SEUIL_PLATITUDE = 1` m ;
- `DEPART_Y = 120`, `DEPART_DISTANCE = 250–400` m,
  `MONDE = { largeur: 1280, hauteur: 420 }`, surface dans
  `[TERRAIN_Y_MIN = 270, TERRAIN_Y_MAX = 400]` ;
- `SEUILS_ZOOM = { vers2: 40, retour1: 44, vers4: 16, retour2: 22 }` ;
- `BIAIS_CAMERA_Y = 60` (px d'écran, zoom 1) ;
- `PLATEFORME_ECHANTILLONS_BASE = 9` (40 m), plancher 5 échantillons (20 m) ;
- terrain : `RUGOSITE_DOUCE = 0.15`, `RUGOSITE_ACCIDENTEE = 1.6`,
  `PENTE_MAX_DOUCE = 0.3`, pics et canyons.

## À faire

1. **Jouer** trois parties par niveau et noter, pour chacune : manches réussies,
   carburant restant au posage, écart moyen, durée de manche, et le ressenti sur
   la manœuvrabilité.
   **Rapport (run D) : non fait.** Aucun navigateur ni manette dans cet
   environnement d'implémentation, comme pour T10–T13. Remplacé par le calcul
   (points 2/3) et par une mesure sur 800 terrains générés (difficultés 0, 1, 2
   et 2,4) via un fichier de mesure temporaire, supprimé après lecture. La
   validation manette en main reste entière, à faire par un humain avant la
   PR.
2. Vérifier **par le calcul, avant** d'ajuster à l'aveugle, les trois points qui
   décident de la jouabilité :
   - **budget carburant** : le vol stationnaire demande
     `MOON_GRAVITY / POUSSEE_MAX * CRANS_MAX ≈ 2,03` crans, soit ≈ 1,62 u/s ; un
     réservoir de 140 u vaut donc ≈ 86 s de stationnaire. Est-ce la durée de
     manche voulue ?
   - **annulation de la dérive** : tuer une dérive `v` au cran 5 sous une assiette
     `θ` coûte
     `v * (CONSO_PAR_CRAN * CRANS_MAX) / (POUSSEE_MAX * sin θ)` unités —
     avec les valeurs actuelles (`CONSO_PAR_CRAN = 0.8`, `CRANS_MAX = 5`,
     `POUSSEE_MAX = 4`, donc `CONSO_PAR_CRAN * CRANS_MAX = POUSSEE_MAX = 4`),
     cette formule se lit `v / sin θ` — soit ≈ 2,9 `v` à 20°, ≈ 1,4 `v` à 45°.
     **Cette simplification n'est vraie que pour les valeurs du jour** : si le
     point 4 change `POUSSEE_MAX` ou `CONSO_PAR_CRAN`, le calcul redevient
     `v * (CONSO_PAR_CRAN * CRANS_MAX) / (POUSSEE_MAX * sin θ)`, pas `v / sin θ`.
     À difficulté 2,4 : dérive 22,4 m/s, réservoir 96,8 u (pente 18), donc ≈ 32 u
     à 45° avec les constantes actuelles.
   - **freinage vertical au pire cas**, et non au meilleur : la hauteur de chute
     va de `TERRAIN_Y_MIN - DEPART_Y = 150` m à
     `TERRAIN_Y_MAX - DEPART_Y = 280` m selon l'altitude de la plateforme tirée.
     C'est **280 m** qu'il faut prendre. Le coût s'écrit
     `v_chute * (CONSO_PAR_CRAN * CRANS_MAX) / (POUSSEE_MAX - MOON_GRAVITY)`,
     où `v_chute` est la vitesse à annuler à l'accélération nette
     `POUSSEE_MAX - MOON_GRAVITY` (2,38 m/s² avec les valeurs actuelles) : 30,1 m/s
     à annuler donnent 12,7 s au cran 5 et ≈ 51 u avec les constantes du jour.
     Avec 150 m on n'obtient que ≈ 37 u, et on certifie un plafond gagnable qui
     ne l'est que sur le terrain le plus favorable. Le total (dérive +
     freinage) au pire cas, ≈ 83 u avec les constantes actuelles, doit rester
     nettement sous le réservoir du plafond, sinon une manche sur une
     plateforme basse est perdue d'avance. **Si le point 4 change
     `POUSSEE_MAX` ou `CONSO_PAR_CRAN`, recalculer ce total avec les formules
     ci-dessus avant de conclure quoi que ce soit sur le plafond** — les
     valeurs numériques (≈ 32 u, ≈ 51 u, ≈ 83 u) ne valent que pour
     `POUSSEE_MAX = 4` et `CONSO_PAR_CRAN = 0.8`.
3. **Vérifier que `DIFFICULTE_MAX = 2.4` est bien gagnable au pire cas**, par ce
   calcul et par le jeu. C'est l'arbitrage retenu : la rampe ne doit pas tuer, un
   joueur excellent doit pouvoir enchaîner. Depuis le niveau facile, atteindre le
   plafond demande `2,4 / 0,08 = 30` manches réussies.
   L'arbitrage **déjà tranché** dans le plan : on garde 2,4 (valeur du cahier des
   charges) et on remonte le réservoir du plafond en passant
   `CARBURANT_PENTE` de 25 à **18** — 96,8 u contre ≈ 83 u de besoin au pire cas,
   soit 17 % de marge. Les deux autres sorties possibles, écartées : abaisser
   `DIFFICULTE_MAX` à 2,0 ne suffit même pas (90 u contre 78,9 u de besoin, soit
   14 % de marge, sous le seuil exigé), et abaisser `DEPART_Y` réduit la chute
   mais rapproche le LEM du sol au départ, ce qui change la nature de la manche.
   Si le jeu contredit le calcul, corriger la valeur **et** le §8 du cahier des
   charges, pas l'invariant.
4. Ajuster les constantes. **Une seule** valeur à la fois, en notant l'effet
   observé — un changement groupé ne dit rien sur ce qui a agi.
   **Rapport (run D) : aucune valeur numérique de `constants.ts` n'a été
   changée.** L'arbitrage central de cette fiche — `CARBURANT_PENTE` de 25 à
   18 — était déjà en place depuis le run B (commit `f75dd61`). Le calcul du
   point 2/3 valide l'ensemble courant : 96,8 u de réservoir au plafond contre
   82,3 u de besoin au pire cas, soit 17,6 % de marge (seuil exigé 15 %). Les
   sept invariants de `reglages.test.ts` passent sans rien toucher, donc rien
   à ajuster « une valeur à la fois ». Seuls deux commentaires de
   `constants.ts` ont été réécrits, parce qu'ils annonçaient encore
   l'équilibrage au futur (« c'est l'équilibrage qui tranchera », « vérifié en
   T17 ») alors que le calcul est désormais fait et chiffré — réécrits au
   passé, avec les chiffres démontrés.
5. Confirmer ou corriger les inconnues chiffrées du README du plan : réglages de
   vol, palier de 0,08, plafond de 2,4, seuils de zoom, contraste de rugosité du
   terrain.
   **Rapport (run D) : non fait par cette tâche**, `plan/README.md` étant hors
   du périmètre de fichiers de cette fiche — reporté au run lui-même. État
   constaté et reporté dans `plan/README.md` (§ Inconnues à lever) : plafond
   2,4 — **levée** (calcul + invariant testé, 17,6 % de marge) ; palier 0,08 —
   **confirmé** (30 manches réussies depuis facile) ; seuils de zoom — ordre et
   bornes de vue désormais testés, ressenti manette encore ouvert ; contraste
   de rugosité — déjà mesuré par `terrain.test.ts` (10 % contre 89 %
   d'abscisses posables), réajustement à l'œil encore ouvert ; harmonie
   canvas/DOM — décision écrite dans `docs/design-system.md`, contrôle à l'œil
   toujours ouvert ; jouabilité des réglages — toujours ouverte, aucune partie
   jouée dans cet environnement.
6. Créer `packages/game/src/reglages.test.ts` : les invariants de cohérence (voir
   « Tests attendus »).
7. Reporter les **valeurs finales** dans `docs/cahier-des-charges.md` : les
   sections §3 (pilotage), §4 (physique et seuils), §5 (terrain), §6 (caméra),
   §7 (score) et §8 (difficulté) donnent aujourd'hui des ordres de grandeur ;
   elles doivent donner les valeurs retenues. En particulier :
   - §7 : l'écart d'une manche est l'écart **horizontal** au drapeau (déjà
     corrigé en T8) — vérifier que la formulation n'est pas revenue à une
     « distance » ;
   - §8 : écrire que le plafond de 2,4 est démontré gagnable **au pire cas de
     terrain** (chute de `TERRAIN_Y_MAX - DEPART_Y`), avec le réservoir retenu au
     plafond.
   - **Rapport (run D) : deux sections hors de cette liste §3–§8 ont aussi été
     corrigées**, parce que la garde « documentation et code d'accord » de
     cette même fiche l'imposait :
     - §9 promettait un « bouton de remise à zéro » alors que le jeu n'a pas de
       souris — c'est la touche `R`, deux appuis, `Échap` pour annuler ;
     - §10.4 annonçait un tableau de 100 lignes alors que l'écran en montre
       neuf et défile (voir task-16-hof-ecran.md, `LIGNES_VISIBLES`).
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
- **Le plafond doit rester franchissable au pire cas**, pas au meilleur : c'est
  l'arbitrage retenu, il faut le démontrer par le calcul du point 2 sur la
  hauteur de chute maximale, pas par l'intuition ni sur la plateforme la plus
  haute.
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
    l'annulation de la dérive à 45°**, avec une marge d'au moins 15 %, le
    freinage étant calculé sur la **hauteur de chute maximale**
    (`TERRAIN_Y_MAX - DEPART_Y`) et non minimale. Écrire l'invariant avec
    `TERRAIN_Y_MAX` dans la formule, pas un 150 en dur : c'est ce qui le rend
    sensible à un futur déplacement du monde. **Même règle pour les deux coûts
    eux-mêmes** : écrire
    `derive * (CONSO_PAR_CRAN * CRANS_MAX) / (POUSSEE_MAX * Math.sin(...))`
    pour la dérive et
    `vChute * (CONSO_PAR_CRAN * CRANS_MAX) / (POUSSEE_MAX - MOON_GRAVITY)`
    pour le freinage, avec `CONSO_PAR_CRAN`, `CRANS_MAX`, `POUSSEE_MAX` et
    `MOON_GRAVITY` importés de `constants.ts`, **pas** la lecture simplifiée
    `v / sin θ` du point 2 : cette dernière n'est correcte qu'aujourd'hui parce
    que `CONSO_PAR_CRAN * CRANS_MAX` vaut exactement `POUSSEE_MAX`, une
    coïncidence que ce même point 4 a le droit de casser. Un invariant écrit
    avec la forme simplifiée resterait vert après un changement de
    `POUSSEE_MAX` ou `CONSO_PAR_CRAN` alors même que le plafond serait devenu
    injouable ;
  - l'**étendue aplatie** de la plateforme à `DIFFICULTE_MAX` est au moins
    `LEM.largeurTrain + 2 * TERRAIN_PAS`. Comparer à `LEM.largeurTrain` seul ne
    couvre rien : `denivele` sur la largeur du train interpole vers les
    échantillons voisins, il faut un pas entier de marge de chaque côté ;
  - les seuils de zoom sont bien ordonnés : `vers4 < retour2 < vers2 < retour1` ;
  - **les quatre seuils tiennent dans la vue du zoom visé**, pas seulement les
    deux d'entrée : `SEUILS_ZOOM.vers2 <= PIXEL.height / 4`,
    `SEUILS_ZOOM.vers4 <= PIXEL.height / 8`, **et aussi**
    `SEUILS_ZOOM.retour1 <= PIXEL.height / 4` et
    `SEUILS_ZOOM.retour2 <= PIXEL.height / 8`. C'est le seuil de **retour** qui
    décide jusqu'à quelle altitude on reste au zoom serré en remontant : sans
    cette moitié de l'invariant, le sol peut sortir de l'écran sur toute la
    bande d'hystérésis alors même que l'ordre des quatre seuils reste
    parfaitement vert ;
  - `RUGOSITE_ACCIDENTEE` vaut au moins cinq fois `RUGOSITE_DOUCE` ;
  - **Chute au largage**, constat et non invariant testé (voir motif ci-dessous) :
    avec les valeurs actuelles,
    `TERRAIN_Y_MAX - DEPART_Y = 280` m dépasse `PIXEL.height / 2 +
    BIAIS_CAMERA_Y = 150` m (zoom 1) : le relief reste hors champ jusqu'à
    150 m d'altitude, même après le biais de caméra de T10. Pousser
    `BIAIS_CAMERA_Y` au point de couvrir tout le pire cas (≈ 190 px)
    déborderait la vue au zoom 2 (`190 / 2 = 95` m de décalage pour une
    demi-vue de 45 m) et rapprocherait trop le LEM du bord haut de l'écran
    pendant toute l'approche : ce n'est **pas** le bon levier. Rapprocher
    `DEPART_Y` du sol romprait l'arbitrage déjà tranché au point 3 (« change
    la nature de la manche »). **Arbitrage retenu ici** : garder
    `BIAIS_CAMERA_Y = 60`, qui réduit substantiellement la fenêtre aveugle
    sans l'annuler, et compter sur `dessineIndicateurCible` (T10) pour
    signaler la cible tant qu'elle reste hors champ. Écrire ce constat, chiffré,
    au §6 du cahier des charges plutôt que de prétendre l'écran toujours plein
    dès le largage.
    **Rapport (run D) : la fiche se trompait sur l'ordre de grandeur.** Elle
    craignait « ~13 s » et demandait de vérifier que l'attente reste
    « courte (quelques secondes, pas ~13) ». Mesure réelle sur 800 terrains
    (difficultés 0, 1, 2 et 2,4) : le relief entre dans le cadre après **6,8 à
    10,0 s** de chute libre, **8,6 s en médiane** — le pire cas théorique de
    12,7 s n'arrive jamais, parce que la génération ne pose jamais la cible à
    `TERRAIN_Y_MAX` : elle tombe entre `y = 307` et `y = 352`. Le §6.2 du
    cahier des charges porte désormais ce constat mesuré, pas la formulation
    prudente d'origine, et rappelle que la flèche d'indicateur de cible est
    affichée dès la première image.

## Fini quand

- [ ] Les trois niveaux ont été joués et les réglages ajustés, une valeur à la
      fois.
- [ ] Le niveau facile est gagnable, le plafond de difficulté est démontré
      franchissable par le calcul **sur la hauteur de chute maximale**.
- [ ] `docs/cahier-des-charges.md` porte les valeurs finales, plus des ordres de
      grandeur.
- [ ] `README.md` décrit le jeu fini, sans bandeau de chantier.
- [ ] Les invariants de réglage sont couverts par `reglages.test.ts`.
- [ ] La commande de vérification du README du plan passe au vert.
