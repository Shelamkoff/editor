import { invokeObserver } from '../shared/invokeObserver.js'

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
    const supplied = { ...thresholds }
    for (const [name, value] of Object.entries(supplied)) {
      if (!['commandMs', 'saveMs', 'renderMs', 'pasteMs'].includes(name)) continue
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new RangeError(`diagnosticThresholds.${name} must be a finite number greater than or equal to 0`)
      }
    }
    this.#thresholds = {
      commandMs: supplied.commandMs ?? Infinity,
      saveMs: supplied.saveMs ?? Infinity,
      renderMs: supplied.renderMs ?? Infinity,
      pasteMs: supplied.pasteMs ?? Infinity,
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
    // A diagnostics event is deliberately content-free. Types alone cannot
    // stop a JavaScript caller accidentally forwarding document/plugin data.
    // Read each permitted field once, without spreading arbitrary payloads.
    // Extensions may pass accessor-backed metadata. Only own data properties
    // are admitted: reading a getter would execute untrusted code inside a
    // transaction (and could throw before the observer is deferred).
    // Inspect the descriptors one key at a time so unrelated properties,
    // including payload accessors, are never evaluated.
    const readField = name => {
      try {
        const descriptor = Object.getOwnPropertyDescriptor(details, name)
        return descriptor && 'value' in descriptor ? descriptor.value : undefined
      } catch {
        // A hostile Proxy must not interrupt editor operations.
        return undefined
      }
    }
    const durationMs = readField('durationMs')
    const operation = readField('operation')
    const pluginType = readField('pluginType')
    const blockType = readField('blockType')
    const errorName = readField('errorName')
    const diagnostic = Object.freeze({
      code,
      timestamp: Date.now(),
      ...(typeof durationMs === 'number' && Number.isFinite(durationMs) ? { durationMs } : {}),
      ...(typeof operation === 'string' ? { operation } : {}),
      ...(typeof pluginType === 'string' ? { pluginType } : {}),
      ...(typeof blockType === 'string' ? { blockType } : {}),
      ...(typeof errorName === 'string' ? { errorName } : {}),
    })
    queueMicrotask(() => invokeObserver(this.#report, [diagnostic]))
  }

  /** @param {unknown} error */
  errorName(error) {
    return error instanceof Error && error.name ? error.name : 'UnknownError'
  }
}
