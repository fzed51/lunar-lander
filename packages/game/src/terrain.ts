/**
 * Génération procédurale du relief lunaire d'une manche.
 *
 * ## Convention de repère — à lire avant d'écrire une comparaison
 *
 * `y` croît **vers le bas**, comme dans le `Heightfield` du moteur. Une crête a
 * donc un `y` **plus petit** qu'un fond de cratère, `TERRAIN_Y_MIN` désigne
 * l'altitude la plus **haute** de la bande et `TERRAIN_Y_MAX` la plus basse. Un
 * pic se plante en **retirant** des mètres à `y`, un canyon se creuse en en
 * **ajoutant**.
 *
 * ## Ce que la génération garantit
 *
 * - **déterminisme** : même graine et même difficulté, même terrain au bit
 *   près. Aucun `Math.random` dans ce fichier, tout tirage passe par le
 *   générateur à graine du moteur ;
 * - **une plateforme cible, par construction** : la mixité forcée garde un
 *   secteur doux d'indice intérieur, donc l'étape de la plateforme ne peut pas
 *   échouer. Ni `null`, ni `throw`, ni tirage répété jusqu'à ce que ça tombe
 *   bien — un `throw` depuis la génération d'une manche figerait l'image et se
 *   rejouerait soixante fois par seconde ;
 * - **au moins un repli** posable ailleurs, en descendant les paliers de
 *   distance plutôt qu'en rendant une liste vide ;
 * - **toute la surface dans `[TERRAIN_Y_MIN, TERRAIN_Y_MAX]` sans écrêtage de
 *   mise en forme** : la bande est tenue par la normalisation affine et par les
 *   marges de `TERRAIN_Y_TRAVAIL_*`. Un écrêtage échantillon par échantillon
 *   collerait plusieurs voisins sur la même valeur et fabriquerait des mesas
 *   plates — donc posables — au milieu des secteurs accidentés, là où l'on ne
 *   doit justement pas pouvoir se poser. Le seul `throw` du fichier garde cet
 *   invariant : c'est une assertion de réglage, inatteignable par construction,
 *   et surtout pas un chemin d'erreur prévu.
 */

import { createRng, denivele, type Heightfield, type Rng } from "@lem/engine";
import {
  AMPLITUDE_DECROISSANCE,
  AMPLITUDE_INITIALE,
  CANYON_LARGEUR_ECHANTILLONS,
  CANYON_PROFONDEUR,
  DEPART_DISTANCE,
  ECRETAGE_BALAYAGES_MAX,
  LEM,
  MONDE,
  PENTE_MAX_DOUCE,
  PICS_PAR_SECTEUR,
  PIC_HAUTEUR,
  PIXEL,
  PLATEFORME_ECHANTILLONS_BASE,
  PLATEFORME_ECHANTILLONS_MIN,
  PROBA_SECTEUR_ACCIDENTE_BASE,
  PROBA_SECTEUR_ACCIDENTE_MAX,
  PROBA_SECTEUR_ACCIDENTE_PENTE,
  REPLIS,
  REPLI_DISTANCE_PALIERS,
  REPLI_ECHANTILLONS,
  REPLI_MARGE_RACCORD,
  RUGOSITE_ACCIDENTEE,
  RUGOSITE_DOUCE,
  SEUIL_PLATITUDE,
  TERRAIN_PAS,
  TERRAIN_SECTEURS,
  TERRAIN_Y_DEPART,
  TERRAIN_Y_MAX,
  TERRAIN_Y_MIN,
  TERRAIN_Y_TRAVAIL_MAX,
  TERRAIN_Y_TRAVAIL_MIN,
} from "./constants.ts";

// --- Grandeurs dérivées ---

/** Largeur d'un secteur (m) : 1280 / 8 = 160. */
const LARGEUR_SECTEUR = MONDE.largeur / TERRAIN_SECTEURS;

/** Nombre d'échantillons : 1280 / 5 + 1 = 257, soit exactement 2^8 + 1. */
const NB_ECHANTILLONS = MONDE.largeur / TERRAIN_PAS + 1;

/** Échantillons par secteur : 256 / 8 = 32. */
const ECHANTILLONS_PAR_SECTEUR = (NB_ECHANTILLONS - 1) / TERRAIN_SECTEURS;

