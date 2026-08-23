/**
 * Fond animé des écrans en DOM : ciel étoilé, la Terre qui tourne, une crête de
 * sol lunaire au premier plan et le drapeau planté dessus.
 *
 * ## Une couche à part, sans caméra
 *
 * Ce décor se peint sur `#fond`, la couche placée **sous** l'écran de jeu. Il n'a
 * pas de caméra : tout est en pixels du canvas 320 × 180, et rien ne passe par
 * `versEcranPixel`. C'est la différence de fond avec `draw.ts` — il n'y a ici
 * aucune position monde à convertir, donc aucun zoom à appliquer.
 *
 * ## Déterministe, et sans le moindre tirage
 *
 * Tout est fonction de `temps` : la dérive des continents, l'ondulation de la
 * toile. Le relief lunaire, lui, est une somme de deux sinus, donc une constante
 * de l'écran. Le champ d'étoiles est reçu en paramètre, tiré **une fois** par
 * l'écran qui appelle : passer un générateur au dessin ferait dépendre la suite
 * des tirages du nombre d'images affichées.
 *
 * ## Grille de pixels
 *
 * Tout est peint en rectangles pleins, sur des coordonnées entières. Aucun
 * `ctx.fill()` ni `ctx.stroke()` : le disque de la Terre est tracé **ligne par
 * ligne**, ce qui donne un bord en marches d'escalier franches là où un
 * `drawCircle` sortirait un cercle antialiasé, seul objet flou de l'écran.
 */

import { Vector2, type Renderer } from "@lem/engine";
import {
  DRAPEAU_PERIODE,
  TERRE,
  TERRE_ROTATION,
} from "../constants.ts";
import { PALETTE } from "../design/palette.ts";
import { dessineCiel, ONDULATION } from "./draw.ts";
import { ETOILES_ETENDUE, type Etoile } from "./stars.ts";

/** Un tour complet, en radians. */
const TOUR = Math.PI * 2;

// --- La Terre ---

/**
 * Direction de la lumière, dans le repère de la vue : `x` vers la droite, `y`
 * vers le **haut**, `z` vers le spectateur. Soleil en haut à gauche et un peu en
 * avant, si bien que le terminateur coupe le disque en biais et que le croissant
 * d'atmosphère se voit sur le bord éclairé.
 *
 * Le vecteur est unitaire : c'est ce qui permet de comparer son produit scalaire
 * avec la normale directement à 0.
 */
const LUMIERE = uniteXyz(-0.58, 0.34, 0.74);

/**
 * Rayon réduit (part du rayon du disque) à partir duquel on peint l'atmosphère
 * plutôt que le globe : un liseré de trois pixels sur le bord éclairé.
 */
const LIMBE = 0.88;

/**
 * Continents, en longitude / latitude (degrés) et rayon angulaire (degrés). Six
 * taches rondes, pas une carte : à 26 pixels de rayon, un contour fidèle ne
 * tiendrait pas et se lirait comme du bruit.
 *
 * La longitude 0 fait face au spectateur à `temps = 0`, et la latitude est
 * comptée positive vers le nord.
 */
const CONTINENTS: readonly {
  readonly lon: number;
  readonly lat: number;
  readonly rayon: number;
}[] = [
  { lon: -75, lat: 12, rayon: 24 },
  { lon: -58, lat: -22, rayon: 18 },
  { lon: 16, lat: 4, rayon: 26 },
  { lon: 32, lat: 46, rayon: 15 },
  { lon: 100, lat: 36, rayon: 26 },
  { lon: 136, lat: -26, rayon: 14 },
];

/** Une tache de continent, prête à comparer : direction unitaire et seuil. */
interface Tache {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Cosinus du rayon angulaire : un point est dans la tache si `dot ≥ seuil`. */
  readonly seuil: number;
}

/**
 * Les continents en direction unitaire, calculés une fois au chargement. Le
 * test d'appartenance devient alors un produit scalaire comparé à un cosinus,
 * sans aucune trigonométrie par pixel.
 */
const TACHES: readonly Tache[] = CONTINENTS.map((c) => {
  const lon = (c.lon / 360) * TOUR;
  const lat = (c.lat / 360) * TOUR;
  return {
    x: Math.sin(lon) * Math.cos(lat),
    y: Math.sin(lat),
    z: Math.cos(lon) * Math.cos(lat),
    seuil: Math.cos((c.rayon / 360) * TOUR),
  };
});

/** Vecteur unitaire à trois composantes. */
function uniteXyz(
  x: number,
  y: number,
  z: number,
): { readonly x: number; readonly y: number; readonly z: number } {
  const norme = Math.hypot(x, y, z);
  return { x: x / norme, y: y / norme, z: z / norme };
}

