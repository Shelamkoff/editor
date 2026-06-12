/**
 * Reference-counted CSS stylesheet injector.
 * Shared across all editor instances — each URL's <link> is created once
 * and removed only when the last instance referencing it is destroyed.
 *
 * @type {Map<string, { count: number, link: HTMLLinkElement }>}
 */
const refCounts = new Map()

/**
 * Inject CSS stylesheet URLs via <link> tags with reference counting.
 * @param {string[]} urls
 * @returns {{ destroy(): void }}
 */
export function injectStyleUrls(urls) {
  /** @type {string[]} */
  const tracked = []

  for (const url of urls) {
    const existing = refCounts.get(url)
    if (existing) {
      existing.count++
    } else {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = url
      link.dataset.oePlugin = ''
      document.head.appendChild(link)
      refCounts.set(url, { count: 1, link })
    }
    tracked.push(url)
  }

  return {
    destroy() {
      for (const url of tracked) {
        const entry = refCounts.get(url)
        if (!entry) continue
        entry.count--
        if (entry.count <= 0) {
          entry.link.remove()
          refCounts.delete(url)
        }
      }
    },
  }
}
