/**
 * Abstract base for block plugins.
 *
 * Implements the boilerplate that every plugin previously duplicated:
 *  - storing the i18n instance (a `ScopedI18n` wrapper auto-prefixed with
 *    `plugin.<type>.`, so plugin code can use short keys like `'title'`
 *    instead of `'plugin.heading.title'`)
 *  - protected `_t(key, fallback, params?)` for plain translations
 *  - protected `_p(key, count, params?)` for pluralized translations
 *  - storing the constructor config in `_config`
 *
 * Subclasses must implement the `BlockPlugin` contract proper:
 *  - `type`, `icon`, `render(data, context)`, `save(element)`
 *  - usually `static styles`, `static locale`, `static isTextBlock`
 *  - optional `validate`, `merge`, `renderSettings`, `onPaste`, etc.
 *
 * Not instantiable directly — `new BlockPluginAbstract()` throws.
 *
 * @template {Record<string, any>} [TConfig=Record<string, any>]
 */
export class BlockPluginAbstract {
  /** @type {import('../core/types').IScopedI18n | null} */
  #i18n = null

  /** @type {TConfig} */
  _config

  /** @param {TConfig} [config] */
  constructor(config) {
    if (new.target === BlockPluginAbstract) {
      throw new Error('BlockPluginAbstract is abstract — extend it')
    }
    this._config = /** @type {TConfig} */ (Object.freeze(config || {}))
  }

  /**
   * Public accessor for plugin configuration.
   * Used by the editor core to read config knobs (e.g. `injectStyles`, `css`).
   * @returns {TConfig}
   */
  getPluginConfig() {
    return this._config
  }

  /**
   * Receive the editor's i18n. `createEditor` passes a `ScopedI18n` wrapper
   * already prefixed with `plugin.<type>.`, so subsequent `_t('foo')` calls
   * resolve to `plugin.<type>.foo` in the underlying dictionary.
   *
   * Backward-compat: if a subclass calls `_t('plugin.heading.title')` with the
   * full key, ScopedI18n detects the matching prefix and passes through
   * untouched.
   *
   * @param {import('../core/types').IScopedI18n} i18n
   */
  setI18n(i18n) {
    this.#i18n = i18n
  }

  /**
   * Resolve a translation key, returning a fallback when i18n is missing
   * or the key is not in the dictionary.
   *
   * Uses the explicit `has()` check rather than comparing the result to the
   * key — that comparison gave a false positive when a translation message
   * happened to literally equal the key string.
   *
   * @protected
   * @param {string} key                                       short key (auto-namespaced)
   * @param {string} [fallback]                                value when i18n is absent or key missing
   * @param {Record<string, string | number>} [params]        `{name}` interpolation params
   * @returns {string}
   */
  _t(key, fallback = '', params) {
    if (!this.#i18n) return fallback
    if (!this.#i18n.has(key)) return fallback
    return this.#i18n.t(key, params)
  }

  /**
   * Resolve a plural-form translation. The locale value can be:
   *  - a `PluralForms` object (`{ one, few, many, other }`) — selected by CLDR rules
   *  - a plain string with `{count}` placeholder — interpolated with count
   *
   * @protected
   * @param {string} key
   * @param {number} count
   * @param {string} [fallback]
   * @param {Record<string, string | number>} [params]
   * @returns {string}
   */
  _p(key, count, fallback = '', params) {
    if (!this.#i18n) return fallback
    if (!this.#i18n.has(key)) return fallback
    return this.#i18n.plural(key, count, params)
  }

  /**
   * Direct access to the i18n instance for cases where subclasses need to
   * pass it to nested helpers.
   *
   * @protected
   * @returns {import('../core/types').IScopedI18n | null}
   */
  get _i18n() {
    return this.#i18n
  }
}
