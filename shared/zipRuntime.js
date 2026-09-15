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
 * Load the browser-native local distribution once.
 * @returns {Promise<ZipRuntime>}
 */
export function loadZipRuntime() {
  const current = getZipRuntime()
  if (current) return Promise.resolve(current)
  if (loadPromise) return loadPromise

  loadPromise = import('./runtime/jszip.js')
    .then(() => {
      const loaded = getZipRuntime()
      if (!loaded) throw new Error('JSZip runtime failed to initialize')
      return loaded
    })
    .catch(error => {
      loadPromise = null
      throw error
    })

  return loadPromise
}
