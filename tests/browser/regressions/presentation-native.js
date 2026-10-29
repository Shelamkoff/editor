import { createEditor } from '../../../core/index.js'
import { test, assert, equal } from './harness.js'

test('public API: sibling presentation preserves genuine IME DOM, scopes and one native history unit', async () => {
  const pause = () => new Promise(resolve => setTimeout(resolve, 40))
  const clone = value => structuredClone(value)
  const widgets = new Map(), transactions = []
  let note, switchTab, editor
  const block = {
    type: 'presentation-public', icon: '', label: { key: 'title', fallback: 'Presentation probe' },
    schema: {
      currentVersion: 1,
      createDefault: () => ({ front: '', back: '', note: '' }),
      decode: input => ({ dataVersion: 1, data: clone(input.data) }),
      encode: data => ({ dataVersion: 1, data: clone(data) }),
      mapRichText: (data, visit) => Object.fromEntries(Object.entries(data).map(([key, value]) => [key, visit(value, key)])),
    },
    setup() { return { create(initial, context) {
      let data = clone(initial), active = 'front', mounted
      const document = context.ownerDocument, root = document.createElement('div')
      const control = document.createElement('button')
      control.type = 'button'; control.textContent = 'Back'
      note = document.createElement('div'); note.contentEditable = 'true'; note.innerHTML = data.note
      const paint = () => {
        const field = document.createElement('div'); field.contentEditable = 'true'; field.innerHTML = data[active]
        if (mounted) mounted.replaceWith(field); else root.append(field)
        mounted = field
      }
      control.addEventListener('mousedown', event => event.preventDefault(), { signal: context.signal })
      control.addEventListener('click', () => { active = 'back'; paint() }, { signal: context.signal })
      paint(); root.append(control, note); switchTab = () => control.click()
      return {
        element: root,
        editableFields: () => [{ key: active, mode: 'rich-text', element: mounted }, { key: 'note', mode: 'rich-text', element: note }],
        read: () => ({ ...data, [active]: mounted.innerHTML, note: note.innerHTML }),
        update(next) { data = clone(next) },
        setReadOnly(value) { mounted.contentEditable = note.contentEditable = String(!value) },
        focus(target) { (target?.fieldKey === 'note' ? note : mounted).focus() },
        destroy() {},
      }
    }, destroy() {} } },
  }
  const inline = {
    type: 'presentation-public-widget', icon: '', label: { key: 'title', fallback: 'Widget' },
    schema: {
      currentVersion: 1, createDefault: () => ({ label: '' }),
      decode: input => ({ dataVersion: 1, data: clone(input.data) }),
      encode: data => ({ dataVersion: 1, data: clone(data) }),
    },
    setup({ ownerDocument }) { return { create(id, data, context) {
      const element = ownerDocument.createElement('span'); element.contentEditable = 'false'; element.textContent = data.label
      widgets.set(id, { element, context })
      return { element, update(next) { element.textContent = next.label }, setReadOnly() {}, destroy() {} }
    }, destroy() {} } },
  }
  const holder = document.createElement('section'); document.body.append(holder)
  try {
    editor = createEditor({ holder, injectStyles: true, plugins: [block], inlinePlugins: [inline], defaultBlock: block.type,
      data: { version: '2.0.0', blocks: [{ id: 'a', type: block.type, dataVersion: 1,
        data: { front: 'Front {{front}}', back: 'Back {{back}}', note: 'Note {{note}} tail' },
        inline: Object.fromEntries(['front', 'back', 'note'].map(label => [label, { type: inline.type, dataVersion: 1, data: { label } }])),
      }] },
    })
    editor.on('transaction:committed', event => transactions.push({ origin: event.origin, action: event.action }))
    await pause()
    const before = editor.save().blocks, widget = widgets.get('note'), task = widget.context.beginTask(), host = note
    const nativeEvents = []
    note.addEventListener('compositionstart', event => nativeEvents.push({ type: event.type, trusted: event.isTrusted }))
    note.focus(); const selection = window.getSelection(); selection.setBaseAndExtent(note.firstChild, 1, note.firstChild, 1)
    await window.__testInput('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Process', windowsVirtualKeyCode: 229 })
    await window.__testInput('Input.imeSetComposition', { text: 'に', selectionStart: 1, selectionEnd: 1 })
    await window.__testInput('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Process', windowsVirtualKeyCode: 229 })
    await pause()
    assert(nativeEvents.some(event => event.trusted) && note.textContent.includes('に'), 'Precondition: genuine native preedit missing')
    equal(editor.save().blocks, before, 'Precondition: native preedit was already committed')
    const range = { anchor: selection.anchorNode, anchorOffset: selection.anchorOffset, focus: selection.focusNode, focusOffset: selection.focusOffset }
    const html = note.innerHTML, text = note.firstChild
    switchTab(); await pause()
    assert(note === host && note.innerHTML === html && note.firstChild === text, 'Sibling tab refresh discarded genuine pending native DOM')
    assert(document.activeElement === note && selection.anchorNode === range.anchor && selection.anchorOffset === range.anchorOffset
      && selection.focusNode === range.focus && selection.focusOffset === range.focusOffset, 'Sibling tab refresh moved the pending native range')
    assert(widgets.get('note').element === widget.element && widget.element.isConnected && !widget.context.signal.aborted && !task.signal.aborted,
      'Sibling tab refresh retired the unrelated widget or task')
    equal(editor.save().blocks, before, 'Presentation changed accepted data')
    assert(!editor.canUndo && transactions.length === 0, 'Presentation created history')
    await window.__testInput('Input.insertText', { text: '日本' }); await pause()
    const expected = clone(before); expected[0].data.note = 'N日本ote {{note}} tail'
    equal(editor.save().blocks, expected, 'Retained native input did not settle exact authored content')
    equal(transactions, [{ origin: 'native-input', action: 'commit' }], 'Native completion did not settle exactly once')
    assert(editor.canUndo && editor.undo(), 'Native completion was not undoable')
    await pause()
    equal(editor.save().blocks, before, 'One Undo did not restore the original canonical data')
    assert(!editor.canUndo && editor.canRedo, 'Presentation introduced extra history')
  } finally {
    editor?.destroy(); holder.remove()
    await window.__testInput('Input.imeSetComposition', { text: '', selectionStart: 0, selectionEnd: 0 })
  }
})