/**
 * Itérations du déplacement du point milieu : 8, puisque 257 = 2^8 + 1. Le
 * compte doit tomber juste, sinon la subdivision laisserait des échantillons
 * jamais remplis.
 */
const ITERATIONS_POINT_MILIEU = Math.log2(NB_ECHANTILLONS - 1);

/** Dénivelé maximal toléré entre deux échantillons d'un secteur doux (m). */
const MARCHE_MAX_DOUCE = PENTE_MAX_DOUCE * TERRAIN_PAS;

/** Demi-largeur de vue à zoom 1 (m) : le départ reste à cette distance des bords. */
const DEMI_VUE = PIXEL.width / 2;

/**
 * Tolérance du contrôle de bande (m). Purement flottante : la normalisation
 * affine et les marges réservées posent les valeurs sur les bornes au dernier
 * bit près, pas au-delà.
 */
const TOLERANCE_BANDE = 1e-6;

// --- Types publics ---

/** Un des `TERRAIN_SECTEURS` tronçons égaux du monde. */
export interface SecteurTerrain {
  /** Abscisse du bord gauche (m). */
  readonly xDebut: number;
  /** Abscisse du bord droit (m). */
  readonly xFin: number;
  /** Vrai pour un secteur infranchissable : crêtes déchiquetées et canyon. */
  readonly accidente: boolean;
}

/** Zone aplatie du relief, décrite en échantillons. Usage interne et tests. */
export interface Plateau {
  /** Index de l'échantillon central. */
  readonly centre: number;
  /** Nombre d'échantillons aplatis, toujours impair. */
  readonly echantillons: number;
  /** Valeur `y` commune à tous les échantillons aplatis (m). */
  readonly y: number;
}

/** Relief complet d'une manche, avec ses points remarquables. */
export interface Terrain {
  /** Le relief lui-même, interrogeable par les outils du moteur. */
  readonly hf: Heightfield;
  /** Découpage en secteurs, dans l'ordre des abscisses. */
  readonly secteurs: readonly SecteurTerrain[];
  /**
   * Plateforme cible, celle du drapeau. `x` tombe **exactement** sur un
   * échantillon et `largeur` est l'étendue **réellement aplatie**, pas la
   * largeur tirée : publier la largeur nominale mentirait à `estPosable`, au
   * rendu du liseré et au contrôle d'équilibrage.
   */
  readonly cible: {
    readonly x: number;
    readonly y: number;
    readonly largeur: number;
  };
  /** Plateaux de secours, plus étroits que la cible. Toujours au moins un. */
  readonly replis: readonly { readonly x: number; readonly largeur: number }[];
  /** Point de largage du LEM, et signe qui pointe **vers** la cible. */
  readonly depart: { readonly x: number; readonly sens: 1 | -1 };
}

// --- Petits outils ---

/**
 * Lecture d'un échantillon. Le `as number` n'est pas une complaisance : tous les
 * index passés ici sont bornés par la longueur du tableau, lui-même rempli avant
 * le premier appel.
 */
function lit(valeurs: readonly number[], i: number): number {
  return valeurs[i] as number;
}

/**
 * Difficulté ramenée à une valeur exploitable. Une difficulté négative ou non
 * finie ne doit ni élargir la plateforme au-delà de sa base, ni sortir les
 * probabilités de leurs bornes.
 */
function difficulteSaine(difficulte: number): number {
  return Number.isFinite(difficulte) ? Math.max(0, difficulte) : 0;
}

/** Premier et dernier échantillon d'un secteur, bornes **incluses**. */
function indicesSecteur(secteur: number): { premier: number; dernier: number } {
  const premier = secteur * ECHANTILLONS_PAR_SECTEUR;
  return { premier, dernier: premier + ECHANTILLONS_PAR_SECTEUR };
}

/** Abscisse (m) de l'échantillon `i`. L'origine du champ est à `x = 0`. */
function xEchantillon(i: number): number {
  return i * TERRAIN_PAS;
}

/** Médiane d'un nombre **impair** de valeurs. */
function mediane(valeurs: readonly number[]): number {
  const tri = [...valeurs].sort((a, b) => a - b);
  return lit(tri, (tri.length - 1) / 2);
}

/** Valeurs impaires de l'intervalle, pour un tirage de largeur en échantillons. */
function impairsDe(bornes: { min: number; max: number }): number[] {
  const valeurs: number[] = [];
  for (let v = bornes.min; v <= bornes.max; v++) {
    if (v % 2 === 1) valeurs.push(v);
  }
  return valeurs;
}

