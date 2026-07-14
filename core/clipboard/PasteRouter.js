/**
 * Routing table built from each plugin's `pasteConfig`.
 *
 * Three independent maps:
 *  - tag → plugin (for HTML element matching)
 *  - file MIME pattern → plugin (for `e.clipboardData.files`)
 *  - text regex → plugin (for plain-text URL/pattern matching)
 *
 * Built once at construction time, then queried by Clipboard during paste.
 */
export class PasteRouter {
  /** @type {Map<string, import('../types').BlockPlugin>} */
  #tagRoutes = new Map()

  /** @type {Array<{ regex: RegExp, plugin: import('../types').BlockPlugin }>} */
  #fileRoutes = []

  /** @type {Array<{ regex: RegExp, plugin: import('../types').BlockPlugin }>} */
  #patternRoutes = []

  /** @param {Iterable<import('../types').BlockPlugin>} plugins */
  constructor(plugins) {
    for (const plugin of plugins) {
      const config = plugin.pasteConfig
      if (!config) continue

      if (config.tags) {
        for (const tag of config.tags) {
          this.#tagRoutes.set(tag.toLowerCase(), plugin)
        }
      }

      if (config.files) {
        for (const mime of config.files) {
          // Convert "image/*" → /^image\/.*$/i
          const regex = new RegExp(
            '^' + mime.replace(/[.+]/g, '\\$&').replace(/\*/g, '.*') + '$',
            'i',
          )
          this.#fileRoutes.push({ regex, plugin })
        }
      }

      if (config.patterns) {
        for (const pattern of config.patterns) {
          this.#patternRoutes.push({ regex: pattern, plugin })
        }
      }
    }
  }

  /** @param {string} tag @returns {import('../types').BlockPlugin | undefined} */
  findByTag(tag) {
    return this.#tagRoutes.get(tag.toLowerCase())
  }

  /**
   * @param {string} mime
   * @returns {import('../types').BlockPlugin | undefined}
   */
  findByFile(mime) {
    return this.#fileRoutes.find((r) => r.regex.test(mime))?.plugin
  }

  /**
   * @param {string} text
   * @returns {import('../types').BlockPlugin | undefined}
   */
  findByPattern(text) {
    return this.#patternRoutes.find((route) => this.#matches(route.regex, text))?.plugin
  }

  /**
   * Plugin-owned expressions may be global or sticky. RegExp.test() mutates
   * lastIndex for both flags, so every routing decision must start from the
   * same state and leave the expression reusable by the next paste.
   * @param {RegExp} regex
   * @param {string} value
   */
  #matches(regex, value) {
    regex.lastIndex = 0
    const matched = regex.test(value)
    regex.lastIndex = 0
    return matched
  }
}
