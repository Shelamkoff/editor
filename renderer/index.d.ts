/**
 * Factory function for quick instance creation
 * @param {import('./types').RendererConfig} [config]
 * @returns {EditorRenderer}
 */
export function createEditorRenderer(config?: import("./types").RendererConfig): EditorRenderer;
/**
 * Renders Ophire Editor blocks to DOM elements.
 */
export class EditorRenderer {
    /** @param {import('./types').RendererConfig} [config] */
    constructor(config?: import("./types").RendererConfig);
    /**
     * Register a custom block renderer
     * @param {import('./types').BlockRenderer} renderer
     * @returns {this}
     */
    registerRenderer(renderer: import("./types").BlockRenderer): this;
    /**
     * Unregister a block renderer
     * @param {string} type
     * @returns {this}
     */
    unregisterRenderer(type: string): this;
    /**
     * Check if a block type is supported
     * @param {string} type
     * @returns {boolean}
     */
    hasRenderer(type: string): boolean;
    /**
     * Get list of all registered block types
     * @returns {string[]}
     */
    getRegisteredTypes(): string[];
    /**
     * Render a single block to HTMLElement
     * @param {import('./types').OutputBlockData} block
     * @returns {HTMLElement}
     */
    renderBlock(block: import("./types").OutputBlockData): HTMLElement;
    /**
     * Render all blocks into a wrapper element with CSS variable scope.
     * @param {import('./types').OutputData} data
     * @returns {HTMLElement}
     */
    render(data: import("./types").OutputData): HTMLElement;
    /**
     * Render all blocks to a container element
     * @param {import('./types').OutputData} data
     * @param {HTMLElement} container
     * @returns {void}
     */
    renderTo(data: import("./types").OutputData, container: HTMLElement): void;
    /**
     * Get the class prefix used by this renderer
     * @returns {string}
     */
    getClassPrefix(): string;
    /**
     * Collect all CSS URLs from base styles and registered renderers
     * @returns {string[]}
     */
    getStyleUrls(): string[];
    /**
     * Inject <link> tags for all collected CSS URLs
     * @returns {{ destroy(): void }}
     */
    injectStyles(): {
        destroy(): void;
    };
    #private;
}
export { getSupportedBlockTypes };
import { getSupportedBlockTypes } from './renderers/index.js';
