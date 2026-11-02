// @ts-check
import { setSanitizedRawHtml } from './sanitize/sanitizeRawHtml.js'
import { sanitizeUrl } from './sanitize/sanitizeUrl.js'
import { rebaseViewportUnits } from './rebaseContentViewport.js'

/** Document behavior for the existing iframe owner, loaded only at its already
 * asynchronous first-document admission. No second lifecycle or authority store.
 * @param {{frame:HTMLIFrameElement,container:HTMLElement,accepted:Document,
 * ownerDocument:Document,parent:Window & typeof globalThis,html:string,
 * contentStyles:readonly string[],minimumHeight:number,owns:()=>boolean,
 * registerCleanup:(cleanup:()=>void)=>void}} context
 */
export function initializeEmbeddedDocument(context) {
  const { frame, accepted, ownerDocument, parent, html, contentStyles, minimumHeight, owns, registerCleanup } = context
  /** @type {ResizeObserver | null} */
  let resizeObserver = null
  /** @type {AbortController | null} */
  let controller = null
  /** @type {number | null} */
  let measureTimer = null
  /** @type {{element:HTMLAnchorElement,parent:HTMLElement} | null} */
  let activationLink = null
  /** @type {Map<HTMLElement,string>} */
  const inlineStyles = new Map()
  /** @type {{sheet:CSSStyleSheet,queries:{rule:CSSMediaRule,query:MediaQueryList}[]}[]} */
  let styles = []
  const cleanup = () => {
    let failed = false, failure
    const attempt = operation => {
      try { operation() } catch (error) { if (!failed) { failed = true; failure = error } }
    }
    const pending = activationLink
    activationLink = null
    if (pending && pending.element.parentNode === pending.parent && pending.element.ownerDocument === ownerDocument) {
      // A passive application observer can retire this view during dispatch.
      // Revoke the anchor before the browser's still-pending default action;
      // preventDefault alone cannot do this inside a passive observer.
      attempt(() => pending.element.removeAttribute('href'))
      attempt(() => pending.element.remove())
    }
    attempt(() => resizeObserver?.disconnect())
    attempt(() => controller?.abort())
    if (measureTimer !== null) attempt(() => parent?.clearTimeout(measureTimer))
    attempt(() => parent?.removeEventListener('resize', refresh))
    inlineStyles.clear()
    styles = []
    if (failed) throw failure
  }
  const measure = () => {
    if (!owns() || !accepted?.body) return
    const body = accepted.body, rect = body.getBoundingClientRect()
    const style = accepted.defaultView.getComputedStyle(body)
    const bottom = style.overflowY === 'visible' ? Math.max(body.scrollHeight + rect.top, rect.bottom) : rect.bottom
    let height = Math.max(minimumHeight, Math.ceil(bottom + (parseFloat(style.marginBottom) || 0)))
    const width = accepted.defaultView.innerWidth
    // Distinct native axes let vi/vb retain per-consumer CSS resolution. A
    // square natural result gets one un-clipped CSS pixel of additional flow.
    if (Math.abs(width - height) < 1) height = Math.ceil(width) + 1
    if (frame.style.height !== height + 'px') {
      frame.style.height = height + 'px'
      refresh()
    }
  }
  const requestMeasure = () => {
    if (!owns() || measureTimer !== null) return
    measureTimer = parent.setTimeout(() => { measureTimer = null; measure() }, 0)
  }
  const refresh = () => {
    if (!owns()) return
    accepted.documentElement.style.setProperty('height', parent.innerHeight + 'px', 'important')
    // The independent percentage reference is geometry, not extra scrollable
    // content. Natural body flow still determines the complete frame height.
    accepted.documentElement.style.setProperty('overflow-y', 'hidden', 'important')
    frame.getBoundingClientRect()
    if (Math.abs(accepted.defaultView.innerWidth - accepted.defaultView.innerHeight) < 1) {
      frame.style.height = Math.ceil(accepted.defaultView.innerWidth) + 1 + 'px'
      frame.getBoundingClientRect()
    }
    const viewport = { width: parent.innerWidth, height: parent.innerHeight,
      nativeWidth: accepted.defaultView.innerWidth, nativeHeight: accepted.defaultView.innerHeight }
    for (const [element, source] of inlineStyles) element.style.cssText = rebaseViewportUnits(source, viewport)
    accepted.adoptedStyleSheets = styles.map(({ sheet: source, queries }) => {
      // Resolve the original condition in the containing page before rebasing
      // declaration lengths. A transformed vi/vb expression belongs to the
      // child geometry and cannot be evaluated as a parent media condition.
      for (const { rule, query } of queries) rule.media.mediaText = query.matches ? 'all' : 'not all'
      const sheet = new accepted.defaultView.CSSStyleSheet()
      sheet.replaceSync(rebaseViewportUnits(Array.from(source.cssRules, rule => rule.cssText).join('\n'), viewport))
      return sheet
    })
    requestMeasure()
  }
  /** @param {MouseEvent} event */
  const activate = event => {
    const link = /** @type {Element} */ (event.target)?.closest?.('a[href],area[href]')
    if (!link) return
    event.preventDefault()
    if (!owns() || !event.isTrusted || !parent.navigator.userActivation.isActive) return
    const raw = link.getAttribute('href') ?? '', download = link.hasAttribute('download')
    const href = sanitizeUrl(raw, { policy: download ? 'download' : 'link', fallback: '' })
    if (!href) return
    const target = link.getAttribute('target') || '_self'
    if (raw.startsWith('#') && !download && target.toLowerCase() === '_self'
      && !event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey) {
      let id
      try { id = decodeURIComponent(raw.slice(1)) } catch { id = raw.slice(1) }
      accepted.defaultView.location.hash = raw
      const element = accepted.getElementById(id) ?? (id ? null : accepted.documentElement)
      element?.scrollIntoView()
      return
    }
    const delegated = ownerDocument.createElement('a')
    delegated.href = new URL(href, ownerDocument.baseURI).href
    delegated.target = target; delegated.rel = 'noopener noreferrer'
    if (download) delegated.download = link.getAttribute('download') || ''
    if (!owns()) return
    const parentBody = ownerDocument.body
    activationLink = { element: delegated, parent: parentBody }
    try {
      parentBody.append(delegated)
      if (!owns()) return
      delegated.dispatchEvent(new parent.MouseEvent(event.type, { bubbles: true, cancelable: true,
        view: parent, button: event.button, buttons: event.buttons, detail: event.detail,
        ctrlKey: event.ctrlKey, shiftKey: event.shiftKey, altKey: event.altKey, metaKey: event.metaKey }))
    } finally {
      if (activationLink?.element === delegated) activationLink = null
      if (delegated.parentNode === parentBody && delegated.ownerDocument === ownerDocument) delegated.remove()
    }
  }

  // Register before the first acquisition so partial setup retires through
  // the same owner and preserves independent cleanup after a platform failure.
  registerCleanup(cleanup)
  controller = new accepted.defaultView.AbortController()
  styles = contentStyles.map(source => {
    const sheet = new accepted.defaultView.CSSStyleSheet()
    sheet.replaceSync(source)
    const queries = []
    const collect = rules => {
      for (const rule of rules) {
        if (rule.type === parent.CSSRule.MEDIA_RULE) {
          const query = parent.matchMedia(rule.conditionText)
          query.addEventListener('change', refresh, { signal: controller.signal })
          queries.push({ rule, query })
        }
        if (rule.cssRules) collect(rule.cssRules)
      }
    }
    collect(sheet.cssRules)
    return { sheet, queries }
  })
  setSanitizedRawHtml(accepted.body, html)
  for (const element of accepted.querySelectorAll('[autofocus]')) element.removeAttribute('autofocus')
  for (const element of accepted.querySelectorAll('[style]')) inlineStyles.set(/** @type {HTMLElement} */ (element), element.getAttribute('style'))
  accepted.addEventListener('click', activate, { capture: true, signal: controller.signal })
  accepted.addEventListener('auxclick', event => {
    if (event.button === 1 && (!owns() || !event.isTrusted || !parent.navigator.userActivation.isActive)) event.preventDefault()
  }, { capture: true, signal: controller.signal })
  accepted.addEventListener('load', requestMeasure, { capture: true, signal: controller.signal })
  resizeObserver = new parent.ResizeObserver(requestMeasure); resizeObserver.observe(accepted.body)
  parent.addEventListener('resize', refresh)
  refresh()
}
