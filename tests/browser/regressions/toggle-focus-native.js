import { createTogglePlugin } from '../../../plugins/toggle/index.js'
import { createParagraphPlugin } from '../../../plugins/paragraph/index.js'
import { getTextOffset } from '../../../shared/textOffset.js'
import { printable, dispatchKey } from '../native-input-helpers.js'
import { test, make, para, blockElement, assert, equal } from './harness.js'

test('Toggle hidden body focus reveals its field without authoring open state and retains native history', async () => {
  const editor = make([para('before', 'Before'),
    { id: 'toggle', type: 'toggle', dataVersion: 1, data: { title: 'Title', content: 'Body', open: false } },
    para('after', 'After'),
  ], { plugins: [createParagraphPlugin(), createTogglePlugin({ injectStyles: false })] })
  const original = editor.save().blocks
  const shell = blockElement(editor, 'toggle'), wrapper = shell.querySelector('.oe-toggle')
  const field = shell.querySelector('.oe-toggle__body'), chevron = shell.querySelector('.oe-toggle__chevron')
  const neighbors = [blockElement(editor, 'before'), blockElement(editor, 'after')]
  equal(getComputedStyle(field).display, 'none')
  assert(editor.blocks.focus('toggle', { fieldKey: 'content', offset: 2 }), 'A keyed request did not reveal the closed Toggle body')
  assert(wrapper.classList.contains('oe-toggle--open'))
  equal(chevron.getAttribute('aria-expanded'), 'true')
  equal(document.activeElement, field)
  const selection = getSelection()
  equal(getTextOffset(field, selection.anchorNode, selection.anchorOffset), 2)
  equal(editor.save().blocks, original, 'Focus must not author the persisted disclosure state')
  assert(!editor.canUndo && !editor.canRedo)
  await printable('X')
  const afterInput = structuredClone(original)
  afterInput[1].data.content = 'BoXdy'
  equal(editor.save().blocks, afterInput)
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, original)
  equal(document.activeElement, field)
  equal(getTextOffset(field, selection.anchorNode, selection.anchorOffset), 2)
  assert(wrapper.classList.contains('oe-toggle--open'), 'Undo concealed the restored author caret')
  await dispatchKey('z', 'KeyZ', 90, 2 | 8)
  equal(editor.save().blocks, afterInput)
  equal(document.activeElement, field)
  equal(getTextOffset(field, selection.anchorNode, selection.anchorOffset), 3)
  assert(wrapper.classList.contains('oe-toggle--open'), 'Redo concealed the author caret')
  equal([blockElement(editor, 'before'), blockElement(editor, 'after')], neighbors)
})

test('Toggle hidden body focus and native typing survive a sibling title update with canonical open false', async () => {
  const editor = make([{ id: 'toggle', type: 'toggle', dataVersion: 1,
    data: { title: 'Title', content: 'Body', open: false } }], {
    defaultBlock: 'toggle', plugins: [createTogglePlugin({ injectStyles: false })],
  })
  const original = editor.save().blocks
  assert(editor.blocks.focus('toggle', { fieldKey: 'content', offset: 2 }))
  const field = blockElement(editor, 'toggle').querySelector('.oe-toggle__body')
  await printable('X')
  const afterInput = structuredClone(original); afterInput[0].data.content = 'BoXdy'
  equal(editor.save().blocks, afterInput)
  editor.blocks.update('toggle', current => ({ data: { ...current.data, title: 'Changed title' } }))
  const afterTitle = structuredClone(afterInput); afterTitle[0].data.title = 'Changed title'
  equal(editor.save().blocks, afterTitle)
  equal(document.activeElement, field)
  assert(getComputedStyle(field).display !== 'none', 'A sibling title edit concealed the author field')
  await printable('Y')
  const afterContinuation = structuredClone(afterTitle); afterContinuation[0].data.content = 'BoXYdy'
  equal(editor.save().blocks, afterContinuation)
  for (const expected of [afterTitle, afterInput, original]) {
    await dispatchKey('z', 'KeyZ', 90, 2)
    equal(editor.save().blocks, expected)
  }
  assert(!editor.canUndo)
  for (const expected of [afterInput, afterTitle, afterContinuation]) {
    await dispatchKey('z', 'KeyZ', 90, 2 | 8)
    equal(editor.save().blocks, expected)
  }
  assert(!editor.canRedo)
})

test('Toggle hidden body focus rejects unknown fields and readonly requests without disclosure or intermediate focus', () => {
  const editor = make([para('before', 'Before'),
    { id: 'toggle', type: 'toggle', dataVersion: 1, data: { title: 'Title', content: 'Body', open: false } },
  ], { plugins: [createParagraphPlugin(), createTogglePlugin({ injectStyles: false })] })
  const original = editor.save().blocks
  assert(editor.blocks.focus('before', { offset: 2 }))
  const active = document.activeElement, selection = getSelection()
  const anchor = selection.anchorNode, offset = selection.anchorOffset
  const shell = blockElement(editor, 'toggle'), field = shell.querySelector('.oe-toggle__body')
  let intermediateFocus = 0
  shell.addEventListener('focusin', () => intermediateFocus++)
  equal(editor.blocks.focus('toggle', { fieldKey: 'unknown', offset: 1 }), false)
  equal([document.activeElement, selection.anchorNode, selection.anchorOffset], [active, anchor, offset])
  equal(intermediateFocus, 0, 'An unknown field temporarily focused a different Toggle field')
  equal(getComputedStyle(field).display, 'none')
  editor.setReadOnly(true)
  equal(editor.blocks.focus('toggle', { fieldKey: 'content', offset: 1 }), false)
  equal(getComputedStyle(field).display, 'none')
  equal(editor.save().blocks, original)
  assert(!editor.canUndo && !editor.canRedo)
})
