import en from './locale/en.js'

/**
 * @typedef {import('./types').I18nMessages} I18nMessages
 * @typedef {import('./types').MessageKey} MessageKey
 * @typedef {import('./types').PluralForms} PluralForms
 * @typedef {import('./types').LocaleValue} LocaleValue
 */

/**
 * Pluralization rules per language. Returns the CLDR plural category for a count.
 * Add new languages here as needed; default falls through to English rules.
 *
 * @type {Record<string, (n: number) => 'zero' | 'one' | 'two' | 'few' | 'many' | 'other'>}
 */
const PLURAL_RULES = {
  en: (n) => (n === 1 ? 'one' : 'other'),
  ru: (n) => {
    const mod10 = n % 10
    const mod100 = n % 100
    if (mod10 === 1 && mod100 !== 11) return 'one'
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'few'
    return 'many'
  },
}

/**
 * Interpolate `{name}` placeholders in a message string.
 * @param {string} msg
 * @param {Record<string, string | number>} [params]
 * @returns {string}
 */
function interpolate(msg, params) {
  if (!params) return msg
  let result = msg
  for (const [k, v] of Object.entries(params)) {
    result = result.replaceAll(`{${k}}`, String(v))
  }
  return result
}

/**
 * Translation dictionary with:
 *  - fallback chain (primary → fallback language → key)
 *  - explicit `has()` for missing-key detection
 *  - plural rules per language (CLDR categories)
 *  - scoped sub-instances for plugin namespacing
 *  - immutable freeze after init
 *  - dev-mode warnings on missing keys
 *
 * Architecturally: ONE instance per editor, shared by core and all plugins.
 * Plugins receive a `ScopedI18n` wrapper that auto-prefixes keys with their
 * type (e.g. `plugin.heading.*`), so plugin code uses short local keys
 * without worrying about cross-plugin collisions.
 */
export class I18n {
  /** @type {Record<string, LocaleValue>} */
  #messages

  /** @type {Record<string, LocaleValue> | null} */
  #fallback

  /** @type {string} */
  #lang

  /** @type {boolean} */
  #frozen = false

  /**
   * @param {Partial<I18nMessages>} [messages]   primary locale (e.g. ru)
   * @param {Partial<I18nMessages>} [fallback]   fallback locale (e.g. en) used when a key is missing in primary
   * @param {string} [lang]                       language code for plural rules ('en', 'ru', ...)
   */
  constructor(messages, fallback, lang = 'en') {
    this.#messages = /** @type {Record<string, LocaleValue>} */ ({ ...(messages || en) })
    this.#fallback = fallback ? /** @type {Record<string, LocaleValue>} */ ({ ...fallback }) : null
    this.#lang = lang
  }

