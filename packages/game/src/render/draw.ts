/**
 * Dessin de l'écran de jeu : ciel, étoiles, relief, drapeau, LEM, flamme,
 * particules, voile de pause.
 *
 * ## Ce que ce module est, et n'est pas
 *
 * Chaque fonction reçoit le `Renderer` et des données **déjà calculées**, et rend
 * `void`. Aucune règle de jeu ici : le dessin lit l'état, ne le calcule pas et ne
 * le modifie pas.
 *
 * ## Aucun tirage aléatoire
 *
 * Les scintillements et les tremblements sont dérivés de `state.time`, jamais
 * d'un générateur. Passer le `rng` de la manche au rendu ferait dépendre la suite
 * des tirages du nombre d'images affichées : le terrain et les particules
 * cesseraient d'être reproductibles à graine égale, et toute la contrainte
 * « aucun `Math.random` » deviendrait décorative.
 *
 * ## Grille de pixels
 *
 * Toute position monde passe par `versEcranPixel`, et toute taille d'objet du
 * monde est multipliée par le zoom **entier** de la caméra. Aucune coordonnée
 * fractionnaire n'atteint le canvas, et rien ne passe par `ctx.fill()` ni
 * `ctx.stroke()`, qui antialiaseraient les diagonales : tout est peint en
 * rectangles pleins.
 *
 * Restent en pixels d'écran, volontairement, les **détails graphiques** qui ne
 * représentent pas une dimension du monde : l'épaisseur d'un liseré, celle de la
 * crête, la taille d'une flèche d'indicateur, un pixel d'étoile. Les agrandir
 * avec le zoom en ferait des pavés à l'approche du sol.
 */

import {
  avecCentre,
  bornesVisibles,
  estVisible,
  surfaceEn,
  versEcran,
  versEcranPixel,
  Vector2,
  type Camera,
  type Heightfield,
  type Renderer,
} from "@lem/engine";
import {
  CRANS_MAX,
  ETOILES_PARALLAXE,
  GAZ_BOUCHE,
  LEM,
  SEUILS_ZOOM,
  ZOOMS,
} from "../constants.ts";
import { dessineTexte } from "../design/font.ts";
import { PALETTE } from "../design/palette.ts";
import { sansCarburant, type Lander } from "../entities/Lander.ts";
import { opaciteParticule, type Particle } from "../entities/Particle.ts";
import { BANDE_JAUGES, BAS_BLOC_SUPERIEUR } from "./hud.ts";
import type { Terrain } from "../terrain.ts";
import type { Etoile } from "./stars.ts";

// --- Réglages de mise en page ---
//
// Ils ne pilotent aucune règle : ce sont des dimensions de dessin. Les valeurs en
// mètres décrivent des objets du monde et sont multipliées par le zoom ; celles
// en pixels décrivent des détails d'écran et ne le sont pas.

/** Part de la hauteur du ciel peinte en `espace`, le reste en `nuit`. */
const CIEL_PART_ESPACE = 0.6;

/** Échantillons de relief gardés en marge de chaque côté de la tranche visible. */
const TERRAIN_MARGE_ECHANTILLONS = 1;

/** Épaisseur (px) du liseré sombre posé sous la crête du relief. */
const LISERE_EPAISSEUR = 2;

/** Drapeau de la plateforme cible, en mètres. */
const DRAPEAU = { mat: 10, toileLargeur: 6, toileHauteur: 4 } as const;

/** Images par seconde de l'ondulation de la toile. */
const DRAPEAU_CADENCE = 8;

/**
 * Décalage horizontal (px de toile) de chaque rangée, pour les quatre images de
 * l'ondulation. Une table plutôt qu'un sinus : quatre poses franches valent mieux
 * qu'un mouvement continu arrondi à la grille.
 *
 * Exportée parce que le drapeau planté dans le décor de l'accueil
 * (`render/background.ts`) ondule sur la même table. Seule la cadence diffère :
 * elle vaut `DRAPEAU_CADENCE` ici et se déduit de `DRAPEAU_PERIODE` là-bas.
 */
export const ONDULATION: readonly (readonly number[])[] = [
  [0, 0, 1, 1],
  [0, 1, 1, 0],
  [1, 1, 0, 0],
  [1, 0, 0, 1],
];

