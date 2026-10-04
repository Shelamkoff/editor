import { createDefaultInlineTools } from '../../preset/index.js'
import { findNodeAtOffset, getTextOffset } from '../../shared/textOffset.js'
import { test, make, para, editableField, editorRoot, pause, assert, equal, run } from './regressions/harness.js'
import { clickNative, dragAcross, dispatchKey } from './native-input-helpers.js'

const types = ['bold', 'italic', 'strikethrough', 'link', 'code', 'marker', 'bgcolor', 'fontSize', 'script', 'align', 'caseTransform', 'clearFormatting']
const tags = { bold: 'b', italic: 'i', strikethrough: 's', code: 'code', marker: 'mark', script: 'sup' }

for (const cross of [false, true]) {
  for (const type of types) {
    test(`native ${type} applies to ${cross ? 'both selected blocks' : 'one field'} as one history entry`, async () => {
      const initial = type === 'clearFormatting' ? '<b>Abc</b>' : 'Abc'
      const extra = type === 'clearFormatting' ? { tunes: { textAlign: 'center' } } : {}
      const editor = make(cross ? [para('a', initial, extra), para('b', initial, extra)] : [para('a', initial, extra)], {
        injectStyles: true,
        inlineTools: createDefaultInlineTools({ types: [type] }),
      })
      const before = editor.save().blocks
      const first = editableField(editor, 'a')
      if (cross) await dragAcross(editor, first, 0, editableField(editor, 'b'), 3, true)
      else {
        first.focus()
        const anchor = findNodeAtOffset(first, 3, 'end')
        const focus = findNodeAtOffset(first, 0, 'start')
        window.getSelection().setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset)
        document.dispatchEvent(new Event('selectionchange'))
        await pause(35)
      }
      const root = editorRoot(editor)
      await clickNative(root.querySelector(`.oe-inline-tool[data-tool="${type}"]`))
      if (type === 'fontSize') {
        const input = root.querySelector('.oe-font-size-input')
        assert(document.activeElement === input, 'font size input did not receive keyboard focus')
        await dispatchKey('a', 'KeyA', 65, 2)
        await window.__testInput('Input.insertText', { text: '24' })
        equal(editor.save().blocks, before, 'custom font size input replaced the document selection before Apply')
        equal(editor.canUndo, false, 'custom font size input created document history')
        await dispatchKey('Enter', 'Enter', 13)
      }
      if (type === 'script') await clickNative(root.querySelectorAll('.oe-inline-toolbar__script-panel .oe-inline-tool')[1])
      if (type === 'align') await clickNative(root.querySelectorAll('.oe-inline-toolbar__align-panel .oe-inline-tool')[2])
      if (type === 'link' || type === 'bgcolor') {
        const input = root.querySelector(type === 'link' ? '.oe-inline-toolbar__link-input' : '.oe-color-hex')
        await clickNative(input)
        await dispatchKey('a', 'KeyA', 65, 2)
        await window.__testInput('Input.insertText', { text: type === 'link' ? 'https://example.test/page' : '#ff0000' })
        equal(editor.save().blocks, before, 'auxiliary input changed document before Apply')
        equal(editor.canUndo, false, 'auxiliary input created document history')
        await dispatchKey('Enter', 'Enter', 13)
      }
      await pause(35)
      const after = editor.save().blocks
      assert(JSON.stringify(after) !== JSON.stringify(before), `${type} made no canonical change`)
      for (const block of after) {
        const field = editableField(editor, block.id)
        if (tags[type]) assert(field.querySelector(tags[type])?.textContent === 'Abc', `${type} did not format the entire selected field`)
        if (type === 'link') equal(field.querySelector('a')?.getAttribute('href'), 'https://example.test/page')
        if (type === 'bgcolor') equal(field.querySelector('span')?.style.backgroundColor, 'rgb(255, 0, 0)')
        if (type === 'fontSize') equal(field.querySelector('span')?.style.fontSize, '24px')
        if (type === 'align') {
          equal(block.tunes?.textAlign, 'center')
          assert(!Object.hasOwn(block.data, 'align'), 'alignment leaked into plugin data')
        }
        if (type === 'caseTransform') equal(block.data.text, 'ABC')
        if (type === 'clearFormatting') {
          equal(block.data.text, 'Abc')
          equal(block.tunes?.textAlign, 'center', 'clear formatting removed block alignment')
        }
      }
      const native = window.getSelection()
      const anchorField = editableField(editor, cross ? 'b' : 'a')
      const focusField = editableField(editor, 'a')
      assert(anchorField.contains(native.anchorNode) && focusField.contains(native.focusNode), `${type} moved the backward selection to another field`)
      equal(getTextOffset(anchorField, native.anchorNode, native.anchorOffset), 3, `${type} changed the backward anchor`)
      equal(getTextOffset(focusField, native.focusNode, native.focusOffset), 0, `${type} changed the backward focus`)
      editor.undo()
      equal(editor.save().blocks, before, `${type} undo was not atomic`)
      equal(editor.canUndo, false, `${type} created more than one history entry`)
      editor.redo()
      equal(editor.save().blocks, after, `${type} redo changed its canonical result`)
    })
  }
}

await run()
