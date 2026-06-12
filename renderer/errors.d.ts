export class EditorRendererError extends Error {
    /** @param {string} message */
    constructor(message: string);
}
export class UnknownBlockTypeError extends EditorRendererError {
    /**
     * @param {string} blockType
     * @param {string} [blockId]
     */
    constructor(blockType: string, blockId?: string);
    /** @readonly @type {string} */
    readonly blockType: string;
    /** @readonly @type {string | undefined} */
    readonly blockId: string | undefined;
}
export class InvalidBlockDataError extends EditorRendererError {
    /**
     * @param {string} blockType
     * @param {string} reason
     * @param {string} [blockId]
     */
    constructor(blockType: string, reason: string, blockId?: string);
    /** @readonly @type {string} */
    readonly blockType: string;
    /** @readonly @type {string | undefined} */
    readonly blockId: string | undefined;
}
