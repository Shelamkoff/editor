import { List } from '../../../plugins/list/index.js'
import { Checklist } from '../../../plugins/checklist/index.js'
import { Paragraph } from '../../../plugins/paragraph/index.js'
import { test, make, key, assert, equal } from './harness.js'

export function register() {
  for (const [type, Plugin, selector] of [
    ['list', List, 'li'], ['checklist', Checklist, '.oe-checklist__text'],
  ]) {
    for (const blank of ['', '<br>']) {
      for (const backward of [false, true]) {
        test(`${type} Enter replaces a ${backward ? 'backward' : 'forward'} range starting in ${JSON.stringify(blank)}`, () => {
          const texts = ['Keep', blank, 'Selected', 'Bravo', 'Tail']
          const data = type === 'list' ? { style: 'unordered', items: texts }
            : { items: texts.map(text => ({ text, checked: true })) }
          const editor = make([{ id: 'a', type, data }], { plugins: [new Paragraph(), new Plugin()] })
          const before = editor.save().blocks
          const fields = editor.blocks.getBlockById('a').contentElement.querySelectorAll(selector)
          fields[1].focus()
          const selection = window.getSelection()
          if (backward) selection.setBaseAndExtent(fields[3].firstChild, 2, fields[1], 0)
          else selection.setBaseAndExtent(fields[1], 0, fields[3].firstChild, 2)
          assert(key(fields[1], 'Enter').defaultPrevented)
          const saved = editor.save().blocks
          equal(saved.length, 1)
          const actual = type === 'list' ? saved[0].data.items : saved[0].data.items.map(item => item.text)
          equal(actual, ['Keep', '', 'avo', 'Tail'], 'replace exactly the selection and split at its beginning')
          if (type === 'checklist') equal(saved[0].data.items.map(item => item.checked), [true, true, false, true])
          const liveFields = editor.blocks.getBlockById('a').contentElement.querySelectorAll(selector)
          const range = selection.getRangeAt(0)
          assert(range.collapsed && liveFields[2].contains(range.startContainer), 'caret belongs to the suffix item')
          equal(range.startOffset, 0)
          editor.undo(); equal(editor.save().blocks, before)
          editor.redo(); equal(editor.save().blocks, saved)
        })
      }
    }
  }
}
