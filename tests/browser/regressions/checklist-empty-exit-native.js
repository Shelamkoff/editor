import { test, make, para, blockElement, assert, equal } from './harness.js'
import { dispatchKey, printable } from '../native-input-helpers.js'
import { createParagraphPlugin } from '../../../plugins/paragraph/index.js'
import { createChecklistPlugin } from '../../../plugins/checklist/index.js'
import { createMentionPlugin } from '../../../inline-plugins/mention/index.js'
import { createColorSwatchPlugin } from '../../../inline-plugins/color.js'
import { getTextOffset } from '../../../shared/textOffset.js'

const inline = {
  mention: { type: 'mention', dataVersion: 1, data: { id: 'ada', name: 'Ada' } },
  color: { type: 'color', dataVersion: 1, data: { value: '#123456' } },
}
const retained = { id: 'retained', text: '<b>Keep</b> <i>{{mention}}</i> {{color}}', checked: true }

function field(editor, id) {
  return blockElement(editor, 'checklist').querySelector(`[data-item-id="${id}"] .oe-checklist__text`)
}

function caret(element, offset = 0) {
  equal(document.activeElement, element, 'Checklist Enter or history lost the editing host')
  const selection = getSelection()
  assert(selection.isCollapsed && element.contains(selection.anchorNode), 'The restored Checklist caret is outside its field')
  equal(getTextOffset(element, selection.anchorNode, selection.anchorOffset), offset)
}

for (const [name, text] of [['empty', ''], ['BR-only', '<br>'], ['formatting-only', '<b></b>']]) {
  for (const position of ['sole', 'last']) test(`Checklist empty exit: ${position} ${name} preserves neighboring widgets and two keyboard history steps`, async () => {
    let providers = 0
    const editor = make([
      para('before', 'Before'),
      { id: 'checklist', type: 'checklist', dataVersion: 2,
        data: { items: [...(position === 'last' ? [retained] : []), { id: 'empty', text, checked: false }] },
        ...(position === 'last' ? { inline } : {}),
      },
      para('after', '<i>After</i> {{mention}} {{color}}', { inline }),
    ], {
      plugins: [createParagraphPlugin(), createChecklistPlugin()],
      inlinePlugins: [createMentionPlugin({ searchFunction: async () => { providers++; return [] } }), createColorSwatchPlugin()],
    })
    const original = editor.save().blocks
    assert(editor.blocks.focus('before', { fieldKey: 'text', offset: 'end' }))
    await printable('X')
    const edited = structuredClone(original)
    edited[0].data.text = 'BeforeX'
    equal(editor.save().blocks, edited)
    assert(editor.blocks.focus('checklist', { fieldKey: 'item:empty', offset: 'start' }))
    await dispatchKey('Enter', 'Enter', 13)
    const exited = editor.save().blocks
    equal(exited.map(block => block.type), position === 'last'
      ? ['paragraph', 'checklist', 'paragraph', 'paragraph'] : ['paragraph', 'paragraph', 'paragraph'])
    equal(exited[0], edited[0], 'Empty exit changed the preceding native edit')
    equal(exited.at(-1), edited.at(-1), 'Empty exit changed the following rich paragraph or its sidecars')
    const target = exited[position === 'last' ? 2 : 1]
    const targetField = () => blockElement(editor, target.id).querySelector('[contenteditable="true"]')
    equal(targetField().textContent, '', 'The exit paragraph contains authored text')
    caret(targetField())
    if (position === 'last') equal(exited[1], { ...edited[1], data: { items: [retained] } },
      'Empty exit changed the surviving item ID, marks, check state or inline sidecars')
    else equal(target.id, 'checklist', 'Default conversion changed the block identity')
    equal(blockElement(editor, 'after').querySelectorAll('[data-inline-plugin]').length, 2)
    equal(providers, 0)

    await dispatchKey('z', 'KeyZ', 90, 2)
    equal(editor.save().blocks, edited, 'First keyboard Undo must restore only the empty item')
    caret(field(editor, 'empty'))
    await dispatchKey('z', 'KeyZ', 90, 2)
    equal(editor.save().blocks, original, 'Second keyboard Undo must restore only the preceding text edit')
    equal(editor.canUndo, false)
    await dispatchKey('z', 'KeyZ', 90, 2 | 8)
    equal(editor.save().blocks, edited)
    await dispatchKey('z', 'KeyZ', 90, 2 | 8)
    equal(editor.save().blocks, exited)
    equal(editor.canRedo, false)
    caret(targetField())
    equal(providers, 0)
  })
}

for (const [name, text, sidecars] of [
  ['visible formatting', '<b>Visible</b>', undefined],
  ['inline widgets', '<b>{{mention}}</b> {{color}}', inline],
]) test(`Checklist empty exit: ${name} remains content when Enter splits the last item`, async () => {
  const editor = make([{ id: 'checklist', type: 'checklist', dataVersion: 2,
    data: { items: [{ id: 'last', text, checked: true }] }, ...(sidecars ? { inline: sidecars } : {}),
  }], {
    plugins: [createParagraphPlugin(), createChecklistPlugin()],
    inlinePlugins: [createMentionPlugin({ searchFunction: async () => [] }), createColorSwatchPlugin()],
  })
  const before = editor.save().blocks
  assert(editor.blocks.focus('checklist', { fieldKey: 'item:last', offset: 'end' }))
  await dispatchKey('Enter', 'Enter', 13)
  const after = editor.save().blocks
  equal(after.length, 1, 'Enter on visible content exited the Checklist')
  equal(after[0].type, 'checklist')
  equal(after[0].data.items.length, 2)
  equal(after[0].data.items[0], before[0].data.items[0])
  equal(after[0].inline, before[0].inline)
  assert(after[0].data.items[1].id !== 'last')
  equal(after[0].data.items[1].checked, false)
  caret(field(editor, after[0].data.items[1].id))
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
  await dispatchKey('z', 'KeyZ', 90, 2 | 8)
  equal(editor.save().blocks, after)
  caret(field(editor, after[0].data.items[1].id))
})
