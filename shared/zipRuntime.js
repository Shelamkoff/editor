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
// A later explicit provider or reset revokes ownership of an earlier import.
let selectionRevision = 0

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
 * @param {ZipRuntime | null} value
 */
export function setZipRuntime(value) {
  runtime = value
  selectionRevision++
  // A later load must follow this selection, not reuse a retired Promise.
  loadPromise = null
}

/**
 * Lazily load JSZip from the declared package dependency once.
 * @returns {Promise<ZipRuntime>}
 */
export function loadZipRuntime() {
  const current = getZipRuntime()
  if (current) return Promise.resolve(current)
  if (loadPromise) return loadPromise

  const revision = selectionRevision
  const pending = import('jszip')
    .then(module => {
      const loaded = /** @type {ZipRuntime} */ (module.default || module)
      // The explicit or ambient runtime selected after this import began
      // has priority. Keep the previous awaiter usable without publishing
      // an obsolete provider into the active registry.
      const selected = getZipRuntime()
      if (revision !== selectionRevision || selected) return selected ?? loaded
      runtime = loaded
      return loaded
    })
    .catch(error => {
      // If an older lazy request fails after a replacement was installed,
      // consumers can still use the newer provider.
      const selected = getZipRuntime()
      if (revision !== selectionRevision && selected) return selected
      throw error
    })
    .finally(() => {
      if (loadPromise === pending) loadPromise = null
    })
  loadPromise = pending
  return pending
}