/**
 * Géométrie du LEM dans son **repère propre** (m, `y` vers le bas, `x` vers la
 * droite). Le tout tient dans `LEM.hauteur` = 7 de haut et `LEM.largeurTrain` = 8
 * de large : ce sont les mêmes dimensions que celles dont `landing.ts` juge le
 * contact, la silhouette ne ment donc pas sur la coque.
 */
const CORPS = { largeur: 6, yHaut: -3, yBas: 1 } as const;
const TUYERE = { largeurHaut: 2.5, largeurBas: 3.5, yHaut: 1, yBas: 3 } as const;
const TRAIN = { xEpaule: 2.5, yEpaule: 1, patin: 1 } as const;
/** Hublot : un pixel d'accent sur le flanc du corps. */
const HUBLOT = { dx: 0, dy: -1.5 } as const;

/** Flamme du moteur, en mètres. */
const FLAMME = {
  /**
   * Sortie de tuyère, dans le repère propre du LEM. C'est `GAZ_BOUCHE` et non un
   * 3 recopié : le panache de gaz part du même point, et les deux ne doivent pas
   * pouvoir se décoller.
   */
  bouche: GAZ_BOUCHE,
  /** Longueur au cran maximal ; elle est proportionnelle au cran. */
  longueurMax: 14,
  largeur: 3.5,
  /** Le cœur clair est plus court et plus étroit que le halo chaud. */
  partCoeurLongueur: 0.6,
  partCoeurLargeur: 0.45,
} as const;

/** Pulsation (rad/s) du tremblement de la flamme, dérivé du temps de jeu. */
const FLAMME_PULSATION = 37;

/** Flèche de l'indicateur de cible : demi-base = hauteur, en pixels d'écran. */
const FLECHE_TAILLE = 4;
/** Marge (px) entre la pointe de la flèche et le bord de l'écran. */
const FLECHE_MARGE = 2;

/**
 * Côté (px d'écran) d'une particule au zoom le plus serré. Une particule est un
 * éclat, pas un objet du monde : elle grossit d'un pixel au zoom rapproché et
 * s'arrête là, sinon les quarante débris d'une explosion deviendraient quarante
 * pavés de 4 px devant le relief.
 */
const PARTICULE_TAILLE_MAX = 2;

/** Opacité du voile de pause. */
const PAUSE_VOILE = 0.65;
/** Ordonnées (px) des trois lignes du voile de pause. */
const PAUSE_LIGNES = { titre: 62, reprendre: 96, abandonner: 108 } as const;

/** Les trois crans de zoom, nommés. Dérivés de `ZOOMS`, jamais recopiés. */
const [ZOOM_LARGE, ZOOM_MOYEN, ZOOM_SERRE] = ZOOMS;

// --- Zoom ---

/**
 * Cran de zoom suivant, en fonction de l'altitude au-dessus du sol et du cran
 * courant. **Machine à hystérésis** : on resserre à `vers2` / `vers4` et on
 * relâche seulement à `retour1` / `retour2`, si bien qu'un LEM qui flotte pile au
 * seuil d'entrée ne fait pas clignoter le zoom d'une image à l'autre.
 *
 * Le zoom ne prend jamais de valeur intermédiaire, et ne saute jamais deux crans
 * dans la même image : chaque appel avance d'un cran au plus. Une interpolation
 * continue placerait les bords des formes entre deux colonnes de la grille et
 * ruinerait le pixel art pendant toute la descente.
 *
 * Un `zoomCourant` hors de `ZOOMS` est ramené au cran le plus proche par le bas :
 * la sortie appartient toujours à `ZOOMS`.
 */
export function zoomSuivant(altitude: number, zoomCourant: number): number {
  if (zoomCourant >= ZOOM_SERRE) {
    return altitude > SEUILS_ZOOM.retour2 ? ZOOM_MOYEN : ZOOM_SERRE;
  }
  if (zoomCourant >= ZOOM_MOYEN) {
    if (altitude < SEUILS_ZOOM.vers4) return ZOOM_SERRE;
    return altitude > SEUILS_ZOOM.retour1 ? ZOOM_LARGE : ZOOM_MOYEN;
  }
  return altitude < SEUILS_ZOOM.vers2 ? ZOOM_MOYEN : ZOOM_LARGE;
}

