import { Renderer, Vector2 } from "@lem/engine";
import { PIXEL } from "./constants.ts";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (!canvas) throw new Error("canvas #game introuvable");

// Résolution interne fixe : tout est dessiné en 320 × 180.
canvas.width = PIXEL.width;
canvas.height = PIXEL.height;

const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("contexte 2d indisponible");
ctx.imageSmoothingEnabled = false;

/**
 * Agrandit le canvas d'un facteur ENTIER, jamais fractionnaire : la grille de
 * pixels reste intacte quelle que soit la taille de la fenêtre.
 */
function fitToWindow(): void {
  const scale = Math.max(
    1,
    Math.floor(
      Math.min(
        window.innerWidth / PIXEL.width,
        window.innerHeight / PIXEL.height,
      ),
    ),
  );
  canvas!.style.width = `${PIXEL.width * scale}px`;
  canvas!.style.height = `${PIXEL.height * scale}px`;
}
fitToWindow();
window.addEventListener("resize", fitToWindow);

// Base du dépôt : écran noir et titre. Le jeu est décrit dans plan/.
const renderer = new Renderer(ctx);
renderer.clear("#000");
renderer.drawText("LEM", new Vector2(PIXEL.width / 2, PIXEL.height / 2), {
  color: "#fff",
  font: "16px monospace",
  align: "center",
  baseline: "middle",
});
