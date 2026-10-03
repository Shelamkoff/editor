// @ts-check

function duration(value, fallback, name) {
  const resolved = value ?? fallback
  if (!Number.isFinite(resolved) || resolved < 0) {
    throw new RangeError(`${name} must be a finite number greater than or equal to 0`)
  }
  return resolved
}

export class ProjectionAnimator {
  #insertMs
  #moveMs
  #removeMs
  #enabled = false
  #spacers = new Set()

  constructor(options = {}) {
    this.#insertMs = duration(options.insertMs, 350, 'insertMs')
    this.#moveMs = duration(options.moveMs, 200, 'moveMs')
    this.#removeMs = duration(options.removeMs, 350, 'removeMs')
  }

  enable() { this.#enabled = true }

  capture(entries) {
    const result = new Map()
    if (!this.#enabled) return result
    this.#clearSpacers()
    if (this.#moveMs === 0) return result
    for (const [id, entry] of entries) {
      const element = entry?.element
      if (!this.#canAnimate(element)) continue
      try { result.set(id, { element, top: element.getBoundingClientRect().top }) } catch {}
    }
    return result
  }

  captureRemoval(element, index) {
    if (!this.#enabled || this.#removeMs === 0 || !this.#canAnimate(element)) return null
    try {
      const rect = element.getBoundingClientRect()
      const height = Number(rect.height || element.offsetHeight || 0)
      if (!(height > 0)) return null
      const marginBottom = parseFloat(
        element.ownerDocument?.defaultView?.getComputedStyle?.(element)?.marginBottom ?? '0',
      ) || 0
      return { index, height, marginBottom, ownerDocument: element.ownerDocument }
    } catch {
      return null
    }
  }

  animateInsert(element) {
    if (!this.#enabled || this.#insertMs === 0 || !this.#canAnimate(element)) return
    try {
      element.animate([
        { opacity: 0, transform: 'scale(.95) translateY(-6px)' },
        { opacity: 1, transform: 'scale(1) translateY(0)' },
      ], { duration: this.#insertMs, easing: 'cubic-bezier(.16,1,.3,1)' })
    } catch {}
  }

  animateMoves(entries, firstRects) {
    if (!this.#enabled || this.#moveMs === 0) return
    for (const [id, first] of firstRects) {
      const element = entries.get(id)?.element
      if (element !== first.element || !this.#canAnimate(element)) continue
      try {
        const dy = first.top - element.getBoundingClientRect().top
        if (Math.abs(dy) < 1) continue
        element.animate([
          { transform: `translateY(${dy}px)` },
          { transform: 'translateY(0)' },
        ], { duration: this.#moveMs, easing: 'cubic-bezier(.22,1,.36,1)' })
      } catch {}
    }
  }

  animateRemovals(container, snapshots) {
    if (!this.#enabled || this.#removeMs === 0) return
    for (const snapshot of snapshots) {
      const spacer = snapshot.ownerDocument.createElement('div')
      spacer.className = 'oe-block-removal-spacer'
      spacer.setAttribute('aria-hidden', 'true')
      spacer.inert = true
      Object.assign(spacer.style, {
        height: `${snapshot.height}px`,
        maxHeight: `${snapshot.height}px`,
        marginBottom: `${snapshot.marginBottom}px`,
        overflow: 'hidden',
        pointerEvents: 'none',
      })
      const anchor = container.children?.[snapshot.index] ?? null
      try { container.insertBefore(spacer, anchor) } catch { continue }
      this.#spacers.add(spacer)
      if (!this.#canAnimate(spacer)) {
        this.#removeSpacer(spacer)
        continue
      }
      try {
        const animation = spacer.animate([
          { opacity: 1, height: spacer.style.height, maxHeight: spacer.style.maxHeight, marginBottom: spacer.style.marginBottom },
          { opacity: 0, height: '0px', maxHeight: '0px', marginBottom: '0px' },
        ], { duration: this.#removeMs, easing: 'cubic-bezier(.22,1,.36,1)' })
        const cleanup = () => this.#removeSpacer(spacer)
        animation.onfinish = cleanup
        animation.oncancel = cleanup
      } catch {
        this.#removeSpacer(spacer)
      }
    }
  }

  destroy() {
    this.#enabled = false
    this.#clearSpacers()
  }

  #clearSpacers() {
    for (const spacer of this.#spacers) spacer.remove?.()
    this.#spacers.clear()
  }

  #removeSpacer(spacer) {
    this.#spacers.delete(spacer)
    spacer.remove?.()
  }

  #canAnimate(element) {
    if (!element || typeof element.animate !== 'function') return false
    try {
      return element.ownerDocument?.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches !== true
    } catch {
      return true
    }
  }
}
