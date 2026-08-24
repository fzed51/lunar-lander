import { GameLoop } from "@lem/engine";
import { creeSurface } from "./render/surface.ts";
import { creeEcranJeu } from "./screens/game.ts";
import { creeEcranFin } from "./screens/gameover.ts";
import { creeEcranHof } from "./screens/hof.ts";
import { creeEcranAccueil } from "./screens/home.ts";
import { GestionnaireEcrans } from "./screens/manager.ts";
import { stockageDisponible } from "./storage.ts";

/**
 * Récupère un élément obligatoire de la page. Le type de retour n'est pas
 * nullable : les fermetures de ce module s'en servent sans avoir à retester, ce
 * que le rétrécissement de type ne leur garantirait pas.
 */
function exige<T extends Element>(selecteur: string): T {
  const element = document.querySelector<T>(selecteur);
  if (!element) throw new Error(`élément ${selecteur} introuvable`);
  return element;
}

const ui = exige<HTMLElement>("#ui");
// Deux surfaces, deux couches : `#fond` porte le décor animé des écrans en DOM,
// `#game` la partie jouée. `#fond` est sous `#game` dans la page, et `#game` est
// transparent : l'écran de jeu efface sa couche en sortant, sinon sa dernière
// image masquerait le fond de tous les autres écrans.
const fond = creeSurface(exige<HTMLCanvasElement>("#fond"));
const surface = creeSurface(exige<HTMLCanvasElement>("#game"));
const gestionnaire = new GestionnaireEcrans();
// L'unique magasin du jeu, choisi **une seule fois** ici puis distribué aux
// écrans qui en ont besoin. Deux appels séparés dans deux écrans se replieraient
// chacun sur leur propre mémoire en navigation privée, et le trigramme validé
// n'apparaîtrait jamais au classement.
const stockage = stockageDisponible();

// Les quatre écrans du jeu : accueil → jeu → fin → hof → accueil. Chacun reçoit
// ce qu'il ne doit pas fabriquer lui-même — surface de dessin, source de
// commandes de l'image, magasin du classement. L'accueil et le hall of fame
// peignent la même couche de fond, et lisent le même magasin que l'écran de fin.
gestionnaire
  .enregistre(creeEcranAccueil({ renderer: fond.renderer }))
  .enregistre(
    creeEcranJeu({
      renderer: surface.renderer,
      input: gestionnaire.sourcePartagee(),
    }),
  )
  .enregistre(creeEcranFin({ hote: ui, stockage }))
  .enregistre(creeEcranHof({ hote: ui, renderer: fond.renderer, stockage }));

gestionnaire.active({ nom: "accueil" });

/**
 * `GameLoop<S>` est fonctionnel sur un état immuable, la couche écrans est à
 * objets : on l'instancie en `GameLoop<null>`, l'état de la boucle reste vide et
 * le gestionnaire porte le sien. C'est assumé — il ne faut **pas** écrire une
 * seconde boucle à côté de celle du moteur, sinon deux horloges se partagent le
 * même clavier et le sondage unique par image ne tient plus.
 */
const boucle = new GameLoop<null>(
  (etat, dt) => {
    gestionnaire.tick(dt);
    return etat;
  },
  () => gestionnaire.rend(),
);
boucle.start(null);
