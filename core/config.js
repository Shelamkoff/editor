/**
 * Default behavioral tuning for the editor.
 *
 * Pass overrides through the `tuning` property of `createEditor()`.
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
 * Validate a numeric tuning value.
 * @param {number} value Candidate value.
 * @param {string} path Property path used in validation error messages.
 * @param {{ integer?: boolean, min?: number }} [rules] Numeric constraints.
 * @returns {void}
 */
function validateNumber(value, path, rules = {}) {
  const min = rules.min ?? 0
  if (
    typeof value !== 'number'
    || !Number.isFinite(value)
    || value < min
    || (rules.integer && !Number.isInteger(value))
  ) {
    const kind = rules.integer ? 'an integer' : 'a finite number'
    throw new RangeError(`${path} must be ${kind} greater than or equal to ${min}`)
  }
}

/**
 * @param {unknown} value
 * @param {string} path
 * @returns {Record<string, unknown>}
 */
function validateGroup(value, path) {
  if (Object.prototype.toString.call(value) !== '[object Object]') {
    throw new TypeError(`${path} must be an object`)
  }
  return /** @type {Record<string, unknown>} */ (value)
}


/**
 * Validate public createEditor() option shapes that JavaScript callers do not
 * get from the TypeScript declarations. Deeper value validation stays with the
 * subsystem that owns it (tuning, diagnostics, document schema, plugins).
 * @param {import('./types').EditorConfig} config
 * @returns {void}
 */
export function validateEditorConfigOptions(config) {
  for (const field of ['inlineTools', 'inlinePlugins', 'migrations']) {
    const value = config[field]
    if (value !== undefined && !Array.isArray(value)) {
      throw new TypeError(`createEditor() ${field} must be an array`)
    }
  }

  if (config.autofocus !== undefined && typeof config.autofocus !== 'boolean') {
    throw new TypeError('createEditor() autofocus must be a boolean')
  }

  if (
    config.defaultBlock !== undefined
    && (typeof config.defaultBlock !== 'string' || config.defaultBlock.length === 0)
  ) {
    throw new TypeError('createEditor() defaultBlock must be a non-empty string')
  }

  if (
    config.locale !== undefined
    && (config.locale === null || typeof config.locale !== 'object' || Array.isArray(config.locale))
  ) {
    throw new TypeError('createEditor() locale must be an object')
  }

  for (const field of ['onChange', 'onReady', 'onValidationError', 'onDiagnostic']) {
    const value = config[field]
    if (value !== undefined && typeof value !== 'function') {
      throw new TypeError(`createEditor() ${field} must be a function`)
    }
  }

  if (
    config.diagnosticThresholds !== undefined
    && (
      config.diagnosticThresholds === null
      || typeof config.diagnosticThresholds !== 'object'
      || Array.isArray(config.diagnosticThresholds)
    )
  ) {
    throw new TypeError('createEditor() diagnosticThresholds must be an object')
  }

  if (
    config.theme !== undefined
    && (typeof config.theme !== 'string' || config.theme.length === 0)
  ) {
    throw new TypeError('createEditor() theme must be a non-empty string')
  }
}

/**
 * Merge user-supplied tuning overrides onto defaults.
 * Shallow per-group (one level deep) — each group is an object with primitive leaves.
 *
 * @param {import('./types').EditorConfig['tuning']} [overrides]
 * @returns {EditorTuning}
 */
export function resolveTuning(overrides) {
  const supplied = /** @type {Partial<EditorTuning>} */ (
    overrides === undefined ? {} : validateGroup(overrides, 'tuning')
  )
  const drag = supplied.drag === undefined ? {} : validateGroup(supplied.drag, 'tuning.drag')
  const undo = supplied.undo === undefined ? {} : validateGroup(supplied.undo, 'tuning.undo')
  const change = supplied.change === undefined ? {} : validateGroup(supplied.change, 'tuning.change')
  const toolbar = supplied.toolbar === undefined ? {} : validateGroup(supplied.toolbar, 'tuning.toolbar')
  const animations = supplied.animations === undefined ? {} : validateGroup(supplied.animations, 'tuning.animations')
  const resolved = {
    drag: { ...DEFAULT_TUNING.drag, ...drag },
    undo: { ...DEFAULT_TUNING.undo, ...undo },
    change: { ...DEFAULT_TUNING.change, ...change },
    toolbar: { ...DEFAULT_TUNING.toolbar, ...toolbar },
    animations: { ...DEFAULT_TUNING.animations, ...animations },
    mobileBreakpoint: supplied.mobileBreakpoint ?? DEFAULT_TUNING.mobileBreakpoint,
  }

  validateNumber(resolved.drag.threshold, 'tuning.drag.threshold')
  validateNumber(resolved.undo.maxStack, 'tuning.undo.maxStack', { integer: true, min: 1 })
  validateNumber(resolved.undo.debounceMs, 'tuning.undo.debounceMs')
  validateNumber(resolved.change.debounceMs, 'tuning.change.debounceMs')
  validateNumber(resolved.toolbar.filterThreshold, 'tuning.toolbar.filterThreshold', { integer: true })
  validateNumber(resolved.animations.blockInsertMs, 'tuning.animations.blockInsertMs')
  validateNumber(resolved.animations.blockMoveMs, 'tuning.animations.blockMoveMs')
  validateNumber(resolved.animations.blockRemoveMs, 'tuning.animations.blockRemoveMs')
  validateNumber(resolved.mobileBreakpoint, 'tuning.mobileBreakpoint')
  return resolved
}
