/**
 * Link preview (bookmark) block renderer with 7 templates support.
 * Mirrors the editor plugin: horizontal, compact, large-top, minimal, twitter, notion, split.
 * Auto-falls back to 'minimal' template when no rich content (title/image).
 *
 * @param {string} classPrefix
 * @returns {import('../../types').BlockRenderer<import('../../types').LinkPreviewBlock>}
 */
export function createLinkPreviewRenderer(classPrefix: string, _locale: any): import("../../types").BlockRenderer<import("../../types").LinkPreviewBlock>;
