// @ts-check

/**
 * @typedef {new () => {
 *   file(name: string, content: Uint8Array): unknown,
 *   generateAsync(options: { type: 'uint8array' }): Promise<Uint8Array>
 * }} ZipRuntime
 */

/** @type {ZipRuntime | null} */
let runtime = null
/** @type {Promise<ZipRuntime> | null} */
let loadPromise = null

/**
 * @returns {ZipRuntime | null}
 */
export function getZipRuntime() {
  if (!runtime && typeof globalThis !== 'undefined') {
    const globalRuntime = /** @type {{ JSZip?: ZipRuntime }} */ (globalThis).JSZip
    if (globalRuntime) runtime = globalRuntime
  }
  return runtime
}

/**
 * @param {ZipRuntime} value
 */
export function setZipRuntime(value) {
  runtime = value
}

/**
 * Lazily load JSZip from the declared package dependency once.
 * @returns {Promise<ZipRuntime>}
 */
export function loadZipRuntime() {
  const current = getZipRuntime()
  if (current) return Promise.resolve(current)
  if (loadPromise) return loadPromise

  loadPromise = import('jszip')
    .then(module => {
      const loaded = /** @type {ZipRuntime} */ (module.default || module)
      runtime = loaded
      return loaded
    })
    .catch(error => {
      loadPromise = null
      throw error
    })

  return loadPromise
}
