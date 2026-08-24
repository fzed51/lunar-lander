/**
 * Petite interface de stockage clé/valeur, et ses deux implémentations : le
 * `localStorage` du navigateur, et un magasin en mémoire.
 *
 * Le jeu ne parle jamais à `localStorage` directement. Passer par une interface
 * coûte trois méthodes et rend deux choses possibles : brancher autre chose plus
 * tard sans toucher au hall of fame, et tester le classement sans DOM du tout.
 *
 * Ce module ne connaît **rien** du hall of fame : ni sa clé, ni son format, ni
 * ses règles de tri. Il transporte des chaînes.
 */

/**
 * Un magasin clé/valeur de chaînes.
 *
 * Les trois méthodes ont le droit de **lever** — `localStorage` le fait en
 * navigation privée, quota plein, ou quand la page est isolée par la politique
 * du navigateur. C'est délibéré : `stockageDisponible` a besoin de voir
 * l'échec pour choisir son repli, et c'est `hof.ts` qui attrape ensuite tout ce
 * qui pourrait remonter jusqu'à un écran. Un adaptateur qui avalerait les
 * exceptions ici rendrait un `localStorage` cassé indiscernable d'un
 * `localStorage` vide.
 */
export interface Stockage {
  /** Valeur associée à la clé, ou `null` si la clé n'existe pas. */
  lit(cle: string): string | null;
  /** Pose la valeur sous la clé. */
  ecrit(cle: string, valeur: string): void;
  /** Retire la clé. Ne lève pas si elle n'existait pas. */
  efface(cle: string): void;
}

/**
 * Clé jetable servant à vérifier que le stockage du navigateur fonctionne
 * vraiment. Elle est écrite puis effacée aussitôt, et son nom est préfixé comme
 * les autres clés du jeu pour ne rien écraser d'un voisin.
 */
const CLE_TEMOIN = "lem.temoin";

/**
 * Adaptateur sur le `localStorage` du navigateur.
 *
 * L'accès passe par `globalThis` et non par le global nu : sous Node — donc
 * sous Vitest en environnement `node` — `localStorage` n'existe pas, et le lire
 * directement lèverait une `ReferenceError` dès la construction de
 * l'adaptateur, avant même qu'on ait pu la rattraper au bon endroit. Par
 * `globalThis`, l'absence se manifeste au premier appel, là où
 * `stockageDisponible` l'attend.
 */
export function stockageNavigateur(): Stockage {
  return {
    lit(cle: string): string | null {
      return globalThis.localStorage.getItem(cle);
    },
    ecrit(cle: string, valeur: string): void {
      globalThis.localStorage.setItem(cle, valeur);
    },
    efface(cle: string): void {
      globalThis.localStorage.removeItem(cle);
    },
  };
}

/**
 * Magasin en mémoire, vivant le temps de la page. Sert aux tests, et de repli
 * quand le navigateur refuse son stockage.
 *
 * Chaque appel crée un magasin **neuf et indépendant** : c'est ce qui en fait un
 * bon outil de test, et c'est aussi pourquoi `stockageDisponible` mémorise le
 * sien plutôt que d'en refabriquer un à chaque appel.
 */
export function stockageMemoire(): Stockage {
  const magasin = new Map<string, string>();
  return {
    lit(cle: string): string | null {
      return magasin.get(cle) ?? null;
    },
    ecrit(cle: string, valeur: string): void {
      magasin.set(cle, valeur);
    },
    efface(cle: string): void {
      magasin.delete(cle);
    },
  };
}

/**
 * Vrai si ce magasin encaisse un aller-retour écriture / lecture / effacement.
 *
 * On **écrit** pour de bon : tester `typeof localStorage !== "undefined"` ne
 * prouve rien. En navigation privée sur certains navigateurs, l'objet existe,
 * répond à `getItem`, et lève seulement à `setItem`. En mode « cookies
 * bloqués », le simple accès à la propriété lève. Seul l'aller-retour réel
 * distingue les trois cas.
 */
function encaisseUnAllerRetour(magasin: Stockage): boolean {
  try {
    const temoin = "1";
    magasin.ecrit(CLE_TEMOIN, temoin);
    const relu = magasin.lit(CLE_TEMOIN);
    magasin.efface(CLE_TEMOIN);
    return relu === temoin;
  } catch {
    return false;
  }
}

/**
 * Repli mémorisé, partagé par tous les appels de `stockageDisponible`. Voir
 * ci-dessous pourquoi il ne peut pas être recréé à chaque appel.
 */
let repliMemoire: Stockage | null = null;

/**
 * Le meilleur stockage disponible : celui du navigateur s'il fonctionne, sinon
 * un magasin en mémoire.
 *
 * Le repli est **mémorisé** : deux appels successifs sur un navigateur sans
 * stockage rendent la **même** instance. Sans cette mémorisation, l'écran de fin
 * de partie et l'écran du hall of fame obtiendraient chacun leur propre magasin,
 * invisible pour l'autre — le joueur validerait son trigramme puis découvrirait
 * un classement vide, sans le moindre message d'erreur pour l'expliquer.
 *
 * Le repli mémorisé ne remplace pas la discipline d'appel : `main.ts` appelle
 * cette fonction **une seule fois** et distribue l'instance obtenue aux écrans.
 * Un écran ne rappelle pas `stockageDisponible` de son côté.
 */
export function stockageDisponible(): Stockage {
  const navigateur = stockageNavigateur();
  if (encaisseUnAllerRetour(navigateur)) return navigateur;
  repliMemoire ??= stockageMemoire();
  return repliMemoire;
}
