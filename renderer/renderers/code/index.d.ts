/**
 * Code block renderer with syntax highlighting
 * Uses highlight.js for syntax highlighting with auto-detection
 * @see https://highlightjs.org/
 * @param {string} classPrefix
 * @returns {import('../../types').BlockRenderer<import('../../types').CodeBlock>}
 */
export function createCodeRenderer(classPrefix: string, locale: Record<string, string>): import("../../types").BlockRenderer<import("../../types").CodeBlock>;
