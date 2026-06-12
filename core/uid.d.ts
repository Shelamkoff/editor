/**
 * Generate a random block ID.
 * Uses rejection sampling to eliminate modulo bias.
 * @returns {string}
 */
export function uid(): string;
