// @ts-check

/** @typedef {{ highlightAuto(code: string): { value: string, language?: string }, highlight(code: string, options: { language: string, ignoreIllegals?: boolean }): { value: string }, getLanguage(language: string): unknown }} HighlightRuntime */

/** @type {HighlightRuntime | null} */
let runtime = null
/** @type {Promise<HighlightRuntime> | null} */
let loadPromise = null
// A stale lazy import must not supersede a later user-selected runtime.
let selectionRevision = 0

/**
 * @returns {HighlightRuntime | null}
 */
export function getHighlightRuntime() {
  if (!runtime && typeof globalThis !== 'undefined') {
    const globalRuntime = /** @type {{ hljs?: HighlightRuntime }} */ (globalThis).hljs
    if (globalRuntime) runtime = globalRuntime
  }
  return runtime
}

/**
 * Preserve dependency injection for consumers that provide their own build.
 * @param {HighlightRuntime | null} value
 */
export function setHighlightRuntime(value) {
  runtime = value
  selectionRevision++
  // Retire the old pending/resolved import lease. Previous awaiters retain
  // their promise, but later calls must follow the newest runtime decision.
  loadPromise = null
}

/**
 * Lazily load highlight.js from the declared package dependency once.
 * @returns {Promise<HighlightRuntime>}
 */
export function loadHighlightRuntime() {
  const current = getHighlightRuntime()
  if (current) return Promise.resolve(current)
  if (loadPromise) return loadPromise

  const revision = selectionRevision
  const pending = import('highlight.js')
    .then(module => {
      const loaded = /** @type {HighlightRuntime} */ (module.default || module)
      // Both explicit injection and a newly discovered ambient provider own
      // newer highlighting authority than this earlier import request.
      const selected = getHighlightRuntime()
      if (revision !== selectionRevision || selected) return selected ?? loaded
      runtime = loaded
      return loaded
    })
    .catch(error => {
      // An abandoned import must not fail a consumer that has since chosen a
      // valid alternate highlighter. Real active import failures still reject.
      const selected = getHighlightRuntime()
      if (revision !== selectionRevision && selected) return selected
      throw error
    })
    .finally(() => {
      if (loadPromise === pending) loadPromise = null
    })
  loadPromise = pending
  return pending
}

/**
 * Highlight synchronously when the runtime has already loaded.
 * @param {string} code
 * @param {string} [language]
 * @returns {{ value: string, language: string } | null}
 */
export function highlightCode(code, language) {
  const hljs = getHighlightRuntime()
  if (!hljs) return null

  try {
    if (language && language !== 'auto' && hljs.getLanguage(language)) {
      const result = hljs.highlight(code, { language, ignoreIllegals: true })
      return { value: result.value, language }
    }

    const result = hljs.highlightAuto(code)
    return { value: result.value, language: result.language || 'plaintext' }
  } catch {
    return null
  }
}

export const HIGHLIGHT_RUNTIME_VERSION = '11.11.1'
