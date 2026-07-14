/** Plugin instances carry mutable locale/config and belong to one live editor. */
const owned = new WeakSet()

/** @param {unknown[]} instances */
export function claimPluginInstances(instances) {
  const claimed = []
  try {
    for (const instance of instances) {
      if ((typeof instance !== 'object' || instance === null) && typeof instance !== 'function') continue
      if (owned.has(instance)) {
        throw new Error('A plugin instance cannot be shared by multiple live editors')
      }
      owned.add(instance)
      claimed.push(instance)
    }
  } catch (error) {
    for (const instance of claimed) owned.delete(instance)
    throw error
  }

  let released = false
  return {
    destroy() {
      if (released) return
      released = true
      for (const instance of claimed) owned.delete(instance)
    },
  }
}
