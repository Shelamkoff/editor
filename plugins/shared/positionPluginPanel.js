// @ts-check

/**
 * Fit an already opened, absolutely positioned panel to its owner's viewport.
 * The panel's CSS owns its width and maximum height; overflow stays scrollable.
 * @param {HTMLElement} panel
 * @param {HTMLElement} anchor Its positioned containing block.
 * @param {{preferAbove?:boolean}} [options]
 * @returns {void}
 */
export function positionPluginPanel(panel, anchor, { preferAbove = false } = {}) {
  const view = panel.ownerDocument.defaultView
  if (!view) return
  const margin = 8
  const gap = 8
  const rect = anchor.getBoundingClientRect()
  const below = Math.max(0, view.innerHeight - rect.bottom - gap - margin)
  const above = Math.max(0, rect.top - gap - margin)
  panel.style.maxHeight = ''
  const height = panel.getBoundingClientRect().height
  const down = preferAbove
    ? !(above >= height || above >= below)
    : below >= height || below >= above
  const limit = parseFloat(view.getComputedStyle(panel).maxHeight) || Infinity
  panel.style.maxHeight = Math.min(limit, down ? below : above) + 'px'
  panel.style.top = down ? `calc(100% + ${gap}px)` : 'auto'
  panel.style.bottom = down ? 'auto' : `calc(100% + ${gap}px)`
  panel.style.left = '0'
  panel.style.transform = ''
  const viewportWidth = Math.min(view.innerWidth, panel.ownerDocument.documentElement.clientWidth || view.innerWidth)
  const bounds = panel.getBoundingClientRect()
  panel.style.left = (bounds.left < margin
    ? margin - bounds.left
    : Math.min(0, viewportWidth - margin - bounds.right)) + 'px'
}

/**
 * Reposition an open panel when its owner's viewport or scroll position changes.
 * All listeners and scheduled work belong to the supplied projection lifecycle.
 * @param {HTMLElement} panel
 * @param {HTMLElement} anchor
 * @param {{signal:AbortSignal,preferAbove?:boolean}} options
 * @returns {{open:()=>void,close:()=>void}}
 */
export function createPluginPanelPositioner(panel, anchor, { signal, preferAbove = false }) {
  const view = panel.ownerDocument.defaultView
  let opened = false
  /** @type {number | null} */
  let frame = null
  const close = () => {
    opened = false
    observer?.disconnect()
    if (frame !== null) view?.cancelAnimationFrame(frame)
    frame = null
  }
  const update = () => {
    if (opened && !signal.aborted && panel.isConnected) positionPluginPanel(panel, anchor, { preferAbove })
  }
  const schedule = () => {
    if (!opened || frame !== null || signal.aborted || !view) return
    frame = view.requestAnimationFrame(() => { frame = null; update() })
  }
  const observer = view?.ResizeObserver ? new view.ResizeObserver(schedule) : null
  if (!signal.aborted) {
    view?.addEventListener('resize', schedule, { signal })
    view?.addEventListener('scroll', schedule, { signal, capture: true, passive: true })
    signal.addEventListener('abort', close, { once: true })
  }
  return {
    open() {
      if (signal.aborted) return
      opened = true
      observer?.observe(anchor.closest('.oe-block') ?? anchor)
      update()
      schedule()
    },
    close,
  }
}