// --- Étape 2 et 3 : secteurs et mixité forcée ---

/**
 * Découpe le monde en secteurs et décide lesquels sont accidentés, puis **force
 * la mixité**.
 *
 * L'ordre compte. On garantit d'abord un secteur doux d'indice **intérieur** (1
 * à 6) : c'est là, et nulle part ailleurs, que la plateforme cible peut se
 * poser, et « 2 doux sur les 8 » ne garantit rien pour elle puisque les deux
 * seuls doux pourraient être 0 et 7. Ce secteur est ensuite **gelé** : les
 * bascules de complément ne le retouchent pas.
 */
function decoupeSecteurs(
  rng: Rng,
  difficulte: number,
): SecteurTerrain[] {
  const proba = Math.min(
    PROBA_SECTEUR_ACCIDENTE_MAX,
    PROBA_SECTEUR_ACCIDENTE_BASE +
      PROBA_SECTEUR_ACCIDENTE_PENTE * difficulteSaine(difficulte),
  );

  const accidente: boolean[] = [];
  for (let s = 0; s < TERRAIN_SECTEURS; s++) accidente.push(rng.bool(proba));

  const estAccidente = (s: number): boolean => accidente[s] === true;
  const tous: number[] = [];
  for (let s = 0; s < TERRAIN_SECTEURS; s++) tous.push(s);
  const interieurs = tous.slice(1, TERRAIN_SECTEURS - 1);
  const douxInterieurs = (): number[] => interieurs.filter((s) => !estAccidente(s));

  // 3.1 — au moins un secteur doux intérieur, puis on le gèle.
  let gele: number | null = null;
  if (douxInterieurs().length === 0) {
    gele = rng.pick(interieurs);
    accidente[gele] = false;
  }

  // 3.2 — compléter jusqu'à 2 doux et 2 accidentés, en tirant les bascules
  // parmi les secteurs non gelés plutôt qu'en les prenant dans l'ordre.
  const compte = (accidentes: boolean): number =>
    tous.filter((s) => estAccidente(s) === accidentes).length;

  for (let essai = 0; essai < TERRAIN_SECTEURS && compte(false) < 2; essai++) {
    const candidats = tous.filter((s) => estAccidente(s) && s !== gele);
    if (candidats.length === 0) break;
    accidente[rng.pick(candidats)] = false;
  }

  for (let essai = 0; essai < TERRAIN_SECTEURS && compte(true) < 2; essai++) {
    // On ne rend jamais accidenté le dernier secteur doux intérieur : ce serait
    // reprendre d'une main la garantie donnée de l'autre à l'étape 3.1.
    const uniqueDouxInterieur =
      douxInterieurs().length === 1 ? douxInterieurs()[0] : null;
    const candidats = tous.filter(
      (s) => !estAccidente(s) && s !== gele && s !== uniqueDouxInterieur,
    );
    if (candidats.length === 0) break;
    accidente[rng.pick(candidats)] = true;
  }

  return tous.map((s) => ({
    xDebut: s * LARGEUR_SECTEUR,
    xFin: (s + 1) * LARGEUR_SECTEUR,
    accidente: estAccidente(s),
  }));
}

// --- Étape 4 : champ de rugosité continu ---

/**
 * Rugosité en fonction de l'abscisse : la valeur d'un secteur est portée par son
 * **centre**, et interpolée linéairement entre centres voisins.
 *
 * Sans cette interpolation la modulation par secteur ne mordrait pas : aux trois
 * premières itérations du point milieu il n'y a que 1, 2 puis 4 points milieux
 * pour 8 secteurs, la macro-forme serait donc décidée par le seul secteur qui
 * possède `x = 640`, et il ne resterait qu'une dizaine de mètres d'amplitude
 * quand la modulation devient enfin locale.
 */
function champRugosite(
  secteurs: readonly SecteurTerrain[],
): (x: number) => number {
  const valeurs = secteurs.map((s) =>
    s.accidente ? RUGOSITE_ACCIDENTEE : RUGOSITE_DOUCE,
  );
  const premierCentre = LARGEUR_SECTEUR / 2;
  const dernierCentre = premierCentre + (valeurs.length - 1) * LARGEUR_SECTEUR;

  return (x: number): number => {
    if (x <= premierCentre) return lit(valeurs, 0);
    if (x >= dernierCentre) return lit(valeurs, valeurs.length - 1);
    const position = (x - premierCentre) / LARGEUR_SECTEUR;
    const i = Math.floor(position);
    const fraction = position - i;
    const gauche = lit(valeurs, i);
    const droite = lit(valeurs, i + 1);
    return gauche + (droite - gauche) * fraction;
  };
}