// --- Ciel et étoiles ---

/**
 * Le fond du ciel, en **deux bandes** de palette : `espace` en haut, `nuit` vers
 * le bas. Deux aplats et pas un dégradé continu — un dégradé sur seize couleurs
 * ne peut se rendre qu'en tramé, et le canvas l'interpolerait hors palette.
 *
 * La couche de jeu est transparente dans la page : ce remplissage est ce qui rend
 * l'écran de jeu opaque.
 */
export function dessineCiel(r: Renderer): void {
  const limite = Math.round(r.height * CIEL_PART_ESPACE);
  r.fillRect(Vector2.ZERO, r.width, limite, PALETTE.espace);
  r.fillRect(
    new Vector2(0, limite),
    r.width,
    r.height - limite,
    PALETTE.nuit,
  );
}

/**
 * Le champ d'étoiles, en **parallaxe** : le point de référence du champ ne suit
 * que `ETOILES_PARALLAXE` du déplacement de la caméra, donc les étoiles glissent
 * quatre fois moins vite que le relief.
 *
 * Une étoile reste un pixel, quel que soit le zoom : c'est un point de lumière
 * lointain, pas un objet du monde qui grossirait en s'approchant.
 */
export function dessineEtoiles(
  r: Renderer,
  etoiles: readonly Etoile[],
  cam: Camera,
): void {
  const camEtoiles = avecCentre(
    cam,
    new Vector2(
      cam.centre.x * ETOILES_PARALLAXE,
      cam.centre.y * ETOILES_PARALLAXE,
    ),
  );
  for (const etoile of etoiles) {
    const p = versEcranPixel(camEtoiles, new Vector2(etoile.x, etoile.y));
    if (p.x < 0 || p.x >= r.width || p.y < 0 || p.y >= r.height) continue;
    r.drawPixel(p, PALETTE[etoile.teinte]);
  }
}

// --- Relief ---

/**
 * Lecture d'un échantillon de relief. Le `as number` n'est pas une complaisance :
 * tous les index passés ici sortent de `trancheVisible`, qui les borne à la
 * longueur du tableau.
 */
function lit(surface: readonly number[], i: number): number {
  return surface[i] as number;
}

/**
 * Index du premier et du dernier échantillon de relief à parcourir : la tranche
 * couverte par la vue, plus un échantillon de marge de chaque côté.
 *
 * La marge n'est pas cosmétique : sans elle, le segment qui relie le dernier
 * échantillon visible au premier hors champ n'est pas tracé, et la crête est
 * coupée net au bord de l'écran. Parcourir les 257 échantillons du monde à chaque
 * image serait l'autre extrême — au zoom 4, la vue n'en couvre qu'une vingtaine.
 */
export function trancheVisible(
  hf: Heightfield,
  cam: Camera,
): { premier: number; dernier: number } {
  const bornes = bornesVisibles(cam);
  const dernierIndex = hf.surface.length - 1;
  const pince = (i: number): number =>
    Math.min(Math.max(i, 0), dernierIndex);
  return {
    premier: pince(
      Math.floor((bornes.xMin - hf.x0) / hf.pas) - TERRAIN_MARGE_ECHANTILLONS,
    ),
    dernier: pince(
      Math.ceil((bornes.xMax - hf.x0) / hf.pas) + TERRAIN_MARGE_ECHANTILLONS,
    ),
  };
}

/**
 * Remplit le corps du relief sous le segment `a → b`, colonne d'écran par
 * colonne d'écran, et pose le liseré sombre juste sous la crête.
 *
 * Colonne par colonne plutôt qu'en polygone : un `ctx.fill()` antialiaserait la
 * pente, et la roche aurait un bord flou d'un pixel sur toute sa longueur.
 */
