/** Plugin instances carry mutable locale/config and belong to one live editor. */
const owned = new WeakSet()

/**
 * Prevent mutable plugin instances from being shared by live editors and
 * release optional editor-scoped resources when ownership ends.
 * @param {unknown[]} instances
 * @returns {{ destroy(): void }}
 */
export function claimPluginInstances(instances) {
  const claimed = []
  const pending = new Set()
  for (const instance of instances) {
    if ((typeof instance !== 'object' || instance === null) && typeof instance !== 'function') continue
    if (owned.has(instance) || pending.has(instance)) {
      throw new Error('A plugin instance cannot be shared by multiple live editors')
    }
    pending.add(instance)
    claimed.push(instance)
  }
  for (const instance of claimed) owned.add(instance)

  let released = false
  return {
    destroy() {
      if (released) return
      released = true
      for (const instance of claimed) {
        try {
          const disposable = /** @type {{ dispose?: () => void }} */ (instance)
          disposable.dispose?.()
        } catch (error) {
          console.warn('[PluginOwnership] Failed to dispose plugin:', error)
        } finally {
          owned.delete(instance)
        }
      }
    },
  }
}
