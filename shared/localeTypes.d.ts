/** CLDR plural variants accepted by editor and renderer dictionaries. */
export interface PluralForms {
  zero?: string
  one?: string
  two?: string
  few?: string
  many?: string
  other: string
}

export type LocaleValue = string | PluralForms
