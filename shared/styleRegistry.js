/** Reference-counted stylesheet ownership, isolated per DOM document. */
const entriesByDocument = new WeakMap()

/**
 * Acquire stylesheet URLs for one owning document.
 * @param {string[]} urls
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
  for (const url of new Set(urls)) {
    const existing = entries.get(url)
    if (existing) {
      existing.count++
    } else {
      const link = ownerDocument.createElement('link')
      link.rel = 'stylesheet'
      link.href = url
      link.dataset.oeStyle = ''
      head.appendChild(link)
      entries.set(url, { count: 1, link })
    }
    tracked.push(url)
  }

  let released = false
  return {
    destroy() {
      if (released) return
      released = true
      for (const url of tracked) {
        const entry = entries.get(url)
        if (!entry) continue
        entry.count--
        if (entry.count <= 0) {
          entry.link.remove()
          entries.delete(url)
        }
      }
      if (entries.size === 0) entriesByDocument.delete(ownerDocument)
    },
  }
}
