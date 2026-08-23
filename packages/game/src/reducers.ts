/**
 * Reducers purs de la partie : ils prennent un état et un événement, et rendent
 * un nouvel état. Aucun ne mute ce qu'il reçoit.
 *
 * ## Deux familles, de part et d'autre de la frontière `Scene.tick`
 *
 * - **appliqués par la scène**, sur les événements des règles de tick :
 *   `surContact`, `surHorsLimites`, `surTempsVol`, `surMancheSuivante`,
 *   `surGaz`, `surParticuleMorte` ;
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
 *
 * ## Tout reducer qui crée des particules avance `tiragesParticules`
 *
 * Un `Rng` est mutable : il ne peut pas vivre dans un `GameState` immuable, et
 * une variable de module serait un état de simulation caché. Chaque gerbe dérive
 * donc son générateur de la graine de la partie, du numéro de manche **et** de ce
 * compteur, qu'elle incrémente. Voir `rngParticules` plus bas.
 */

import {
  addEntities,
  byKind,
  createRng,
  melangeGraine,
  removeEntities,
  surfaceEn,
  Vector2,
  type Rng,
} from "@lem/engine";
import { GAZ_BOUCHE, LEM, PARTICULES_MAX } from "./constants.ts";
import { Lander, sansCarburant } from "./entities/Lander.ts";
import {
  explosion,
  gaz,
  poussiere,
  type Gerbe,
} from "./entities/Particle.ts";
import type { Verdict } from "./landing.ts";
import { nouvelleManche, type EtatPartie, type Globals } from "./state.ts";
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

// --- Particules ---

/**
 * Particules encore **vivantes** dans une liste d'entités.
 *
 * Le plafond ne compte que celles-là : sans `regleParticules` pour retirer les
 * autres de la scène le compte inclurait des particules mortes et invisibles, et
 * `PARTICULES_MAX` serait atteint en quelques secondes sans jamais se libérer.
 */
function particulesVivantes(entites: readonly LemEntity[]): number {
  let compte = 0;
  for (const entite of entites) {
    if (entite.kind === "particle" && entite.age < entite.life) compte++;
  }
  return compte;
}

/**
 * Générateur d'une gerbe : dérivé de la graine de la **partie**, du numéro de
 * manche et du nombre de gerbes déjà tirées.
 *
 * Les trois sont indispensables. Sans le numéro de manche, deux manches d'une
 * même partie auraient les mêmes gerbes ; sans le compteur, **toutes** les gerbes
 * d'une manche seraient identiques — un panache de gaz figé en un trait de pixels
 * fixe sous la tuyère — sans qu'un test « déterministe à graine fixée » ne le
 * signale, puisqu'il le resterait.
 */
function rngParticules(g: Globals): Rng {
  return createRng(
    melangeGraine(melangeGraine(g.graine, g.numeroManche), g.tiragesParticules),
  );
}

/** Ce qu'une gerbe change dans l'état : les entités et deux compteurs. */
interface AjoutGerbe {
  readonly entities: readonly LemEntity[];
  readonly nextId: number;
  readonly tiragesParticules: number;
}

/**
 * Ajoute une gerbe à une liste d'entités, **plafond respecté**.
 *
 * Au-delà de `PARTICULES_MAX` particules vivantes, rien n'est créé et aucun
 * tirage n'est consommé : le compteur ne bouge pas non plus, puisque aucun
 * générateur n'a été dérivé.
 */
function ajouteGerbe(
  g: Globals,
  entites: readonly LemEntity[],
  fabrique: (startId: number, rng: Rng) => Gerbe,
): AjoutGerbe {
  if (particulesVivantes(entites) >= PARTICULES_MAX) {
    return {
      entities: entites,
      nextId: g.nextId,
      tiragesParticules: g.tiragesParticules,
    };
  }
  const gerbe = fabrique(g.nextId, rngParticules(g));
  return {
    entities: [...entites, ...gerbe.particles],
    nextId: gerbe.nextId,
    tiragesParticules: g.tiragesParticules + 1,
  };
}

/** Le LEM de l'état, ou `null` : les gerbes de contact partent de sa position. */
function lemDe(etat: EtatPartie): Lander | null {
  return byKind(etat, "lander")[0] ?? null;
}

