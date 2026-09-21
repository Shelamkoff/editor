import { createColorSwatchPlugin } from '../../../inline-plugins/color.js'
import { test, make, para, equal, assert, select, pause, expectError } from './harness.js'
import { nativeClipboardShortcut } from './nativeClipboard.js'

const fragmentType = 'application/x-rector-fragment'
const red = { type: 'color', data: { value: '#ff0000' } }
const green = { type: 'color', data: { value: '#00ff00' } }
const options = () => ({ inlinePlugins: [createColorSwatchPlugin()] })
const payloads = editor => editor.save().blocks.flatMap(block => Object.values(block.inline ?? {}))
const labelled = editor => editor.save().blocks.map(block => block.data.text.replace(/\{\{([\w-]+)\}\}/g,
  (token, id) => block.inline?.[id] ? `[${block.inline[id].data.value}]` : token))

function fixture(backwards = false) {
  const editor = make([para('a', 'A{{w}}Z', { inline: { w: red } }), para('b', 'Bravo')], options())
  const a = editor.blocks.getBlockById('a').contentElement
  const b = editor.blocks.getBlockById('b').contentElement
  a.focus()
  // Select the whole atomic widget and only the first two letters of b.
  // Element offsets avoid depending on the widget's internal label markup.
  window.getSelection().setBaseAndExtent(backwards ? b.firstChild : a, backwards ? 2 : 1,
    backwards ? a : b.firstChild, backwards ? 1 : 2)
  return { editor, field: a }
}

function copy(field, action, clipboardData = new DataTransfer()) {
  const event = new ClipboardEvent(action, { clipboardData, bubbles: true, cancelable: true })
  field.dispatchEvent(event)
  assert(event.defaultPrevented, 'editor must own a cross-block transfer')
  return clipboardData
}

async function receive(clipboardData, registered = false) {
  const editor = make([para('target', '')], registered ? options() : {})
  const field = editor.blocks.getBlockByIndex(0).contentElement
  select(field, 0)
  field.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }))
  await pause(20)
  return editor
}

export function register() {
  for (const backwards of [false, true]) for (const action of ['copy', 'cut']) for (const registered of [false, true]) {
    test(`cross-block live widget ${action} ${backwards ? 'backward' : 'forward'} preserves data (recipient plugin=${registered})`, async () => {
      const { editor: source, field } = fixture(backwards)
      const before = source.save().blocks
      const clipboard = copy(field, action)
      const recipient = await receive(clipboard, registered)
      equal(payloads(recipient), [red])
      equal(labelled(recipient), ['[#ff0000]Z', 'Br'], 'only the selected content is transferred')
      if (action === 'copy') equal(source.save().blocks, before)
      else {
        equal(labelled(source), ['Aavo'])
        source.undo(); equal(source.save().blocks, before)
        source.redo(); equal(labelled(source), ['Aavo'])
      }
      const pasted = recipient.save().blocks
      recipient.undo(); equal(labelled(recipient), ['']); equal(recipient.canUndo, false)
      recipient.redo(); equal(recipient.save().blocks, pasted)
      const restored = make(pasted, options())
      equal(restored.rootElement.querySelectorAll('[data-inline-plugin="color"]').length, 1)
      equal(payloads(restored), [red])
    })
  }

  for (const refusal of ['discard', 'throw']) {
    test(`cross-block live widget Cut keeps its source when fragment write is ${refusal}`, () => {
      const { editor, field } = fixture()
      const before = editor.save().blocks
      const clipboard = new DataTransfer(), set = clipboard.setData.bind(clipboard)
      let attempted = false
      Object.defineProperty(clipboard, 'setData', { value(type, value) {
        if (type !== fragmentType) return set(type, value)
        attempted = true
        if (refusal === 'throw') throw new Error('live widget fragment refused')
      } })
      if (refusal === 'throw') expectError(/live widget fragment refused/)
      copy(field, 'cut', clipboard)
      equal(editor.save().blocks, before, 'a lossy write must not authorize deletion')
      equal(editor.canUndo, false)
      assert(attempted, 'the required format must actually be written')
    })
  }

  test('cross-block live widgets with colliding IDs stay distinct from a selected literal', async () => {
    const source = make([
      para('a', 'A{{w}}Z', { inline: { w: red } }),
      para('b', '{{w}}', { inline: { w: green } }),
      para('c', '{{w}}End'),
    ], options())
    const a = source.blocks.getBlockById('a').contentElement, c = source.blocks.getBlockById('c').contentElement
    a.focus(); window.getSelection().setBaseAndExtent(a, 1, c.firstChild, 5)
    const before = source.save().blocks
    const recipient = await receive(copy(a, 'copy'))
    equal(payloads(recipient), [red, green])
    equal(labelled(recipient), ['[#ff0000]Z', '[#00ff00]', '{{w}}'])
    equal(source.save().blocks, before)
    const restored = make(recipient.save().blocks, options())
    equal(restored.rootElement.querySelectorAll('[data-inline-plugin="color"]').length, 2)
    equal(restored.blocks.getBlockByIndex(2).contentElement.textContent, '{{w}}')
  })

  test('cross-block plain fragment does not export a live widget outside the selection', async () => {
    const { editor, field } = fixture()
    const b = editor.blocks.getBlockById('b').contentElement
    window.getSelection().setBaseAndExtent(field.lastChild, 0, b.firstChild, 2)
    const clipboard = copy(field, 'copy')
    equal(clipboard.getData(fragmentType), '')
    const recipient = await receive(clipboard)
    equal(payloads(recipient), [])
    equal(labelled(recipient), ['Z', 'Br'])
    equal(payloads(editor), [red])
  })
}

export function registerNative() {
  for (const backwards of [false, true]) for (const action of ['c', 'x']) {
    test(`native cross-block Ctrl+${action.toUpperCase()} → Paste retains live widget data (${backwards ? 'backward' : 'forward'})`, async () => {
      const { editor: source } = fixture(backwards)
      const before = source.save().blocks
      let events = 0
      source.rootElement.addEventListener(action === 'c' ? 'copy' : 'cut', () => { events++ }, { once: true })
      await nativeClipboardShortcut(action, action === 'c' ? 67 : 88)
      equal(events, 1, 'the native shortcut must generate a real clipboard event')
      const recipient = make([para('target', '')])
      select(recipient.blocks.getBlockByIndex(0).contentElement, 0)
      await nativeClipboardShortcut('v', 86)
      equal(payloads(recipient), [red])
      equal(labelled(recipient), ['[#ff0000]Z', 'Br'])
      if (action === 'x') { equal(labelled(source), ['Aavo']); source.undo() }
      equal(source.save().blocks, before)
      recipient.undo(); equal(labelled(recipient), [''])
      recipient.redo(); equal(payloads(recipient), [red])
    })
  }
}
