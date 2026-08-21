/**
 * Champ d'altitudes : un relief décrit par des altitudes échantillonnées à pas
 * constant, et les outils pour l'interroger. La **génération** du relief n'est
 * pas ici : le moteur ne sait que répondre à des questions sur un champ donné.
 *
 * ## Convention de repère — à lire avant d'écrire une comparaison
 *
 * `y` croît **vers le bas** (repère canvas). Une altitude de terrain est donc
 * stockée comme une **coordonnée `y` de surface**, et « plus haut » veut dire
 * « `y` plus petit ». Conséquences directes, toutes assumées :
 *
 * - un point est **sous le sol** quand son `y` est **supérieur ou égal** à
 *   celui de la surface ;
 * - le sommet d'un pic a le `y` le plus **petit** de son voisinage ;
 * - une pente positive (`dy/dx > 0`) **descend** vers la droite à l'écran.
 *
 * Le dénivelé, lui, est rendu en valeur absolue : c'est un écart, pas une
 * direction.
 */

/** Un point du plan. Structural : un `Vector2` du moteur convient. */
type Point = { readonly x: number; readonly y: number };

/**
 * Relief échantillonné à pas constant.
 *
 * L'échantillon `i` se trouve à l'abscisse `x0 + i * pas` et sa surface vaut
 * `surface[i]`. Entre deux échantillons, la surface est le segment de droite
 * qui les joint.
 */
export interface Heightfield {
  /** Abscisse du premier échantillon. */
  readonly x0: number;
  /** Écart horizontal constant entre deux échantillons. Strictement positif. */
  readonly pas: number;
  /** Coordonnée `y` de la surface à chaque échantillon. Au moins 2 entrées. */
  readonly surface: readonly number[];
}

/**
 * Refuse un champ inexploitable dès l'appel, plutôt que de laisser un `NaN`
 * remonter silencieusement jusqu'au rendu, où il serait indébogable.
 */
function valide(hf: Heightfield): void {
  if (!Number.isFinite(hf.pas) || hf.pas <= 0) {
    throw new Error(
      `Heightfield : le pas doit être un nombre strictement positif (reçu ${hf.pas}).`,
    );
  }
  if (hf.surface.length < 2) {
    throw new Error(
      `Heightfield : il faut au moins 2 échantillons de surface (reçu ${hf.surface.length}).`,
    );
  }
}

/**
 * Lit l'échantillon `i`. L'index est ramené dans les bornes du tableau, ce qui
 * rend l'accès toujours défini — d'où le `as number`, qui n'est pas une
 * complaisance : `surface` a au moins une entrée (garanti par `valide`) et
 * l'index est borné.
 */
function echantillon(hf: Heightfield, i: number): number {
  const borne = Math.min(Math.max(i, 0), hf.surface.length - 1);
  return hf.surface[borne] as number;
}

/** Étendue horizontale couverte par le champ. */
export function largeur(hf: Heightfield): number {
  valide(hf);
  return (hf.surface.length - 1) * hf.pas;
}

/** Abscisse du dernier échantillon. Suppose `hf` déjà validé. */
function xFin(hf: Heightfield): number {
  return hf.x0 + (hf.surface.length - 1) * hf.pas;
}

/**
 * Coordonnée `y` de la surface en `x`, par interpolation linéaire entre les
 * deux échantillons encadrants.
 *
 * Hors des bornes du champ, on rend la valeur du bord le plus proche : le
 * relief est prolongé **plat**. C'est un choix — extrapoler la pente du dernier
 * segment enverrait la surface à l'infini dès qu'une entité sort du champ.
 */
export function surfaceEn(hf: Heightfield, x: number): number {
  valide(hf);
  if (!(x > hf.x0)) return echantillon(hf, 0); // couvre aussi x = NaN
  if (x >= xFin(hf)) return echantillon(hf, hf.surface.length - 1);

  const position = (x - hf.x0) / hf.pas;
  const i = Math.floor(position);
  const fraction = position - i;
  const gauche = echantillon(hf, i);
  const droite = echantillon(hf, i + 1);
  return gauche + (droite - gauche) * fraction;
}

/**
 * Pente locale de la surface en `x`, sans unité (`dy/dx`). Positive quand la
 * surface descend vers la droite à l'écran, `y` croissant vers le bas.
 *
 * C'est la dérivée de `surfaceEn` : à l'intérieur d'un pas, la pente du segment
 * qui le porte ; aux bornes et au-delà, `0`, puisque le relief y est prolongé
 * plat (voir `surfaceEn`).
 */
export function penteEn(hf: Heightfield, x: number): number {
  valide(hf);
  if (!(x > hf.x0) || x >= xFin(hf)) return 0;

  const i = Math.floor((x - hf.x0) / hf.pas);
  return (echantillon(hf, i + 1) - echantillon(hf, i)) / hf.pas;
}

/**
 * Écart entre le point le plus haut et le point le plus bas de la surface sur
 * `[xa, xb]`, toujours positif. Les bornes sont échangées si `xa > xb`.
 *
 * Le calcul retient les deux bornes interpolées **et** tous les échantillons
 * situés entre elles. Un pic plus étroit qu'un pas compte donc, alors qu'une
 * simple comparaison des deux bornes l'aurait raté — c'est exactement le relief
 * qui doit faire refuser un atterrissage. Sur un intervalle plus étroit qu'un
 * pas, il n'y a aucun échantillon dedans : seules les bornes interpolées
 * comptent.
 */
export function denivele(hf: Heightfield, xa: number, xb: number): number {
  valide(hf);
  const debut = Math.min(xa, xb);
  const fin = Math.max(xa, xb);

  let plusHaut = surfaceEn(hf, debut); // `y` minimal
  let plusBas = plusHaut; // `y` maximal
  const retiens = (y: number): void => {
    if (y < plusHaut) plusHaut = y;
    if (y > plusBas) plusBas = y;
  };
  retiens(surfaceEn(hf, fin));

  // Échantillons compris dans l'intervalle. Ceux qui tombent pile sur une borne
  // sont déjà couverts par l'interpolation, les reprendre ne change rien.
  const premier = Math.max(Math.ceil((debut - hf.x0) / hf.pas), 0);
  const dernier = Math.min(
    Math.floor((fin - hf.x0) / hf.pas),
    hf.surface.length - 1,
  );
  for (let i = premier; i <= dernier; i++) {
    retiens(echantillon(hf, i));
  }

  return plusBas - plusHaut;
}

/**
 * Vrai quand le point touche le sol ou s'y trouve enfoncé. `y` croît vers le
 * bas : « sous le sol » veut dire `y` supérieur ou égal à celui de la surface.
 * Un point exactement sur la surface compte comme touché.
 */
export function souLeSol(hf: Heightfield, point: Point): boolean {
  return point.y >= surfaceEn(hf, point.x);
}

/**
 * Profondeur d'enfoncement du point sous la surface, en unités monde. Vaut `0`
 * au-dessus de la surface comme exactement dessus — jamais de négatif.
 */
export function penetration(hf: Heightfield, point: Point): number {
  return Math.max(0, point.y - surfaceEn(hf, point.x));
}