/** Manche réussie : l'écart entre au score, une manche réussie de plus. */
function enregistrePose(etat: EtatPartie, verdict: Verdict): EtatPartie {
  if (verdict.pose === false) return etat;
  const g = etat.globals;
  const lem = lemDe(etat);
  // La poussière se soulève sous les **pieds**, donc à la surface du relief, et
  // non au centre du LEM qui est une demi-hauteur plus haut.
  const origine = lem
    ? new Vector2(lem.position.x, surfaceEn(g.terrain.hf, lem.position.x))
    : Vector2.ZERO;
  const ajout = ajouteGerbe(g, figeLem(etat, true), (id, rng) =>
    poussiere(id, origine, rng),
  );
  return {
    ...etat,
    entities: ajout.entities,
    globals: {
      ...g,
      statut: "pose",
      ecarts: [...g.ecarts, verdict.ecart],
      manchesReussies: g.manchesReussies + 1,
      dernierVerdict: verdict,
      contactEmisPourManche: true,
      instantStatut: etat.time,
      nextId: ajout.nextId,
      tiragesParticules: ajout.tiragesParticules,
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
  // L'explosion part du **centre** du LEM, là où il a été figé : dans la roche
  // s'il s'y est enfoncé, dans le vide s'il est sorti du monde.
  const origine = lemDe(etat)?.position ?? Vector2.ZERO;
  const ajout = ajouteGerbe(g, figeLem(etat, false), (id, rng) =>
    explosion(id, origine, rng),
  );
  return {
    ...etat,
    entities: ajout.entities,
    globals: {
      ...g,
      statut: vies <= 0 ? "fini" : "crash",
      vies,
      dernierVerdict: verdict,
      contactEmisPourManche: true,
      instantStatut: etat.time,
      nextId: ajout.nextId,
      tiragesParticules: ajout.tiragesParticules,
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

/**
 * Bouffée de gaz sous la tuyère, pour le `dt` écoulé.
 *
 * La garde de statut est doublée avec celle de `regleGaz` : la règle et le
 * reducer sont de part et d'autre du repliement des événements, et le contact du
 * même tick a pu faire passer le statut hors du vol entre les deux. Un panache
 * craché sous un LEM déjà jugé serait un mensonge visuel.
 *
 * Le reste fractionnaire du débit repart dans `gazAccu`, et le compteur de
 * tirages avance d'un cran : c'est ce qui fait que deux bouffées consécutives ne
 * sont pas la même image copiée deux fois.
 */
export function surGaz(
  etat: EtatPartie,
  ev: { readonly dt: number },
): EtatPartie {
  const g = etat.globals;
  if (g.statut !== "vol") return etat;
  const lem = lemDe(etat);
  if (!lem || lem.inerte || lem.cran <= 0 || sansCarburant(lem)) return etat;
  if (particulesVivantes(etat.entities) >= PARTICULES_MAX) return etat;

  // La bouche de la tuyère et l'axe du jet, tous deux tournés de l'assiette. Le
  // gaz sort à l'opposé de la poussée : `y` croît vers le bas, donc l'axe de
  // poussée est `assiette - π/2` et celui du jet `assiette + π/2`.
  const bouche = lem.position.add(
    new Vector2(0, GAZ_BOUCHE).rotate(lem.assiette),
  );
  const direction = Vector2.fromAngle(lem.assiette + Math.PI / 2);
  const jet = gaz(
    g.nextId,
    bouche,
    direction,
    lem.cran,
    ev.dt,
    g.gazAccu,
    rngParticules(g),
  );
  // `addEntities` rend l'état tel quel quand la gerbe est vide : une image sur
  // deux au cran 5 à 60 Hz ne produit aucune particule — le reste fractionnaire
  // n'a pas encore atteint 1 — et il n'y a aucune raison d'y recopier la liste
  // entière des entités.
  return {
    ...addEntities(etat, jet.particles),
    globals: {
      ...g,
      nextId: jet.nextId,
      gazAccu: jet.reste,
      tiragesParticules: g.tiragesParticules + 1,
    },
  };
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
