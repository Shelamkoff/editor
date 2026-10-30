import { createPersonPlugin } from '../../../plugins/person/index.js'
import { createMentionPlugin } from '../../../inline-plugins/mention/index.js'
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
  equal(blockElement(editor, 'person').querySelector('.oe-person__name'), field, 'A sibling rich field replaced the native name host')
  equal(document.activeElement, field, 'A sibling rich field moved native focus')
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
  equal(blockElement(editor, 'person').querySelector('.oe-person__link-url'), input, 'A rich field change replaced the active URL control')
  equal(input.parentNode.querySelector('.oe-person__link-icon'), icon)
  equal(document.activeElement, input)
  equal([input.selectionStart, input.selectionEnd], [original.length + 1, original.length + 1])
  await printable('Y')
  equal(editor.save().blocks[0].data.persons[0].links[0].url, original + 'XY')
  assert(editor.undo()); equal(editor.save().blocks, afterSibling)
  assert(editor.undo()); equal(editor.save().blocks, afterInput)
})

test('Person native URL survives a pending sibling name sidecar-only update and exact history replay', async () => {
  const original = 'https://example.com/Alpha'
  const person = (id, name, links = []) => ({ id, name, role: '', bio: '', avatar: '', links })
  let created = 0, providers = 0, mentionContext
  const mention = createMentionPlugin({ searchFunction: async () => { providers++; return [] } })
  const editor = make([{ id: 'person', type: 'person', dataVersion: 2, data: { persons: [
    person('active', 'Alpha {{ref}}', [{ id: 'site', type: 'website', url: original }]), person('other', 'Other'),
  ] }, inline: { ref: { type: 'mention', dataVersion: 1, data: { id: 'ada', name: 'Ada' } } } }], {
    plugins: [createPersonPlugin({ injectStyles: false })], defaultBlock: 'person',
    inlinePlugins: [{ ...mention, setup(context) {
      const runtime = mention.setup(context)
      return { ...runtime, create(...args) { created++; mentionContext = args.at(-1); return runtime.create(...args) } }
    } }],
  })
  const before = editor.save().blocks
  assert(editor.blocks.focus('person', { fieldKey: 'person:active:link:site:url', offset: 'end' }))
  const input = blockElement(editor, 'person').querySelector('.oe-person__link-url')
  const icon = input.parentNode.querySelector('.oe-person__link-icon')
  let duringInput, deliveries = 0
  input.addEventListener('beforeinput', () => {
    mentionContext.updateData(data => ({ ...data, name: 'Grace' }))
    duringInput = editor.save().blocks
    deliveries++
  }, { once: true })
  await printable('X')
  const afterInput = editor.save().blocks
  equal(afterInput[0].data.persons[0].links[0].url, original + 'X')
  equal(deliveries, 1, 'The sidecar update must happen during real native beforeinput')
  mentionContext.updateData(data => ({ ...data, name: 'Lin' }))
  const afterLabel = editor.save().blocks
  equal(blockElement(editor, 'person').querySelector('[data-person-id="active"] .oe-person__tab-label').textContent, 'Alpha @Lin')
  equal(blockElement(editor, 'person').querySelector('.oe-person__link-url'), input)
  equal(input.parentNode.querySelector('.oe-person__link-icon'), icon)
  equal(document.activeElement, input)
  equal([input.selectionStart, input.selectionEnd], [original.length + 1, original.length + 1])
  equal([created, providers], [1, 0])
  await printable('Y')
  const afterContinuation = editor.save().blocks
  equal(afterContinuation[0].data.persons[0].links[0].url, original + 'XY')
  assert(editor.undo()); equal(editor.save().blocks, afterLabel)
  assert(editor.undo()); equal(editor.save().blocks, afterInput)
  assert(editor.undo()); equal(editor.save().blocks, duringInput)
  assert(editor.undo()); equal(editor.save().blocks, before); assert(!editor.canUndo)
  assert(editor.redo()); equal(editor.save().blocks, duringInput)
  assert(editor.redo()); equal(editor.save().blocks, afterInput)
  assert(editor.redo()); equal(editor.save().blocks, afterLabel)
  assert(editor.redo()); equal(editor.save().blocks, afterContinuation); assert(!editor.canRedo)
})
