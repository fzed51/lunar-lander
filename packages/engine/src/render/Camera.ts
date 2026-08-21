import { Vector2 } from "../math/Vector2.ts";

/**
 * Caméra 2D à zoom **entier**, pensée pour du pixel art.
 *
 * ## Ce que la caméra fait, et ce qu'elle ne fait pas
 *
 * Elle convertit des coordonnées : monde → écran et écran → monde. Elle ne
 * dessine rien et ne touche jamais au contexte canvas. En particulier, il n'y a
 * **pas** de `withCamera` qui appliquerait un `ctx.scale` : une mise à l'échelle
 * du contexte place les bords des formes à des coordonnées fractionnaires dès
 * que la position monde n'est pas entière — un LEM à `x = 623,47` — ce qui rend
 * des pixels antialiasés, de largeur irrégulière. Le jeu convertit donc ses
 * positions avec {@link versEcranPixel} et multiplie ses tailles par le zoom
 * entier ; le contexte canvas, lui, reste à l'échelle 1.
 *
 * ## Conventions
 *
 * - `y` croît **vers le bas**, comme le canvas.
 * - `centre` est le point du monde qui tombe au **centre** de la vue.
 * - `zoom` est un **entier ≥ 1** : un pixel écran vaut `1 / zoom` unité monde.
 *   Un zoom fractionnaire est refusé par {@link avecZoom} et {@link creeCamera},
 *   c'est le seul moyen de garantir la grille de pixels.
 * - `vue` est la taille de la surface de rendu, **en pixels**.
 *
 * ## Coordonnées non finies
 *
 * Aucune fonction de ce module ne filtre les `NaN` ni les infinis d'un
 * `Vector2` d'entrée : ils traversent le calcul et ressortent en `NaN`, y
 * compris après {@link versEcranPixel} (`Math.round(NaN)` vaut `NaN`). Le
 * canvas, lui, ignore silencieusement un ordre de dessin dont une coordonnée
 * n'est pas finie — rien n'apparaît, sans le moindre message. Un écran vide se
 * diagnostique donc en remontant à la source de la position, pas ici. Ce qui
 * *est* validé, parce qu'un `NaN` y contaminerait toutes les conversions
 * suivantes : la caméra elle-même ({@link creeCamera}) et les limites passées à
 * {@link borne}.
 *
 * {@link estVisible} rend `false` sur un point non fini, par simple jeu des
 * comparaisons : c'est cohérent, un point dont on ne sait rien n'est pas visible.
 */
export interface Camera {
  /** Point du monde placé au centre de la vue. */
  readonly centre: Vector2;
  /** Facteur d'agrandissement, entier ≥ 1. */
  readonly zoom: number;
  /** Taille de la surface de rendu, en pixels. */
  readonly vue: TailleVue;
}

/** Taille d'une surface de rendu, en pixels. */
export interface TailleVue {
  readonly largeur: number;
  readonly hauteur: number;
}

/** Rectangle du monde, `y` croissant vers le bas (`yMin` est donc en haut). */
export interface Limites {
  readonly xMin: number;
  readonly xMax: number;
  readonly yMin: number;
  readonly yMax: number;
}

/**
 * Refuse un zoom qui casserait la grille de pixels ou ferait disparaître
 * l'écran sans message : un zoom fractionnaire antialiase tout le rendu, un
 * zoom nul rend des coordonnées infinies.
 */
function valideZoom(zoom: number): void {
  if (!Number.isInteger(zoom) || zoom < 1) {
    throw new Error(
      `Camera : le zoom doit être un entier supérieur ou égal à 1 (reçu ${zoom}).`,
    );
  }
}

