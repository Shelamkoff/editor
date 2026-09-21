import { List } from '../../../plugins/list/index.js'
import { Checklist } from '../../../plugins/checklist/index.js'
import { Table } from '../../../plugins/table/index.js'
import { Paragraph } from '../../../plugins/paragraph/index.js'
import { test, make, key, select, equal, assert } from './harness.js'

// The widget owns its native input. A document Selection can remain in a
// containing editing host while this control owns keyboard input.
function controlPlugin(tag) {
  return {
    type: 'native-control', title: 'Control', icon: '',
    createWidget(data, id, { ownerDocument }) {
      const node = ownerDocument.createElement('span')
      node.contentEditable = 'false'; node.dataset.inlinePlugin = this.type; node.dataset.id = id
      return node
    },
    getData() { return {} },
    hydrate(node) {
      if (node.firstChild) return
      const control = node.ownerDocument.createElement(tag)
      control.value = 'private'; node.appendChild(control)
    },
  }
}
const inline = { w: { type: 'native-control', data: {} } }

function setup(type, Plugin, selector, tag) {
  const data = type === 'list' ? { style: 'unordered', items: ['First', 'Second {{w}}'] }
    : type === 'checklist' ? { items: [{ text: 'First', checked: false }, { text: 'Second {{w}}', checked: true }] }
      : { withHeadings: false, content: [['First', 'Second {{w}}', 'Third']] }
  const editor = make([{ id: 'a', type, data, inline }], {
    plugins: [new Paragraph(), new Plugin()], inlinePlugins: [controlPlugin(tag)],
  })
  const root = editor.blocks.getBlockById('a').contentElement
  const field = root.querySelectorAll(selector)[1]
  select(field, 0)
  const control = field.querySelector(tag)
  control.focus()
  // This happens natively in Chromium; assert the premise rather than
  // synthesizing an impossible selection inside the native control.
  equal(document.activeElement, control)
  assert(field.contains(window.getSelection().anchorNode), 'native input leaves a DOM selection inside the containing field')
  return { editor, root, field, control }
}

export function register() {
  for (const [type, Plugin, selector] of [
    ['list', List, 'li'], ['checklist', Checklist, '.oe-checklist__text'],
  ]) {
    for (const tag of ['input', 'textarea']) {
      for (const action of ['Enter', 'Backspace']) {
        test(`${type} does not consume ${action} owned by a nested ${tag}`, () => {
          const { editor, control } = setup(type, Plugin, selector, tag)
          const before = editor.save().blocks
          const event = key(control, action)
          equal(editor.save().blocks, before, 'native control input must not split or merge authored items')
          assert(!event.defaultPrevented, 'the native control retains its key')
          equal(document.activeElement, control)
          equal(editor.canUndo, false)
        })
      }
    }
  }
  for (const action of ['Enter', 'Tab', 'beforeinput']) {
    test(`table does not consume ${action} owned by an inline native control`, () => {
      const { editor, control } = setup('table', Table, 'td', 'textarea')
      const before = editor.save().blocks
      const event = action === 'beforeinput'
        ? new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertLineBreak' })
        : key(control, action)
      if (action === 'beforeinput') control.dispatchEvent(event)
      assert(!event.defaultPrevented, 'native editing is not a table command')
      equal(document.activeElement, control)
      equal(editor.save().blocks, before)
      equal(editor.canUndo, false)
    })
  }
}


export function registerNative() {
  for (const [type, Plugin, selector] of [
    ['list', List, 'li'], ['checklist', Checklist, '.oe-checklist__text'], ['table', Table, 'td'],
  ]) {
    test(`native Enter edits the widget textarea without changing its ${type} block`, async () => {
      const { editor, control } = setup(type, Plugin, selector, 'textarea')
      const before = editor.save().blocks
      control.setSelectionRange(3, 3)
      let delivered = 0
      control.addEventListener('keydown', () => { delivered++ }, { once: true })
      await window.__testInput('Input.dispatchKeyEvent', {
        type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r',
      })
      await window.__testInput('Input.dispatchKeyEvent', {
        type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13,
      })
      equal(delivered, 1)
      equal(control.value, 'pri\nvate', 'Enter retains native textarea editing')
      equal(editor.save().blocks, before, 'private editing must not change document structure or duplicate widgets')
      equal(editor.canUndo, false)
      equal(document.activeElement, control)
    })
  }
}
