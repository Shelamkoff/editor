/**
 * Event payload type map. Used for JSDoc annotations at call sites.
 *
 * @typedef {Object} EditorEventMap
 * @property {void} READY
 * @property {void} WILL_CHANGE
 * @property {void} CHANGED
 * @property {void} DESTROYED
 * @property {{ blockId: string, index: number }} BLOCK_ADDED
 * @property {{ blockId: string, index: number, animDone?: Promise<void> }} BLOCK_REMOVED
 * @property {{ blockId: string, from: number, to: number }} BLOCK_MOVED
 * @property {{ blockId: string, from: string, to: string }} BLOCK_CONVERTED
 * @property {{ blockId: string }} BLOCK_CHANGED
 * @property {{ blockId: string }} BLOCK_FOCUSED
 * @property {{ blockId: string }} BLOCK_BLURRED
 * @property {{ blockIds: string[] }} BLOCK_SELECTED
 * @property {{ type: 'block' | 'inline' }} TOOLBAR_OPENED
 * @property {{ type: 'block' | 'inline' }} TOOLBAR_CLOSED
 * @property {void} UNDO_BATCH_START
 * @property {void} UNDO_BATCH_END
 * @property {{ type: string }} INLINE_PLUGIN_INSERT
 * @property {void} DRAG_HANDLE_CLICKED
 */

/** @enum {string} */
export const EditorEvent = {
  READY: 'editor:ready',
  WILL_CHANGE: 'editor:willChange',
  CHANGED: 'editor:changed',
  DESTROYED: 'editor:destroyed',

  BLOCK_ADDED: 'block:added',
  BLOCK_REMOVED: 'block:removed',
  BLOCK_MOVED: 'block:moved',
  BLOCK_CONVERTED: 'block:converted',
  BLOCK_CHANGED: 'block:changed',
  BLOCK_FOCUSED: 'block:focused',
  BLOCK_BLURRED: 'block:blurred',
  BLOCK_SELECTED: 'block:selected',

  TOOLBAR_OPENED: 'toolbar:opened',
  TOOLBAR_CLOSED: 'toolbar:closed',

  UNDO_BATCH_START: 'undo:batchStart',
  UNDO_BATCH_END: 'undo:batchEnd',

  INLINE_PLUGIN_INSERT: 'inlinePlugin:insert',

  /** Drag handle was clicked (no drag occurred). Fired by DragManager,
   *  consumed by Toolbar to open its block settings menu. */
  DRAG_HANDLE_CLICKED: 'dragHandle:clicked',
}
