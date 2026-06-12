/**
 * Spoiler (hidden text) block renderer.
 * Mirrors editor plugin layout: card with header (toggle + label) + content section.
 *
 * @param {string} classPrefix
 * @returns {import('../../types').BlockRenderer<import('../../types').SpoilerBlock>}
 */
export function createSpoilerRenderer(classPrefix: string, locale: Record<string, string>): import("../../types").BlockRenderer<import("../../types").SpoilerBlock>;
