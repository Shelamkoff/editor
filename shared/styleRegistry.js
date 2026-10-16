/** Reference-counted stylesheet ownership, isolated per DOM document. */
const entriesByDocument = new WeakMap()
const acquiringByDocument = new WeakSet()

/**
 * Acquire stylesheet URLs for one owning document.
 * @param {readonly string[]} urls
 * @param {Document | undefined | null} [ownerDocument]
 */
export function acquireStyleUrls(urls, ownerDocument = globalThis.document) {
  const head = ownerDocument?.head
  if (!ownerDocument || !head || typeof head.appendChild !== 'function') {
    return { destroy() {} }
  }

  let entries = entriesByDocument.get(ownerDocument)
  if (!entries) {
    entries = new Map()
    entriesByDocument.set(ownerDocument, entries)
  }

  const tracked = []
  const release = () => {
    for (const url of tracked) {
      const entry = entries.get(url)
      if (!entry) continue
      entry.count--
      if (entry.count <= 0) {
        entries.delete(url)
        // Continue releasing remaining ownership even if a DOM adapter
        // rejects removal; partial acquisition must never retain counts.
        try { entry.link.remove() } catch {}
      }
    }
    if (entries.size === 0) entriesByDocument.delete(ownerDocument)
  }

  if (acquiringByDocument.has(ownerDocument)) {
    throw new Error('Cannot reenter stylesheet acquisition')
  }
  acquiringByDocument.add(ownerDocument)
  try {
    for (const url of new Set(urls)) {
      const existing = entries.get(url)
      if (existing) {
        existing.count++
      } else {
        const link = ownerDocument.createElement('link')
        link.rel = 'stylesheet'
        link.href = url
        link.dataset.oeStyle = ''
        try {
          head.appendChild(link)
        } catch (error) {
          // Some DOM adapters append before reporting failure.
          try { link.remove() } catch {}
          throw error
        }
        entries.set(url, { count: 1, link })
      }
      tracked.push(url)
    }
  } catch (error) {
    release()
    throw error
  } finally {
    acquiringByDocument.delete(ownerDocument)
  }

  let released = false
  return {
    destroy() {
      if (released) return
      released = true
      release()
    },
  }
}
