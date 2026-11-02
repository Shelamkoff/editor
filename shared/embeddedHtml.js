// @ts-check
import { toTrustedHtml } from './sanitize/trustedHtml.js'

const EMPTY_DOCUMENT = '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>'

/** One instance/output-owned HTML projection. Author HTML and styles are inputs,
 * never a source of sandbox flags or navigation authority.
 * @param {HTMLElement} container
 * @param {string} html
 * @param {{contentStyles?:readonly string[],title?:string,signal?:AbortSignal,minimumHeight?:number}} [options]
 */
export function mountEmbeddedHtml(container, html, options = {}) {
  let ownerDocument = container.ownerDocument
  let parent = ownerDocument.defaultView
  const frame = ownerDocument.createElement('iframe')
  frame.setAttribute('sandbox', 'allow-same-origin')
  frame.title = options.title ?? 'HTML content'
  const minimumHeight = options.minimumHeight ?? 0
  frame.style.cssText = `display:block;width:100%;height:100px;min-height:${minimumHeight}px;border:0`
  const contentStyles = options.contentStyles ?? []
  const signal = options.signal
  let live = true
  /** @type {Document | null} */
  let accepted = null
  /** @type {MutationObserver | null} */
  let ownershipObserver = null
  /** @type {(() => void) | null} */
  let documentCleanup = null
  /** @type {(value:boolean)=>void} */
  let settleReady
  const ready = new Promise(resolve => { settleReady = resolve })

  const sameContainer = () => frame.parentNode === container
    && frame.ownerDocument === ownerDocument && container.ownerDocument === ownerDocument
  const owns = () => live && sameContainer() && frame.isConnected
    && accepted !== null && frame.contentDocument === accepted

  const destroy = () => {
    if (!live) return
    live = false
    let failed = false, failure
    const attempt = operation => {
      try { operation() } catch (error) { if (!failed) { failed = true; failure = error } }
    }
    attempt(() => documentCleanup?.())
    documentCleanup = null
    attempt(() => ownershipObserver?.disconnect())
    ownershipObserver = null
    attempt(() => frame.removeEventListener('load', initialize))
    attempt(() => signal?.removeEventListener('abort', automaticDestroy))
    accepted = null
    if (sameContainer()) attempt(() => frame.remove())
    settleReady(false)
    if (failed) throw failure
  }
  // Explicit disposal reports its first failure to the existing caller. An
  // automatic abort/load/ownership callback has no synchronous caller: report
  // the failed frame locally after all independent resources have retired.
  const notifyFailure = () => { if (parent) frame.dispatchEvent(new parent.Event('error')) }
  const automaticDestroy = () => { try { destroy() } catch { notifyFailure() } }

  function initialize() {
    if (accepted) { automaticDestroy(); return }
    if (!live || !frame.isConnected || frame.parentNode !== container || !frame.contentDocument) return
    if (!frame.hasAttribute('srcdoc') || frame.srcdoc !== EMPTY_DOCUMENT || frame.contentDocument.URL !== 'about:srcdoc') {
      automaticDestroy(); return
    }
    // Detached output can be adopted before admission. Bind before awaiting
    // code so a later load or move cannot acquire the replacement document.
    ownerDocument = container.ownerDocument
    parent = ownerDocument.defaultView
    if (!parent || !sameContainer()) { automaticDestroy(); return }
    accepted = frame.contentDocument
    /** @type {MutationObserver | null} */
    let observer = null
    try {
      // Keep a returned resource provisional across reentrant platform calls.
      // A retired owner cannot accept a constructor/observe result afterward.
      observer = new parent.MutationObserver(records => {
        if (!sameContainer() || records.some(record => Array.from(record.removedNodes).includes(frame))) automaticDestroy()
      })
      if (!owns()) { observer.disconnect(); automaticDestroy(); return }
      observer.observe(container, { childList: true })
      if (!owns()) { observer.disconnect(); automaticDestroy(); return }
      ownershipObserver = observer
    } catch {
      try { observer?.disconnect() } catch { /* Preserve the initialization failure. */ }
      if (!live) return
      try { destroy() } catch { /* Preserve the initialization failure. */ }
      notifyFailure()
      return
    }
    void import('./embeddedHtmlDocument.js').then(({ initializeEmbeddedDocument }) => {
      if (!owns()) { automaticDestroy(); return }
      initializeEmbeddedDocument({ frame, accepted, ownerDocument, parent,
        html, contentStyles, minimumHeight, owns,
        registerCleanup: cleanup => { documentCleanup = cleanup } })
      if (owns()) settleReady(true)
      else automaticDestroy()
    }).catch(() => {
      if (!live) return
      if (!owns()) { automaticDestroy(); return }
      try { destroy() } catch { /* The initialization failure owns this notification. */ }
      notifyFailure()
    })
  }
  frame.addEventListener('load', initialize)
  if (!signal?.aborted) {
    signal?.addEventListener('abort', automaticDestroy, { once: true })
    try {
      frame.srcdoc = /** @type {any} */ (toTrustedHtml(EMPTY_DOCUMENT, ownerDocument))
      container.append(frame)
    } catch (error) { try { destroy() } catch { /* Preserve the initiating failure. */ } throw error }
  } else destroy()
  return { element: frame, ready, destroy }
}
