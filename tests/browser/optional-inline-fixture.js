import { make, para, blockElement } from './regressions/harness.js'

export function optionalInlineFixture({ editable = false, withUpdate = false, nativeOptIn = false, readOnly = false, inspect = null } = {}) {
  const flags = { failCreation: null, failUpdate: null, caret: 2, onCreate: null, onUpdate: null }
  const created = []
  const contexts = []
  const roots = []
  const disposed = []
  const schema = {
    currentVersion: 1,
    createDefault: () => ({ label: '' }),
    decode({ dataVersion, data }) {
      if (dataVersion !== 1 || typeof data?.label !== 'string') throw new TypeError('Invalid badge')
      return { dataVersion: 1, data: { label: data.label } }
    },
    encode(data) {
      if (typeof data?.label !== 'string') throw new TypeError('Invalid badge')
      return { dataVersion: 1, data: { label: data.label } }
    },
  }
  const badge = {
    type: 'static-badge', label: { key: 'badge', fallback: 'Badge' }, icon: '', schema,
    ...(editable ? { editing: { handle() {
      return { kind: 'update', data: { label: 'Updated' },
        ...(Number.isInteger(flags.caret) ? { caret: flags.caret } : {}) }
    } } } : {}),
    setup({ ownerDocument }) {
      return {
        create(id, data, context) {
          created.push(data.label)
          flags.onCreate?.(id, data, context)
          if (id === 'x' && flags.failCreation) {
            const error = flags.failCreation
            flags.failCreation = null
            throw error
          }
          contexts.push({ id, context })
          const element = ownerDocument.createElement('span')
          element.dataset.staticBadge = id
          element.textContent = data.label
          roots.push(element)
          // update() is deliberately absent from this supported contract.
          return {
            element,
            ...(withUpdate ? { update(next) {
              element.textContent = next.label
              const outcome = flags.onUpdate?.(next)
              if (flags.failUpdate) {
                const error = flags.failUpdate
                flags.failUpdate = null
                throw error
              }
              return outcome
            } } : {}),
            setReadOnly(value) { element.contentEditable = String(editable && !value) },
            destroy() { disposed.push(element) },
          }
        },
        destroy() {},
      }
    },
  }
  if (nativeOptIn) badge.editing = { ...badge.editing, reconcileNative(input, data) { return { kind: 'update', data: { ...data } } } }
  inspect?.({ flags, created, contexts, roots, disposed, badge })
  const inline = {
    x: { type: badge.type, dataVersion: 1, data: { label: 'Original' } },
    y: { type: badge.type, dataVersion: 1, data: { label: 'Sibling' } },
  }
  const editor = make([para('a', 'A {{x}} / {{y}} Z', { inline }), para('b', 'Other')], { inlinePlugins: [badge], readOnly })
  return {
    editor, roots, disposed, flags, created,
    context: id => contexts.filter(entry => entry.id === id).at(-1).context,
    root: id => blockElement(editor, 'a').querySelector(`[data-static-badge="${id}"]`),
    data: () => editor.save().blocks,
  }
}

