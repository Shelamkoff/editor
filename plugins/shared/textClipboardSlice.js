/**
 * Copy selected author text from a media/card block without copying unselected
 * assets. Cutting keeps its assets, settings, identities and untouched fields.
 * @param {{mapRichText:Function}} schema
 * @returns {import('../../plugin-kit/types').ClipboardCapability<any>}
 */
export function createTextClipboardSlice(schema) {
  return Object.freeze({
    slice(data, context) {
      const selected = []
      const remaining = schema.mapRichText(data, (html, key) => {
        const field = context.field(key)
        if (!field) return html
        selected.push(field.selected)
        return field.before + field.after
      })
      if (!selected.length) throw new Error('Text clipboard selection is empty')
      return {
        parts: [{ kind: /** @type {'rich-text'} */ ('rich-text'), html: selected.filter(Boolean).join('<br>') }],
        remaining,
        focus: null,
      }
    },
  })
}
