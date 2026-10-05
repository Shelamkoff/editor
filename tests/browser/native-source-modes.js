import { createCodePlugin, createRawPlugin, createParagraphPlugin } from '../../plugins/index.js'
import en from '../../locale/en.js'
import ru from '../../locale/ru.js'
import { test, make, para, blockElement, assert, equal, run } from './regressions/harness.js'
import { dispatchKey, printable, clickNative } from './native-input-helpers.js'

const variants = [
  { name: 'Code', factory: createCodePlugin, key: 'code', toggle: '.oe-code-btn--edit' },
  { name: 'Raw', factory: createRawPlugin, key: 'html', toggle: '.oe-raw__toggle' },
]
const locales = [{ name: 'EN/light', value: en, theme: 'light' }, { name: 'RU/dark', value: ru, theme: 'dark' }]
const ranges = [
  { name: 'start caret', start: 0, end: 0 },
  { name: 'second-line caret', start: 7, end: 7 },
  { name: 'single-line range', start: 1, end: 4 },
  { name: 'multiline range', start: 2, end: 9 },
]
const source = 'Alpha\nBravo'
function mount(variant, locale = locales[0]) {
  const definition = variant.factory()
  return make([para('left', 'Before'), { id: 'a', type: definition.type, dataVersion: definition.schema.currentVersion, data: { ...definition.schema.createDefault(), [variant.key]: source, ...(variant.name === 'Code' ? { language: 'plaintext' } : {}) } }, para('right', 'After')], {
    plugins: [createParagraphPlugin(), definition], injectStyles: true, locale: locale.value, theme: locale.theme,
  })
}
function field(editor) {
  const input = blockElement(editor, 'a').querySelector('textarea')
  assert(input instanceof HTMLTextAreaElement, 'Source input is missing')
  return input
}
function assertSelection(editor, range, backwards) {
  const input = field(editor)
  equal(document.activeElement, input, 'Returning from preview stranded focus outside the source input')
  equal([input.selectionStart, input.selectionEnd], [range.start, range.end], 'Mode transition moved the source selection')
  if (range.start !== range.end) equal(input.selectionDirection, backwards ? 'backward' : 'forward', 'Mode transition reversed the range')
}
async function selectNative(editor, variant, range, backwards) {
  editor.blocks.focus('a', { fieldKey: variant.key, offset: backwards ? range.end : range.start })
  for (let i = range.start; i < range.end; i++) await dispatchKey(backwards ? 'ArrowLeft' : 'ArrowRight', backwards ? 'ArrowLeft' : 'ArrowRight', backwards ? 37 : 39, 8)
  assertSelection(editor, range, backwards)
}
async function activate(control, activation) {
  if (activation === 'mouse') await clickNative(control)
  else {
    // Focus a public control as keyboard setup; activation is a trusted Space,
    // including browser keyup/click, rather than a synthetic DOM event.
    control.focus()
    await dispatchKey(' ', 'Space', 32, 0, ' ')
  }
}
function assertPreview(editor, variant, active) {
  const block = blockElement(editor, 'a')
  if (variant.name === 'Raw') {
    equal(block.querySelector(variant.toggle).getAttribute('aria-pressed'), String(active))
    equal(Boolean(block.querySelector('iframe')), active, 'Raw mode lost/retained its preview iframe')
    if (active) equal(block.querySelector('iframe').getAttribute('sandbox'), '')
  } else equal(block.querySelector('.oe-code-wrap').classList.contains('oe-code-wrap--editing'), !active)
}
async function assertContinuation(editor, variant, range, backwards, before) {
  assertSelection(editor, range, backwards)
  equal(editor.save().blocks, before, 'Mode transition mutated document data')
  equal(editor.canUndo, false, 'Mode transition created history')
  await printable('X')
  const expected = source.slice(0, range.start) + 'X' + source.slice(range.end)
  const after = before.map(block => block.id === 'a' ? { ...block, data: { ...block.data, [variant.key]: expected } } : block)
  equal(editor.save().blocks, after, 'Next input did not replace the retained source range')
  assertSelection(editor, { start: range.start + 1, end: range.start + 1 }, false)
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before, 'Undo lost source or sibling metadata')
  assertSelection(editor, range, backwards)
  equal(editor.canUndo, false, 'Mode transitions added extra history')
  await dispatchKey('z', 'KeyZ', 90, 10)
  equal(editor.save().blocks, after)
  assertSelection(editor, { start: range.start + 1, end: range.start + 1 }, false)
}

// Keep the original red/green case stable and independently filterable.
test('Raw returning from preview resumes native input at the retained selection', async () => {
  const variant = variants[1], range = ranges[2], editor = mount(variant)
  const before = editor.save().blocks
  await selectNative(editor, variant, range, false)
  await activate(blockElement(editor, 'a').querySelector(variant.toggle), 'mouse')
  assertPreview(editor, variant, true)
  await activate(blockElement(editor, 'a').querySelector(variant.toggle), 'mouse')
  assertPreview(editor, variant, false)
  await assertContinuation(editor, variant, range, false, before)
})

for (const variant of variants) for (const locale of locales) for (const activation of ['mouse', 'keyboard']) for (const range of ranges) for (const backwards of range.start === range.end ? [false] : [false, true]) {
  test(variant.name + ' view/edit then typing/history / ' + locale.name + ' / ' + activation + ' / ' + range.name + ' / ' + (backwards ? 'backward' : 'forward'), async () => {
    const editor = mount(variant, locale), before = editor.save().blocks
    await selectNative(editor, variant, range, backwards)
    const toggle = blockElement(editor, 'a').querySelector(variant.toggle)
    await activate(toggle, activation)
    assertPreview(editor, variant, true)
    await activate(toggle, activation)
    assertPreview(editor, variant, false)
    await assertContinuation(editor, variant, range, backwards, before)
  })
}

for (const exit of ['Escape', 'Ctrl+Enter']) for (const reopen of ['button', 'highlighted source']) for (const backwards of [false, true]) {
  test('Code ' + exit + ' then ' + reopen + ' resumes range/input/history / ' + (backwards ? 'backward' : 'forward'), async () => {
    const variant = variants[0], range = ranges[3], editor = mount(variant)
    const before = editor.save().blocks
    await selectNative(editor, variant, range, backwards)
    await dispatchKey(exit === 'Escape' ? 'Escape' : 'Enter', exit === 'Escape' ? 'Escape' : 'Enter', exit === 'Escape' ? 27 : 13, exit === 'Escape' ? 0 : 2)
    assertPreview(editor, variant, true)
    await clickNative(blockElement(editor, 'a').querySelector(reopen === 'button' ? variant.toggle : '.oe-code-pre'))
    assertPreview(editor, variant, false)
    await assertContinuation(editor, variant, range, backwards, before)
  })
}

for (const variant of variants) for (const locale of locales) {
  test(variant.name + ' read-only view returns to a registered authoring field / ' + locale.name, async () => {
    const editor = mount(variant, locale), before = editor.save().blocks
    await selectNative(editor, variant, ranges[3], true)
    editor.setReadOnly(true)
    assertPreview(editor, variant, true)
    const toggle = blockElement(editor, 'a').querySelector(variant.toggle)
    assert(toggle.hidden && toggle.disabled, 'Read-only view left its authoring toggle active')
    equal(editor.save().blocks, before)
    editor.setReadOnly(false)
    await activate(toggle, 'mouse')
    assertPreview(editor, variant, false)
    editor.blocks.focus('a', { fieldKey: variant.key, offset: 7 })
    await assertContinuation(editor, variant, ranges[1], false, before)
  })
}
await run()
