/**
 * Content-free, opt-in production diagnostics.
 * Consumer callbacks are isolated and can never break editor execution.
 */
export class Diagnostics {
  /** @type {import('./types').EditorConfig['onDiagnostic']} */ #report
  /** @type {import('./types').DiagnosticThresholds} */ #thresholds

  /**
   * @param {import('./types').EditorConfig['onDiagnostic']} report
   * @param {import('./types').EditorConfig['diagnosticThresholds']} thresholds
   */
  constructor(report, thresholds = {}) {
    this.#report = report
    for (const [name, value] of Object.entries(thresholds)) {
      if (!['commandMs', 'saveMs', 'renderMs', 'pasteMs'].includes(name)) continue
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new RangeError(`diagnosticThresholds.${name} must be a finite number greater than or equal to 0`)
      }
    }
    this.#thresholds = {
      commandMs: thresholds.commandMs ?? Infinity,
      saveMs: thresholds.saveMs ?? Infinity,
      renderMs: thresholds.renderMs ?? Infinity,
      pasteMs: thresholds.pasteMs ?? Infinity,
    }
  }

  get enabled() { return typeof this.#report === 'function' }

  /** @param {keyof import('./types').DiagnosticThresholds} name */
  threshold(name) { return this.#thresholds[name] }

  now() {
    return typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now()
  }

  /**
   * @param {import('./types').EditorDiagnosticCode} code
   * @param {Omit<import('./types').EditorDiagnostic, 'code' | 'timestamp'>} [details]
   */
  emit(code, details = {}) {
    if (!this.#report) return
    const diagnostic = Object.freeze({
      code,
      timestamp: Date.now(),
      ...details,
    })
    try {
      this.#report(diagnostic)
    } catch {
      // Diagnostics are observational and must never affect editor behavior.
    }
  }

  /** @param {unknown} error */
  errorName(error) {
    return error instanceof Error && error.name ? error.name : 'UnknownError'
  }
}
