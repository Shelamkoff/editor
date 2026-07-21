/** Reference-counted stylesheet ownership shared by editor and renderer. */
const entries = new Map()

/** @param {string[]} urls */
export function acquireStyleUrls(urls) {
  const head = globalThis.document?.head
  if (!head || typeof head.appendChild !== 'function') {
    return { destroy() {} }
  }

  const tracked = []
  for (const url of new Set(urls)) {
    const existing = entries.get(url)
    if (existing) {
      existing.count++
    } else {
      const link = document.createElement('link')
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
    },
  }
}
