/**
 * A schema-owned rich-field range. Non-text settings and stable identities stay
 * with each residual; the selected author text uses the neutral rich payload.
 * No DOM or editor managers participate in this pure plugin capability.
 * @param {{mapRichText:Function}} schema
 * @param {boolean} [retainUnselectedFields] Preserve empty fields outside the range.
 * @returns {import('../../plugin-kit/types').SelectionSliceCapability<any>}
 */
export function createTextSelectionSlice(schema, retainUnselectedFields = false) {
  return Object.freeze({
    slice(data, start, end, context) {
      const fields = []
      schema.mapRichText(data, (html, key) => { fields.push({ html, key }); return html })
      const first = fields.findIndex(field => field.key === start.fieldKey)
      const last = fields.findIndex(field => field.key === end.fieldKey)
      if (first < 0 || last < first) return null
      const slices = new Map()
      for (let index = first; index <= last; index++) {
        const field = fields[index]
        const result = context.sliceField(field.key, {
          start: index === first ? start.offset : 0,
          end: index === last ? end.offset : Number.MAX_SAFE_INTEGER,
        })
        if (!result) return null
        slices.set(field.key, result)
      }
      const firstSlice = slices.get(fields[first].key)
      const lastSlice = slices.get(fields[last].key)
      // Range extraction can return empty format wrappers at a field edge.
      // Use logical offsets to decide whether that edge has a residual.
      const startsInsideField = start.offset > 0
      const endsInsideField = lastSlice.length === undefined || end.offset < lastSlice.length
      let hasBefore = retainUnselectedFields && first > 0
      let hasAfter = retainUnselectedFields && last < fields.length - 1
      const before = schema.mapRichText(data, (html, key) => {
        const index = fields.findIndex(field => field.key === key)
        const text = index < first ? html : index === first && startsInsideField ? firstSlice.before : ''
        hasBefore ||= !!text
        return text
      })
      const after = schema.mapRichText(data, (html, key) => {
        const index = fields.findIndex(field => field.key === key)
        const text = index > last ? html : index === last && endsInsideField ? lastSlice.after : ''
        hasAfter ||= !!text
        return text
      })
      return {
        before: hasBefore ? before : null,
        selected: { kind: 'rich-text', data: { text: [...slices.values()].map(slice => slice.selected).filter(Boolean).join('<br>') } },
        after: hasAfter ? after : null,
      }
    },
  })
}
