const activeHolders = new WeakMap()

/**
 * Claim an editor holder until the returned lease is destroyed.
 *
 * The WeakMap does not keep detached holders alive, while the private token
 * prevents an old lease from releasing a newer editor accidentally.
 *
 * @param {HTMLElement} holder
 * @returns {{ destroy(): void }}
 */
export function claimEditorHolder(holder) {
  if (activeHolders.has(holder)) {
    throw new Error('The editor holder already owns a live editor instance')
  }

  const token = Object.freeze({})
  activeHolders.set(holder, token)
  let released = false

  return {
    destroy() {
      if (released) return
      released = true
      if (activeHolders.get(holder) === token) activeHolders.delete(holder)
    },
  }
}