/** Vrai quand la direction du globe donnée tombe dans une tache de continent. */
function estContinent(x: number, y: number, z: number): boolean {
  for (const tache of TACHES) {
    if (x * tache.x + y * tache.y + z * tache.z >= tache.seuil) return true;
  }
  return false;
}

/**
 * Couleur d'un pixel du disque, ou `null` hors du disque.
 *
 * `u` et `v` sont les coordonnées réduites du pixel dans le disque (`v` vers le
 * **bas**, comme le canvas). La normale de la sphère en ce point vaut
 * `(u, -v, z)` avec `z = √(1 - u² - v²)`, la composante qui pointe vers le
 * spectateur : c'est elle qui donne à la fois l'éclairement et la position sur le
 * globe, sans jamais projeter quoi que ce soit.
 *
 * `cosA` et `sinA` sont ceux de l'angle de rotation, passés tout calculés : ils
 * ne dépendent pas du pixel.
 */
function couleurTerre(
  u: number,
  v: number,
  cosA: number,
  sinA: number,
): string | null {
  const rayonCarre = u * u + v * v;
  if (rayonCarre > 1) return null;
  const z = Math.sqrt(1 - rayonCarre);
  const haut = -v;

  // Face non éclairée : le terminateur est la ligne où ce produit s'annule.
  const eclairement = u * LUMIERE.x + haut * LUMIERE.y + z * LUMIERE.z;
  if (eclairement <= 0) return PALETTE.nuit;

  // Bord éclairé : le croissant d'atmosphère, avant tout continent.
  if (rayonCarre >= LIMBE * LIMBE) return PALETTE.terreCiel;

  // Passage dans le repère du globe : rotation inverse autour de l'axe des
  // pôles. C'est ce qui fait dériver les continents avec le temps, le disque et
  // son éclairement restant, eux, immobiles.
  const gx = u * cosA - z * sinA;
  const gz = u * sinA + z * cosA;
  return estContinent(gx, haut, gz) ? PALETTE.terreSol : PALETTE.terreOcean;
}

/**
 * La Terre : disque océan, taches de continents qui dérivent selon `temps`,
 * croissant d'atmosphère sur le bord éclairé et terminateur.
 *
 * Le disque est peint **par lignes**, et chaque ligne en runs de couleur
 * constante : un seul `fillRect` par plage, au lieu d'un par pixel. Le résultat
 * est le même à l'écran, à quelques centaines d'appels de canvas près par image.
 */
function dessineTerre(r: Renderer, temps: number): void {
  const angle = temps * TERRE_ROTATION * TOUR;
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const { rayon, centre } = TERRE;

  for (let dy = -rayon; dy <= rayon; dy++) {
    const y = centre.y + dy;
    if (y < 0 || y >= r.height) continue;

    let couleur: string | null = null;
    let debut = 0;
    const pose = (fin: number): void => {
      if (couleur !== null && fin > debut) {
        r.fillRect(new Vector2(debut, y), fin - debut, 1, couleur);
      }
    };

    for (let dx = -rayon; dx <= rayon; dx++) {
      const x = centre.x + dx;
      const suivante =
        x < 0 || x >= r.width
          ? null
          : couleurTerre(dx / rayon, dy / rayon, cosA, sinA);
      if (suivante !== couleur) {
        pose(x);
        couleur = suivante;
        debut = x;
      }
    }
    pose(centre.x + rayon + 1);
  }
}

// --- Sol lunaire du premier plan ---

/**
 * La crête du sol : deux ondulations de périodes premières entre elles, pour un
 * profil qui ne se répète pas sur la largeur de l'écran. Le corps est peint en
 * `reliefSombre` — c'est un premier plan, il doit rester derrière le texte du
 * menu — et la crête reçoit un liseré `reliefMoyen` qui la détache du ciel.
 */
const SOL = {
  /** Ordonnée moyenne de la crête (px). */
  base: 148,
  ondes: [
    { amplitude: 9, periode: 197, phase: 0.4 },
    { amplitude: 4, periode: 61, phase: 1.9 },
  ],
  /** Épaisseur (px) du liseré clair posé sur la crête. */
  lisere: 2,
} as const;

/**
 * Ordonnée entière de la crête du sol à l'abscisse `x`. Pure et sans mémoire :
 * c'est ce qui permet de planter le drapeau exactement sur le sol sans stocker
 * de profil.
 */
export function creteSol(x: number): number {
  let y = SOL.base;
  for (const onde of SOL.ondes) {
    y -= onde.amplitude * Math.sin((x / onde.periode) * TOUR + onde.phase);
  }
  return Math.round(y);
}

