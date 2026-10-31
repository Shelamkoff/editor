import { test, make, select, key, assert, equal } from './harness.js'

function fixture(mode = 'rich-text') {
  const contexts = new Map(), fields = new Map()
  const validate = data => {
    if (typeof data?.text !== 'string' || typeof data?.key !== 'string') throw new TypeError('Key and text are required')
    return { key: data.key, text: data.text }
  }
  const definition = {
    type: 'capture-note',
    icon: '',
    label: { key: 'captureNote', fallback: 'Capture note' },
    schema: {
      currentVersion: 1,
      createDefault: () => ({ key: 'default', text: '' }),
      decode: input => ({ dataVersion: 1, data: validate(input.data) }),
      encode: data => ({ dataVersion: 1, data: validate(data) }),
      mapRichText: (data, visit) => mode === 'rich-text'
        ? { ...data, text: visit(data.text, 'text') } : { ...data },
    },
    setup(runtime) {
      return {
        create(initial, context) {
          const element = runtime.ownerDocument.createElement('div')
          const field = runtime.ownerDocument.createElement(mode === 'plain-text' ? 'input' : 'p')
          const write = text => {
            if (mode === 'plain-text') field.value = text
            else field.textContent = text
          }
          write(initial.text)
          element.append(field)
          contexts.set(initial.key, context)
          fields.set(initial.key, field)
          return {
            element,
            read: () => ({ key: initial.key, text: mode === 'plain-text' ? field.value : field.textContent }),
            update(next) { write(next.text) },
            editableFields: () => [{ key: 'text', mode, element: field }],
            setReadOnly(value) {
              if (mode === 'plain-text') field.readOnly = value
              else field.contentEditable = String(!value)
            },
            destroy() { element.remove() },
          }
        },
        destroy() {},
      }
    },
  }
  const editor = make(['a', 'b'].map((id, index) => ({
    id, type: definition.type, dataVersion: 1, data: { key: id, text: index ? 'Bravo' : 'Alpha' },
  })), {
    defaultBlock: definition.type,
    plugins: [definition],
    blockInsertAnimationMs: 0,
    blockMoveAnimationMs: 0,
    blockRemoveAnimationMs: 0,
  })
  return { editor, contexts, fields }
}

for (const action of ['host write', 'mode change']) {
  test(`DOM selection capture denies a ${action} from its public selection-cleared observer`, () => {
    const { editor, contexts, fields } = fixture()
    const before = editor.save().blocks
    select(fields.get('a'), 5)
    const extended = key(fields.get('a'), 'ArrowRight', { shiftKey: true })
    assert(extended.defaultPrevented, 'Cross-block selection was not admitted')
    equal(editor.blocks.selectedIds(), ['a', 'b'], 'Fixture did not establish a logical cross-block selection')
    let notices = 0, hostProducers = 0, domProducers = 0
    const failures = []
    editor.on('selection:changed', event => {
      if (event.selectedIds.length || notices++) return
      try {
        if (action === 'host write') editor.blocks.update('b', () => {
          hostProducers++
          return { data: { key: 'b', text: 'Unexpected observer edit' } }
        })
        else editor.setReadOnly(true)
      } catch (error) { failures.push(error.message) }
    })
    // A native selectionchange is queued; the synchronous author operation
    // discovers this stale range first through the real selectionPort.
    window.getSelection().removeAllRanges()
    contexts.get('a').commitDomMutation(() => {
      domProducers++
      fields.get('a').textContent = 'Accepted DOM edit'
    })
    equal(failures, ['Cannot mutate document during protected projection edit'],
      'The capture observer borrowed idle rights from the admitted DOM edit')
    equal(hostProducers, 0)
    equal(domProducers, 1)
    equal(editor.readOnly, false)
    equal(editor.save().blocks.map(block => block.data.text), ['Accepted DOM edit', 'Bravo'])
    equal(editor.undo(), true)
    equal(editor.save().blocks, before)
    equal(editor.canUndo, false, 'The capture observer created an extra history entry')
  })
}

test('DOM selection capture protects plugin-owned native input getters and keeps the live edit undoable', () => {
  const { editor, contexts, fields } = fixture('plain-text')
  const field = fields.get('a'), before = editor.save().blocks
  field.focus()
  field.setSelectionRange(2, 2)
  const nativeStart = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'selectionStart').get
  let armed = true, reads = 0, hostProducers = 0, domProducers = 0
  const failures = []
  Object.defineProperty(field, 'selectionStart', {
    configurable: true,
    get() {
      const value = nativeStart.call(this)
      if (armed) {
        armed = false
        reads++
        for (const attempt of [
          () => editor.blocks.update('b', () => {
            hostProducers++
            return { data: { key: 'b', text: 'Unexpected native getter edit' } }
          }),
          () => editor.setReadOnly(true),
        ]) {
          try { attempt() } catch (error) { failures.push(error.message) }
        }
      }
      return value
    },
  })
  try {
    contexts.get('a').commitDomMutation(() => {
      domProducers++
      fields.get('a').value = 'Accepted input edit'
    })
  } finally { delete field.selectionStart }
  equal(reads, 1, 'The production LogicalSelection did not read the supplied native field')
  equal(failures, [
    'Cannot mutate document during protected projection edit',
    'Cannot mutate document during protected projection edit',
  ])
  equal(hostProducers, 0)
  equal(domProducers, 1)
  equal(editor.readOnly, false)
  equal(editor.save().blocks.map(block => block.data.text), ['Accepted input edit', 'Bravo'])
  equal(editor.undo(), true)
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
})

test('DOM selection capture preserves recovery and releases the guard after a throwing author callback', () => {
  const { editor, contexts, fields } = fixture('plain-text')
  const before = editor.save().blocks
  fields.get('a').focus()
  fields.get('a').setSelectionRange(2, 2)
  const failure = new Error('Rejected DOM edit')
  let caught
  try {
    contexts.get('a').commitDomMutation(() => {
      fields.get('a').value = 'Uncommitted'
      throw failure
    })
  } catch (error) { caught = error }
  equal(caught, failure)
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
  equal(fields.get('a').value, 'Alpha')
  assert(document.activeElement === fields.get('a'), 'Recovery lost the captured native input owner')
  equal([fields.get('a').selectionStart, fields.get('a').selectionEnd], [2, 2])
  contexts.get('a').commitDomMutation(() => { fields.get('a').value = 'Accepted after recovery' })
  equal(editor.blocks.get('a').data.text, 'Accepted after recovery')
  equal(editor.undo(), true)
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
})

test('DOM selection capture guard leaves healthy idle selection observers able to author', () => {
  const { editor } = fixture()
  let producers = 0
  const stop = editor.on('selection:changed', event => {
    if (event.selectedIds.length !== 1) return
    editor.blocks.update('b', () => {
      producers++
      return { data: { key: 'b', text: 'Accepted idle observer edit' } }
    })
  })
  editor.blocks.select(['a'])
  stop()
  equal(producers, 1)
  equal(editor.blocks.get('b').data.text, 'Accepted idle observer edit')
  equal(editor.undo(), true)
  equal(editor.blocks.get('b').data.text, 'Bravo')
  equal(editor.canUndo, false)
})
