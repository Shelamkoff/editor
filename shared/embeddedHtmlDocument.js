// @ts-check
import { setSanitizedRawHtml } from './sanitize/sanitizeRawHtml.js'
import { sanitizeUrl } from './sanitize/sanitizeUrl.js'
import { rebaseViewportUnits } from './rebaseContentViewport.js'

/** Document behavior for the existing iframe owner, loaded only at its already
 * asynchronous first-document admission. No second lifecycle or authority store.
 * @param {{frame:HTMLIFrameElement,accepted:Document,
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
  /** @type {{sheet:CSSStyleSheet,queries:{rule:CSSMediaRule,query:MediaQueryList}[],projected:CSSStyleSheet|null,text:string|null}[]} */
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
    if (!owns()) return
    if (frame.style.height !== height + 'px') {
      frame.style.height = height + 'px'
      refresh()
    }
  }
  const requestMeasure = () => {
    if (!owns() || measureTimer !== null) return
    measureTimer = parent.setTimeout(() => { measureTimer = null; measure() }, 0)
  }
  // Preserve unchanged native rules (especially FontFace ownership) while
  // viewport-dependent declarations change. Both trees are native CSSOM from
  // the same immutable application source, never application-owned DOM.
  const reconcileRules = (target, next) => {
    const headerKeys = ['conditionText', 'name', 'selectorText', 'keyText', 'start', 'end']
    for (let index = 0; index < next.cssRules.length; index++) {
      if (!owns()) return
      const incoming = next.cssRules[index], previous = target.cssRules[index]
      if (previous?.cssText === incoming.cssText) continue
      if (previous?.type === incoming.type) {
        const media = Reflect.get(previous, 'media'), nextMedia = Reflect.get(incoming, 'media')
        if (media && nextMedia && media.mediaText !== nextMedia.mediaText) media.mediaText = nextMedia.mediaText
        if (!owns()) return
        const matchingHeader = headerKeys.every(key => Reflect.get(previous, key) === Reflect.get(incoming, key))
          && (headerKeys.some(key => Reflect.get(previous, key) !== undefined) || Reflect.has(previous, 'style') || previous.constructor.name === 'CSSStartingStyleRule')
        if (matchingHeader) {
          const style = Reflect.get(previous, 'style'), nextStyle = Reflect.get(incoming, 'style')
          const rules = Reflect.get(previous, 'cssRules'), nextRules = Reflect.get(incoming, 'cssRules')
          if (style && nextStyle && style.cssText !== nextStyle.cssText) style.cssText = nextStyle.cssText
          if (!owns()) return
          const indexed = typeof Reflect.get(previous, 'insertRule') === 'function'
          const matchingKeyframes = rules && nextRules && rules.length === nextRules.length
            && Array.from(/** @type {CSSRuleList} */ (rules)).every((rule, at) => Reflect.get(rule, 'keyText') === Reflect.get(nextRules[at], 'keyText'))
          if (rules && nextRules && (indexed || matchingKeyframes)) { reconcileRules(previous, incoming); continue }
          if (style && nextStyle) continue
        }
      }
      // A changed immutable prelude needs its native parser. Keep unrelated
      // rules intact instead of republishing an entire sheet and its resources.
      if (previous) target.deleteRule(index)
      if (!owns()) return
      target.insertRule(incoming.cssText, index)
    }
    while (owns() && target.cssRules.length > next.cssRules.length) target.deleteRule(target.cssRules.length - 1)
  }
  const refresh = () => {
    if (!owns()) return
    accepted.documentElement.style.setProperty('height', parent.innerHeight + 'px', 'important')
    // The independent percentage reference is geometry, not extra scrollable
    // content. Natural body flow still determines the complete frame height.
    accepted.documentElement.style.setProperty('overflow-y', 'hidden', 'important')
    frame.getBoundingClientRect()
    if (!owns()) return
    if (Math.abs(accepted.defaultView.innerWidth - accepted.defaultView.innerHeight) < 1) {
      frame.style.height = Math.ceil(accepted.defaultView.innerWidth) + 1 + 'px'
      frame.getBoundingClientRect()
    }
    const viewport = { width: parent.innerWidth, height: parent.innerHeight,
      nativeWidth: accepted.defaultView.innerWidth, nativeHeight: accepted.defaultView.innerHeight }
    for (const [element, source] of inlineStyles) {
      if (!owns()) return
      element.style.cssText = rebaseViewportUnits(source, viewport)
    }
    const preparedSheets = []
    for (const entry of styles) {
      const { sheet: source, queries } = entry
      if (!owns()) return
      // Resolve the original condition in the containing page before rebasing
      // declaration lengths. A transformed vi/vb expression belongs to the
      // child geometry and cannot be evaluated as a parent media condition.
      for (const { rule, query } of queries) rule.media.mediaText = query.matches ? 'all' : 'not all'
      const text = rebaseViewportUnits(Array.from(source.cssRules, rule => rule.cssText).join('\n'), viewport)
      if (entry.text !== text) {
        const sheet = new accepted.defaultView.CSSStyleSheet()
        if (!owns()) return
        sheet.replaceSync(text)
        if (!owns()) return
        if (entry.projected) reconcileRules(entry.projected, sheet)
        else entry.projected = sheet
        if (!owns()) return
        entry.text = text
      }
      if (entry.projected) preparedSheets.push(entry.projected)
    }
    if (!owns()) return
    const adopted = accepted.adoptedStyleSheets
    if (adopted.length !== preparedSheets.length || preparedSheets.some((sheet, index) => sheet !== adopted[index])) {
      accepted.adoptedStyleSheets = preparedSheets
    }
    if (owns()) requestMeasure()
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
  if (!owns()) return
  const ownedController = new accepted.defaultView.AbortController()
  if (!owns()) { ownedController.abort(); return }
  controller = ownedController
  for (const source of contentStyles) {
    const sheet = new accepted.defaultView.CSSStyleSheet()
    if (!owns()) return
    sheet.replaceSync(source)
    if (!owns()) return
    const queries = []
    const collect = rules => {
      for (const rule of rules) {
        if (!owns()) return
        if (rule.type === parent.CSSRule.MEDIA_RULE) {
          const query = parent.matchMedia(rule.conditionText)
          if (!owns()) return
          query.addEventListener('change', refresh, { signal: controller.signal })
          queries.push({ rule, query })
        }
        if (rule.cssRules) collect(rule.cssRules)
      }
    }
    collect(sheet.cssRules)
    if (!owns()) return
    styles.push({ sheet, queries, projected: null, text: null })
  }
  if (!owns()) return
  setSanitizedRawHtml(accepted.body, html)
  if (!owns()) return
  for (const element of accepted.querySelectorAll('[autofocus]')) element.removeAttribute('autofocus')
  for (const element of accepted.querySelectorAll('[style]')) inlineStyles.set(/** @type {HTMLElement} */ (element), element.getAttribute('style'))
  accepted.addEventListener('click', activate, { capture: true, signal: controller.signal })
  accepted.addEventListener('auxclick', event => {
    if (event.button === 1 && (!owns() || !event.isTrusted || !parent.navigator.userActivation.isActive)) event.preventDefault()
  }, { capture: true, signal: controller.signal })
  accepted.addEventListener('load', requestMeasure, { capture: true, signal: controller.signal })
  // Observation can retire the owner before returning or failing. Only publish
  // a live acquisition; release a provisional observer even on a falsy throw.
  const observer = new parent.ResizeObserver(requestMeasure)
  if (!owns()) { observer.disconnect(); return }
  try { observer.observe(accepted.body) }
  catch (error) { try { observer.disconnect() } catch {} throw error }
  if (!owns()) { observer.disconnect(); return }
  resizeObserver = observer
  parent.addEventListener('resize', refresh, { signal: controller.signal })
  refresh()
}
