// @ts-check

/** @typedef {{ highlightAuto(code: string): { value: string, language?: string }, highlight(code: string, options: { language: string, ignoreIllegals?: boolean }): { value: string }, getLanguage(language: string): unknown }} HighlightRuntime */

/** @type {HighlightRuntime | null} */
let runtime = null
/** @type {Promise<HighlightRuntime> | null} */
let loadPromise = null

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
 * @param {HighlightRuntime} value
 */
export function setHighlightRuntime(value) {
  runtime = value
}

/**
 * Load the browser-native local bundle once.
 * @returns {Promise<HighlightRuntime>}
 */
export function loadHighlightRuntime() {
  const current = getHighlightRuntime()
  if (current) return Promise.resolve(current)
  if (loadPromise) return loadPromise

  loadPromise = import('./runtime/highlightBundle.js')
    .then(module => {
      const loaded = /** @type {HighlightRuntime} */ (module.default || module)
      runtime = loaded
      return loaded
    })
    .catch(error => {
      loadPromise = null
      throw error
    })

  return loadPromise
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
