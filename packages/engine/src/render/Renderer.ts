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
