export type EditorEvent = string;
export namespace EditorEvent {
    let READY: string;
    let WILL_CHANGE: string;
    let CHANGED: string;
    let DESTROYED: string;
    let BLOCK_ADDED: string;
    let BLOCK_REMOVED: string;
    let BLOCK_MOVED: string;
    let BLOCK_CONVERTED: string;
    let BLOCK_CHANGED: string;
    let BLOCK_FOCUSED: string;
    let BLOCK_BLURRED: string;
    let BLOCK_SELECTED: string;
    let TOOLBAR_OPENED: string;
    let TOOLBAR_CLOSED: string;
    let UNDO_BATCH_START: string;
    let UNDO_BATCH_END: string;
    let INLINE_PLUGIN_INSERT: string;
    let DRAG_HANDLE_CLICKED: string;
}
/**
 * Event payload type map. Used for JSDoc annotations at call sites.
 */
export type EditorEventMap = {
    READY: void;
    WILL_CHANGE: void;
    CHANGED: void;
    DESTROYED: void;
    BLOCK_ADDED: {
        blockId: string;
        index: number;
    };
    BLOCK_REMOVED: {
        blockId: string;
        index: number;
        animDone?: Promise<void>;
    };
    BLOCK_MOVED: {
        blockId: string;
        from: number;
        to: number;
    };
    BLOCK_CONVERTED: {
        blockId: string;
        from: string;
        to: string;
    };
    BLOCK_CHANGED: {
        blockId: string;
    };
    BLOCK_FOCUSED: {
        blockId: string;
    };
    BLOCK_BLURRED: {
        blockId: string;
    };
    BLOCK_SELECTED: {
        blockIds: string[];
    };
    TOOLBAR_OPENED: {
        type: "block" | "inline";
    };
    TOOLBAR_CLOSED: {
        type: "block" | "inline";
    };
    UNDO_BATCH_START: void;
    UNDO_BATCH_END: void;
    INLINE_PLUGIN_INSERT: {
        type: string;
    };
    DRAG_HANDLE_CLICKED: void;
};
