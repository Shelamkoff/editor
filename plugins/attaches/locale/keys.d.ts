import enLocale from './en.js'

declare module '../../../types' {
  interface I18nMessages extends Record<keyof typeof enLocale, string> {}
}
