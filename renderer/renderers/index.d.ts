/**
 * Get all supported block types
 * @returns {import('../types').BlockType[]}
 */
export function getSupportedBlockTypes(): import("../types").BlockType[];
/**
 * Create all default renderers
 * @param {string} classPrefix
 * @param {Record<string, string>} locale
 * @returns {Map<string, import('../types').BlockRenderer>}
 */
export function createDefaultRenderers(classPrefix: string, locale: Record<string, string>): Map<string, import("../types").BlockRenderer>;
/**
 * Create a single renderer by type
 * @template {import('../types').OutputBlockData} T
 * @param {T['type']} type
 * @param {string} classPrefix
 * @param {Record<string, string>} [locale]
 * @returns {import('../types').BlockRenderer<T> | null}
 */
export function createRenderer<T extends import("../types").OutputBlockData>(type: T["type"], classPrefix: string, locale?: Record<string, string>): import("../types").BlockRenderer<T> | null;
export type RendererFactory = (prefix: string, locale: Record<string, string>) => import("../types").BlockRenderer;
import { createParagraphRenderer } from './paragraph/index.js';
import { createHeaderRenderer } from './heading/index.js';
import { createListRenderer } from './list/index.js';
import { createQuoteRenderer } from './quote/index.js';
import { createCodeRenderer } from './code/index.js';
import { createImageRenderer } from './image/index.js';
import { createDelimiterRenderer } from './delimiter/index.js';
import { createTableRenderer } from './table/index.js';
import { createChecklistRenderer } from './checklist/index.js';
import { createWarningRenderer } from './warning/index.js';
import { createEmbedRenderer } from './embed/index.js';
import { createRawRenderer } from './raw/index.js';
import { createGalleryRenderer } from './gallery/index.js';
import { createAttachesRenderer } from './attaches/index.js';
import { createLinkPreviewRenderer } from './link-preview/index.js';
import { createToggleRenderer } from './toggle/index.js';
import { createColumnsRenderer } from './columns/index.js';
import { createSpoilerRenderer } from './spoiler/index.js';
import { createPollRenderer } from './poll/index.js';
import { createPersonRenderer } from './person/index.js';
export { createParagraphRenderer, createHeaderRenderer, createListRenderer, createQuoteRenderer, createCodeRenderer, createImageRenderer, createDelimiterRenderer, createTableRenderer, createChecklistRenderer, createWarningRenderer, createEmbedRenderer, createRawRenderer, createGalleryRenderer, createAttachesRenderer, createLinkPreviewRenderer, createToggleRenderer, createColumnsRenderer, createSpoilerRenderer, createPollRenderer, createPersonRenderer };
