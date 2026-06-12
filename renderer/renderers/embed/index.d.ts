/**
 * Embed block renderer — uses shared buildPlayer() for identical DOM structure.
 * Data: { service, videoId, caption?, cover?, title?, duration? }
 * @param {string} classPrefix
 * @returns {import('../../types').BlockRenderer<import('../../types').EmbedBlock>}
 */
export function createEmbedRenderer(classPrefix: string, _locale: any): import("../../types").BlockRenderer<import("../../types").EmbedBlock>;
