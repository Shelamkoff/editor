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
export const DEFAULT_TUNING = {
  drag: { threshold: 5 },
  undo: { maxStack: 100, debounceMs: 300 },
  change: { debounceMs: 250 },
  toolbar: { filterThreshold: 7 },
  animations: { blockInsertMs: 350, blockMoveMs: 200, blockRemoveMs: 350 },
  mobileBreakpoint: 768,
}

/**
 * Merge user-supplied tuning overrides onto defaults.
 * Shallow per-group (one level deep) — each group is an object with primitive leaves.
 *
 * @param {Partial<EditorTuning>} [overrides]
 * @returns {EditorTuning}
 */
export function resolveTuning(overrides) {
  if (!overrides) return DEFAULT_TUNING
  return {
    drag: { ...DEFAULT_TUNING.drag, ...overrides.drag },
    undo: { ...DEFAULT_TUNING.undo, ...overrides.undo },
    change: { ...DEFAULT_TUNING.change, ...overrides.change },
    toolbar: { ...DEFAULT_TUNING.toolbar, ...overrides.toolbar },
    animations: { ...DEFAULT_TUNING.animations, ...overrides.animations },
    mobileBreakpoint: overrides.mobileBreakpoint ?? DEFAULT_TUNING.mobileBreakpoint,
  }
}
