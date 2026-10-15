// @ts-check
import { cloneEditorData } from '../shared/cloneEditorData.js'

/** Enumerate schema fields without allowing ambiguous addresses. */
export function mapRichTextFields(definition, data, visit) {
  const keys = new Set()
  if (typeof definition?.schema?.mapRichText !== 'function') return data
  return definition.schema.mapRichText(data, (html, key) => {
    if (typeof key !== 'string' || !key || keys.has(key)) {
      throw new TypeError('Rich-text field keys must be unique nonempty strings')
    }
    keys.add(key)
    return visit(html, key)
  })
}

export function richTextFieldMap(definition, data) {
  const fields = new Map()
  mapRichTextFields(definition, cloneEditorData(data), (html, key) => {
    fields.set(key, String(html ?? ''))
    return html
  })
  return fields
}

/** Capture descriptors once before publishing any field ownership. */
export function captureEditableFields(source) {
  if (!Array.isArray(source)) throw new TypeError('Editable fields must be an array')
  const keys = new Set()
  const elements = new Set()
  const fields = []
  for (let index = 0; index < source.length; index++) {
    if (!Object.hasOwn(source, index)) throw new TypeError('Editable fields must be a dense array')
    const field = source[index]
    const key = field?.key
    const element = field?.element
    const mode = field?.mode
    if (typeof key !== 'string' || !key || keys.has(key)) {
      throw new TypeError('Editable field keys must be unique nonempty strings')
    }
    if (!element || elements.has(element)) throw new TypeError('Editable field elements must be unique')
    if (mode !== 'rich-text' && mode !== 'plain-text') throw new TypeError('Invalid editable field mode')
    keys.add(key)
    elements.add(element)
    fields.push(Object.freeze({ key, element, mode }))
  }
  return fields
}

export function mountedRichFields(fields, candidate) {
  const rich = new Map()
  for (const field of captureEditableFields(fields ?? [])) {
    if (field.mode !== 'rich-text') continue
    if (!candidate.has(field.key)) throw new TypeError('Mounted rich-text field key is absent from candidate: ' + field.key)
    rich.set(field.key, field.element)
  }
  return rich
}
