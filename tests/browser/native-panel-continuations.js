import { createDefaultInlineTools } from '../../inline-tools/defaults.js'
import { createParagraphPlugin } from '../../plugins/index.js'
import { getTextOffset } from '../../shared/textOffset.js'
import ru from '../../locale/ru.js'
import { test, make, editorRoot, pause, assert, equal, run } from './regressions/harness.js'
import { clickNative, dispatchKey, printable, pointAt } from './native-input-helpers.js'
import { pluginParityFixtures, writePath } from './plugin-parity-fixtures.js'

const tool = document.body.dataset.tool
const panelSelectors = {
  fontSize: { input: '.oe-font-size-input', draft: '99', panel: '.oe-font-size-dropdown' },
  bgcolor: { input: '.oe-color-hex', draft: '#ff0000', panel: '.oe-color-dropdown' },
  link: { input: '.oe-inline-toolbar__link-input', draft: 'https://example.com/canceled', panel: '.oe-inline-toolbar__panel--link' },
}

function focusedField(editor, key) {
  editor.blocks.focus('a', { fieldKey: key, offset: 'start' })
  const field = document.activeElement
  assert(field instanceof HTMLElement && field.isContentEditable, 'Cannot focus rich author field ' + key)
  return field
}

function directed(field, backwards) {
  const native = window.getSelection()
  assert(document.activeElement === field, 'Cancel lost editing focus: ' + document.activeElement?.outerHTML?.slice(0, 180))
  equal(getTextOffset(field, native.anchorNode, native.anchorOffset), backwards ? 4 : 1, 'Cancel changed selection anchor')
  equal(getTextOffset(field, native.focusNode, native.focusOffset), backwards ? 1 : 4, 'Cancel changed selection focus')
}

// v1 explicitly disabled formatting for these rich author fields.
const withoutFormatting = ['Image', 'Embed', 'Gallery', 'Carousel', 'Poll', 'Person']
const richNames = ['Paragraph', 'Heading', 'List', 'Quote', 'Image', 'Table', 'Checklist', 'Warning', 'Embed', 'Gallery', 'Carousel', 'Toggle', 'Columns', 'Spoiler', 'Poll', 'Person']
for (const fixture of pluginParityFixtures.filter(entry => richNames.includes(entry.name) && (tool === 'fontSize' || !withoutFormatting.includes(entry.name)))) {
  for (const spec of fixture.fields.filter(field => !field.key.endsWith('url'))) for (const backwards of [false, true]) {
    const formatting = !withoutFormatting.includes(fixture.name)
    test((formatting ? tool + ' cancel, input and history' : 'rich field input without inline tools') + ' / ' + fixture.name + ' / ' + spec.key + ' / ' + (backwards ? 'backward' : 'forward'), async () => {
      const definition = fixture.factory()
      const sourceData = { ...definition.schema.createDefault(), ...fixture.data }
      if (fixture.name === 'Image') sourceData.styles = { width: '300px', height: '180px' }
      const editor = make([{ id: 'a', type: definition.type, dataVersion: definition.schema.currentVersion, data: sourceData }], {
        injectStyles: true, locale: ru, plugins: [createParagraphPlugin(), ...(fixture.name === 'Paragraph' ? [] : [definition])],
        inlineTools: createDefaultInlineTools(),
      })
      await pause(150)
      const before = editor.save().blocks
      const field = focusedField(editor, spec.key)
      const fieldIndex = [...editorRoot(editor).querySelectorAll('[contenteditable="true"]')].indexOf(field)
      await clickNative(field)
      const from = pointAt(field, backwards ? 4 : 1), to = pointAt(field, backwards ? 1 : 4)
      await window.__testInput('Input.drag', { from: { x: from.clientX, y: from.clientY }, to: { x: to.clientX, y: to.clientY } })
      await pause(30)
      directed(field, backwards)
      const root = editorRoot(editor), panel = panelSelectors[tool]
      if (formatting) {
        await clickNative(root.querySelector('[data-tool="' + tool + '"]'))
        await clickNative(root.querySelector(panel.input))
        await dispatchKey('a', 'KeyA', 65, 2)
        await window.__testInput('Input.insertText', { text: panel.draft })
        equal(editor.save().blocks, before, 'Auxiliary draft changed authored fields')
        equal(editor.canUndo, false, 'Auxiliary input added document history')
        await dispatchKey('Escape', 'Escape', 27)
        const canceledPanel = root.querySelector(panel.panel)
        assert(!canceledPanel || getComputedStyle(canceledPanel).display === 'none', 'Escape left the panel visible')
        directed(field, backwards)
        equal(editor.save().blocks, before, 'Escape applied the auxiliary draft')
      } else {
        assert([...root.querySelectorAll('[data-tool]')].every(button => getComputedStyle(button).display === 'none'), 'v1-disabled inline formatting became available')
        assert(getComputedStyle(root.querySelector('.oe-inline-toolbar__type-select')).display !== 'none', 'Type conversion disappeared with disabled formatting')
      }
      await printable('X')
      const after = editor.save().blocks
      equal(after, [{ ...before[0], data: writePath(before[0].data, spec.path, spec.value.slice(0, 1) + 'X' + spec.value.slice(4)) }], 'Typing after Cancel changed another field or failed to replace the selected text')
      await dispatchKey('z', 'KeyZ', 90, 2)
      equal(editor.save().blocks, before)
      equal(editor.canUndo, false, 'Cancel created an extra history entry')
      directed(editorRoot(editor).querySelectorAll('[contenteditable="true"]')[fieldIndex], backwards)
      await dispatchKey('z', 'KeyZ', 90, 10)
      equal(editor.save().blocks, after)
    })
  }
}

await run()
