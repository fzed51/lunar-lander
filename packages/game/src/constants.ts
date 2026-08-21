/** Résolution interne du canvas, agrandie ensuite par un facteur ENTIER. */
export const PIXEL = { width: 320, height: 180 } as const;

/** Gravité lunaire (m/s²), constante et verticale. */
export const MOON_GRAVITY = 1.62;

// --- Particules (explosion, poussière, gaz du moteur) ---
/** Durée de vie d'une particule (s) ; l'opacité fond linéairement dessus. */
export const PARTICLE_LIFE = 0.6;
/** Vitesse d'éjection d'une particule (px/s), légèrement randomisée. */
export const PARTICLE_SPEED = 40;
