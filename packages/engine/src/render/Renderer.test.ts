import { describe, it, expect, vi } from "vitest";
import { Vector2 } from "../math/Vector2.ts";
import { Renderer } from "./Renderer.ts";

/**
 * Un faux contexte 2D qui n'enregistre que ce dont `drawPolyline` a besoin.
 * `happy-dom` ne rend pas de canvas exploitable : on fabrique le strict
 * nécessaire plutôt que d'en dépendre.
 */
function creeContexteFactice() {
  return {
    fillStyle: "",
    fillRect: vi.fn(),
    stroke: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
  } as unknown as CanvasRenderingContext2D & {
    fillRect: ReturnType<typeof vi.fn>;
    stroke: ReturnType<typeof vi.fn>;
  };
}

describe("Renderer.drawPolyline", () => {
  it("peint en fillRect, jamais en ctx.stroke()", () => {
    const ctx = creeContexteFactice();
    const r = new Renderer(ctx);
    r.drawPolyline([new Vector2(0, 0), new Vector2(3, 0)], { stroke: "#abc" });
    expect(ctx.stroke).not.toHaveBeenCalled();
    expect(ctx.fillRect).toHaveBeenCalled();
  });

  it("couvre chaque pixel entier d'un segment horizontal", () => {
    const ctx = creeContexteFactice();
    const r = new Renderer(ctx);
    r.drawPolyline([new Vector2(0, 5), new Vector2(3, 5)]);
    const pixels = ctx.fillRect.mock.calls.map(([x, y]) => `${x},${y}`);
    expect(pixels).toEqual(["0,5", "1,5", "2,5", "3,5"]);
  });

  it("couvre chaque pixel entier d'un segment diagonal", () => {
    const ctx = creeContexteFactice();
    const r = new Renderer(ctx);
    r.drawPolyline([new Vector2(0, 0), new Vector2(2, 2)]);
    const pixels = ctx.fillRect.mock.calls.map(([x, y]) => `${x},${y}`);
    expect(pixels).toEqual(["0,0", "1,1", "2,2"]);
  });

  it("relie chaque paire de points consécutifs d'une ligne brisée", () => {
    const ctx = creeContexteFactice();
    const r = new Renderer(ctx);
    r.drawPolyline([new Vector2(0, 0), new Vector2(2, 0), new Vector2(2, 2)]);
    const pixels = ctx.fillRect.mock.calls.map(([x, y]) => `${x},${y}`);
    // Le point de jonction (2,0) est peint deux fois : fin du premier segment,
    // départ du second — même pixel, sans effet visible.
    expect(pixels).toEqual(["0,0", "1,0", "2,0", "2,0", "2,1", "2,2"]);
  });

  it("ne dessine rien pour moins de deux points", () => {
    const ctx = creeContexteFactice();
    const r = new Renderer(ctx);
    r.drawPolyline([new Vector2(1, 1)]);
    expect(ctx.fillRect).not.toHaveBeenCalled();
  });
});
