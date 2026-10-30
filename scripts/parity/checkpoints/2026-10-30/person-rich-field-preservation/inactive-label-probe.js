import { createPersonPlugin } from '../../../../../plugins/person/index.js'
import { createMentionPlugin } from '../../../../../inline-plugins/mention/index.js'
import { createColorSwatchPlugin } from '../../../../../inline-plugins/color.js'
import { test, make, blockElement, equal, pause } from '../../../../../tests/browser/regressions/harness.js'

// An intentionally open reproduction, not part of the green acceptance suite.
test('OPEN Person never-opened name derives its tab text from real inline widgets', async () => {
  const person = (id, name) => ({ id, name, role: '', bio: '', avatar: '', links: [] })
  const editor = make([{ id: 'person', type: 'person', dataVersion: 2, data: { persons: [
    person('active', 'Grace'), person('inactive', '<b>Alpha</b> <i>{{mention}}</i> <mark>{{swatch}}</mark> tail'),
  ] }, inline: {
    mention: { type: 'mention', dataVersion: 1, data: { id: 'ada', name: 'Ada' } },
    swatch: { type: 'color', dataVersion: 1, data: { value: '#123456' } },
  } }], { plugins: [createPersonPlugin({ injectStyles: false })], defaultBlock: 'person',
    inlinePlugins: [createMentionPlugin({ searchFunction: async () => [] }), createColorSwatchPlugin()] })
  await pause(20)
  const before = editor.save().blocks
  const label = () => blockElement(editor, 'person').querySelector('[data-person-id="inactive"] .oe-person__tab-label').textContent
  const initial = label()
  editor.blocks.focus('person', { fieldKey: 'person:inactive:name', offset: 'end' })
  await pause(20)
  equal(label(), 'Alpha @Ada #123456 tail', 'Opening the actual rich field must hydrate its widgets')
  equal(editor.save().blocks, before, 'Opening the profile must not change author data')
  equal(editor.canUndo, false, 'Presentation must not create history')
  equal(initial, 'Alpha @Ada #123456 tail', 'A never-opened tab still exposes canonical token IDs')
})
