/**
 * Reducers purs de la partie : ils prennent un état et un événement, et rendent
 * un nouvel état. Aucun ne mute ce qu'il reçoit.
 *
 * ## Deux familles, de part et d'autre de la frontière `Scene.tick`
 *
 * - **appliqués par la scène**, sur les événements des règles de tick :
 *   `surContact`, `surHorsLimites`, `surTempsVol`, `surMancheSuivante`,
 *   `surParticuleMorte` ;
 * - **appliqués par l'écran de jeu (T10)**, hors de la scène, à chaque image et
 *   **y compris en pause** : `surPause`, `surReprise`, `surAbandon`. Ces
 *   trois-là ne sont ni des `TickRule` ni des événements de scène : une règle de
 *   tick ne tourne plus dès que l'écran cesse de ticker la scène, donc la sortie
 *   de pause n'y serait jamais lue et la partie serait perdue — seul un
 *   rechargement de page débloquerait le jeu. L'entrée **et** la sortie de pause
 *   vivent du même côté de la frontière.
 *
 * ## Gardes de statut, et pourquoi elles font l'idempotence
 *
 * `toucheLeSol` et `horsLimites` restent vrais indéfiniment après le verdict : un
 * LEM enfoncé dans le sol y reste, un LEM sorti du monde continue de s'éloigner.
 * Les gardes « je ne fais quelque chose que depuis tel statut » sont donc ce qui
 * rend ces reducers idempotents **d'un tick à l'autre**, et pas seulement à
 * l'intérieur d'un tick.
 *
 * ## Tout reducer qui change le statut écrit `instantStatut`
 *
 * Sans cette écriture, `regleEnchainement` n'a aucun instant de référence et le
 * jeu reste bloqué sur le bandeau de fin de manche.
 */

import { removeEntities, surfaceEn, Vector2 } from "@lem/engine";
import { LEM } from "./constants.ts";
import { Lander } from "./entities/Lander.ts";
import type { Verdict } from "./landing.ts";
import { nouvelleManche, type EtatPartie } from "./state.ts";
import type { LemEntity } from "./types.ts";

/**
 * Verdict d'une sortie du monde. Il n'y a rien à mesurer sur un sol qui n'existe
 * pas : la seule cause est la sortie elle-même.
 */
const VERDICT_HORS_LIMITES: Verdict = {
  pose: false,
  causes: ["hors-limites"],
};

/**
 * Immobilise le LEM. **Cela fait partie du reducer du verdict**, ce n'est pas un
 * détail de rendu : `Scene.tick` déplace inconditionnellement toutes les entités
 * *avant* d'évaluer les règles, et `step(dt, input)` ne reçoit pas les globals,
 * donc rien d'autre ne peut arrêter le LEM au moment où sa manche est jugée.
 *
 * Sans ce gel, le LEM continue pendant les deux secondes du bandeau à intégrer
 * la gravité, à brûler du carburant et à obéir aux quatre flèches : après un posé
 * à `vy = 2` m/s, deux secondes de chute lunaire l'enfoncent d'environ 7,2 m —
 * plus que `LEM.hauteur` = 7 — il disparaît dans la roche et la caméra qui le
 * suit plonge sous le relief. Et l'état publié en fin de manche porterait une
 * position et un carburant qui ne sont plus ceux du contact.
 *
 * Sur un **posé**, `position.y` est recalé pour que les pieds reposent exactement
 * sur la surface ; sur un **crash** ou une sortie du monde, le LEM est figé sur
 * place, dans la roche ou dans le vide.
 */
function figeLem(etat: EtatPartie, pose: boolean): readonly LemEntity[] {
  const hf = etat.globals.terrain.hf;
  return etat.entities.map((entite) => {
    if (entite.kind !== "lander") return entite;
    const y = pose
      ? surfaceEn(hf, entite.position.x) - LEM.hauteur / 2
      : entite.position.y;
    return new Lander(
      entite.id,
      new Vector2(entite.position.x, y),
      Vector2.ZERO,
      entite.assiette,
      0,
      entite.carburant,
      entite.radius,
      true,
    );
  });
}

/** Manche réussie : l'écart entre au score, une manche réussie de plus. */
function enregistrePose(etat: EtatPartie, verdict: Verdict): EtatPartie {
  if (verdict.pose === false) return etat;
  const g = etat.globals;
  return {
    ...etat,
    entities: figeLem(etat, true),
    globals: {
      ...g,
      statut: "pose",
      ecarts: [...g.ecarts, verdict.ecart],
      manchesReussies: g.manchesReussies + 1,
      dernierVerdict: verdict,
      contactEmisPourManche: true,
      instantStatut: etat.time,
    },
  };
}

/**
 * Manche perdue : une vie de moins, et la partie s'arrête net à zéro vie plutôt
 * que de boucler sur un crash sans suite. **Aucun écart n'est ajouté** — sinon le
 * score de golf punirait deux fois le même échec.
 */
