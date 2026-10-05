// @ts-check

/**
 * Format the tool's shortcut for the platform of its owning document.
 * @param {string} combo
 * @param {Pick<Navigator, 'userAgent' | 'platform'>} navigator
 * @returns {string}
 */
export function formatShortcut(combo, navigator) {
  if (!combo) return ''
  const isMac = /Mac|iPhone|iPad/.test(navigator?.userAgent || navigator?.platform || '')
  const names = { Mod: isMac ? '⌘' : 'Ctrl', Shift: isMac ? '⇧' : 'Shift', Alt: isMac ? '⌥' : 'Alt' }
  return combo.split('+').map(part => names[part] ?? part).join(isMac ? '' : '+')
}

let nextTooltipId = 0

/** Editor-owned presentation; never reads or changes the document selection. */
export class Tooltip {
  #root
  #element
  #window
  #listeners
  #timer = null
  #anchor = null
  #destroyed = false

  /** @param {HTMLElement} root */
  constructor(root) {
    this.#root = root
    this.#window = root.ownerDocument.defaultView
    this.#listeners = new this.#window.AbortController()
    this.#element = root.ownerDocument.createElement('div')
    this.#element.className = 'oe-tooltip'
    this.#element.id = 'oe-tooltip-' + ++nextTooltipId
    this.#element.setAttribute('role', 'tooltip')
    this.#element.style.display = 'none'
    root.append(this.#element)
    const signal = this.#listeners.signal
    root.addEventListener('mousedown', () => this.hide(), { capture: true, signal })
    root.ownerDocument.addEventListener('scroll', () => this.hide(), { capture: true, signal })
    this.#window.addEventListener('resize', () => this.hide(), { signal })
  }

  /** @param {HTMLElement} anchor @param {() => string} label @param {string} [shortcut] */
  bind(anchor, label, shortcut = '') {
    const signal = this.#listeners.signal
    const show = () => this.show(anchor, label(), shortcut)
    anchor.addEventListener('mouseenter', show, { signal })
    anchor.addEventListener('mouseleave', () => this.hide(), { signal })
    anchor.addEventListener('focus', show, { signal })
    anchor.addEventListener('blur', () => this.hide(), { signal })
  }

  /** @param {HTMLElement} anchor @param {string} label @param {string} [shortcut] */
  show(anchor, label, shortcut = '') {
    this.hide()
    if (this.#destroyed) return
    this.#timer = this.#window.setTimeout(() => {
      this.#timer = null
      const rect = anchor.getBoundingClientRect()
      if (!this.#root.isConnected || !this.#root.contains(anchor) || !rect.width || !rect.height) return
      const doc = this.#root.ownerDocument
      const text = doc.createElement('span')
      text.className = 'oe-tooltip__label'
      text.textContent = label
      this.#element.replaceChildren(text)
      if (shortcut) {
        const badge = doc.createElement('span')
        badge.className = 'oe-tooltip__shortcut'
        badge.textContent = formatShortcut(shortcut, this.#window.navigator)
        this.#element.append(badge)
      }
      this.#element.style.display = 'flex'
      const bounds = this.#element.getBoundingClientRect()
      const margin = 6
      const center = Math.max(margin + bounds.width / 2,
        Math.min(rect.left + rect.width / 2, this.#window.innerWidth - margin - bounds.width / 2))
      const below = rect.bottom + margin
      const top = below + bounds.height <= this.#window.innerHeight
        ? below : Math.max(margin, rect.top - margin - bounds.height)
      this.#element.style.left = center + 'px'
      this.#element.style.top = top + 'px'
      this.#anchor = anchor
      const ids = new Set((anchor.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean))
      ids.add(this.#element.id)
      anchor.setAttribute('aria-describedby', [...ids].join(' '))
    }, 500)
  }

  hide() {
    if (this.#timer !== null) this.#window.clearTimeout(this.#timer)
    this.#timer = null
    this.#element.style.display = 'none'
    if (this.#anchor) {
      const ids = (this.#anchor.getAttribute('aria-describedby') ?? '').split(/\s+/)
        .filter(id => id && id !== this.#element.id)
      if (ids.length) this.#anchor.setAttribute('aria-describedby', ids.join(' '))
      else this.#anchor.removeAttribute('aria-describedby')
      this.#anchor = null
    }
  }

  destroy() {
    if (this.#destroyed) return
    this.#destroyed = true
    this.hide()
    this.#listeners.abort()
    this.#element.remove()
  }
}