/** Une vue de taille nulle ou non finie envoie toutes les conversions au tapis. */
function valideVue(vue: TailleVue): void {
  if (
    !Number.isFinite(vue.largeur) ||
    !Number.isFinite(vue.hauteur) ||
    vue.largeur <= 0 ||
    vue.hauteur <= 0
  ) {
    throw new Error(
      "Camera : la vue doit avoir une largeur et une hauteur finies et " +
        `strictement positives (reçu ${vue.largeur} × ${vue.hauteur}).`,
    );
  }
}

/**
 * Crée une caméra validée. Passer par cette fonction plutôt que par un objet
 * littéral : c'est ici que le zoom entier et la vue non dégénérée sont
 * garantis, une fois pour toutes.
 */
export function creeCamera(
  centre: Vector2,
  vue: TailleVue,
  zoom = 1,
): Camera {
  valideZoom(zoom);
  valideVue(vue);
  return { centre, zoom, vue: { largeur: vue.largeur, hauteur: vue.hauteur } };
}

/**
 * Position écran exacte, en flottant, d'un point du monde. Utile pour un calcul
 * intermédiaire ; pour **dessiner**, c'est {@link versEcranPixel}.
 */
export function versEcran(cam: Camera, monde: Vector2): Vector2 {
  return new Vector2(
    (monde.x - cam.centre.x) * cam.zoom + cam.vue.largeur / 2,
    (monde.y - cam.centre.y) * cam.zoom + cam.vue.hauteur / 2,
  );
}

/**
 * Position écran **arrondie à l'entier** : la seule à utiliser pour dessiner.
 *
 * L'arrondi est une fonction pure de la position monde, donc stable : deux
 * images qui voient la même position rendent le même pixel, sans oscillation.
 * Deux positions monde séparées par une fraction de pixel écran tombent
 * normalement sur le même pixel — sauf si elles encadrent un demi-pixel, où le
 * saut d'un pixel est le comportement attendu et non un tremblement.
 */
export function versEcranPixel(cam: Camera, monde: Vector2): Vector2 {
  const e = versEcran(cam, monde);
  return new Vector2(Math.round(e.x), Math.round(e.y));
}

/** Point du monde sous une position écran. Inverse exact de {@link versEcran}. */
export function versMonde(cam: Camera, ecran: Vector2): Vector2 {
  return new Vector2(
    (ecran.x - cam.vue.largeur / 2) / cam.zoom + cam.centre.x,
    (ecran.y - cam.vue.hauteur / 2) / cam.zoom + cam.centre.y,
  );
}

/** Nouvelle caméra recentrée. L'originale n'est pas touchée. */
export function avecCentre(cam: Camera, centre: Vector2): Camera {
  return { centre, zoom: cam.zoom, vue: cam.vue };
}

/**
 * Nouvelle caméra au zoom demandé. L'originale n'est pas touchée. Refuse un
 * zoom non entier ou inférieur à 1 par une erreur explicite.
 */
export function avecZoom(cam: Camera, zoom: number): Camera {
  valideZoom(zoom);
  return { centre: cam.centre, zoom, vue: cam.vue };
}

/** Refuse des limites non finies, qui contamineraient le centre en `NaN`. */
function valideLimites(limites: Limites): void {
  if (
    !Number.isFinite(limites.xMin) ||
    !Number.isFinite(limites.xMax) ||
    !Number.isFinite(limites.yMin) ||
    !Number.isFinite(limites.yMax)
  ) {
    throw new Error(
      "Camera : les limites doivent être finies (reçu " +
        `x [${limites.xMin} ; ${limites.xMax}], ` +
        `y [${limites.yMin} ; ${limites.yMax}]).`,
    );
  }
}

/**
 * Recentre l'axe pour que la vue reste dans `[min ; max]`.
 *
 * Quand l'étendue disponible est plus petite que la vue, il n'y a pas de
 * position qui satisfasse les deux bords : on **centre** l'étendue dans la vue.
 * Un clamp naïf collerait la vue dans un coin, avec du vide asymétrique d'un
 * seul côté.
 */
