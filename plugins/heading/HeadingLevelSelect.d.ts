/**
 * Inline toolbar control for changing heading level.
 * Extracted from Heading.renderInlineControls() for SRP.
 *
 * @param {import('./index.js').Heading} plugin
 * @param {HTMLElement} element - heading content element
 * @param {import('../../../editor/core/types').InlineControlContext} ctx
 * @param {(key: string, fallback: string) => string} t - translation function
 * @returns {import('../../../editor/core/types').InlineControlGroup}
 */
export function createHeadingLevelSelect(plugin: import("./index.js").Heading, element: HTMLElement, ctx: import("../../../editor/core/types").InlineControlContext, t: (key: string, fallback: string) => string): import("../../../editor/core/types").InlineControlGroup;