/** Le sol lunaire, colonne par colonne, du haut de la crête au bas de l'écran. */
function dessineSol(r: Renderer): void {
  for (let x = 0; x < r.width; x++) {
    const haut = Math.max(0, creteSol(x));
    if (haut >= r.height) continue;
    r.fillRect(new Vector2(x, haut), 1, r.height - haut, PALETTE.reliefSombre);
    const fin = Math.min(r.height, haut + SOL.lisere);
    r.fillRect(new Vector2(x, haut), 1, fin - haut, PALETTE.reliefMoyen);
  }
}

// --- Drapeau planté dans le décor ---

/** Le drapeau du décor, en pixels du canvas. */
const DRAPEAU = {
  /** Abscisse du mât. À gauche, où le bloc de menu ne le recouvre pas. */
  x: 58,
  /** Hauteur du mât, du sol au haut de la toile. */
  mat: 26,
  /** Toile : quatre rangées de `rangee` pixels de haut. */
  largeur: 9,
  rangee: 2,
} as const;

/**
 * Image (0 à 3) de l'ondulation de la toile à l'instant `temps`, dérivée de
 * `DRAPEAU_PERIODE` : le cycle des quatre poses dure une période, donc l'image
 * change toutes les `DRAPEAU_PERIODE / 4` secondes.
 *
 * Fonction du **temps écoulé** et de rien d'autre : l'ondulation ne dépend ni du
 * nombre d'images affichées, ni d'un tirage.
 */
export function poseDrapeau(temps: number): number {
  const images = ONDULATION.length;
  return Math.abs(Math.floor(temps / (DRAPEAU_PERIODE / images))) % images;
}

/** Le drapeau : mât `grisPale` planté sur la crête, toile `alerte` qui ondule. */
function dessineDrapeauFond(r: Renderer, temps: number): void {
  const pied = creteSol(DRAPEAU.x);
  const haut = pied - DRAPEAU.mat;
  r.fillRect(new Vector2(DRAPEAU.x, haut), 1, DRAPEAU.mat, PALETTE.grisPale);

  const rangees = ONDULATION[poseDrapeau(temps)] as readonly number[];
  for (let i = 0; i < rangees.length; i++) {
    const decalage = rangees[i] ?? 0;
    r.fillRect(
      new Vector2(DRAPEAU.x + 1 + decalage, haut + i * DRAPEAU.rangee),
      DRAPEAU.largeur,
      DRAPEAU.rangee,
      PALETTE.alerte,
    );
  }
}

// --- Étoiles ---

/**
 * Étoile ramenée dans le cadre du canvas. `genereEtoiles` tire des positions
 * **monde**, sur l'étendue de parallaxe d'une manche ; le fond, lui, n'a pas de
 * caméra et couvre exactement la surface. Le champ est donc remis à l'échelle du
 * canvas — et non enroulé, ce qui doublerait la densité d'étoiles sur la moitié
 * gauche du ciel.
 */
function versCadre(r: Renderer, etoile: Etoile): Vector2 {
  return new Vector2(
    Math.round((etoile.x / ETOILES_ETENDUE.largeur) * (r.width - 1)),
    Math.round((etoile.y / ETOILES_ETENDUE.hauteur) * (r.height - 1)),
  );
}

/**
 * Le champ d'étoiles, un pixel chacune. Les étoiles tombées derrière la crête
 * sont peintes puis recouvertes par le sol : c'est un pixel gratuit, contre un
 * test de visibilité qui referait le calcul de la crête pour chacune.
 */
function dessineEtoilesFond(r: Renderer, etoiles: readonly Etoile[]): void {
  for (const etoile of etoiles) {
    r.drawPixel(versCadre(r, etoile), PALETTE[etoile.teinte]);
  }
}

// --- Assemblage ---

/**
 * Une image complète du fond animé.
 *
 * L'ordre est figé : le ciel efface l'image précédente, les étoiles passent
 * dessus, la Terre devant les étoiles, puis le sol qui masque tout ce qui est
 * derrière lui, et le drapeau planté par-dessus le sol.
 *
 * `etoiles` est **reçu**, jamais tiré ici : l'appelant le tire une fois, sur une
 * graine fixe, pour que le ciel de l'accueil soit toujours le même.
 */
export function dessineFond(
  r: Renderer,
  temps: number,
  etoiles: readonly Etoile[],
): void {
  dessineCiel(r);
  dessineEtoilesFond(r, etoiles);
  dessineTerre(r, temps);
  dessineSol(r);
  dessineDrapeauFond(r, temps);
}