function borneAxe(
  valeur: number,
  min: number,
  max: number,
  demiVue: number,
): number {
  if (max - min <= demiVue * 2) return (min + max) / 2;
  return Math.min(Math.max(valeur, min + demiVue), max - demiVue);
}

/**
 * Recentre la caméra pour que la vue ne sorte pas de `limites`. Les deux axes
 * sont traités indépendamment : la vue peut être bornée horizontalement et
 * centrée verticalement.
 */
export function borne(cam: Camera, limites: Limites): Camera {
  valideLimites(limites);
  const demiLargeur = cam.vue.largeur / (2 * cam.zoom);
  const demiHauteur = cam.vue.hauteur / (2 * cam.zoom);
  return avecCentre(
    cam,
    new Vector2(
      borneAxe(cam.centre.x, limites.xMin, limites.xMax, demiLargeur),
      borneAxe(cam.centre.y, limites.yMin, limites.yMax, demiHauteur),
    ),
  );
}

/**
 * Rapproche le centre de `cible` par lissage **exponentiel**, indépendant du
 * framerate : la fraction parcourue vaut `1 - exp(-reactivite * dt)`.
 *
 * `reactivite` est en 1/s : c'est l'inverse du temps caractéristique de
 * rattrapage (6 rattrape environ 63 % de l'écart en 1/6 s).
 *
 * Cette forme se compose exactement : un pas de 0,1 s donne le même résultat
 * que dix pas de 0,01 s, à la précision flottante près. Un `lerp(centre, cible,
 * reactivite * dt)` n'a pas cette propriété — il suit plus vite à 120 images par
 * seconde qu'à 30, et **dépasse** la cible dès que `reactivite * dt > 1`, ce qui
 * fait osciller la caméra au premier ralentissement. Ici la fraction reste dans
 * `[0 ; 1[` quel que soit `dt` : jamais de dépassement.
 *
 * `dt` nul ou négatif, ou `reactivite` nulle ou négative : la caméra ne bouge
 * pas du tout et la même instance est rendue.
 */
export function suit(
  cam: Camera,
  cible: Vector2,
  dt: number,
  reactivite: number,
): Camera {
  // Les comparaisons en `!(x > 0)` couvrent aussi le cas `NaN`.
  if (!(dt > 0) || !(reactivite > 0)) return cam;
  const fraction = 1 - Math.exp(-reactivite * dt);
  return avecCentre(
    cam,
    new Vector2(
      cam.centre.x + (cible.x - cam.centre.x) * fraction,
      cam.centre.y + (cible.y - cam.centre.y) * fraction,
    ),
  );
}

/**
 * Étendue du monde couverte par la vue. Au zoom `z`, la vue couvre
 * `vue.largeur / z` unités monde en largeur : le zoom 4 voit quatre fois moins
 * de monde que le zoom 1 sur chaque axe.
 *
 * C'est ce qui permet au rendu de ne parcourir que la tranche visible du
 * terrain, au lieu des 1280 m du monde à chaque image.
 */
export function bornesVisibles(cam: Camera): Limites {
  const demiLargeur = cam.vue.largeur / (2 * cam.zoom);
  const demiHauteur = cam.vue.hauteur / (2 * cam.zoom);
  return {
    xMin: cam.centre.x - demiLargeur,
    xMax: cam.centre.x + demiLargeur,
    yMin: cam.centre.y - demiHauteur,
    yMax: cam.centre.y + demiHauteur,
  };
}

/**
 * Vrai quand le point tombe dans la vue, élargie de `marge` **unités monde** de
 * chaque côté. Les bords comptent comme visibles.
 */
export function estVisible(cam: Camera, point: Vector2, marge = 0): boolean {
  const b = bornesVisibles(cam);
  return (
    point.x >= b.xMin - marge &&
    point.x <= b.xMax + marge &&
    point.y >= b.yMin - marge &&
    point.y <= b.yMax + marge
  );
}