// --- Étape 5 : déplacement du point milieu ---

/**
 * Surface brute par déplacement du point milieu, en
 * `ITERATIONS_POINT_MILIEU` itérations.
 *
 * Chaque point milieu prend la moyenne de ses deux voisins, plus un déplacement
 * tiré **uniformément dans `[-amplitude, +amplitude]`** et multiplié par la
 * rugosité locale. La convention de tirage est écrite ici parce que
 * `±amplitude` et `±amplitude / 2` donnent deux reliefs d'ampleur double l'un de
 * l'autre, et que tout le dimensionnement de la bande en dépend.
 */
function surfacePointMilieu(
  rng: Rng,
  rugosite: (x: number) => number,
): number[] {
  const surface = new Array<number>(NB_ECHANTILLONS).fill(0);
  surface[0] = rng.range(TERRAIN_Y_DEPART.min, TERRAIN_Y_DEPART.max);
  surface[NB_ECHANTILLONS - 1] = rng.range(
    TERRAIN_Y_DEPART.min,
    TERRAIN_Y_DEPART.max,
  );

  let ecart = NB_ECHANTILLONS - 1;
  let amplitude = AMPLITUDE_INITIALE;
  for (let iteration = 0; iteration < ITERATIONS_POINT_MILIEU; iteration++) {
    const demi = ecart / 2;
    for (let i = demi; i < NB_ECHANTILLONS; i += ecart) {
      const moyenne = (lit(surface, i - demi) + lit(surface, i + demi)) / 2;
      const deplacement =
        rng.range(-amplitude, amplitude) * rugosite(xEchantillon(i));
      surface[i] = moyenne + deplacement;
    }
    ecart = demi;
    amplitude *= AMPLITUDE_DECROISSANCE;
  }
  return surface;
}

// --- Étape 6 : normalisation dans la bande de travail ---

/**
 * Ramène la surface dans `[TERRAIN_Y_TRAVAIL_MIN, TERRAIN_Y_TRAVAIL_MAX]` par
 * **une seule transformation affine** : même décalage et même facteur pour tous
 * les échantillons.
 *
 * Jamais d'écrêtage échantillon par échantillon ici : un écrêtage colle
 * plusieurs voisins sur la même valeur et fabrique une mesa plate, donc posable,
 * exactement là où le relief doit être infranchissable. La normalisation, elle,
 * préserve la forme et n'aplatit rien.
 */
function normaliseDansBande(surface: readonly number[]): number[] {
  let bas = lit(surface, 0);
  let haut = bas;
  for (const y of surface) {
    if (y < bas) bas = y;
    if (y > haut) haut = y;
  }
  if (bas >= TERRAIN_Y_TRAVAIL_MIN && haut <= TERRAIN_Y_TRAVAIL_MAX) {
    return [...surface];
  }

  const bande = TERRAIN_Y_TRAVAIL_MAX - TERRAIN_Y_TRAVAIL_MIN;
  const etendue = haut - bas;
  if (etendue > bande) {
    const facteur = bande / etendue;
    return surface.map((y) => TERRAIN_Y_TRAVAIL_MIN + (y - bas) * facteur);
  }
  // L'étendue tient dans la bande : une simple translation, la plus petite qui
  // rentre, plutôt qu'un recalage inutile contre une des deux bornes.
  const decalage =
    bas < TERRAIN_Y_TRAVAIL_MIN
      ? TERRAIN_Y_TRAVAIL_MIN - bas
      : TERRAIN_Y_TRAVAIL_MAX - haut;
  return surface.map((y) => y + decalage);
}

/**
 * Étapes 1 à 6 : secteurs, rugosité, point milieu, normalisation. Rend aussi le
 * générateur, que `genereTerrain` continue d'avancer — c'est la même suite de
 * tirages, pas une seconde.
 *
 * Exporté pour le test « la surface **avant** la passe de pics et de canyons
 * tient dans la bande de travail », qui n'a pas d'autre prise sur cet état
 * intermédiaire.
 */
