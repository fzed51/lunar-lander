import { Vector2 } from "../math/Vector2.ts";

export interface StrokeFill {
  stroke?: string;
  fill?: string;
  lineWidth?: number;
}

export interface TextOptions {
  color?: string;
  font?: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
}

/**
 * Fine surcouche du contexte canvas 2D : primitives de dessin, aucune logique
 * de jeu. Le jeu compose ces primitives pour dessiner ses entités.
 *
 * Le contexte reste **toujours à l'échelle 1** : il n'existe volontairement
 * aucune primitive qui appliquerait le zoom de la caméra par un `ctx.scale`.
 * Une mise à l'échelle du contexte placerait les bords des formes à des
 * coordonnées fractionnaires dès que la position monde n'est pas entière, et
 * rendrait des pixels antialiasés de largeur irrégulière. C'est l'appelant qui
 * convertit ses positions monde en pixels entiers (`versEcranPixel`) et
 * multiplie ses tailles par le zoom entier.
 */
export class Renderer {
  constructor(private readonly ctx: CanvasRenderingContext2D) {}

  get width(): number {
    return this.ctx.canvas.width;
  }

  get height(): number {
    return this.ctx.canvas.height;
  }

  clear(color = "#000"): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  /**
   * Un pixel plein de `taille` pixels de côté. Quand on dessine du monde,
   * `taille` vaut le zoom entier de la caméra : un « pixel monde » couvre alors
   * exactement une cellule de la grille agrandie.
   */
  drawPixel(at: Vector2, couleur: string, taille = 1): void {
    this.ctx.fillStyle = couleur;
    this.ctx.fillRect(at.x, at.y, taille, taille);
  }

  /** Rectangle plein. `at` est le coin haut-gauche. */
  fillRect(
    at: Vector2,
    largeur: number,
    hauteur: number,
    couleur: string,
  ): void {
    this.ctx.fillStyle = couleur;
    this.ctx.fillRect(at.x, at.y, largeur, hauteur);
  }

  /**
   * Contour de rectangle, épais de `lineWidth` pixels (1 par défaut), tracé
   * **à l'intérieur** de la zone `largeur × hauteur`. Remplit d'abord
   * l'intérieur si `fill` est donné.
   *
   * Le contour est peint en quatre rectangles pleins, pas en `ctx.stroke()` :
   * un trait de canvas est centré sur son chemin, donc un contour d'épaisseur 1
   * posé sur des coordonnées entières déborde d'un demi-pixel de chaque côté et
   * ressort en deux rangées à 50 % d'opacité. Le cadre d'une jauge du HUD serait
   * flou et large de deux pixels au lieu d'un. Ici tout tombe sur la grille.
   */
  strokeRect(
    at: Vector2,
    largeur: number,
    hauteur: number,
    opts: StrokeFill = {},
  ): void {
    const ctx = this.ctx;
    if (opts.fill) {
      ctx.fillStyle = opts.fill;
      ctx.fillRect(at.x, at.y, largeur, hauteur);
    }
    const e = Math.min(
      opts.lineWidth ?? 1,
      Math.abs(largeur),
      Math.abs(hauteur),
    );
    ctx.fillStyle = opts.stroke ?? "#fff";
    ctx.fillRect(at.x, at.y, largeur, e); // haut
    ctx.fillRect(at.x, at.y + hauteur - e, largeur, e); // bas
    ctx.fillRect(at.x, at.y + e, e, hauteur - 2 * e); // gauche
    ctx.fillRect(at.x + largeur - e, at.y + e, e, hauteur - 2 * e); // droite
  }

