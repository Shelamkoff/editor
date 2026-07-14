import enLocale from './en.js'

declare module '../../../core/types.js' {
  interface I18nMessages extends Record<keyof typeof enLocale, string> {}
}
