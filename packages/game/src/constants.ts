/** Résolution interne du canvas, agrandie ensuite par un facteur ENTIER. */
export const PIXEL = { width: 320, height: 180 } as const;

/** Gravité lunaire (m/s²), constante et verticale. */
export const MOON_GRAVITY = 1.62;

// --- Particules (explosion, poussière, gaz du moteur) ---
/** Durée de vie d'une particule (s) ; l'opacité fond linéairement dessus. */
export const PARTICLE_LIFE = 0.6;
/** Vitesse d'éjection d'une particule (px/s), légèrement randomisée. */
export const PARTICLE_SPEED = 40;

// --- Monde et terrain ---
//
// Convention de repère, celle du `Heightfield` du moteur : `y` croît **vers le
// bas**. « Plus haut » veut donc dire « `y` plus petit », `TERRAIN_Y_MIN` est
// l'altitude la plus **haute** que la surface peut atteindre, et
// `TERRAIN_Y_MAX` la plus basse. C'est la source d'erreur numéro un de tout ce
// qui touche au relief : à relire avant d'écrire une comparaison.

/** Étendue du monde jouable (m). À zoom 1, 1 m se dessine sur 1 pixel. */
export const MONDE = { largeur: 1280, hauteur: 420 } as const;

/**
 * Plafond du monde : coordonnée `y` du haut de l'espace jouable (m). Le LEM qui
 * passe **au-dessus** — donc à un `y` plus **petit**, `y` croissant vers le bas
 * — sort du monde et perd la manche. Sans plafond, un LEM lancé vers le haut
 * monterait indéfiniment et la partie ne finirait jamais.
 */
export const PLAFOND_Y = 0;

/** Écart horizontal entre deux échantillons du relief (m) → 257 échantillons. */
export const TERRAIN_PAS = 5;

/** Altitude la plus haute que la surface peut atteindre (m, `y` vers le bas). */
export const TERRAIN_Y_MIN = 270;
/** Altitude la plus basse que la surface peut atteindre (m, `y` vers le bas). */
export const TERRAIN_Y_MAX = 400;

/** Découpage du monde en secteurs égaux : 160 m et 32 échantillons chacun. */
export const TERRAIN_SECTEURS = 8;

/** Géométrie du LEM (m). Définie ici parce que `estPosable` en a besoin. */
export const LEM = { largeurTrain: 8, hauteur: 7, rayon: 4 } as const;

/** Dénivelé toléré (m) sous la largeur du train pour déclarer un sol posable. */
export const SEUIL_PLATITUDE = 1;

/** Facteur de rugosité d'un secteur doux : le relief y reste vallonné. */
export const RUGOSITE_DOUCE = 0.15;
/** Facteur de rugosité d'un secteur accidenté. */
export const RUGOSITE_ACCIDENTEE = 1.6;

/**
 * Amplitude (m) du déplacement de la **première** itération du point milieu,
 * avant modulation par la rugosité, et facteur appliqué à chaque itération
 * suivante.
 *
 * Ce qui compte ici n'est pas la somme des amplitudes — la normalisation affine
 * de l'étape 6 ramène de toute façon la surface dans la bande de travail sans
 * rien écrêter, donc aucune mesa plate — mais le **rapport entre la dernière
 * amplitude et les premières** : c'est lui qui décide si le relief est tourmenté
 * à l'échelle du train d'atterrissage (8 m, deux pas d'échantillonnage) ou
 * seulement à l'échelle du secteur.
 *
 * À `0,55`, la dernière itération ne déplaçait plus que `18 × 0,55^7 ≈ 0,27 m`,
 * soit `0,44 m` à `RUGOSITE_ACCIDENTEE` : loin sous `SEUIL_PLATITUDE`, donc un
 * secteur accidenté restait posable presque partout entre ses aiguilles
 * (mesuré : 49 % de ses abscisses). À `0,70`, elle vaut `18 × 0,70^7 ≈ 1,5 m`,
 * soit `2,4 m` en accidenté : le train n'y tient plus à plat. Mesuré sur
 * 200 graines à difficulté 2,4 : **10 % des abscisses d'un secteur accidenté
 * sont posables, contre 89 % en secteur doux** — les secteurs doux gardent leur
 * platitude parce que la passe d'adoucissement les écrête à `PENTE_MAX_DOUCE`,
 * qui n'est pas touchée par ce réglage.
 *
 * `terrain.test.ts` borne les deux fractions : elles sont l'expression testable
 * du « zones franchement accidentées où poser est impossible » du cahier des
 * charges.
 */
export const AMPLITUDE_INITIALE = 18;
export const AMPLITUDE_DECROISSANCE = 0.7;

/** Dénivelé maximal par pas dans un secteur doux : 0,3 × 5 m = 1,5 m. */
export const PENTE_MAX_DOUCE = 0.3;

/** Nombre d'aiguilles d'un échantillon plantées dans un secteur accidenté. */
export const PICS_PAR_SECTEUR = { min: 2, max: 5 } as const;
/** Hauteur (m) dont une aiguille est remontée. */
export const PIC_HAUTEUR = { min: 12, max: 28 } as const;

