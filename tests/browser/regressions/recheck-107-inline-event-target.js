import { test, make, para, select, key, equal, assert } from './harness.js'

function fixture(text) {
  const calls = { edits: 0, widgets: 0 }
  const inline = { type: 'event-probe', title: 'Probe', icon: '', trigger: '@',
    pasteConfig: { patterns: [/^#abc$/] },
    onEdit() { calls.edits++ },
    createWidget(data, id, { ownerDocument }) {
      calls.widgets++
      const span = ownerDocument.createElement('span')
      span.contentEditable = 'false'; span.dataset.inlinePlugin = 'event-probe'; span.dataset.id = id
      span.textContent = 'widget'; return span
    },
    getData() { return {} }, hydrate() {},
  }
  const block = { type: 'nested-controls', title: 'Nested controls', icon: '',
    render(data, { ownerDocument }) {
      const field = ownerDocument.createElement('div')
      field.contentEditable = 'true'; field.textContent = data.text
      for (const tag of ['input', 'textarea', 'select', 'button']) {
        const control = ownerDocument.createElement(tag)
        control.className = 'private-control'
        if (tag === 'button') control.type = 'button'
        field.appendChild(control)
      }
      const locked = ownerDocument.createElement('span')
      locked.contentEditable = 'false'; locked.className = 'private-control'; locked.textContent = 'locked'
      field.appendChild(locked)
      const widget = ownerDocument.createElement('span')
      widget.dataset.inlinePlugin = 'event-probe'; widget.className = 'private-control'
      widget.contentEditable = 'false'; widget.textContent = 'private widget'
      field.appendChild(widget)
      return field
    },
    save(field) {
      const clone = field.cloneNode(true)
      clone.querySelectorAll('.private-control').forEach(node => node.remove())
      return { text: clone.innerHTML }
    },
    mapTextFields(data, transform) { data.text = transform(data.text) },
  }
  const editor = make([{ id: 'a', type: block.type, data: { text } }], {
    plugins: [block], defaultBlock: block.type, inlinePlugins: [inline],
  })
  const field = editor.blocks.getBlockById('a').contentElement
  return { editor, field, calls, inline }
}

export function register() {
  test('native controls and locked descendants cannot complete a pattern at a stale text selection', () => {
    const f = fixture('#abc'), before = f.editor.save().blocks
    for (const control of f.field.querySelectorAll('.private-control')) {
      select(f.field, 4)
      assert(!key(control, ' ').defaultPrevented, 'control must retain native space handling')
      equal(f.calls.widgets, 0)
      equal(f.editor.save().blocks, before)
    }
    assert(key(f.field, ' ').defaultPrevented, 'authored field must still complete a matching pattern')
    equal(f.calls.widgets, 1)
  })

  test('nested controls cannot open an inline trigger from a stale text selection', () => {
    const f = fixture('@')
    for (const control of f.field.querySelectorAll('.private-control')) {
      select(f.field, 1)
      control.dispatchEvent(new InputEvent('input', { bubbles: true }))
      equal(f.calls.edits, 0)
    }
    f.field.dispatchEvent(new InputEvent('input', { bubbles: true }))
    equal(f.calls.edits, 1, 'authored input must retain trigger support')
  })
}
