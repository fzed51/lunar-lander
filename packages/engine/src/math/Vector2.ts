/**
 * Vecteur 2D immuable. Toutes les opérations retournent une nouvelle instance.
 */
export class Vector2 {
  constructor(
    readonly x: number,
    readonly y: number,
  ) {}

  static readonly ZERO = new Vector2(0, 0);

  /** Vecteur unitaire (ou de longueur `len`) pour un angle en radians (0 = +X). */
  static fromAngle(rad: number, len = 1): Vector2 {
    return new Vector2(Math.cos(rad) * len, Math.sin(rad) * len);
  }

  add(v: Vector2): Vector2 {
    return new Vector2(this.x + v.x, this.y + v.y);
  }

  sub(v: Vector2): Vector2 {
    return new Vector2(this.x - v.x, this.y - v.y);
  }

  scale(k: number): Vector2 {
    return new Vector2(this.x * k, this.y * k);
  }

  length(): number {
    return Math.hypot(this.x, this.y);
  }

  /** Vecteur de même direction et de longueur 1 (ZERO si longueur nulle). */
  normalize(): Vector2 {
    const len = this.length();
    return len === 0 ? Vector2.ZERO : new Vector2(this.x / len, this.y / len);
  }

  /** Rotation dans le sens trigonométrique inverse (horaire à l'écran, Y vers le bas). */
  rotate(rad: number): Vector2 {
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    return new Vector2(this.x * c - this.y * s, this.x * s + this.y * c);
  }

  /** Clampe la norme à `max` (conserve la direction). */
  limit(max: number): Vector2 {
    const len = this.length();
    return len <= max ? this : this.scale(max / len);
  }
}
