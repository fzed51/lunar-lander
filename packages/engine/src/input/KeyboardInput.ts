import type { InputSnapshot } from "./InputSnapshot.ts";
import type { InputSource } from "./InputSource.ts";

/**
 * Source clavier générique. Le `mapping` associe des `KeyboardEvent.code`
 * (ex. "ArrowLeft", "Space") aux noms de commandes du jeu.
 *
 * `justPressed` reflète les touches pressées depuis le DERNIER `poll()`, pas
 * depuis la dernière frame : un appui survenu pendant une frame skippée par le
 * frame limiter n'est pas perdu.
 *
 * Deux garde-fous, tous deux invisibles quand tout va bien :
 *
 * - **Perte de focus** : un `blur` vide les touches actives. Sans ça, une touche
 *   encore enfoncée au moment où la fenêtre passe en arrière-plan ne reçoit
 *   jamais son `keyup`, et la commande reste active pour toujours — au retour
 *   d'onglet, le vaisseau tourne indéfiniment.
 * - **Raccourcis à modificateur** : un `keydown` accompagné de `Ctrl`, `Cmd` ou
 *   `Alt` est ignoré, sans `preventDefault`. Voir `onKeyDown`.
 */
export class KeyboardInput<C extends string> implements InputSource<C> {
  private readonly active = new Set<C>();
  private readonly pressedSincePoll = new Set<C>();
  private readonly onKeyDown: (e: KeyboardEvent) => void;
  private readonly onKeyUp: (e: KeyboardEvent) => void;
  private readonly onBlur: () => void;
  private readonly target: EventTarget;

  constructor(
    private readonly mapping: Readonly<Record<string, C>>,
    target: EventTarget = window,
  ) {
    this.target = target;
    this.onKeyDown = (e) => {
      const ev = e as KeyboardEvent;
      // Un raccourci du navigateur n'est pas une commande de jeu. On sort AVANT
      // de lire le mapping, et sans `preventDefault` pour que le navigateur
      // garde son raccourci : sinon `Ctrl+R` / `Cmd+R` ne recharge plus la page
      // ET vaut un appui sur la commande mappée sur `KeyR`. `shiftKey` n'est pas
      // filtré : il ne porte aucun raccourci navigateur sur les touches du jeu.
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const cmd = this.mapping[ev.code];
      if (cmd === undefined) return;
      ev.preventDefault?.();
      if (!this.active.has(cmd)) this.pressedSincePoll.add(cmd);
      this.active.add(cmd);
    };
    this.onKeyUp = (e) => {
      // Volontairement PAS filtré sur les modificateurs, contrairement à
      // `onKeyDown` : ce gestionnaire ne fait qu'un `active.delete` et n'appelle
      // aucun `preventDefault`, donc le filtrer n'apporterait rien et laisserait
      // la commande bloquée quand la touche est relâchée après avoir attrapé un
      // `Ctrl` en cours de route. Rien en aval ne peut rattraper ce cas :
      // `InputSnapshot` ne transporte aucun modificateur.
      const cmd = this.mapping[(e as KeyboardEvent).code];
      if (cmd === undefined) return;
      this.active.delete(cmd);
    };
    this.onBlur = () => {
      // Les touches enfoncées ne le sont plus de notre point de vue : leur
      // `keyup` partira à la fenêtre qui a pris le focus. On ne touche PAS à
      // `pressedSincePoll` : un front montant déjà enregistré est une
      // information réelle, que le prochain `poll()` doit encore voir.
      this.active.clear();
    };
    this.target.addEventListener("keydown", this.onKeyDown as EventListener);
    this.target.addEventListener("keyup", this.onKeyUp as EventListener);
    this.target.addEventListener("blur", this.onBlur);
  }

  poll(): InputSnapshot<C> {
    const active = new Set(this.active);
    const pressed = new Set(this.pressedSincePoll);
    this.pressedSincePoll.clear();
    return {
      isActive: (c) => active.has(c),
      justPressed: (c) => pressed.has(c),
    };
  }

  dispose(): void {
    this.target.removeEventListener("keydown", this.onKeyDown as EventListener);
    this.target.removeEventListener("keyup", this.onKeyUp as EventListener);
    this.target.removeEventListener("blur", this.onBlur);
    this.active.clear();
    this.pressedSincePoll.clear();
  }
}