export function construitSurfaceDeBase(
  graine: number,
  difficulte: number,
): { rng: Rng; secteurs: SecteurTerrain[]; surface: number[] } {
  const rng = createRng(graine);
  const secteurs = decoupeSecteurs(rng, difficulte);
  const brute = surfacePointMilieu(rng, champRugosite(secteurs));
  return { rng, secteurs, surface: normaliseDansBande(brute) };
}

// --- Étape 7 : pics et canyons ---

/**
 * Plante les aiguilles et creuse le canyon des secteurs **accidentés
 * uniquement** : c'est cette passe qui donne les crêtes déchiquetées, le
 * déplacement du point milieu seul ne produisant que du vallonné.
 *
 * Les échantillons de bord d'un secteur sont laissés tranquilles : ils sont
 * partagés avec le secteur voisin, et une aiguille posée là déborderait sur un
 * secteur doux. Deux aiguilles ne se superposent jamais — les centres sont tirés
 * **sans remise** — sinon la bande sauterait de deux hauteurs de pic d'un coup.
 */
function poseAccidents(
  rng: Rng,
  secteurs: readonly SecteurTerrain[],
  surface: number[],
): void {
  for (let s = 0; s < secteurs.length; s++) {
    if (!secteurs[s]?.accidente) continue;
    const { premier, dernier } = indicesSecteur(s);

    const candidats: number[] = [];
    for (let i = premier + 1; i <= dernier - 1; i++) candidats.push(i);

    const nombrePics = rng.int(PICS_PAR_SECTEUR.min, PICS_PAR_SECTEUR.max);
    for (let p = 0; p < nombrePics && candidats.length > 0; p++) {
      const choisi = rng.int(0, candidats.length - 1);
      const i = lit(candidats, choisi);
      candidats.splice(choisi, 1);
      surface[i] = lit(surface, i) - rng.range(PIC_HAUTEUR.min, PIC_HAUTEUR.max);
    }

    // Le canyon peut recouvrir une aiguille : la valeur repart alors de
    // `TERRAIN_Y_MIN` vers le bas, donc toujours dans la bande. C'est la seule
    // superposition tolérée, et elle est sans conséquence.
    const largeurCanyon = rng.int(
      CANYON_LARGEUR_ECHANTILLONS.min,
      CANYON_LARGEUR_ECHANTILLONS.max,
    );
    const profondeur = rng.range(CANYON_PROFONDEUR.min, CANYON_PROFONDEUR.max);
    const debutCanyon = rng.int(premier + 1, dernier - largeurCanyon);
    for (let i = debutCanyon; i < debutCanyon + largeurCanyon; i++) {
      surface[i] = lit(surface, i) + profondeur;
    }
  }
}

// --- Étapes 8 et 12 : écrêtage des pentes ---

/**
 * Écrête le dénivelé entre échantillons consécutifs de `[debut, fin]` à
 * `MARCHE_MAX_DOUCE`, en balayages alternés jusqu'à stabilité.
 *
 * Un échantillon **gelé** n'est jamais déplacé : c'est ce qui permet de raccorder
 * les bords d'un plateau sans le remettre à pencher. Quand les deux échantillons
 * d'une marche sont gelés, la marche est laissée telle quelle — la géométrie des
 * plateaux garantit que ce cas ne se présente qu'à l'intérieur d'un même
 * plateau, où la marche est nulle.
 *
 * Le nombre de balayages est **borné** et l'arrêt se fait sur « aucune valeur
 * modifiée », jamais sur « plus aucune violation » : une valeur reposée
 * identique à elle-même n'est pas un changement, alors qu'un écart recalculé en
 * flottant peut rester d'un cheveu au-dessus de la borne.
 */
