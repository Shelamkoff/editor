import { test, make, para, blockElement, assert, equal, run } from './regressions/harness.js'
import { dispatchKey } from './native-input-helpers.js'
import { createParagraphPlugin } from '../../plugins/index.js'
import { getTextOffset } from '../../shared/textOffset.js'
import { pluginParityFixtures, writePath } from './plugin-parity-fixtures.js'

function pluginEditor(fixture) {
  const definition = fixture.factory()
  return make([{ id: 'a', type: definition.type, dataVersion: definition.schema.currentVersion, data: structuredClone(fixture.data) }], {
    plugins: definition.type === 'paragraph' ? [definition] : [createParagraphPlugin(), definition],
  })
}

function checkCaret(editor, identity, value, offset) {
  const field = document.activeElement
  assert(blockElement(editor, 'a').contains(field), 'Clipboard moved focus outside the owner')
  assert(field.matches(identity), 'Clipboard focused a different authoring field')
  equal(typeof field.selectionStart === 'number' ? field.value : field.textContent, value, 'Focused field has the wrong content')
  if (typeof field.selectionStart === 'number') equal([field.selectionStart, field.selectionEnd], [offset, offset])
  else {
    const selection = window.getSelection()
    assert(selection.isCollapsed && field.contains(selection.anchorNode), 'Clipboard lost its collapsed caret')
    equal(getTextOffset(field, selection.anchorNode, selection.anchorOffset), offset)
  }
}

for (const fixture of pluginParityFixtures) for (const spec of fixture.fields) {
  for (const cut of [false, true]) test(`${fixture.name} ${spec.key}: native ${cut ? 'Cut' : 'rich fragment Paste'} targets only this field and restores its caret`, async () => {
    if (!cut) {
      const source = make([para('source', '<b>XY</b>')])
      source.blocks.focus('source', { offset: 0 })
      await dispatchKey('a', 'KeyA', 65, 2)
      equal(window.getSelection().toString(), 'XY')
      await dispatchKey('c', 'KeyC', 67, 2)
    }
    const editor = pluginEditor(fixture)
    const before = editor.save().blocks
    const start = spec.key.endsWith('url') ? spec.value.length - 5 : 2
    editor.blocks.focus('a', { fieldKey: spec.key, offset: start })
    const field = document.activeElement
    assert(blockElement(editor, 'a').contains(field), 'Public field focus failed')
    const identity = field.tagName.toLowerCase() + (field.classList[0] ? '.' + CSS.escape(field.classList[0]) : '')
      + [...field.attributes].filter(attribute => /^data-.*id$/.test(attribute.name))
        .map(attribute => `[${attribute.name}="${CSS.escape(attribute.value)}"]`).join('')
    const nativeControl = typeof field.selectionStart === 'number'
    const plain = nativeControl || fixture.name === 'Attaches'
    await dispatchKey('ArrowRight', 'ArrowRight', 39, 8)
    await dispatchKey('ArrowRight', 'ArrowRight', 39, 8)
    equal(nativeControl ? field.value.slice(field.selectionStart, field.selectionEnd) : window.getSelection().toString(), spec.value.slice(start, start + 2))
    await dispatchKey(cut ? 'x' : 'v', cut ? 'KeyX' : 'KeyV', cut ? 88 : 86, 2)
    const replacement = cut ? '' : plain ? 'XY' : '<b>XY</b>'
    const expectedValue = spec.value.slice(0, start) + replacement + spec.value.slice(start + 2)
    const expectedData = fixture.name === 'LinkPreview'
      ? { ...fixture.factory().schema.createDefault(), template: before[0].data.template, url: expectedValue, domain: 'example.com' }
      : writePath(before[0].data, spec.path, expectedValue)
    const after = editor.save().blocks
    equal(after, [{ ...before[0], data: expectedData }], 'Clipboard changed unrelated fields or lost rich marks')
    checkCaret(editor, identity, spec.value.slice(0, start) + (cut ? '' : 'XY') + spec.value.slice(start + 2), start + (cut ? 0 : 2))
    await dispatchKey('z', 'KeyZ', 90, 2)
    equal(editor.save().blocks, before)
    equal(editor.canUndo, false, 'Clipboard created more than one history action')
    await dispatchKey('z', 'KeyZ', 90, 2 | 8)
    equal(editor.save().blocks, after)
    checkCaret(editor, identity, spec.value.slice(0, start) + (cut ? '' : 'XY') + spec.value.slice(start + 2), start + (cut ? 0 : 2))
    if (!cut && !plain) equal(document.activeElement.querySelector('b')?.textContent, 'XY', 'Redo lost pasted formatting')
  })
}

await run()
