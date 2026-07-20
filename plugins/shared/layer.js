const openLayers = new WeakMap()

/**
 * Keep a plugin surface above neighbouring editor blocks while it is open.
 * Calls are reference-counted so a source editor can coexist with a settings
 * panel owned by the same block.
 *
 * @param {HTMLElement} owner Element inside the plugin block.
 * @param {AbortSignal} signal Plugin render lifecycle signal.
 * @returns {{ open: () => void, close: () => void }}
 */
export function createPluginLayer(owner, signal) {
  /** @type {HTMLElement | null} */
  let block = null
  let opened = false

  const close = () => {
    if (!opened || !block) return
    const currentBlock = block
    opened = false
    block = null
    const next = Math.max(0, (openLayers.get(currentBlock) || 1) - 1)
    if (next === 0) {
      openLayers.delete(currentBlock)
      currentBlock.removeAttribute('data-oe-layer-open')
      return
    }
    openLayers.set(currentBlock, next)
  }

  signal.addEventListener('abort', close, { once: true })

  return {
    open() {
      if (opened || signal.aborted) return
      const candidate = owner.closest('.oe-block')
      if (!(candidate instanceof HTMLElement)) return
      block = candidate
      opened = true
      openLayers.set(block, (openLayers.get(block) || 0) + 1)
      block.setAttribute('data-oe-layer-open', 'true')
    },
    close,
  }
}