function remplitSousSegment(r: Renderer, a: Vector2, b: Vector2): void {
  const gauche = a.x <= b.x ? a : b;
  const droite = a.x <= b.x ? b : a;
  const etendue = droite.x - gauche.x;
  for (let x = gauche.x; x <= droite.x; x++) {
    if (x < 0 || x >= r.width) continue;
    const part = etendue === 0 ? 0 : (x - gauche.x) / etendue;
    const y = Math.round(gauche.y + (droite.y - gauche.y) * part);
    const haut = Math.max(0, y);
    if (haut >= r.height) continue;
    r.fillRect(new Vector2(x, haut), 1, r.height - haut, PALETTE.reliefMoyen);
    const debut = Math.max(0, y + 1);
    const fin = Math.min(r.height, y + 1 + LISERE_EPAISSEUR);
    if (fin > debut) {
      r.fillRect(new Vector2(x, debut), 1, fin - debut, PALETTE.reliefSombre);
    }
  }
}

/**
 * Le relief : corps en `reliefMoyen`, liseré `reliefSombre` sous la crête, crête
 * elle-même en `grisClair`. Seule la tranche visible est parcourue.
 */
export function dessineTerrain(
  r: Renderer,
  terrain: Terrain,
  cam: Camera,
): void {
  const hf = terrain.hf;
  const { premier, dernier } = trancheVisible(hf, cam);
  const crete: Vector2[] = [];
  for (let i = premier; i <= dernier; i++) {
    crete.push(
      versEcranPixel(cam, new Vector2(hf.x0 + i * hf.pas, lit(hf.surface, i))),
    );
  }
  for (let i = 1; i < crete.length; i++) {
    remplitSousSegment(r, crete[i - 1] as Vector2, crete[i] as Vector2);
  }
  r.drawPolyline(crete, { stroke: PALETTE.grisClair });
}

/**
 * Les plateaux de repli, en liseré `reliefClair` : assez pour les repérer à
 * l'approche, pas assez pour crier plus fort que la plateforme cible et son
 * drapeau.
 *
 * Le terrain entier est passé, et non la seule liste `replis` : celle-ci ne porte
 * que l'abscisse et la largeur d'un plateau, l'altitude se lit dans le champ.
 */
export function dessineReplis(
  r: Renderer,
  terrain: Terrain,
  cam: Camera,
): void {
  for (const repli of terrain.replis) {
    const pied = versEcranPixel(
      cam,
      new Vector2(repli.x, surfaceEn(terrain.hf, repli.x)),
    );
    const demi = Math.round((repli.largeur * cam.zoom) / 2);
    if (
      pied.x + demi < 0 ||
      pied.x - demi >= r.width ||
      pied.y < 0 ||
      pied.y >= r.height
    ) {
      continue;
    }
    r.fillRect(
      new Vector2(pied.x - demi, pied.y),
      2 * demi + 1,
      1,
      PALETTE.reliefClair,
    );
  }
}

/**
 * Le drapeau de la plateforme cible : liseré de plateforme en `accent`, mât, et
 * toile `alerte` qui ondule sur **quatre images**.
 *
 * L'ondulation est indexée sur `temps`, le temps de jeu, et sur rien d'autre :
 * pas de tirage aléatoire au rendu.
 */
export function dessineDrapeau(
  r: Renderer,
  cible: Terrain["cible"],
  cam: Camera,
  temps: number,
): void {
  const z = cam.zoom;
  const pied = versEcranPixel(cam, new Vector2(cible.x, cible.y));

  const demiPlateforme = Math.round((cible.largeur * z) / 2);
  r.fillRect(
    new Vector2(pied.x - demiPlateforme, pied.y),
    2 * demiPlateforme + 1,
    1,
    PALETTE.accent,
  );

  const hauteurMat = Math.round(DRAPEAU.mat * z);
  const hautMat = pied.y - hauteurMat;
  r.fillRect(
    new Vector2(pied.x, hautMat),
    Math.max(1, Math.floor(z / 2)),
    hauteurMat,
    PALETTE.grisPale,
  );

  const pose = Math.abs(Math.floor(temps * DRAPEAU_CADENCE)) % ONDULATION.length;
  const rangees = ONDULATION[pose] as readonly number[];
  const hauteurRangee = Math.max(
    1,
    Math.round((DRAPEAU.toileHauteur * z) / rangees.length),
  );
  const largeurToile = Math.round(DRAPEAU.toileLargeur * z);
  for (let i = 0; i < rangees.length; i++) {
    const decalage = (rangees[i] ?? 0) * z;
    r.fillRect(
      new Vector2(pied.x + 1 + decalage, hautMat + i * hauteurRangee),
      largeurToile,
      hauteurRangee,
      PALETTE.alerte,
    );
  }
}