/** Largeur (en échantillons) du canyon creusé dans un secteur accidenté. */
export const CANYON_LARGEUR_ECHANTILLONS = { min: 2, max: 3 } as const;
/** Profondeur (m) dont ce canyon est creusé. */
export const CANYON_PROFONDEUR = { min: 20, max: 40 } as const;

/**
 * Bande dans laquelle vit la surface **avant** la passe de pics et de canyons.
 *
 * Les deux marges sont réservées pour que la plus haute aiguille et le plus
 * profond canyon tiennent dans `[TERRAIN_Y_MIN, TERRAIN_Y_MAX]` sans être
 * rognés : une aiguille écrêtée à la borne, à égalité avec ses voisins, n'est
 * plus une aiguille.
 */
export const TERRAIN_Y_TRAVAIL_MIN = TERRAIN_Y_MIN + PIC_HAUTEUR.max;
export const TERRAIN_Y_TRAVAIL_MAX = TERRAIN_Y_MAX - CANYON_PROFONDEUR.max;

/**
 * Intervalle où sont tirées les **deux valeurs d'extrémité** de la surface
 * (échantillons 0 et 256). Centré dans la bande de travail, pour que le
 * déplacement du point milieu ait de la place des deux côtés.
 */
export const TERRAIN_Y_DEPART = { min: 318, max: 340 } as const;

/**
 * Étendue (m) **réellement plate** minimale à garantir sur un plateau : la
 * largeur du train, plus un échantillon entier de marge de chaque côté, pour que
 * le dénivelé sous le train ne morde jamais sur un voisin non aplati.
 */
export const ETENDUE_PLATE_MIN = LEM.largeurTrain + 2 * TERRAIN_PAS;

/**
 * Les plateaux se dimensionnent en **échantillons**, pas en mètres : c'est
 * l'aplatissement qui porte sur des échantillons, une largeur en mètres mal
 * alignée ne couvrirait pas ce qu'elle annonce. Les deux valeurs sont
 * **impaires**, pour que la cible tombe sur l'échantillon du milieu.
 */
export const PLATEFORME_ECHANTILLONS_BASE = 9; // 40 m d'étendue plate
export const PLATEFORME_ECHANTILLONS_MIN = 5; // 20 m, soit ≥ ETENDUE_PLATE_MIN

/**
 * Nombre de replis **souhaité**, pas garanti : la géométrie peut n'offrir
 * qu'une seule place. La génération en pose toujours au moins un.
 */
export const REPLIS = { min: 2, max: 4 } as const;
/** Largeur d'un repli en échantillons (valeurs impaires) : 20 à 30 m aplatis. */
export const REPLI_ECHANTILLONS = { min: 5, max: 7 } as const;
/**
 * Distances (m) à la plateforme cible, du plus exigeant au plus tolérant. On
 * descend d'un palier quand aucun centre n'est admissible, plutôt que de rendre
 * une liste vide : un seuil unique de 150 m est parfois géométriquement
 * infaisable.
 *
 * Ces paliers ne servent **qu'à** la distance à la cible. L'écart entre deux
 * replis se dimensionne sur `REPLI_MARGE_RACCORD`, pas sur eux : un secteur ne
 * fait que 160 m, deux replis séparés de 150 m n'y tiendraient quasiment jamais
 * et le jeu retomberait à un seul plateau de secours.
 */
export const REPLI_DISTANCE_PALIERS = [150, 100, 60] as const;

/**
 * Marge (m) laissée entre les bords **aplatis** de deux replis. L'écart minimal
 * entre leurs centres vaut donc « largeur aplatie + cette marge ».
 *
 * Elle n'est pas là que pour éviter le chevauchement : c'est aussi la place que
 * le raccord de pente de l'étape 12 a pour rattraper la différence d'altitude
 * entre deux plateaux voisins, tous leurs échantillons étant gelés. 30 m font
 * six pas d'échantillonnage, soit 9 m de dénivelé rattrapables à
 * `PENTE_MAX_DOUCE` — largement au-dessus de l'écart que deux médianes prises à
 * cette distance dans un secteur déjà adouci peuvent présenter.
 */
export const REPLI_MARGE_RACCORD = 30;

/** Probabilité qu'un secteur soit accidenté : base, pente en difficulté, plafond. */
export const PROBA_SECTEUR_ACCIDENTE_BASE = 0.25;
export const PROBA_SECTEUR_ACCIDENTE_PENTE = 0.15;
export const PROBA_SECTEUR_ACCIDENTE_MAX = 0.75;

/** Distance (m) entre le point de départ du LEM et la plateforme cible. */
export const DEPART_DISTANCE = { min: 250, max: 400 } as const;

/**
 * Nombre maximal de balayages d'un écrêtage de pente. L'écrêtage converge en
 * deux ou trois balayages ; la borne est là pour qu'aucune boucle de génération
 * ne puisse tourner sans fin en pleine partie.
 */
export const ECRETAGE_BALAYAGES_MAX = 64;

