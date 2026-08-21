// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { creeSurface, densiteValide, facteurEchelle, VAR_ECHELLE } from "./surface.ts";
import { PIXEL } from "../constants.ts";

describe("facteurEchelle", () => {
  it("reste à 1 quand la fenêtre est plus petite que la surface", () => {
    // 300 / 320 et 150 / 180 sont tous deux < 1 : le jeu déborde, mais la
    // grille de pixels est intacte.
    expect(facteurEchelle(300, 150)).toBe(1);
  });

  it("rend le facteur exact quand la fenêtre est un multiple entier", () => {
    expect(facteurEchelle(1280, 720)).toBe(4);
    expect(facteurEchelle(PIXEL.width, PIXEL.height)).toBe(1);
    expect(facteurEchelle(PIXEL.width * 3, PIXEL.height * 3)).toBe(3);
  });

  it("tronque un facteur fractionnaire vers l'entier inférieur", () => {
    // 1400 / 320 = 4,375 et 800 / 180 = 4,44… : on prend 4, pas 4,375.
    expect(facteurEchelle(1400, 800)).toBe(4);
  });

  it("prend la plus contraignante des deux dimensions", () => {
    // Très large mais court : c'est la hauteur qui décide.
    expect(facteurEchelle(4000, 400)).toBe(2);
    // Très haut mais étroit : c'est la largeur qui décide.
    expect(facteurEchelle(700, 4000)).toBe(2);
  });

  it("rend 1 pour une mesure absurde plutôt que 0", () => {
    expect(facteurEchelle(0, 0)).toBe(1);
    expect(facteurEchelle(Number.NaN, 720)).toBe(1);
    expect(facteurEchelle(-1280, -720)).toBe(1);
  });

  it("compte en pixels d'écran, pas en pixels CSS", () => {
    // 1000 × 600 pixels CSS à 1,5 dppx font 1500 × 900 pixels d'écran :
    // min(1500 / 320 ; 900 / 180) = 4,68… → 4 pixels d'écran par pixel de jeu.
    // Compté en pixels CSS on aurait rendu 3, soit 4,5 pixels d'écran : une
    // colonne sur deux plus large que ses voisines.
    expect(facteurEchelle(1000, 600, 1.5)).toBe(4);
    // 2 dppx : le facteur double, la taille apparente ne change pas.
    expect(facteurEchelle(1280, 720, 2)).toBe(8);
    // 1,25 dppx (Windows à 125 %) sur une fenêtre de 1400 × 800.
    expect(facteurEchelle(1400, 800, 1.25)).toBe(5);
  });

  it("retombe sur la densité 1 quand elle est absurde", () => {
    expect(facteurEchelle(1280, 720, 0)).toBe(4);
    expect(facteurEchelle(1280, 720, Number.NaN)).toBe(4);
    expect(facteurEchelle(1280, 720, -2)).toBe(4);
  });
});

describe("densiteValide", () => {
  it("garde une densité fractionnaire telle quelle", () => {
    expect(densiteValide(1.5)).toBe(1.5);
    expect(densiteValide(3)).toBe(3);
  });

  it("rend 1 pour une densité absente ou absurde", () => {
    expect(densiteValide(undefined)).toBe(1);
    expect(densiteValide(0)).toBe(1);
    expect(densiteValide(-1)).toBe(1);
    expect(densiteValide(Number.NaN)).toBe(1);
    expect(densiteValide(Number.POSITIVE_INFINITY)).toBe(1);
  });
});

/** Requête de densité factice : garde ses écouteurs pour qu'on les déclenche. */
class RequeteFactice {
  ecouteurs: (() => void)[] = [];
  constructor(readonly media: string) {}
  addEventListener(_type: string, ecouteur: () => void): void {
    this.ecouteurs.push(ecouteur);
  }
  removeEventListener(_type: string, ecouteur: () => void): void {
    this.ecouteurs = this.ecouteurs.filter((e) => e !== ecouteur);
  }
  declenche(): void {
    for (const ecouteur of [...this.ecouteurs]) ecouteur();
  }
}

/** Remplace `window.matchMedia` et collecte les requêtes ouvertes. */
function espionneMatchMedia(): RequeteFactice[] {
  const requetes: RequeteFactice[] = [];
  const faux = (media: string): RequeteFactice => {
    const requete = new RequeteFactice(media);
    requetes.push(requete);
    return requete;
  };
  window.matchMedia = faux as unknown as typeof window.matchMedia;
  return requetes;
}

/**
 * Canvas au contexte 2d factice : happy-dom ne rend rien, `getContext("2d")` y
 * vaut `null`. Seul le dimensionnement nous intéresse ici.
 */
function canvasFactice(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const ctx = { canvas, imageSmoothingEnabled: true };
  canvas.getContext = (() => ctx) as unknown as HTMLCanvasElement["getContext"];
  return canvas;
}