// --- LEM et flamme ---

/**
 * Point du LEM donné dans son repère propre, ramené en pixel d'écran entier :
 * rotation d'assiette, translation au centre, puis `versEcranPixel`.
 *
 * C'est la même construction que `pointDeCoque` dans `landing.ts` — la silhouette
 * dessinée est bien celle dont le contact est jugé.
 */
function pointLem(
  cam: Camera,
  lem: Lander,
  dx: number,
  dy: number,
): Vector2 {
  return versEcranPixel(
    cam,
    lem.position.add(new Vector2(dx, dy).rotate(lem.assiette)),
  );
}

/**
 * Remplit un trapèze du repère propre du LEM par **lignes horizontales**, une par
 * pixel d'écran de hauteur.
 *
 * Un remplissage en lignes de Bresenham plutôt qu'un `ctx.fill()` : le LEM est
 * tourné de son assiette, donc ses bords sont des diagonales, et un remplissage
 * de canvas les antialiaserait.
 */
function remplitTrapeze(
  r: Renderer,
  cam: Camera,
  lem: Lander,
  forme: {
    largeurHaut: number;
    largeurBas: number;
    yHaut: number;
    yBas: number;
  },
  couleur: string,
  decalageX = 0,
): void {
  const hauteur = forme.yBas - forme.yHaut;
  const lignes = Math.max(2, Math.round(hauteur * cam.zoom) + 1);
  for (let i = 0; i < lignes; i++) {
    const part = i / (lignes - 1);
    const dy = forme.yHaut + hauteur * part;
    const demi =
      (forme.largeurHaut +
        (forme.largeurBas - forme.largeurHaut) * part) /
      2;
    const dx = Math.round(part * decalageX);
    const a = pointLem(cam, lem, -demi, dy);
    const b = pointLem(cam, lem, demi, dy);
    r.drawPolyline(
      [new Vector2(a.x + dx, a.y), new Vector2(b.x + dx, b.y)],
      { stroke: couleur },
    );
  }
}

/** Le LEM : corps, tuyère, train à deux pieds, tourné de son assiette. */
export function dessineLem(r: Renderer, lem: Lander, cam: Camera): void {
  const demiCorps = CORPS.largeur / 2;

  remplitTrapeze(
    r,
    cam,
    lem,
    {
      largeurHaut: TUYERE.largeurHaut,
      largeurBas: TUYERE.largeurBas,
      yHaut: TUYERE.yHaut,
      yBas: TUYERE.yBas,
    },
    PALETTE.reliefMoyen,
  );

  remplitTrapeze(
    r,
    cam,
    lem,
    {
      largeurHaut: CORPS.largeur,
      largeurBas: CORPS.largeur,
      yHaut: CORPS.yHaut,
      yBas: CORPS.yBas,
    },
    PALETTE.reliefClair,
  );

  // Contour du corps : une ligne brisée fermée, sur les mêmes pixels entiers.
  const coins = [
    pointLem(cam, lem, -demiCorps, CORPS.yHaut),
    pointLem(cam, lem, demiCorps, CORPS.yHaut),
    pointLem(cam, lem, demiCorps, CORPS.yBas),
    pointLem(cam, lem, -demiCorps, CORPS.yBas),
  ];
  r.drawPolyline([...coins, coins[0] as Vector2], { stroke: PALETTE.grisPale });

  // Train : une jambe par côté, du bas du corps au pied, patin compris. Les
  // pieds sont ceux dont `landing.ts` juge le contact.
  const demiTrain = LEM.largeurTrain / 2;
  const yPied = LEM.hauteur / 2;
  for (const sens of [-1, 1]) {
    const epaule = pointLem(cam, lem, sens * TRAIN.xEpaule, TRAIN.yEpaule);
    const pied = pointLem(cam, lem, sens * demiTrain, yPied);
    r.drawPolyline([epaule, pied], { stroke: PALETTE.grisClair });
    r.drawPolyline(
      [
        pointLem(cam, lem, sens * (demiTrain - TRAIN.patin), yPied),
        pointLem(cam, lem, sens * (demiTrain + TRAIN.patin), yPied),
      ],
      { stroke: PALETTE.grisClair },
    );
  }

  r.drawPixel(pointLem(cam, lem, HUBLOT.dx, HUBLOT.dy), PALETTE.accent);
}

