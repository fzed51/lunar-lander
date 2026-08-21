import { Renderer } from "@lem/engine";
import { PIXEL } from "../constants.ts";

/**
 * Surface d'affichage du jeu : le canvas interne 320 × 180 et son
 * agrandissement à facteur entier.
 *
 * Tout le dessin se fait dans la résolution interne ; l'agrandissement est une
 * affaire de CSS, appliquée à la boîte qui porte les trois couches (`#fond`,
 * `#game`, `#ui`). Aucun `ctx.scale` : le contexte reste à l'échelle 1, sinon
 * les bords des formes tomberaient sur des coordonnées fractionnaires et le
 * rendu s'antialiaserait.
 *
 * Le facteur qui doit être entier est celui qui compte **en pixels d'écran**,
 * pas en pixels CSS : c'est l'écran qui affiche les carrés. Sur un
 * `devicePixelRatio` fractionnaire (Windows à 125 % ou 150 %, la plupart des
 * mobiles, certaines résolutions macOS mises à l'échelle), un facteur entier en
 * pixels CSS donne un nombre fractionnaire de pixels d'écran par pixel de jeu —
 * ×3 à 1,5 dppx fait 4,5 — et `image-rendering: pixelated` duplique alors une
 * colonne sur deux plus large que ses voisines. On compte donc en pixels
 * d'écran, et on redonne au CSS une taille de boîte éventuellement
 * fractionnaire dont le produit par la densité retombe juste.
 */
export interface Surface {
  /** Primitives de dessin du moteur, branchées sur le canvas interne. */
  readonly renderer: Renderer;
  /**
   * Facteur d'agrandissement entier courant (≥ 1), en **pixels d'écran** par
   * pixel de jeu. La taille de la boîte en pixels CSS en découle
   * (`echelle() / densite()`) et n'est pas forcément entière.
   */
  echelle(): number;
  /** Densité d'affichage retenue au dernier calcul (`devicePixelRatio` filtré). */
  densite(): number;
  /** Retire les écouteurs de redimensionnement. Sans effet au second appel. */
  dispose(): void;
}

/**
 * Variable CSS qui porte la taille d'un pixel de jeu, **en pixels CSS**. Les
 * trois couches en tirent leurs dimensions : une seule mesure, une seule boîte,
 * un seul facteur. Elle vaut `echelle() / densite()`, donc pas forcément un
 * entier — l'invariant tenu est que son produit par `devicePixelRatio` en soit
 * un.
 */
export const VAR_ECHELLE = "--lem-echelle";

/**
 * Densité d'affichage exploitable, tirée de `devicePixelRatio`. Une valeur
 * absente, nulle ou absurde vaut 1 : mieux vaut compter en pixels CSS que
 * rendre une surface de taille nulle.
 */
export function densiteValide(brute: number | undefined): number {
  if (typeof brute !== "number" || !Number.isFinite(brute) || brute <= 0) {
    return 1;
  }
  return brute;
}

/**
 * Plus grand facteur **entier** d'agrandissement de la surface 320 × 180 qui
 * tient dans `largeur × hauteur` pixels CSS à la densité `densite`, jamais
 * inférieur à 1. Le facteur rendu se compte en **pixels d'écran** par pixel de
 * jeu.
 *
 * Un facteur fractionnaire casserait la grille de pixels : à ×4,375, une
 * colonne de pixels sur trois est peinte plus large que ses voisines. On préfère
 * les marges noires, et on préfère même déborder — fenêtre plus petite que
 * 320 × 180, le facteur reste 1 et l'image dépasse plutôt que de rétrécir hors
 * grille.
 */
export function facteurEchelle(
  largeur: number,
  hauteur: number,
  densite = 1,
): number {
  const d = densiteValide(densite);
  const brut = Math.min(
    (largeur * d) / PIXEL.width,
    (hauteur * d) / PIXEL.height,
  );
  // Une mesure absente ou absurde (0, NaN) ne doit pas rendre un facteur 0 :
  // la surface disparaîtrait sans laisser de trace de la cause.
  if (!Number.isFinite(brut)) return 1;
  return Math.max(1, Math.floor(brut));
}

/**
 * Prépare le canvas de jeu : résolution interne fixe, lissage désactivé,
 * agrandissement recalculé à chaque redimensionnement de la fenêtre **et à
 * chaque changement de densité d'affichage** — une fenêtre glissée d'un écran à
 * l'autre change de `devicePixelRatio` sans changer de taille.
 */
export function creeSurface(canvas: HTMLCanvasElement): Surface {
  // Résolution interne fixe : tout est dessiné en 320 × 180. Posée AVANT
  // `getContext`, car changer `width` réinitialise l'état du contexte — et donc
  // le `imageSmoothingEnabled` qu'on règle juste après.
  canvas.width = PIXEL.width;
  canvas.height = PIXEL.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("contexte 2d indisponible");
  ctx.imageSmoothingEnabled = false;

  let echelle = 1;
  let densite = 1;
  /** Requête de densité en cours de surveillance, réarmée à chaque calcul. */
  let requete: MediaQueryList | null = null;

  const ajuste = (): void => {
    densite = densiteValide(window.devicePixelRatio);
    echelle = facteurEchelle(window.innerWidth, window.innerHeight, densite);
    // La boîte est dimensionnée en pixels CSS : on redivise par la densité pour
    // que `echelle` pixels d'écran, entiers, couvrent un pixel de jeu.
    document.documentElement.style.setProperty(
      VAR_ECHELLE,
      String(echelle / densite),
    );
    surveilleDensite();
  };

  /**
   * Réarme la surveillance de la densité. `devicePixelRatio` ne déclenche aucun
   * événement propre : on interroge la densité courante par media query et on
   * attend qu'elle cesse de correspondre. Il faut réarmer à chaque changement,
   * car la requête porte la valeur observée.
   */
  const surveilleDensite = (): void => {
    if (typeof window.matchMedia !== "function") return;
    requete?.removeEventListener("change", ajuste);
    requete = window.matchMedia(`(resolution: ${densite}dppx)`);
    requete.addEventListener("change", ajuste);
  };

  ajuste();
  window.addEventListener("resize", ajuste);

  let vivante = true;

  return {
    renderer: new Renderer(ctx),
    echelle: () => echelle,
    densite: () => densite,
    dispose(): void {
      // Idempotent : `removeEventListener` deux fois serait inoffensif, mais un
      // `dispose` qui se contredit au second appel est un piège à bogue.
      if (!vivante) return;
      vivante = false;
      window.removeEventListener("resize", ajuste);
      requete?.removeEventListener("change", ajuste);
      requete = null;
    },
  };
}