  drawPolygon(points: readonly Vector2[], opts: StrokeFill = {}): void {
    if (points.length === 0) return;
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(points[0]!.x, points[0]!.y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i]!.x, points[i]!.y);
    }
    ctx.closePath();
    this.paint(opts);
  }

  /**
   * Chemin **ouvert** : le premier et le dernier point ne sont pas reliés.
   * C'est ce qu'il faut pour une crête de terrain, qu'un `drawPolygon`
   * refermerait par un segment traversant tout l'écran.
   *
   * Peint en `fillRect` par pixel entier (Bresenham), pas en `ctx.stroke()` :
   * sur des coordonnées entières, `stroke()` centre le trait sur le chemin et
   * l'étale sur deux rangées de pixels à moitié opaques. `strokeRect` évite déjà
   * ce défaut pour les rectangles ; ceci fait la même chose pour une ligne
   * brisée quelconque.
   */
  drawPolyline(points: readonly Vector2[], opts: StrokeFill = {}): void {
    if (points.length < 2) return;
    const ctx = this.ctx;
    const epaisseur = Math.max(1, Math.round(opts.lineWidth ?? 1));
    ctx.fillStyle = opts.stroke ?? opts.fill ?? "#fff";
    for (let i = 1; i < points.length; i++) {
      this.traceSegment(points[i - 1]!, points[i]!, epaisseur);
    }
  }

  /** Un `fillRect` par pixel entier du segment, algorithme de Bresenham. */
  private traceSegment(a: Vector2, b: Vector2, epaisseur: number): void {
    const ctx = this.ctx;
    let x = Math.round(a.x);
    let y = Math.round(a.y);
    const xFin = Math.round(b.x);
    const yFin = Math.round(b.y);
    const dx = Math.abs(xFin - x);
    const dy = -Math.abs(yFin - y);
    const sx = x < xFin ? 1 : -1;
    const sy = y < yFin ? 1 : -1;
    let erreur = dx + dy;
    for (;;) {
      ctx.fillRect(x, y, epaisseur, epaisseur);
      if (x === xFin && y === yFin) break;
      const e2 = 2 * erreur;
      if (e2 >= dy) {
        erreur += dy;
        x += sx;
      }
      if (e2 <= dx) {
        erreur += dx;
        y += sy;
      }
    }
  }

  drawCircle(center: Vector2, r: number, opts: StrokeFill = {}): void {
    this.ctx.beginPath();
    this.ctx.arc(center.x, center.y, r, 0, Math.PI * 2);
    this.paint(opts);
  }

  drawLine(a: Vector2, b: Vector2, opts: StrokeFill = {}): void {
    this.ctx.beginPath();
    this.ctx.moveTo(a.x, a.y);
    this.ctx.lineTo(b.x, b.y);
    this.paint({ stroke: opts.stroke ?? "#fff", ...opts });
  }

  drawText(text: string, at: Vector2, opts: TextOptions = {}): void {
    const ctx = this.ctx;
    ctx.fillStyle = opts.color ?? "#fff";
    ctx.font = opts.font ?? "16px monospace";
    ctx.textAlign = opts.align ?? "left";
    ctx.textBaseline = opts.baseline ?? "alphabetic";
    ctx.fillText(text, at.x, at.y);
  }

  /** Applique une translation + rotation autour de `pos` pendant `fn`. */
  withTransform(pos: Vector2, angleRad: number, fn: () => void): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(angleRad);
    fn();
    ctx.restore();
  }

  /** Applique une transparence globale pendant `fn`. */
  withAlpha(alpha: number, fn: () => void): void {
    const ctx = this.ctx;
    const prev = ctx.globalAlpha;
    ctx.globalAlpha = alpha;
    fn();
    ctx.globalAlpha = prev;
  }

  /**
   * Limite le dessin au rectangle donné pendant `fn` (une jauge du HUD, une
   * fenêtre de texte). Le `restore` est dans un `finally` : une exception dans
   * `fn` ne laisse pas la découpe active pour tout le reste de l'image, ce qui
   * ferait disparaître le jeu entier sans laisser de trace de la cause.
   */
  withClip(
    at: Vector2,
    largeur: number,
    hauteur: number,
    fn: () => void,
  ): void {
    const ctx = this.ctx;
    ctx.save();
    try {
      ctx.beginPath();
      ctx.rect(at.x, at.y, largeur, hauteur);
      ctx.clip();
      fn();
    } finally {
      ctx.restore();
    }
  }

  private paint(opts: StrokeFill): void {
    const ctx = this.ctx;
    if (opts.fill) {
      ctx.fillStyle = opts.fill;
      ctx.fill();
    }
    if (opts.stroke || !opts.fill) {
      ctx.strokeStyle = opts.stroke ?? "#fff";
      ctx.lineWidth = opts.lineWidth ?? 1;
      ctx.stroke();
    }
  }
}