// --- Dynamique du LEM ---
//
// Le pilotage est volontairement grossier : six crans de poussée mémorisés
// plutôt qu'un dosage continu, et une rotation lente. La poussée maximale vaut
// un peu moins de 2,5 fois la gravité lunaire, ce qui laisse remonter d'une
// mauvaise approche sans annuler l'inertie d'un coup.

/** Poussée délivrée au cran 5, réservoir plein (m/s²). */
export const POUSSEE_MAX = 4;

/** Cran de poussée le plus élevé ; les crans vont de 0 à cette valeur. */
export const CRANS_MAX = 5;

/** Carburant brûlé par seconde et par cran (unités/s/cran). */
export const CONSO_PAR_CRAN = 0.8;

/** Vitesse de rotation de l'assiette, flèche tenue (rad/s, soit 45°/s). */
export const VITESSE_ROTATION = Math.PI / 4;

/** Assiette maximale de part et d'autre de la verticale (rad, soit 90°). */
export const ASSIETTE_MAX = Math.PI / 2;

// --- Critères d'atterrissage ---
//
// Les trois seuils de vol du §4.1 du cahier des charges, plus `SEUIL_PLATITUDE`
// déjà défini plus haut avec le terrain : quatre conditions à réunir au contact.
// Tous sont des **ordres de grandeur réglés en T17**, pas des valeurs arrêtées :
// c'est l'équilibrage qui tranchera, et il ne touchera qu'à ces lignes.
//
// Les seuils sont **inclusifs** : le contact pile au seuil est un posé. Ils sont
// comparés à des grandeurs que le joueur lit sur le HUD, et refuser une valeur
// affichée comme conforme serait incompréhensible.

/** Vitesse verticale maximale **à la descente** au contact (m/s). */
export const SEUIL_VY = 2;

/** Vitesse horizontale maximale au contact, en valeur absolue (m/s). */
export const SEUIL_VX = 1;

/** Inclinaison maximale au contact, de part et d'autre de la verticale (rad, soit 10°). */
export const SEUIL_ASSIETTE = Math.PI / 18;

/**
 * Fraction de la demi-largeur du train à laquelle se trouvent les **épaules**
 * du LEM, les deux points hauts de la coque. Le fuselage est plus étroit que le
 * train : c'est ce qui permet à une aiguille de passer entre les pieds et de
 * heurter quand même la coque.
 */
export const COQUE_LARGEUR_EPAULES = 0.75;

// --- Partie, manches et difficulté ---
//
// La difficulté est une grandeur **continue** : le niveau choisi à l'accueil en
// donne la valeur de départ (0, 1 ou 2), et chaque manche réussie y ajoute un
// palier. Elle module ensuite le relief (T6), la vitesse initiale et la dotation
// de carburant.

/** Vies d'une partie. La troisième perdue termine la partie. */
export const VIES_INITIALES = 3;

/** Niveaux proposés à l'accueil, et difficulté de départ de chacun. */
export const NIVEAUX = { facile: 0, moyen: 1, difficile: 2 } as const;

/**
 * Palier de difficulté gagné par manche **réussie**. Volontairement doux : il
 * faut treize manches réussies pour franchir un cran entier de difficulté.
 */
export const PALIER_DIFFICULTE = 0.08;

/**
 * Plafond de difficulté, **volontairement gagnable**. Il est vérifié en T17 sur
 * le **pire cas** de terrain — plateforme à `TERRAIN_Y_MAX`, donc une chute de
 * `TERRAIN_Y_MAX - DEPART_Y` = 280 m — et non sur le meilleur.
 */
export const DIFFICULTE_MAX = 2.4;

/** Vitesse horizontale initiale (m/s) : base, pente en difficulté, plafond. */
export const VH_BASE = 8;
export const VH_PENTE = 6;
export const VH_MAX = 32;

/**
 * Dotation de carburant (unités) : base, pente en difficulté, plancher.
 *
 * La pente est à **18** et non 25, et c'est l'arbitrage qui tient le plafond de
 * difficulté de 2,4. Au pire cas, freiner 280 m de chute libre coûte ≈ 51 u
 * (30,1 m/s à annuler à 2,38 m/s² net, à 4 u/s) et annuler la dérive de
 * 22,4 m/s à 45° coûte ≈ 32 u, soit ≈ 83 u. Avec une pente de 25 le réservoir
 * au plafond ne valait que 80 u : la manche était **perdue d'avance** sur une
 * plateforme basse. Avec 18 il vaut 96,8 u, soit 17 % de marge.
 */
export const CARBURANT_BASE = 140;
export const CARBURANT_PENTE = 18;
export const CARBURANT_MIN = 60;

/**
 * Coordonnée `y` de largage du LEM (m). C'est un `y`, pas une altitude : le
 * repère descend, donc l'altitude au-dessus du sol s'en déduit en retranchant
 * ce `y` à celui de la surface.
 */
export const DEPART_Y = 120;

/** Temps (s) passé sur le bandeau de posé ou de crash avant la manche suivante. */
export const DELAI_ENCHAINEMENT = 2;
