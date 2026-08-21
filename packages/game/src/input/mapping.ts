import type { Command } from "../types.ts";

/** Table `KeyboardEvent.code` → commande. Le jeu se joue aux quatre flèches. */
export const KEY_MAP: Record<string, Command> = {
  ArrowLeft: "tilt-left",
  ArrowRight: "tilt-right",
  ArrowUp: "throttle-up",
  ArrowDown: "throttle-down",
  Enter: "confirm",
  Escape: "back",
};