/**
 * La flamme du moteur : longueur **proportionnelle au cran**, halo
 * `flammeChaude`, cœur `flammeClaire` plus court et plus étroit, et tremblement
 * d'un pixel dérivé du temps de jeu.
 *
 * Rien à dessiner au cran 0 ni réservoir vide : une flamme sur un moteur éteint
 * ou à sec est un mensonge visuel. La garde de statut — pas de flamme hors du vol
 * — appartient à l'appelant, qui est le seul à connaître le statut de la manche.
 */
export function dessineFlamme(
  r: Renderer,
  lem: Lander,
  cam: Camera,
  temps: number,
): void {
  if (lem.cran <= 0 || sansCarburant(lem)) return;

  const longueur = (lem.cran / CRANS_MAX) * FLAMME.longueurMax;
  // Tremblement dérivé du temps, jamais d'un générateur : la suite des tirages
  // de la manche ne doit pas dépendre du nombre d'images affichées.
  const tremble = Math.round(Math.sin(temps * FLAMME_PULSATION));

  remplitTrapeze(
    r,
    cam,
    lem,
    {
      largeurHaut: FLAMME.largeur,
      largeurBas: 0,
      yHaut: FLAMME.bouche,
      yBas: FLAMME.bouche + longueur,
    },
    PALETTE.flammeChaude,
    tremble,
  );
  remplitTrapeze(
    r,
    cam,
    lem,
    {
      largeurHaut: FLAMME.largeur * FLAMME.partCoeurLargeur,
      largeurBas: 0,
      yHaut: FLAMME.bouche,
      yBas: FLAMME.bouche + longueur * FLAMME.partCoeurLongueur,
    },
    PALETTE.flammeClaire,
    tremble,
  );
}

// --- Particules ---

/**
 * Les particules : un pixel plein chacune, deux au zoom serré, dans leur teinte
 * de palette et fondues sur leur âge.
 *
 * Un `drawPixel` et pas un `drawCircle` : un cercle de canvas de rayon 1 sort
 * antialiasé, et une gerbe de quarante débris flous devant un relief net se voit
 * immédiatement. Le fondu passe par `withAlpha`, seule façon d'éclaircir une
 * couleur sans sortir des seize teintes.
 *
 * Rien n'est tiré ici : la position, l'âge et la teinte viennent de l'entité.
 */
export function dessineParticules(
  r: Renderer,
  particules: readonly Particle[],
  cam: Camera,
): void {
  const taille = Math.min(PARTICULE_TAILLE_MAX, cam.zoom);
  for (const particule of particules) {
    const opacite = opaciteParticule(particule);
    if (opacite <= 0) continue;
    const p = versEcranPixel(cam, particule.position);
    if (
      p.x + taille <= 0 ||
      p.x >= r.width ||
      p.y + taille <= 0 ||
      p.y >= r.height
    ) {
      continue;
    }
    r.withAlpha(opacite, () => {
      r.drawPixel(p, PALETTE[particule.teinte], taille);
    });
  }
}

// --- Indicateur de cible ---

/** Vers où pointe l'indicateur, ou `null` quand la cible est dans la vue. */
export type DirectionIndicateur = "gauche" | "droite" | "haut" | "bas" | null;

/**
 * Direction de l'indicateur de cible : le côté par lequel la cible sort le plus
 * de la vue, **verticalement comme latéralement**.
 *
 * Le cas vertical n'est pas un raffinement : au largage, la cible est
 * typiquement sous le bord bas de l'écran (voir `BIAIS_CAMERA_Y`), et un
 * indicateur qui ne saurait pointer qu'à gauche ou à droite laisserait le joueur
 * sans repère au moment où il en a le plus besoin.
 */