function ecretePentes(
  surface: number[],
  debut: number,
  fin: number,
  estGele: (i: number) => boolean,
): void {
  const rapproche = (ancre: number, mobile: number): boolean => {
    const yAncre = lit(surface, ancre);
    const yMobile = lit(surface, mobile);
    if (Math.abs(yMobile - yAncre) <= MARCHE_MAX_DOUCE) return false;
    surface[mobile] =
      yMobile > yAncre
        ? yAncre + MARCHE_MAX_DOUCE
        : yAncre - MARCHE_MAX_DOUCE;
    return true;
  };
  // `mobile` est l'échantillon que le sens du balayage désigne comme déplaçable ;
  // s'il est gelé, on déplace l'autre plutôt que d'abandonner la marche.
  const traite = (ancre: number, mobile: number): boolean => {
    if (!estGele(mobile)) return rapproche(ancre, mobile);
    if (!estGele(ancre)) return rapproche(mobile, ancre);
    return false;
  };

  for (let balayage = 0; balayage < ECRETAGE_BALAYAGES_MAX; balayage++) {
    let modifie = false;
    if (balayage % 2 === 0) {
      for (let i = debut; i < fin; i++) {
        if (traite(i, i + 1)) modifie = true;
      }
    } else {
      for (let i = fin - 1; i >= debut; i--) {
        if (traite(i + 1, i)) modifie = true;
      }
    }
    if (!modifie) return;
  }
}

/**
 * Plages d'échantillons des **suites maximales** de secteurs doux.
 *
 * On écrête par suite, et non par secteur, parce que l'échantillon de frontière
 * entre deux secteurs doux appartient aux deux : le traiter deux fois, une fois
 * par secteur, laisserait la seconde passe défaire la première.
 */
function suitesDouces(
  secteurs: readonly SecteurTerrain[],
): { debut: number; fin: number }[] {
  const suites: { debut: number; fin: number }[] = [];
  let s = 0;
  while (s < secteurs.length) {
    if (secteurs[s]?.accidente) {
      s++;
      continue;
    }
    const premierSecteur = s;
    while (s < secteurs.length && !secteurs[s]?.accidente) s++;
    suites.push({
      debut: indicesSecteur(premierSecteur).premier,
      fin: indicesSecteur(s - 1).dernier,
    });
  }
  return suites;
}

/**
 * Passe d'adoucissement des secteurs doux. Sans elle, un secteur « doux » peut
 * reposer sur une pente macro de 40°, et il n'existe alors aucun sol posable en
 * dehors de la plateforme forcée.
 */
function adoucitSecteursDoux(
  secteurs: readonly SecteurTerrain[],
  surface: number[],
): void {
  for (const suite of suitesDouces(secteurs)) {
    ecretePentes(surface, suite.debut, suite.fin, () => false);
  }
}

// --- Étape 9 : contrôle de bande ---

/**
 * Vérifie qu'aucune valeur n'est sortie de `[TERRAIN_Y_MIN, TERRAIN_Y_MAX]`.
 *
 * C'est un **contrôle**, pas une passe de mise en forme : après la normalisation
 * affine et les marges réservées par `TERRAIN_Y_TRAVAIL_*`, aucune valeur ne
 * doit avoir besoin d'être ramenée. Si celui-ci parle, c'est un réglage à
 * corriger — pas un échantillon à écrêter.
 */
function verifieBande(surface: readonly number[], etape: string): void {
  for (let i = 0; i < surface.length; i++) {
    const y = lit(surface, i);
    if (
      y < TERRAIN_Y_MIN - TOLERANCE_BANDE ||
      y > TERRAIN_Y_MAX + TOLERANCE_BANDE
    ) {
      throw new Error(
        `genereTerrain : l'échantillon ${i} vaut ${y}, hors de la bande ` +
          `[${TERRAIN_Y_MIN}, ${TERRAIN_Y_MAX}] ${etape}. C'est un réglage à ` +
          `corriger, pas un échantillon à écrêter.`,
      );
    }
  }
}

// --- Étapes 10 et 11 : plateaux ---

/**
 * Aplatit `echantillons` échantillons centrés sur `centre`, à la **médiane** de
 * leurs valeurs. La médiane plutôt que la moyenne : elle tombe sur une valeur
 * réellement présente, donc le plateau ne flotte pas au-dessus d'une aiguille
 * voisine.
 */
function aplatitPlateau(
  surface: number[],
  centre: number,
  echantillons: number,
): Plateau {
  const demi = (echantillons - 1) / 2;
  const valeurs: number[] = [];
  for (let i = centre - demi; i <= centre + demi; i++) {
    valeurs.push(lit(surface, i));
  }
  const y = mediane(valeurs);
  for (let i = centre - demi; i <= centre + demi; i++) surface[i] = y;
  return { centre, echantillons, y };
}

/** Étendue réellement aplatie d'un plateau (m). */
function largeurAplatie(plateau: Plateau): number {
  return (plateau.echantillons - 1) * TERRAIN_PAS;
}

