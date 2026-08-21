/** Base de tout événement de jeu. Le jeu fournit une union discriminée par `type`. */
export interface EventBase {
  readonly type: string;
}
