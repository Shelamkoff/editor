/**
 * Merge user-supplied tuning overrides onto defaults.
 * Shallow per-group (one level deep) — each group is an object with primitive leaves.
 *
 * @param {Partial<EditorTuning>} [overrides]
 * @returns {EditorTuning}
 */
export function resolveTuning(overrides?: Partial<EditorTuning>): EditorTuning;
/**
 * Default behavioral tuning for the editor.
 *
 * Every knob here is overridable via `createEditor({ tuning: {...} })`.
 * These are UX/behavior defaults, not performance tuning — the name `tuning`
 * reflects that.
 *
 * @typedef {Object} EditorTuning
 * @property {{ threshold: number }} drag
 *   Drag-and-drop — minimum pixel movement before a mousedown becomes a drag.
 * @property {{ maxStack: number, debounceMs: number }} undo
 *   Undo stack — max history depth and coalescing debounce.
 * @property {{ debounceMs: number }} change
 *   `onChange` coalescing window for ChangeNotifier.
 * @property {{ filterThreshold: number }} toolbar
 *   TypeSelector search — minimum plugin count before filter input appears.
 * @property {{ blockInsertMs: number, blockMoveMs: number, blockRemoveMs: number }} animations
 *   Block insert/move/remove animation durations.
 * @property {number} mobileBreakpoint
 *   Width below which the UI switches to mobile layout (matches CSS media queries).
 */
/** @type {EditorTuning} */
export const DEFAULT_TUNING: EditorTuning;
/**
 * Default behavioral tuning for the editor.
 *
 * Every knob here is overridable via `createEditor({ tuning: {...} })`.
 * These are UX/behavior defaults, not performance tuning — the name `tuning`
 * reflects that.
 */
export type EditorTuning = {
    /**
     *   Drag-and-drop — minimum pixel movement before a mousedown becomes a drag.
     */
    drag: {
        threshold: number;
    };
    /**
     *   Undo stack — max history depth and coalescing debounce.
     */
    undo: {
        maxStack: number;
        debounceMs: number;
    };
    /**
     *   `onChange` coalescing window for ChangeNotifier.
     */
    change: {
        debounceMs: number;
    };
    /**
     *   TypeSelector search — minimum plugin count before filter input appears.
     */
    toolbar: {
        filterThreshold: number;
    };
    /**
     *   Block insert/move/remove animation durations.
     */
    animations: {
        blockInsertMs: number;
        blockMoveMs: number;
        blockRemoveMs: number;
    };
    /**
     *   Width below which the UI switches to mobile layout (matches CSS media queries).
     */
    mobileBreakpoint: number;
};