function enregistrePerte(etat: EtatPartie, verdict: Verdict): EtatPartie {
  const g = etat.globals;
  const vies = g.vies - 1;
  return {
    ...etat,
    entities: figeLem(etat, false),
    globals: {
      ...g,
      statut: vies <= 0 ? "fini" : "crash",
      vies,
      dernierVerdict: verdict,
      contactEmisPourManche: true,
      instantStatut: etat.time,
    },
  };
}

/**
 * Contact avec le sol : posé ou crash, selon le verdict.
 *
 * No-op hors du vol. C'est la garde qui permet de ticker cinq fois de suite un
 * LEM posé sans recompter cinq manches réussies.
 */
export function surContact(
  etat: EtatPartie,
  ev: { readonly verdict: Verdict },
): EtatPartie {
  if (etat.globals.statut !== "vol") return etat;
  return ev.verdict.pose
    ? enregistrePose(etat, ev.verdict)
    : enregistrePerte(etat, ev.verdict);
}

/**
 * Sortie du monde : traitée exactement comme un crash, **avec les mêmes gardes**.
 * Un LEM sorti par le côté continue de s'éloigner, donc `horsLimites` reste
 * vrai : sans garde, la partie se perdrait en trois images.
 */
export function surHorsLimites(etat: EtatPartie): EtatPartie {
  if (etat.globals.statut !== "vol") return etat;
  return enregistrePerte(etat, VERDICT_HORS_LIMITES);
}

/**
 * Un pas de temps de vol de plus au compteur de la partie et à celui de la
 * manche.
 *
 * La garde de statut est doublée avec celle de `regleTempsDeVol` : le chrono ne
 * doit tourner qu'en vol, sans quoi la pause deviendrait un abri gratuit et le
 * temps de vol — clé de tri principale du hall of fame — se gonflerait à l'arrêt.
 */
export function surTempsVol(
  etat: EtatPartie,
  ev: { readonly dt: number },
): EtatPartie {
  const g = etat.globals;
  if (g.statut !== "vol") return etat;
  return {
    ...etat,
    globals: {
      ...g,
      tempsDeVol: g.tempsDeVol + ev.dt,
      tempsManche: g.tempsManche + ev.dt,
    },
  };
}

/**
 * Le bandeau de fin de manche a tenu son délai : on enchaîne s'il reste des
 * vies, sinon la partie est finie.
 *
 * La garde sur `"pose"` / `"crash"` interdit qu'un événement dupliqué démarre
 * deux manches. La branche « plus de vie » est défensive : un crash à la
 * dernière vie met déjà le statut à `"fini"`, et un posé ne coûte pas de vie.
 */
export function surMancheSuivante(etat: EtatPartie): EtatPartie {
  const g = etat.globals;
  if (g.statut !== "pose" && g.statut !== "crash") return etat;
  if (g.vies <= 0) {
    return {
      ...etat,
      globals: { ...g, statut: "fini", instantStatut: etat.time },
    };
  }
  return nouvelleManche(etat);
}

/** Une particule a épuisé sa durée de vie : elle quitte la scène. */
export function surParticuleMorte(
  etat: EtatPartie,
  ev: { readonly particleId: number },
): EtatPartie {
  return removeEntities(etat, new Set([ev.particleId]));
}

/**
 * Mise en pause, **depuis le vol seulement**.
 *
 * Pas de bascule ternaire `"vol" ↔ "pause"` : pendant les deux secondes de
 * `DELAI_ENCHAINEMENT` le statut vaut `"pose"` ou `"crash"`, la scène tourne et
 * l'entrée est lue. Un Échap non gardé y écrirait `statut = "pause"` **et**
 * réécrirait `instantStatut` : `regleEnchainement`, qui ne regarde que `"pose"`
 * et `"crash"`, perdrait sa référence et la manche suivante ne démarrerait
 * jamais.
 *
 * Le gel de la **physique** n'est pas obtenu ici : il l'est par l'écran de jeu,
 * qui ne ticke plus la scène tant que le statut vaut `"pause"` (T10).
 */
export function surPause(etat: EtatPartie): EtatPartie {
  const g = etat.globals;
  if (g.statut !== "vol") return etat;
  return {
    ...etat,
    globals: { ...g, statut: "pause", instantStatut: etat.time },
  };
}

/** Reprise, **depuis la pause seulement**. */
export function surReprise(etat: EtatPartie): EtatPartie {
  const g = etat.globals;
  if (g.statut !== "pause") return etat;
  return {
    ...etat,
    globals: { ...g, statut: "vol", instantStatut: etat.time },
  };
}

/**
 * Abandon, **depuis la pause seulement**. La partie est finie et marquée comme
 * abandonnée ; elle reste classable si au moins une manche a été réussie (T14),
 * sans exploit possible puisque le chrono est gelé en pause.
 */
export function surAbandon(etat: EtatPartie): EtatPartie {
  const g = etat.globals;
  if (g.statut !== "pause") return etat;
  return {
    ...etat,
    globals: {
      ...g,
      statut: "fini",
      abandonnee: true,
      instantStatut: etat.time,
    },
  };
}