export function directionIndicateur(
  cam: Camera,
  cible: { readonly x: number; readonly y: number },
): DirectionIndicateur {
  if (estVisible(cam, new Vector2(cible.x, cible.y))) return null;
  const b = bornesVisibles(cam);
  const debords = [
    { direction: "gauche" as const, debord: b.xMin - cible.x },
    { direction: "droite" as const, debord: cible.x - b.xMax },
    { direction: "haut" as const, debord: b.yMin - cible.y },
    { direction: "bas" as const, debord: cible.y - b.yMax },
  ];
  let pire = debords[0] as (typeof debords)[number];
  for (const candidat of debords) {
    if (candidat.debord > pire.debord) pire = candidat;
  }
  return pire.direction;
}

/** Triangle plein de `FLECHE_TAILLE` pixels, pointe dans la direction donnée. */
function dessineFleche(
  r: Renderer,
  at: Vector2,
  direction: Exclude<DirectionIndicateur, null>,
): void {
  for (let l = 0; l < FLECHE_TAILLE; l++) {
    const demi = FLECHE_TAILLE - 1 - l;
    const travers = 2 * demi + 1;
    switch (direction) {
      case "bas":
        r.fillRect(
          new Vector2(at.x - demi, at.y + l),
          travers,
          1,
          PALETTE.accent,
        );
        break;
      case "haut":
        r.fillRect(
          new Vector2(at.x - demi, at.y - l),
          travers,
          1,
          PALETTE.accent,
        );
        break;
      case "gauche":
        r.fillRect(
          new Vector2(at.x - l, at.y - demi),
          1,
          travers,
          PALETTE.accent,
        );
        break;
      case "droite":
        r.fillRect(
          new Vector2(at.x + l, at.y - demi),
          1,
          travers,
          PALETTE.accent,
        );
        break;
    }
  }
}

/**
 * Flèche au bord de l'écran quand la plateforme cible est hors champ. Rien du
 * tout quand elle est visible : le joueur la voit, l'indicateur n'a rien à dire.
 *
 * L'écrêtage évite aussi le tableau de bord, pas seulement les bords du
 * canvas : au largage, la cible est toujours sous le bord bas de la vue (voir
 * `BIAIS_CAMERA_Y`), et une flèche simplement écrêtée aux bords de l'écran
 * tombe pile sur la jauge de carburant ou celle de puissance — deux jauges
 * pleines qui la couvrent quasi entièrement. La bande du bas (`BANDE_JAUGES`)
 * et celle du haut (`BAS_BLOC_SUPERIEUR`) sont donc retirées de la zone
 * atteignable, en plus de la marge d'écran déjà appliquée en abscisse.
 */
export function dessineIndicateurCible(
  r: Renderer,
  cible: Terrain["cible"],
  cam: Camera,
): void {
  const direction = directionIndicateur(cam, cible);
  if (direction === null) return;
  const p = versEcran(cam, new Vector2(cible.x, cible.y));
  const marge = FLECHE_TAILLE + FLECHE_MARGE;
  const pince = (v: number, min: number, max: number): number =>
    Math.round(Math.min(Math.max(v, min), max));
  const x = pince(p.x, marge, r.width - 1 - marge);
  const y = pince(
    p.y,
    BAS_BLOC_SUPERIEUR + marge,
    r.height - BANDE_JAUGES - 1 - marge,
  );
  dessineFleche(r, new Vector2(x, y), direction);
}

// --- Pause ---

/**
 * Voile de pause : un assombrissement de l'image, puis les trois lignes du menu.
 * L'image du jeu reste visible dessous — la pause suspend la partie, elle ne la
 * cache pas.
 */
export function dessinePause(r: Renderer): void {
  r.withAlpha(PAUSE_VOILE, () => {
    r.fillRect(Vector2.ZERO, r.width, r.height, PALETTE.espace);
  });
  const centre = Math.round(r.width / 2);
  dessineTexte(r, "PAUSE", new Vector2(centre, PAUSE_LIGNES.titre), PALETTE.blanc, {
    align: "center",
    echelle: 2,
  });
  dessineTexte(
    r,
    "ENTREE REPRENDRE",
    new Vector2(centre, PAUSE_LIGNES.reprendre),
    PALETTE.grisPale,
    { align: "center" },
  );
  dessineTexte(
    r,
    "ECHAP ABANDONNER",
    new Vector2(centre, PAUSE_LIGNES.abandonner),
    PALETTE.grisPale,
    { align: "center" },
  );
}
