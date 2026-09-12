// @ts-check

/**
 * Read one renderer locale entry without observing inherited prototype values.
 * Direct renderer factories are public API and can receive arbitrary locale objects.
 * @param {Record<string, import('../../shared/localeTypes').LocaleValue> | undefined | null} locale
 * @param {string} key
 * @returns {import('../../shared/localeTypes').LocaleValue | undefined}
 */
export function localeValue(locale, key) {
  if (!locale || !Object.hasOwn(locale, key)) return undefined
  return locale[key]
}

/**
 * Resolve an own string locale entry or return a fallback.
 * @param {Record<string, import('../../shared/localeTypes').LocaleValue> | undefined | null} locale
 * @param {string} key
 * @param {string} fallback
 * @returns {string}
 */
export function localeText(locale, key, fallback) {
  const value = localeValue(locale, key)
  return typeof value === 'string' ? value : fallback
}

/**
 * Resolve an own plural-form locale entry without inherited categories.
 * @param {Record<string, import('../../shared/localeTypes').LocaleValue> | undefined | null} locale
 * @param {string} key
 * @param {number} count
 * @param {string} fallback
 * @returns {string}
 */
export function localePluralText(locale, key, count, fallback) {
  const value = localeValue(locale, key)
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback
  const language = localeValue(locale, '__lang')
  const category = new Intl.PluralRules(typeof language === 'string' ? language : 'en').select(count)
  const selected = Object.hasOwn(value, category) ? value[category] : undefined
  if (typeof selected === 'string') return selected
  const other = Object.hasOwn(value, 'other') ? value.other : undefined
  return typeof other === 'string' ? other : fallback
}
