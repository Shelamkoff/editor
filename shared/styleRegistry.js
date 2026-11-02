import { compileContentClassSheets } from './contentClassStyles.js'

/** Reference-counted stylesheet ownership, isolated per DOM document. */
const entriesByDocument = new WeakMap()
const acquiringByDocument = new WeakSet()

/** Acquire explicit content CSS through the same document resource ledger.
 * @param {readonly string[]} sources
 * @param {Document} ownerDocument
 * @param {{id:string}} scope Private identity shared by this instance's leases.
 */
export function acquireContentStyles(sources, ownerDocument, scope) {
  // An inert document has no active presentation. A real target Document uses
  // renderTo()/injectStyles() in that document, never an ambient Window.
  if (!sources.length || !ownerDocument.defaultView) return { destroy() {} }
  if (acquiringByDocument.has(ownerDocument)) throw new Error('Cannot reenter stylesheet acquisition')
  let entries = entriesByDocument.get(ownerDocument)
  if (!entries) { entries = new Map(); entriesByDocument.set(ownerDocument, entries) }
  let entry = entries.get(scope)
  if (entry) entry.count++
  else {
    acquiringByDocument.add(ownerDocument)
    try {
      const sheets = compileContentClassSheets(sources, ownerDocument, scope)
      entry = { count: 1, sheets }
      entries.set(scope, entry)
      try { ownerDocument.adoptedStyleSheets.push(...sheets) }
      catch (error) {
        if (entries.get(scope) === entry) entries.delete(scope)
        for (const sheet of sheets) {
          try { sheet.disabled = true } catch {}
          try {
            const index = ownerDocument.adoptedStyleSheets.indexOf(sheet)
            if (index !== -1) ownerDocument.adoptedStyleSheets.splice(index, 1)
          } catch {}
        }
        throw error
      }
    } finally {
      acquiringByDocument.delete(ownerDocument)
      if (!entries.size && entriesByDocument.get(ownerDocument) === entries) entriesByDocument.delete(ownerDocument)
    }
  }
  let released = false
  return { destroy() {
    if (released) return
    released = true
    if (entries.get(scope) !== entry || --entry.count > 0) return
    entries.delete(scope)
    // No old lease can remove a successor's sheets or overwrite an app-owned
    // adoptedStyleSheets array. Continue independent cleanup after host failure.
    for (const sheet of entry.sheets) {
      try { sheet.disabled = true } catch {}
      try {
        const index = ownerDocument.adoptedStyleSheets.indexOf(sheet)
        if (index !== -1) ownerDocument.adoptedStyleSheets.splice(index, 1)
      } catch {}
    }
    if (!entries.size && !acquiringByDocument.has(ownerDocument) && entriesByDocument.get(ownerDocument) === entries) entriesByDocument.delete(ownerDocument)
  } }
}

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
        try {
          if (!entry.link.parentNode || entry.link.parentNode === head) entry.link.remove()
        } catch {}
      }
    }
    // Another owner may be halfway through acquiring a link using this
    // same ledger. DOM creation/append callbacks can synchronously release
    // the final old lease; deleting the ledger now would orphan the pending
    // new link and allow a duplicate stylesheet on the next acquisition.
    if (entries.size === 0 && !acquiringByDocument.has(ownerDocument)
      && entriesByDocument.get(ownerDocument) === entries) {
      entriesByDocument.delete(ownerDocument)
    }
  }

  if (acquiringByDocument.has(ownerDocument)) {
    throw new Error('Cannot reenter stylesheet acquisition')
  }
  acquiringByDocument.add(ownerDocument)
  try {
    // Snapshot all URL inputs before the first createElement/appendChild.
    // Those DOM callbacks can synchronously mutate a caller-owned array.
    // This helper may be called directly, without ExtensionRegistry's
    // snapshot, and must not consult an overridden Array iterator.
    const seen = new Set()
    const selectedUrls = []
    const length = urls.length
    for (let index = 0; index < length; index++) {
      if (!Object.hasOwn(urls, index)) {
        throw new TypeError('Stylesheet URLs must be a dense array')
      }
      const url = urls[index]
      if (typeof url !== 'string') throw new TypeError('Stylesheet URL must be a string')
      if (seen.has(url)) continue
      seen.add(url)
      selectedUrls.push(url)
    }
    for (const url of selectedUrls) {
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
          try {
            if (!link.parentNode || link.parentNode === head) link.remove()
          } catch {}
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
    // Rollback of a failed acquisition can leave an empty ledger deliberately
    // retained during the mutation. Prune it after the acquisition gate ends.
    if (entries.size === 0 && entriesByDocument.get(ownerDocument) === entries) {
      entriesByDocument.delete(ownerDocument)
    }
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
