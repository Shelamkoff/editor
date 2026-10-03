// @ts-check

function nonNegativeDuration(value, fallback, label) {
  const resolved = value ?? fallback
  if (typeof resolved !== 'number' || !Number.isFinite(resolved) || resolved < 0) {
    throw new RangeError(`${label} must be a finite number greater than or equal to 0`)
  }
  return resolved
}

/**
 * Visual-only animations for committed block projection changes.
 *
 * The animator never owns canonical state or plugin instances. Removed plugin
 * DOM is detached synchronously; an inert layout spacer provides the collapse
 * animation so stale extension DOM cannot outlive the projection commit.
 */
export class ProjectionAnimator {
  #insertMs
  #moveMs
  #removeMs
  #enabled = false
  #animations = new Set()
  #transient = new Set()

  constructor(options = {}) {
    this.#insertMs = nonNegativeDuration(options.insertMs, 350, 'insertMs')
    this.#moveMs = nonNegativeDuration(options.moveMs, 200, 'moveMs')
    this.#removeMs = nonNegativeDuration(options.removeMs, 350, 'removeMs')
  }

  enable() {
    this.#enabled = true
  }

  /**
   * Capture existing element positions before a structural projection change.
   * @param {Map<string, { element: HTMLElement }>} entries
   */
  capture(entries) {
    const result = new Map()
    if (!this.#enabled || this.#moveMs === 0) return result
    for (const [id, entry] of entries) {
      const element = entry?.element
      if (!element || typeof element.animate !== 'function' || this.#reducedMotion(element)) continue
      try {
        const rect = element.getBoundingClientRect()
        result.set(id, { element, top: rect.top })
      } catch {}
    }
    return result
  }

  /**
   * Snapshot only inert layout geometry for a block that will be removed.
   * @param {HTMLElement} element
   * @param {number} index
   */
  captureRemoval(element, index) {
    if (!this.#enabled || this.#removeMs === 0 || !element || typeof element.animate !== 'function') return null
    if (this.#reducedMotion(element)) return null
    try {
      const rect = element.getBoundingClientRect()
      const height = Number(rect.height || element.offsetHeight || 0)
      if (!(height > 0)) return null
      const view = element.ownerDocument?.defaultView
      const marginBottom = parseFloat(view?.getComputedStyle?.(element)?.marginBottom ?? '0') || 0
      return { index, height, marginBottom, ownerDocument: element.ownerDocument }
    } catch {
      return null
    }
  }

  /** @param {HTMLElement} element */
  animateInsert(element) {
    if (!this.#enabled || this.#insertMs === 0 || !element || typeof element.animate !== 'function') return
    if (this.#reducedMotion(element)) return
    try {
      this.#track(element.animate([
        { opacity: 0, transform: 'scale(0.95) translateY(-6px)' },
        { opacity: 1, transform: 'scale(1) translateY(0)' },
      ], {
        duration: this.#insertMs,
        easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
      }))
    } catch {}
  }

  /**
   * FLIP-animate surviving elements that changed vertical position.
   * @param {Map<string, { element: HTMLElement }>} entries
   * @param {Map<string, { element: HTMLElement, top: number }>} firstRects
   */
  animateMoves(entries, firstRects) {
    if (!this.#enabled || this.#moveMs === 0 || !firstRects?.size) return
    for (const [id, first] of firstRects) {
      const element = entries.get(id)?.element
      if (!element || element !== first.element || typeof element.animate !== 'function') continue
      if (this.#reducedMotion(element)) continue
      try {
        const dy = first.top - element.getBoundingClientRect().top
        if (Math.abs(dy) < 1) continue
        this.#track(element.animate([
          { transform: `translateY(${dy}px)` },
          { transform: 'translateY(0)' },
        ], {
          duration: this.#moveMs,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        }))
      } catch {}
    }
  }

  /**
   * Recreate removed layout slots without retaining removed plugin DOM.
   * @param {HTMLElement} container
   * @param {Array<{ index:number, height:number, marginBottom:number, ownerDocument:Document }>} snapshots
   */
  animateRemovals(container, snapshots) {
    if (!this.#enabled || this.#removeMs === 0 || !snapshots?.length) return
    for (const snapshot of [...snapshots].sort((left, right) => left.index - right.index)) {
      const document = snapshot.ownerDocument ?? container.ownerDocument
      const spacer = document.createElement('div')
      spacer.className = 'oe-block oe-block--removal-spacer'
      spacer.setAttribute('aria-hidden', 'true')
      spacer.inert = true
      spacer.style.height = `${snapshot.height}px`
      spacer.style.maxHeight = `${snapshot.height}px`
      spacer.style.marginBottom = `${snapshot.marginBottom}px`
      spacer.style.overflow = 'hidden'
      spacer.style.pointerEvents = 'none'
      const anchor = container.children?.[snapshot.index] ?? null
      try {
        if (typeof container.insertBefore === 'function') container.insertBefore(spacer, anchor)
        else container.appendChild(spacer)
      } catch {
        spacer.remove?.()
        continue
      }
      this.#transient.add(spacer)

      if (typeof spacer.animate !== 'function' || this.#reducedMotion(spacer)) {
        this.#removeTransient(spacer)
        continue
      }
      try {
        const animation = spacer.animate([
          {
            opacity: 1,
            height: `${snapshot.height}px`,
            maxHeight: `${snapshot.height}px`,
            marginBottom: `${snapshot.marginBottom}px`,
          },
          {
            opacity: 0,
            height: '0px',
            maxHeight: '0px',
            marginBottom: '0px',
          },
        ], {
          duration: this.#removeMs,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        })
        const cleanup = () => this.#removeTransient(spacer)
        animation.onfinish = cleanup
        animation.oncancel = cleanup
        this.#track(animation)
      } catch {
        this.#removeTransient(spacer)
      }
    }
  }

  destroy() {
    this.#enabled = false
    for (const animation of this.#animations) {
      try { animation.cancel?.() } catch {}
    }
    this.#animations.clear()
    for (const element of this.#transient) {
      try { element.remove?.() } catch {}
    }
    this.#transient.clear()
  }

  #track(animation) {
    if (!animation) return
    this.#animations.add(animation)
    const release = () => this.#animations.delete(animation)
    const previousFinish = animation.onfinish
    const previousCancel = animation.oncancel
    animation.onfinish = event => {
      try { previousFinish?.call(animation, event) } finally { release() }
    }
    animation.oncancel = event => {
      try { previousCancel?.call(animation, event) } finally { release() }
    }
  }

  #removeTransient(element) {
    this.#transient.delete(element)
    try { element.remove?.() } catch {}
  }

  #reducedMotion(element) {
    try {
      return element.ownerDocument?.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true
    } catch {
      return false
    }
  }
}