/** Impose une fenêtre et une densité d'affichage à l'environnement de test. */
function poseFenetre(largeur: number, hauteur: number, densite: number): void {
  Object.defineProperty(window, "innerWidth", { value: largeur, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: hauteur, configurable: true });
  Object.defineProperty(window, "devicePixelRatio", { value: densite, configurable: true });
}

/** Taille d'un pixel de jeu, en pixels CSS, telle que le CSS la lira. */
function echelleCss(): number {
  return Number(document.documentElement.style.getPropertyValue(VAR_ECHELLE));
}

describe("creeSurface", () => {
  const matchMediaOrigine = window.matchMedia;

  afterEach(() => {
    // `defineProperty` et non une affectation : un test remplace `matchMedia`
    // par une propriété non inscriptible.
    Object.defineProperty(window, "matchMedia", {
      value: matchMediaOrigine,
      configurable: true,
      writable: true,
    });
    document.documentElement.style.removeProperty(VAR_ECHELLE);
  });

  it("dimensionne le canvas à la résolution interne", () => {
    poseFenetre(1280, 720, 1);
    const surface = creeSurface(canvasFactice());
    expect(surface.renderer.width).toBe(PIXEL.width);
    expect(surface.renderer.height).toBe(PIXEL.height);
    surface.dispose();
  });

  it("pose une taille de boîte dont le produit par la densité est entier", () => {
    espionneMatchMedia();
    poseFenetre(1000, 600, 1.5);
    const surface = creeSurface(canvasFactice());

    // 4 pixels d'écran par pixel de jeu, soit 2,666… pixels CSS.
    expect(surface.echelle()).toBe(4);
    expect(surface.densite()).toBe(1.5);
    expect(echelleCss() * 1.5).toBeCloseTo(4, 10);
    // La boîte tient bien dans la fenêtre : 320 × 2,666… = 853,33 < 1000.
    expect(echelleCss() * PIXEL.width).toBeLessThanOrEqual(1000);
    surface.dispose();
  });

  it("garde une taille de boîte entière quand la densité vaut 1", () => {
    espionneMatchMedia();
    poseFenetre(1400, 800, 1);
    const surface = creeSurface(canvasFactice());
    expect(surface.echelle()).toBe(4);
    expect(echelleCss()).toBe(4);
    surface.dispose();
  });

  it("recalcule au redimensionnement de la fenêtre", () => {
    espionneMatchMedia();
    poseFenetre(1280, 720, 1);
    const surface = creeSurface(canvasFactice());
    expect(surface.echelle()).toBe(4);

    poseFenetre(640, 360, 1);
    window.dispatchEvent(new Event("resize"));
    expect(surface.echelle()).toBe(2);
    expect(echelleCss()).toBe(2);
    surface.dispose();
  });

  it("recalcule quand la densité change sans redimensionnement", () => {
    // Fenêtre glissée d'un écran à l'autre : `devicePixelRatio` change, aucune
    // dimension ne bouge, aucun `resize` n'est émis.
    const requetes = espionneMatchMedia();
    poseFenetre(1280, 720, 1);
    const surface = creeSurface(canvasFactice());
    expect(surface.echelle()).toBe(4);
    expect(requetes.at(-1)?.media).toBe("(resolution: 1dppx)");

    poseFenetre(1280, 720, 1.5);
    requetes.at(-1)?.declenche();

    expect(surface.densite()).toBe(1.5);
    // 1280 × 1,5 = 1920 pixels d'écran → 6 par pixel de jeu, soit 4 pixels CSS.
    expect(surface.echelle()).toBe(6);
    expect(echelleCss() * 1.5).toBeCloseTo(6, 10);
    // La surveillance suit la nouvelle densité, sans écouteur laissé derrière.
    expect(requetes.at(-1)?.media).toBe("(resolution: 1.5dppx)");
    expect(requetes.filter((r) => r.ecouteurs.length > 0)).toHaveLength(1);
    surface.dispose();
  });

  it("libère la surveillance de densité au dispose", () => {
    const requetes = espionneMatchMedia();
    poseFenetre(1280, 720, 1);
    const surface = creeSurface(canvasFactice());
    surface.dispose();
    expect(requetes.every((r) => r.ecouteurs.length === 0)).toBe(true);

    // Second dispose : sans effet, et aucun recalcul ne suit un resize.
    surface.dispose();
    poseFenetre(640, 360, 1);
    window.dispatchEvent(new Event("resize"));
    expect(surface.echelle()).toBe(4);
  });

  it("tient sans matchMedia dans l'environnement", () => {
    // Environnement sans media queries : on perd la surveillance de densité,
    // pas la surface.
    Object.defineProperty(window, "matchMedia", { value: undefined, configurable: true });
    poseFenetre(1280, 720, 1);
    const surface = creeSurface(canvasFactice());
    expect(surface.echelle()).toBe(4);
    surface.dispose();
  });
});
