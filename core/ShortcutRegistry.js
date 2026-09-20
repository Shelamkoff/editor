export class ShortcutRegistry {
  /** @type {Map<string, Array<{ handler: (e: KeyboardEvent) => void, scope: 'content' | 'editor', when?: () => boolean }>>} */
  #shortcuts = new Map()

  /**
   * Register a keyboard shortcut.
   * Combo format: 'Mod+B', 'Mod+Shift+Z', 'Tab', 'Shift+Tab', 'Escape'
   * 'Mod' maps to Cmd (Mac) / Ctrl (other).
   *
   * @param {string} combo — normalized combo string
   * @param {(e: KeyboardEvent) => void} handler
   * @param {{ scope?: 'content' | 'editor', when?: () => boolean }} [options]
   * @returns {() => void} Unregister function
   */
  register(combo, handler, options = {}) {
    const key = this.#normalizeCombo(combo)
    const entry = { handler, scope: options.scope ?? 'content', when: options.when }
    const entries = this.#shortcuts.get(key) ?? []
    entries.push(entry)
    this.#shortcuts.set(key, entries)
    return () => {
      const current = this.#shortcuts.get(key)
      const index = current?.indexOf(entry) ?? -1
      if (index < 0) return
      current.splice(index, 1)
      if (current.length === 0) this.#shortcuts.delete(key)
    }
  }

  /**
   * Try to handle a keyboard event. If a matching shortcut is found,
   * calls its handler and returns true.
   *
   * @param {KeyboardEvent} e
   * @param {'content' | 'editor'} [scope]
   * @returns {boolean} Whether the event was handled
   */
  handle(e, scope = 'content') {
    const key = this.#eventToKey(e)
    const entries = this.#shortcuts.get(key) ?? []

    // Keep distinct block contexts and editor-level bindings available even
    // when they share a normalized key. Only an eligible handler consumes it.
    for (let index = entries.length - 1; index >= 0; index--) {
      const entry = entries[index]
      if (scope === 'editor' && entry.scope !== 'editor') continue
      if (entry.when && !entry.when()) continue
      e.preventDefault()
      entry.handler(e)
      return true
    }
    return false
  }

  /**
   * Remove all registered shortcuts.
   */
  clear() {
    this.#shortcuts.clear()
  }

  /**
   * Normalize a combo string to a canonical form.
   * Sorts modifier parts, lowercases the main key.
   * 'Mod+Shift+Z' → 'mod+shift+z'
   * @param {string} combo
   * @returns {string}
   */
  #normalizeCombo(combo) {
    const parts = combo.toLowerCase().split('+').map(p => p.trim())
    // Separate modifiers from main key
    const modifiers = []
    let mainKey = ''

    for (const part of parts) {
      if (part === 'mod' || part === 'ctrl' || part === 'cmd' || part === 'meta') {
        modifiers.push('mod')
      } else if (part === 'shift' || part === 'alt') {
        modifiers.push(part)
      } else {
        mainKey = part
      }
    }

    // Sort modifiers for consistent key
    modifiers.sort()
    return [...modifiers, mainKey].join('+')
  }

  /**
   * Convert a KeyboardEvent to the same canonical key format.
   * Uses e.code for letter keys to be keyboard-layout-independent
   * (e.g. Ctrl+Z works on Russian layout where e.key would be 'я').
   * @param {KeyboardEvent} e
   * @returns {string}
   */
  #eventToKey(e) {
    const modifiers = []
    if (e.metaKey || e.ctrlKey) modifiers.push('mod')
    if (e.shiftKey) modifiers.push('shift')
    if (e.altKey) modifiers.push('alt')
    modifiers.sort()

    // For letter keys, use e.code (layout-independent): 'KeyA' → 'a'
    // For digit keys, use e.code: 'Digit1' → '1' (Shift+1 = '!' on US layout)
    let key
    if (e.code && e.code.startsWith('Key')) {
      key = e.code.slice(3).toLowerCase()
    } else if (e.code && e.code.startsWith('Digit')) {
      key = e.code.slice(5)
    } else {
      key = e.key.toLowerCase()
    }

    return [...modifiers, key].join('+')
  }
}
