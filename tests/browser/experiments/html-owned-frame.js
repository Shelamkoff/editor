// Decision-only implementation. No production surface imports this file.
import DOMPurify from 'dompurify'
import { setSanitizedRawHtml } from '../../../shared/sanitize/sanitizeRawHtml.js'
import { sanitizeUrl } from '../../../shared/sanitize/sanitizeUrl.js'
import { toTrustedHtml } from '../../../shared/sanitize/trustedHtml.js'
import { rebaseViewportUnits } from './html-viewport-units.js'

export function mountHtmlExperiment(container, html, contentStyles = []) {
  const ownerDocument = container.ownerDocument, parent = ownerDocument.defaultView
  const frame = ownerDocument.createElement('iframe')
  frame.sandbox = 'allow-same-origin'
  frame.title = 'Decision experiment: isolated article content'
  frame.style.cssText = 'display:block;width:100%;height:100px;border:0'
  let live = true, accepted = null, observer = null, ownershipObserver = null, controller = null, measureTimer = null, settleReady, rejectReady
  const ready = new Promise((resolve, reject) => { settleReady = resolve; rejectReady = reject })
  const commands = [], measurements = []
  const owns = () => live && frame.parentNode === container && frame.isConnected
    && accepted && frame.contentDocument === accepted
  const dispose = () => {
    if (!live) return
    live = false
    observer?.disconnect(); ownershipObserver?.disconnect(); controller?.abort()
    if (measureTimer !== null) parent.clearTimeout(measureTimer)
    parent.removeEventListener('resize', refresh)
    if (frame.parentNode === container) frame.remove()
    settleReady(false)
  }
  const measure = () => {
    if (!owns() || !accepted.body) return
    const body = accepted.body, rect = body.getBoundingClientRect()
    const style = accepted.defaultView.getComputedStyle(body)
    const height = Math.ceil(Math.max(body.scrollHeight + rect.top, rect.bottom) + (parseFloat(style.marginBottom) || 0))
    if (frame.style.height !== height + 'px') {
      measurements.push(height)
      frame.style.height = height + 'px'
    }
  }
  const sources = new Map()
  const requestMeasure = () => {
    if (!owns() || measureTimer !== null) return
    // Queue viewport writes outside rendering/observer delivery callbacks.
    measureTimer = parent.setTimeout(() => { measureTimer = null; measure() }, 0)
  }
  const refresh = () => {
    if (!owns()) return
    // A top-level document's root percentage heights resolve against its page
    // viewport. Keep that reference independent of the auto-sized outer frame.
    accepted.documentElement.style.setProperty('height', parent.innerHeight + 'px', 'important')
    const viewport = { width: parent.innerWidth, height: parent.innerHeight,
      nativeWidth: accepted.defaultView.innerWidth, nativeHeight: accepted.defaultView.innerHeight }
    for (const [element, source] of sources) element.style.cssText = rebaseViewportUnits(source, viewport)
    const media = cssRules => {
      for (const rule of cssRules) {
        if (rule.type === parent.CSSRule.MEDIA_RULE) {
          rule.media.mediaText = parent.matchMedia(rule.conditionText).matches ? 'all' : 'not all'
        }
        if (rule.cssRules) media(rule.cssRules)
      }
    }
    accepted.adoptedStyleSheets = contentStyles.map(source => {
      const sheet = new accepted.defaultView.CSSStyleSheet()
      sheet.replaceSync(rebaseViewportUnits(source, viewport))
      media(sheet.cssRules)
      return sheet
    })
    requestMeasure()
  }
  const activate = event => {
    const link = event.target.closest?.('a[href],area[href]')
    if (!link) return
    event.preventDefault()
    if (!owns() || !event.isTrusted || !parent.navigator.userActivation.isActive) return
    const raw = link.getAttribute('href') ?? '', download = link.hasAttribute('download')
    const href = sanitizeUrl(raw, { policy: download ? 'download' : 'link', fallback: '' })
    if (!href) return
    const requestedTarget = link.getAttribute('target') || '_self'
    if (raw.startsWith('#') && !download && requestedTarget.toLowerCase() === '_self'
      && !event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey) {
      let id
      try { id = decodeURIComponent(raw.slice(1)) } catch { id = raw.slice(1) }
      accepted.defaultView.location.hash = raw
      const target = accepted.getElementById(id) ?? (id ? null : accepted.documentElement)
      target?.scrollIntoView()
      commands.push({ kind: 'fragment', id })
      return
    }
    const delegated = ownerDocument.createElement('a')
    delegated.href = new URL(href, ownerDocument.baseURI).href
    delegated.target = requestedTarget
    delegated.rel = 'noopener noreferrer'
    if (download) delegated.download = link.getAttribute('download') || ''
    commands.push({ kind: download ? 'download' : 'navigation', href: delegated.href, target: delegated.target })
    ownerDocument.body.append(delegated)
    try {
      delegated.dispatchEvent(new parent.MouseEvent(event.type, { bubbles: true, cancelable: true,
        view: parent, button: event.button, buttons: event.buttons, detail: event.detail,
        ctrlKey: event.ctrlKey, shiftKey: event.shiftKey, altKey: event.altKey, metaKey: event.metaKey }))
    } finally { delegated.remove() }
  }
  const initialize = () => {
    if (accepted) { dispose(); return }
    if (!live || !frame.isConnected || frame.parentNode !== container || !frame.contentDocument) return
    accepted = frame.contentDocument
    controller = new accepted.defaultView.AbortController()
    // Research-only target preservation around the existing Raw sanitizer.
    // Production must settle and implement its own single target boundary.
    const fragment = DOMPurify.sanitize(html, { RETURN_DOM_FRAGMENT: true, ADD_ATTR: ['target'], ADD_URI_SAFE_ATTR: ['href', 'src', 'poster'] })
    const targets = new Map()
    let sequence = 0
    for (const element of fragment.querySelectorAll('[data-rector-probe-target]')) element.removeAttribute('data-rector-probe-target')
    for (const link of fragment.querySelectorAll('a,area')) {
      const id = String(++sequence)
      targets.set(id, link.getAttribute('target'))
      link.setAttribute('data-rector-probe-target', id)
    }
    const template = ownerDocument.createElement('div'); template.append(fragment)
    const clean = ownerDocument.createElement('div')
    setSanitizedRawHtml(clean, template.innerHTML)
    for (const link of clean.querySelectorAll('[data-rector-probe-target]')) {
      const target = targets.get(link.getAttribute('data-rector-probe-target'))
      if (target !== null && target !== undefined) link.setAttribute('target', target)
      link.removeAttribute('data-rector-probe-target')
      link.setAttribute('rel', 'noopener noreferrer')
    }
    for (const element of clean.querySelectorAll('[autofocus]')) element.removeAttribute('autofocus')
    accepted.body.replaceChildren(...clean.childNodes)
    for (const element of accepted.querySelectorAll('[style]')) sources.set(element, element.getAttribute('style'))
    accepted.addEventListener('click', activate, { capture: true, signal: controller.signal })
    // Middle-click is a browser-owned auxiliary action. Synthesizing auxclick
    // on a parent link has no native default in Chrome; retain the original
    // sandboxed link's real action, with the same lifetime/trust admission.
    accepted.addEventListener('auxclick', event => {
      if (event.button === 1 && (!owns() || !event.isTrusted || !parent.navigator.userActivation.isActive)) event.preventDefault()
    }, { capture: true, signal: controller.signal })
    accepted.addEventListener('load', requestMeasure, { capture: true, signal: controller.signal })
    observer = new parent.ResizeObserver(requestMeasure); observer.observe(accepted.body)
    ownershipObserver = new parent.MutationObserver(() => {
      if (frame.parentNode !== container) dispose()
    })
    ownershipObserver.observe(container, { childList: true })
    parent.addEventListener('resize', refresh)
    refresh()
    settleReady(true)
  }
  frame.addEventListener('load', () => {
    try { initialize() }
    catch (error) { rejectReady(error); dispose() }
  })
  frame.srcdoc = toTrustedHtml('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>', ownerDocument)
  container.append(frame)
  return { frame, ready, dispose, commands, measurements, refresh, get document() { return accepted }, get live() { return owns() } }
}