/**
 * Nombre d'échantillons de la plateforme cible pour une difficulté donnée.
 *
 * On retire **deux** échantillons par tranche de 2 points de difficulté, ce qui
 * garde le compte impair sans arrondi à rattraper : 9 (40 m) jusqu'à 2, 7 (30 m)
 * de 2 à 4, puis le plancher de 5 (20 m), qui reste au-dessus de
 * `ETENDUE_PLATE_MIN`.
 */
function echantillonsPlateforme(difficulte: number): number {
  return Math.max(
    PLATEFORME_ECHANTILLONS_MIN,
    PLATEFORME_ECHANTILLONS_BASE -
      2 * Math.floor(difficulteSaine(difficulte) / 2),
  );
}

/**
 * Pose les replis : plateaux supplémentaires, **jamais plus larges que la
 * plateforme cible**, dans un secteur doux autre que le sien. Ils rendent vrai
 * le « s'y rabattre est un choix sûr mais coûteux » du cahier des charges ; sans
 * eux, le joueur n'a aucune alternative et le score n'est plus un arbitrage.
 *
 * **Procédé imposé : énumérer d'abord, tirer ensuite.** Aucune boucle « je
 * retire jusqu'à trouver une place valide » : les contraintes peuvent n'admettre
 * aucune solution, et cette boucle-là ne terminerait jamais — l'onglet se
 * figerait en pleine partie.
 *
 * Le palier de distance ne sert qu'à **une** chose : écarter les candidats trop
 * proches de la cible. L'écart entre deux replis, lui, se dimensionne sur la
 * géométrie des plateaux — leur largeur aplatie plus `REPLI_MARGE_RACCORD` —
 * parce que la contrainte réelle est de ne pas se chevaucher et de laisser au
 * raccord de l'étape 12 la place de rattraper leur différence d'altitude. Y
 * réutiliser le palier de la cible (150 m) réserverait à chaque repli presque un
 * secteur entier de 160 m et ramènerait un tiers des manches difficiles à un
 * seul plateau de secours.
 *
 * Exporté pour le test du pire cas géométrique, qui a besoin de poser lui-même
 * les secteurs et la cible.
 */
export function poseReplis(
  rng: Rng,
  secteurs: readonly SecteurTerrain[],
  surface: number[],
  secteurCible: number,
  plateauCible: Plateau,
): Plateau[] {
  const echantillons = Math.min(
    rng.pick(impairsDe(REPLI_ECHANTILLONS)),
    plateauCible.echantillons,
  );
  const demi = (echantillons - 1) / 2;
  const xCible = xEchantillon(plateauCible.centre);

  const candidatsPour = (palier: number): number[] => {
    const candidats: number[] = [];
    for (let s = 0; s < secteurs.length; s++) {
      if (secteurs[s]?.accidente || s === secteurCible) continue;
      const { premier, dernier } = indicesSecteur(s);
      for (let c = premier + demi; c <= dernier - demi; c++) {
        if (Math.abs(xEchantillon(c) - xCible) > palier) candidats.push(c);
      }
    }
    return candidats;
  };

  // Un repli proche vaut mieux qu'une liste vide : on descend les paliers plutôt
  // que de retirer au joueur l'alternative promise par le cahier des charges.
  let candidats: number[] = [];
  for (const essai of REPLI_DISTANCE_PALIERS) {
    candidats = candidatsPour(essai);
    if (candidats.length > 0) break;
  }

  // Écart minimal entre deux centres : la largeur réellement aplatie d'un repli,
  // plus la marge de raccord. Tous les replis d'une manche ont la même largeur,
  // le calcul se fait donc une fois.
  const ecartMin = (echantillons - 1) * TERRAIN_PAS + REPLI_MARGE_RACCORD;

  const souhaite = rng.int(REPLIS.min, REPLIS.max);
  const nombre = Math.min(souhaite, candidats.length);
  const centres: number[] = [];
  let restants = candidats;
  for (let n = 0; n < nombre && restants.length > 0; n++) {
    const centre = rng.pick(restants);
    centres.push(centre);
    restants = restants.filter(
      (c) => Math.abs(xEchantillon(c) - xEchantillon(centre)) >= ecartMin,
    );
  }

  return centres
    .sort((a, b) => a - b)
    .map((centre) => aplatitPlateau(surface, centre, echantillons));
}

