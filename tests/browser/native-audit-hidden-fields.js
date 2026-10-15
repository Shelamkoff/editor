import { createPersonPlugin } from '../../plugins/person/index.js'
import { createCarouselPlugin } from '../../plugins/carousel/index.js'
import { createMentionPlugin } from '../../inline-plugins/mention/index.js'
import { pixel } from './plugin-parity-fixtures.js'
import { test, make, blockElement, equal, run } from './regressions/harness.js'
import { clickNative, dispatchKey, printable } from './native-input-helpers.js'

const mention = name => ({ type: 'mention', dataVersion: 1, data: { id: name.toLowerCase(), name } })

for (const field of ['name', 'role', 'bio']) test('Person hidden ' + field + ' keeps canonical text and registered/opaque inline payloads', async () => {
  const definition = createPersonPlugin()
  const editor = make([{ id: 'person', type: 'person', dataVersion: definition.schema.currentVersion, data: { persons: [
    { id: 'first', avatar: '', name: '{{name}}', role: '{{role}}', bio: 'Bio {{bio}} {{opaque}}', links: [] },
    { id: 'second', avatar: '', name: 'Second', role: 'Role', bio: 'Biography', links: [] },
  ] }, inline: {
    name: mention('Ada'), role: mention('Grace'), bio: mention('Linus'),
    opaque: { type: 'unloaded', dataVersion: 7, data: { label: 'untouched' } },
  } }], { plugins: [definition], defaultBlock: 'person', injectStyles: true, inlinePlugins: [createMentionPlugin()] })
  const before = editor.save().blocks
  await clickNative(blockElement(editor, 'person').querySelector('[data-person-id="second"] .oe-person__tab-select'))
  equal(editor.save().blocks, before, 'Tab navigation changed author data')
  editor.blocks.focus('person', { fieldKey: 'person:second:' + field, offset: 'start' })
  await printable('X')
  const expected = structuredClone(before)
  expected[0].data.persons[1][field] = 'X' + expected[0].data.persons[1][field]
  equal(editor.save().blocks, expected, 'Editing the current person corrupted hidden author fields or inline identities')
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
  await dispatchKey('z', 'KeyZ', 90, 10)
  equal(editor.save().blocks, expected)
})

test('Carousel caption editing keeps inline payloads of inactive slides', async () => {
  const definition = createCarouselPlugin()
  const editor = make([{ id: 'carousel', type: 'carousel', dataVersion: definition.schema.currentVersion, data: {
    ...definition.schema.createDefault(), slides: [
      { id: 'first', type: 'image', src: pixel, alt: '', caption: '{{first}}' },
      { id: 'second', type: 'image', src: pixel, alt: '', caption: '{{second}} {{opaque}}' },
    ],
  }, inline: { first: mention('Ada'), second: mention('Grace'), opaque: { type: 'unloaded', dataVersion: 7, data: { label: 'untouched' } } } }], {
    plugins: [definition], defaultBlock: 'carousel', injectStyles: true, inlinePlugins: [createMentionPlugin()],
  })
  const before = editor.save().blocks
  editor.blocks.focus('carousel', { fieldKey: 'slide:first:caption', offset: 'start' })
  await printable('X')
  const expected = structuredClone(before)
  expected[0].data.slides[0].caption = 'X{{first}}'
  equal(editor.save().blocks, expected, 'Caption editing pruned an inactive slide inline payload')
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
  await dispatchKey('z', 'KeyZ', 90, 10)
  equal(editor.save().blocks, expected)
})

await run()