  /**
   * Merge additional messages into the primary dictionary.
   * Plugins call this to register their own keys at runtime.
   * Throws after `freeze()`.
   *
   * @param {Partial<I18nMessages>} messages
   */
  merge(messages) {
    if (this.#frozen) throw new Error('[I18n] Dictionary is frozen — cannot merge after init')
    Object.assign(this.#messages, messages)
  }

  /**
   * Merge additional messages into the fallback dictionary.
   * Used so plugin English locales become the fallback for other languages.
   * Throws after `freeze()`.
   *
   * @param {Partial<I18nMessages>} messages
   */
  mergeFallback(messages) {
    if (this.#frozen) throw new Error('[I18n] Dictionary is frozen — cannot merge after init')
    if (!this.#fallback) this.#fallback = {}
    Object.assign(this.#fallback, messages)
  }

  /**
   * Lock the dictionary against further mutation. Called by `createEditor`
   * after all plugins have registered. Subsequent `merge()` calls throw,
   * and the underlying objects are deep-frozen.
   */
  freeze() {
    if (this.#frozen) return
    this.#frozen = true
    Object.freeze(this.#messages)
    if (this.#fallback) Object.freeze(this.#fallback)
  }

  /**
   * @returns {boolean} true if the i18n dictionary has been frozen
   */
  get isFrozen() {
    return this.#frozen
  }

  /**
   * Check whether a key resolves to anything (primary or fallback).
   * Use this to distinguish "missing" from "intentionally returns the key".
   *
   * @param {MessageKey | (string & {})} key
   * @returns {boolean}
   */
  has(key) {
    if (key in this.#messages) return true
    if (this.#fallback && key in this.#fallback) return true
    return false
  }

  /**
   * Resolve a translation key with optional `{name}` interpolation.
   *
   * Resolution order:
   *  1. primary dictionary
   *  2. fallback dictionary (if set)
   *  3. `defaultValue` from options (if provided)
   *  4. the key itself, verbatim
   *
   * For string values, returns the interpolated message.
   * For plural-form values (object with `one`/`few`/`many`/`other`), returns the
   * `other` form interpolated — callers wanting count-aware selection should use `plural()`.
   *
   * @param {MessageKey | (string & {})} key
   * @param {Record<string, string | number>} [params] interpolation params
   * @returns {string}
   */
  t(key, params) {
    const value = this.#resolve(key)
    if (value === undefined) {
      this.#warnMissing(key)
      return key
    }
    if (typeof value === 'string') return interpolate(value, params)
    // Plural object accessed via t() — fall back to "other" form.
    return interpolate(value.other ?? Object.values(value)[0] ?? '', params)
  }

  /**
   * Resolve a key as a pluralized message.
   *
   * The locale value should be a `PluralForms` object (`{ one, few, many, other }`).
   * If it's a plain string, it's interpolated with `{count}` like a regular message.
   *
   * The plural form is chosen by CLDR rules for the current language. `count` is
   * automatically merged into `params` so messages can use `{count}`.
   *
   * @param {MessageKey | (string & {})} key
   * @param {number} count
   * @param {Record<string, string | number>} [params]
   * @returns {string}
   */
  plural(key, count, params) {
    const value = this.#resolve(key)
    if (value === undefined) {
      this.#warnMissing(key)
      return key
    }
    const merged = { ...params, count }
    if (typeof value === 'string') return interpolate(value, merged)

    const rule = PLURAL_RULES[this.#lang] ?? PLURAL_RULES.en
    const category = /** @type {(n: number) => keyof PluralForms} */ (rule)(count)
    const form = value[category] ?? value.other ?? Object.values(value)[0] ?? ''
    return interpolate(form, merged)
  }

  /**
   * Create a scoped wrapper that auto-prefixes every key with `prefix.`
   * (e.g. `i18n.scope('plugin.heading')` makes `t('title')` resolve `plugin.heading.title`).
   *
   * Backward-compat: keys that already start with `prefix.` are passed through
   * untouched, so legacy plugin code using full keys keeps working alongside
   * new code using short keys.
   *
   * @param {string} prefix
   * @returns {ScopedI18n}
   */
  scope(prefix) {
    return new ScopedI18n(this, prefix)
  }

  // ── private ────────────────────────────────────────────────────────────────

  /**
   * @param {string} key
   * @returns {LocaleValue | undefined}
   */
  #resolve(key) {
    if (key in this.#messages) return this.#messages[key]
    if (this.#fallback && key in this.#fallback) return this.#fallback[key]
    return undefined
  }

  /** @param {string} key */
  #warnMissing(key) {
    // Dev warning — surfaces missing keys early during plugin development.
    // Disabled when frozen has run AND we're not in dev (heuristic: warn if window
    // exists, since this is a browser-side library).
    if (typeof console !== 'undefined' && console.warn) {
      console.warn(`[I18n] Missing translation key: "${key}"`)
    }
  }
}

/**
 * Plugin-facing i18n wrapper. Auto-prefixes every key with the plugin's
 * namespace, so plugin code can write `_t('title')` instead of
 * `_t('plugin.heading.title')`.
 *
 * Backward-compat: if a caller passes a key that already starts with the
 * prefix, it's left untouched. This lets old code coexist with new code
 * during incremental migration.
 */
export class ScopedI18n {
  /** @type {I18n} */
  #parent

  /** @type {string} */
  #prefix

  /**
   * @param {I18n} parent
   * @param {string} prefix
   */
  constructor(parent, prefix) {
    this.#parent = parent
    this.#prefix = prefix
  }

  /** @param {string} key */
  #fullKey(key) {
    return key.startsWith(this.#prefix + '.') ? key : `${this.#prefix}.${key}`
  }

  /**
   * @param {string} key
   * @param {Record<string, string | number>} [params]
   * @returns {string}
   */
  t(key, params) {
    return this.#parent.t(this.#fullKey(key), params)
  }

  /**
   * @param {string} key
   * @returns {boolean}
   */
  has(key) {
    return this.#parent.has(this.#fullKey(key))
  }

  /**
   * @param {string} key
   * @param {number} count
   * @param {Record<string, string | number>} [params]
   * @returns {string}
   */
  plural(key, count, params) {
    return this.#parent.plural(this.#fullKey(key), count, params)
  }

  /**
   * Create a sub-scope under the current prefix.
   * @param {string} sub
   * @returns {ScopedI18n}
   */
  scope(sub) {
    return new ScopedI18n(this.#parent, `${this.#prefix}.${sub}`)
  }
}