// --- Étape 13 : point de départ ---

/** Vrai si le LEM peut être largué là sans commencer à moins d'une demi-vue du bord. */
function departDansLeMonde(x: number): boolean {
  return x >= DEMI_VUE && x <= MONDE.largeur - DEMI_VUE;
}

// --- Point d'entrée ---

/**
 * Relief complet d'une manche. Pur et déterministe : même graine et même
 * difficulté, même terrain.
 */
export function genereTerrain(graine: number, difficulte: number): Terrain {
  const { rng, secteurs, surface } = construitSurfaceDeBase(graine, difficulte);

  poseAccidents(rng, secteurs, surface);
  adoucitSecteursDoux(secteurs, surface);
  verifieBande(surface, "après les pics, les canyons et l'adoucissement");

  // Étape 10 — plateforme cible. L'étape 3.1 garantit qu'il existe au moins un
  // secteur doux d'indice intérieur : ce tirage ne peut pas tomber à vide.
  const secteursPossibles: number[] = [];
  for (let s = 1; s < TERRAIN_SECTEURS - 1; s++) {
    if (!secteurs[s]?.accidente) secteursPossibles.push(s);
  }
  const secteurCible = rng.pick(secteursPossibles);
  const echantillonsCible = echantillonsPlateforme(difficulte);
  const margeCible = (echantillonsCible - 1) / 2;
  const bornesCible = indicesSecteur(secteurCible);
  const centreCible = rng.int(
    bornesCible.premier + margeCible,
    bornesCible.dernier - margeCible,
  );
  const plateauCible = aplatitPlateau(surface, centreCible, echantillonsCible);

  // Étape 11 — replis.
  const plateauxReplis = poseReplis(
    rng,
    secteurs,
    surface,
    secteurCible,
    plateauCible,
  );

  // Étape 12 — raccord des bords de plateau, vers l'extérieur seulement :
  // l'aplatissement à la médiane vient après l'adoucissement, il peut donc
  // laisser une marche entre le dernier échantillon du plateau et son voisin.
  const geles = new Set<number>();
  for (const plateau of [plateauCible, ...plateauxReplis]) {
    const demi = (plateau.echantillons - 1) / 2;
    for (let i = plateau.centre - demi; i <= plateau.centre + demi; i++) {
      geles.add(i);
    }
  }
  for (const suite of suitesDouces(secteurs)) {
    ecretePentes(surface, suite.debut, suite.fin, (i) => geles.has(i));
  }
  verifieBande(surface, "après le raccord des bords de plateau");

  // Étape 13 — départ : à distance tirée de la cible, du côté qui laisse la
  // place dans le monde. Le sens pointe **vers** la cible, sinon une manche sur
  // deux commencerait en s'éloignant du drapeau.
  const distance = rng.range(DEPART_DISTANCE.min, DEPART_DISTANCE.max);
  const xCible = xEchantillon(plateauCible.centre);
  const cotePrefere = rng.signe();
  const possibles = [
    xCible + cotePrefere * distance,
    xCible - cotePrefere * distance,
  ];
  // Le repli sur la borne ne sert jamais : la cible vit dans un secteur intérieur
  // et la distance vaut au plus 400 m, donc un des deux côtés tient toujours.
  const xDepart =
    possibles.find(departDansLeMonde) ??
    Math.min(Math.max(xCible + distance, DEMI_VUE), MONDE.largeur - DEMI_VUE);

  return {
    hf: { x0: 0, pas: TERRAIN_PAS, surface: [...surface] },
    secteurs,
    cible: {
      x: xCible,
      y: plateauCible.y,
      largeur: largeurAplatie(plateauCible),
    },
    replis: plateauxReplis.map((plateau) => ({
      x: xEchantillon(plateau.centre),
      largeur: largeurAplatie(plateau),
    })),
    depart: { x: xDepart, sens: xCible > xDepart ? 1 : -1 },
  };
}

/**
 * Vrai si le train d'atterrissage du LEM tient à plat en `x` : le dénivelé sous
 * sa largeur ne dépasse pas `SEUIL_PLATITUDE`.
 */
export function estPosable(terrain: Terrain, x: number): boolean {
  const demiTrain = LEM.largeurTrain / 2;
  return (
    denivele(terrain.hf, x - demiTrain, x + demiTrain) <= SEUIL_PLATITUDE
  );
}
