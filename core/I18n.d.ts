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
    /**
     * @param {Partial<I18nMessages>} [messages]   primary locale (e.g. ru)
     * @param {Partial<I18nMessages>} [fallback]   fallback locale (e.g. en) used when a key is missing in primary
     * @param {string} [lang]                       language code for plural rules ('en', 'ru', ...)
     */
    constructor(messages?: Partial<I18nMessages>, fallback?: Partial<I18nMessages>, lang?: string);
    /**
     * Merge additional messages into the primary dictionary.
     * Plugins call this to register their own keys at runtime.
     * Throws after `freeze()`.
     *
     * @param {Partial<I18nMessages>} messages
     */
    merge(messages: Partial<I18nMessages>): void;
    /**
     * Merge additional messages into the fallback dictionary.
     * Used so plugin English locales become the fallback for other languages.
     * Throws after `freeze()`.
     *
     * @param {Partial<I18nMessages>} messages
     */
    mergeFallback(messages: Partial<I18nMessages>): void;
    /**
     * Lock the dictionary against further mutation. Called by `createEditor`
     * after all plugins have registered. Subsequent `merge()` calls throw,
     * and the underlying objects are deep-frozen.
     */
    freeze(): void;
    /**
     * @returns {boolean} true if the i18n dictionary has been frozen
     */
    get isFrozen(): boolean;
    /**
     * Check whether a key resolves to anything (primary or fallback).
     * Use this to distinguish "missing" from "intentionally returns the key".
     *
     * @param {MessageKey | (string & {})} key
     * @returns {boolean}
     */
    has(key: MessageKey | (string & {})): boolean;
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
    t(key: MessageKey | (string & {}), params?: Record<string, string | number>): string;
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
    plural(key: MessageKey | (string & {}), count: number, params?: Record<string, string | number>): string;
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
    scope(prefix: string): ScopedI18n;
    #private;
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
    /**
     * @param {I18n} parent
     * @param {string} prefix
     */
    constructor(parent: I18n, prefix: string);
    /**
     * @param {string} key
     * @param {Record<string, string | number>} [params]
     * @returns {string}
     */
    t(key: string, params?: Record<string, string | number>): string;
    /**
     * @param {string} key
     * @returns {boolean}
     */
    has(key: string): boolean;
    /**
     * @param {string} key
     * @param {number} count
     * @param {Record<string, string | number>} [params]
     * @returns {string}
     */
    plural(key: string, count: number, params?: Record<string, string | number>): string;
    /**
     * Create a sub-scope under the current prefix.
     * @param {string} sub
     * @returns {ScopedI18n}
     */
    scope(sub: string): ScopedI18n;
    #private;
}
export type I18nMessages = import("./types").I18nMessages;
export type MessageKey = import("./types").MessageKey;
export type PluralForms = import("./types").PluralForms;
export type LocaleValue = import("./types").LocaleValue;
