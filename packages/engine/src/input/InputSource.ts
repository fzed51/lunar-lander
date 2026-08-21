import type { InputSnapshot } from "./InputSnapshot.ts";

/** Source de commandes (clavier, manette, IA…). Le moteur reste device-agnostique. */
export interface InputSource<C extends string> {
  /** Capture l'état courant et draine le tampon des touches fraîchement pressées. */
  poll(): InputSnapshot<C>;
}
