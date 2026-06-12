/**
 * Routing table built from each plugin's `pasteConfig`.
 *
 * Three independent maps:
 *  - tag → plugin (for HTML element matching)
 *  - file MIME pattern → plugin (for `e.clipboardData.files`)
 *  - text regex → plugin (for plain-text URL/pattern matching)
 *
 * Built once at construction time, then queried by Clipboard during paste.
 */
export class PasteRouter {
    /** @param {Iterable<import('../types').BlockPlugin>} plugins */
    constructor(plugins: Iterable<import("../types").BlockPlugin>);
    /** @param {string} tag @returns {import('../types').BlockPlugin | undefined} */
    findByTag(tag: string): import("../types").BlockPlugin | undefined;
    /**
     * @param {string} mime
     * @returns {import('../types').BlockPlugin | undefined}
     */
    findByFile(mime: string): import("../types").BlockPlugin | undefined;
    /**
     * @param {string} text
     * @returns {import('../types').BlockPlugin | undefined}
     */
    findByPattern(text: string): import("../types").BlockPlugin | undefined;
    #private;
}
