import { createPersonPlugin } from '../../../plugins/person/index.js'
import { getTextOffset } from '../../../shared/textOffset.js'
import { printable } from '../native-input-helpers.js'
import { test, make, blockElement, assert, equal } from './harness.js'

function fixture(links = []) {
  const definition = createPersonPlugin({ injectStyles: false })
  return make([{ id: 'person', type: 'person', dataVersion: 2,
    data: { persons: [{ id: 'active', name: 'Alpha', role: 'Owner', bio: 'Biography', avatar: '', links }] },
  }], { plugins: [definition], defaultBlock: 'person' })
}

function nameCaret(editor, field, offset) {
  equal(blockElement(editor, 'person').querySelector('.oe-person__name'), field)
  equal(document.activeElement, field)
  const selection = getSelection()
  assert(selection.isCollapsed && field.contains(selection.anchorNode))
  equal(getTextOffset(field, selection.anchorNode, selection.anchorOffset), offset)
}

for (const key of ['role', 'bio']) test(`Person native name continues after changing its own ${key}`, async () => {
  const editor = fixture()
  const before = editor.save().blocks
  assert(editor.blocks.focus('person', { fieldKey: 'person:active:name', offset: 2 }))
  const field = blockElement(editor, 'person').querySelector('.oe-person__name')
  await printable('X')
  const afterInput = editor.save().blocks
  equal(afterInput[0].data.persons[0].name, 'AlXpha')
  nameCaret(editor, field, 3)
  editor.blocks.update('person', current => ({ data: { persons: current.data.persons.map(person => ({ ...person, [key]: 'Changed sibling' })) } }))
  const afterSibling = editor.save().blocks
  equal(afterSibling[0].data.persons[0][key], 'Changed sibling')
  nameCaret(editor, field, 3)
  await printable('Y')
  const afterContinuation = editor.save().blocks
  equal(afterContinuation[0].data.persons[0].name, 'AlXYpha')
  nameCaret(editor, field, 4)
  assert(editor.undo()); equal(editor.save().blocks, afterSibling)
  assert(editor.undo()); equal(editor.save().blocks, afterInput)
  assert(editor.undo()); equal(editor.save().blocks, before); assert(!editor.canUndo)
  assert(editor.redo()); equal(editor.save().blocks, afterInput)
  assert(editor.redo()); equal(editor.save().blocks, afterSibling)
  assert(editor.redo()); equal(editor.save().blocks, afterContinuation); assert(!editor.canRedo)
})

test('Person native URL continues after changing a rich field in the same card', async () => {
  const original = 'https://example.com/Alpha'
  const editor = fixture([{ id: 'site', type: 'website', url: original }])
  assert(editor.blocks.focus('person', { fieldKey: 'person:active:link:site:url', offset: 'end' }))
  const input = blockElement(editor, 'person').querySelector('.oe-person__link-url')
  const icon = input.parentNode.querySelector('.oe-person__link-icon')
  await printable('X')
  const afterInput = editor.save().blocks
  equal(afterInput[0].data.persons[0].links[0].url, original + 'X')
  editor.blocks.update('person', current => ({ data: { persons: current.data.persons.map(person => ({ ...person, name: 'New name' })) } }))
  const afterSibling = editor.save().blocks
  equal(blockElement(editor, 'person').querySelector('.oe-person__name').textContent, 'New name')
  equal(blockElement(editor, 'person').querySelector('.oe-person__tab-label').textContent, 'New name')
  equal(blockElement(editor, 'person').querySelector('.oe-person__link-url'), input)
  equal(input.parentNode.querySelector('.oe-person__link-icon'), icon)
  equal(document.activeElement, input)
  equal([input.selectionStart, input.selectionEnd], [original.length + 1, original.length + 1])
  await printable('Y')
  equal(editor.save().blocks[0].data.persons[0].links[0].url, original + 'XY')
  assert(editor.undo()); equal(editor.save().blocks, afterSibling)
  assert(editor.undo()); equal(editor.save().blocks, afterInput)
})
