import { List } from '../../../plugins/list/index.js'
import { Checklist } from '../../../plugins/checklist/index.js'
import { Paragraph } from '../../../plugins/paragraph/index.js'
import { iconPlugin, iconData, edge } from './recheck-54-atomic-emptiness.js'
import { test, make, key, assert, equal } from './harness.js'

export function register() {
  for (const [type, Plugin, selector] of [
    ['list', List, 'li'], ['checklist', Checklist, '.oe-checklist__text'],
  ]) {
    for (const items of [['{{w}}'], ['A', '{{w}}'], ['A', '{{w}}', 'B']]) {
      for (const after of [false, true]) {
        test(`${type} Enter ${after ? 'after' : 'before'} an icon-only item preserves its payload (${items.length} items)`, () => {
          const data = type === 'list' ? { style: 'unordered', items }
            : { items: items.map(text => ({ text, checked: true })) }
          const editor = make([{ id: 'a', type, data, inline: iconData }], {
            plugins: [new Paragraph(), new Plugin()], inlinePlugins: [iconPlugin],
          })
          const before = editor.save().blocks
          const index = items.indexOf('{{w}}')
          const field = editor.blocks.getBlockById('a').contentElement.querySelectorAll(selector)[index]
          edge(field, after)
          assert(key(field, 'Enter').defaultPrevented)
          const saved = editor.save().blocks
          equal(saved.length, 1, 'splitting a nonempty item does not exit the list')
          equal(saved[0].inline, iconData, 'Enter must not delete an unselected atomic widget')
          const actualItems = type === 'list' ? saved[0].data.items : saved[0].data.items.map(item => item.text)
          const expected = items.flatMap((text, i) => i === index ? (after ? [text, ''] : ['', text]) : [text])
          equal(actualItems, expected)
          const widget = editor.blocks.getBlockById('a').contentElement.querySelector('[data-inline-plugin]')
          widget.click(); equal(widget.dataset.clicked, 'yes')
          editor.undo(); equal(editor.save().blocks, before)
          editor.redo(); equal(editor.save().blocks, saved)
        })
      }
    }
    test(`${type} Enter still exits a genuinely empty single item`, () => {
      const data = type === 'list' ? { style: 'unordered', items: ['<br>'] }
        : { items: [{ text: '<br>', checked: false }] }
      const editor = make([{ id: 'a', type, data }], { plugins: [new Paragraph(), new Plugin()] })
      const before = editor.save().blocks
      edge(editor.blocks.getBlockById('a').contentElement.querySelector(selector))
      assert(key(editor.blocks.getBlockById('a').contentElement.querySelector(selector), 'Enter').defaultPrevented)
      equal(editor.save().blocks[0].type, 'paragraph')
      editor.undo(); equal(editor.save().blocks, before)
    })
  }
}
