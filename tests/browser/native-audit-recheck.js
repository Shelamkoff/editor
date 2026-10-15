import { createPersonPlugin } from '../../plugins/person/index.js'
import { createCarouselPlugin } from '../../plugins/carousel/index.js'
import { createMentionPlugin } from '../../inline-plugins/mention/index.js'
import { pixel, pluginParityFixtures, writePath } from './plugin-parity-fixtures.js'
import { test, make, blockElement, editorRoot, assert, equal, pause, run } from './regressions/harness.js'
import { clickNative, dispatchKey, printable } from './native-input-helpers.js'

const mention = name => ({ type: 'mention', dataVersion: 1, data: { id: name.toLowerCase(), name } })
const inlinePlugins = () => [createMentionPlugin({ debounceDelay: 0, searchFunction: async () => [] })]

for (const fixture of pluginParityFixtures) {
  const definition = fixture.factory(), richKeys = new Set()
  definition.schema.mapRichText?.(structuredClone(fixture.data), (html, key) => { richKeys.add(key); return html })
  for (const field of fixture.fields.filter(field => richKeys.has(field.key))) test(fixture.name + ' inline projection survives immediate read-only transitions in ' + field.key, async () => {
    const data = writePath({ ...definition.schema.createDefault(), ...structuredClone(fixture.data) }, field.path, '{{person}}')
    const editor = make([{ id: 'a', type: definition.type, dataVersion: definition.schema.currentVersion, data, inline: { person: mention('Ada') } }], {
      plugins: [definition], defaultBlock: definition.type, injectStyles: true, inlinePlugins: inlinePlugins(),
    })
    const before = editor.save().blocks
    const widget = () => blockElement(editor, 'a').querySelector('[data-inline-plugin="mention"][data-id="person"]')
    assert(widget(), 'Initial inline projection is missing')
    editor.setReadOnly(true)
    assert(widget(), 'Read-only projection left a canonical placeholder instead of its widget')
    equal(widget().textContent, '@Ada')
    equal(editor.save().blocks, before)
    editor.setReadOnly(false)
    assert(widget(), 'Returning to editing lost the inline occurrence')
    equal(editor.save().blocks, before)
    editor.blocks.focus('a', { fieldKey: field.key, offset: 'start' })
    await printable('X')
    const expected = structuredClone(before)
    expected[0].data = writePath(expected[0].data, field.path, 'X{{person}}')
    equal(editor.save().blocks, expected)
    await dispatchKey('z', 'KeyZ', 90, 2)
    equal(editor.save().blocks, before)
    equal(editor.canUndo, false)
    await dispatchKey('z', 'KeyZ', 90, 10)
    equal(editor.save().blocks, expected)
  })
}

for (const caret of ['label', 'prefix', 'other-widget']) test('Mention replacement target range owns the edit with a collapsed caret in ' + caret, async () => {
  const editor = make([{ id: 'a', type: 'paragraph', dataVersion: 2, data: { text: 'Prefix {{person}} {{other}}' }, inline: {
    person: mention('Ada'), other: mention('Linus'),
  } }], { inlinePlugins: inlinePlugins() })
  const before = editor.save().blocks, field = blockElement(editor, 'a').querySelector('.oe-paragraph')
  const span = field.querySelector('[data-id="person"]'), other = field.querySelector('[data-id="other"]')
  const anchor = caret === 'prefix' ? field.firstChild : (caret === 'label' ? span : other).firstChild
  field.focus()
  window.getSelection().setBaseAndExtent(anchor, 2, anchor, 2)
  const event = new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertReplacementText', data: 'Grace' })
  Object.defineProperty(event, 'getTargetRanges', { value: () => [new StaticRange({
    startContainer: span.firstChild, startOffset: 1, endContainer: span.firstChild, endOffset: 4,
  })] })
  field.dispatchEvent(event)
  assert(event.defaultPrevented, 'Browser replacement was allowed to change the label without canonical data')
  const expected = structuredClone(before)
  expected[0].inline.person.data.name = 'Grace'
  equal(editor.save().blocks, expected, 'Replacement followed the native caret instead of its explicit target range')
  equal(span.textContent, '@Grace')
  editor.undo()
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false, 'Replacement created more than one history entry')
  editor.redo()
  equal(editor.save().blocks, expected)
})

for (const inputType of ['insertText', 'deleteContentBackward']) test('Mention beforeinput ignores an auxiliary control with a restored label selection: ' + inputType, async () => {
  const editor = make([{ id: 'a', type: 'paragraph', dataVersion: 2, data: { text: '{{person}}' }, inline: { person: mention('Ada') } }], { inlinePlugins: inlinePlugins() })
  const before = editor.save().blocks, field = blockElement(editor, 'a').querySelector('.oe-paragraph')
  const span = field.querySelector('[data-id="person"]'), input = document.createElement('input')
  editorRoot(editor).append(input)
  input.focus()
  // A host can restore a document range while its auxiliary input stays focused.
  window.getSelection().setBaseAndExtent(span.firstChild, 2, span.firstChild, 2)
  const event = new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType, data: inputType === 'insertText' ? 'X' : null })
  input.dispatchEvent(event)
  assert(!event.defaultPrevented, 'An unrelated control lost ownership of its input')
  equal(editor.save().blocks, before)
  equal(span.textContent, '@Ada')
  equal(editor.canUndo, false)
})

for (const tag of ['input', 'textarea']) test('Native ' + tag + ' edits stay isolated after leaving a mention label', async () => {
  const editor = make([{ id: 'a', type: 'paragraph', dataVersion: 2, data: { text: '{{person}}' }, inline: { person: mention('Ada') } }], { inlinePlugins: inlinePlugins() })
  const before = editor.save().blocks, field = blockElement(editor, 'a').querySelector('.oe-paragraph'), span = field.querySelector('[data-id="person"]')
  field.focus()
  window.getSelection().setBaseAndExtent(span.firstChild, 2, span.firstChild, 2)
  const input = document.createElement(tag)
  input.value = 'Draft'
  editorRoot(editor).append(input)
  input.focus()
  input.setSelectionRange(5, 5)
  await printable('X')
  equal(input.value, 'DraftX')
  await dispatchKey('Backspace', 'Backspace', 8)
  equal(input.value, 'Draft')
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
})

function personEditor() {
  const definition = createPersonPlugin()
  return make([{ id: 'person', type: 'person', dataVersion: definition.schema.currentVersion, data: { persons: [
    { id: 'first', avatar: '', name: '{{name}}', role: '{{role}}', bio: '{{bio}} {{opaque}}', links: [] },
    { id: 'second', avatar: '', name: 'Second', role: 'Role', bio: 'Biography', links: [] },
  ] }, inline: { name: mention('Ada'), role: mention('Grace'), bio: mention('Linus'), opaque: { type: 'unloaded', dataVersion: 7, data: { label: 'untouched' } } } }], {
    plugins: [definition], defaultBlock: 'person', injectStyles: true, inlinePlugins: inlinePlugins(),
  })
}

for (const readOnly of [false, true]) for (const fieldKey of ['name', 'role', 'bio']) test('Person tab round trip restores owned ' + fieldKey + ' widgets / read-only ' + readOnly, async () => {
  const editor = personEditor(), before = editor.save().blocks
  if (readOnly) editor.setReadOnly(true)
  for (const id of ['second', 'first', 'second', 'first']) {
    await clickNative(blockElement(editor, 'person').querySelector('[data-person-id="' + id + '"] .oe-person__tab-select'))
    equal(editor.save().blocks, before, 'Presentation navigation changed saved data')
  }
  if (readOnly) editor.setReadOnly(false)
  const field = blockElement(editor, 'person').querySelector('.oe-person__' + fieldKey)
  const span = field.querySelector('[data-inline-plugin="mention"]')
  assert(span, 'Revisited authoring field lost its inline widget projection')
  equal(span.textContent, '@' + before[0].inline[fieldKey].data.name)
  editor.blocks.focus('person', { fieldKey: 'person:first:' + fieldKey, offset: 'start' })
  await printable('X')
  const expected = structuredClone(before)
  expected[0].data.persons[0][fieldKey] = 'X' + expected[0].data.persons[0][fieldKey]
  equal(editor.save().blocks, expected)
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
  await dispatchKey('z', 'KeyZ', 90, 10)
  equal(editor.save().blocks, expected)
})

for (const remove of ['first', 'second']) test('Person removal prunes only removed card inline payloads: ' + remove, async () => {
  const editor = personEditor(), before = editor.save().blocks
  await clickNative(blockElement(editor, 'person').querySelector('[data-person-id="' + remove + '"] .oe-person__tab-remove'))
  const expected = structuredClone(before)
  expected[0].data.persons = expected[0].data.persons.filter(person => person.id !== remove)
  if (remove === 'first') delete expected[0].inline
  equal(editor.save().blocks, expected)
  editor.undo()
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
  editor.redo()
  equal(editor.save().blocks, expected)
})

function carouselEditor() {
  const definition = createCarouselPlugin()
  return make([{ id: 'carousel', type: 'carousel', dataVersion: definition.schema.currentVersion, data: {
    ...definition.schema.createDefault(), slides: [
      { id: 'first', type: 'image', src: pixel, alt: '', caption: '{{first}}' },
      { id: 'second', type: 'image', src: pixel, alt: '', caption: '{{second}} {{opaque}}' },
    ],
  }, inline: { first: mention('Ada'), second: mention('Grace'), opaque: { type: 'unloaded', dataVersion: 7, data: { label: 'untouched' } } } }], {
    plugins: [definition], defaultBlock: 'carousel', injectStyles: true, inlinePlugins: inlinePlugins(),
  })
}

for (const readOnly of [false, true]) test('Carousel navigation round trip restores widget projection / read-only ' + readOnly, async () => {
  const editor = carouselEditor(), before = editor.save().blocks
  if (readOnly) editor.setReadOnly(true)
  for (const direction of ['next', 'previous', 'next', 'previous']) {
    await clickNative(blockElement(editor, 'carousel').querySelector('.oe-carousel-block__nav--' + direction))
    equal(editor.save().blocks, before)
  }
  if (readOnly) editor.setReadOnly(false)
  const span = blockElement(editor, 'carousel').querySelector('[data-id="first"]')
  assert(span, 'Revisited caption lost its inline widget projection')
  equal(span.textContent, '@Ada')
  editor.blocks.focus('carousel', { fieldKey: 'slide:first:caption', offset: 'start' })
  await printable('X')
  const expected = structuredClone(before)
  expected[0].data.slides[0].caption = 'X{{first}}'
  equal(editor.save().blocks, expected)
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
  await dispatchKey('z', 'KeyZ', 90, 10)
  equal(editor.save().blocks, expected)
})

test('Carousel active slide removal retains hidden registered and opaque inline payloads', async () => {
  const editor = carouselEditor(), before = editor.save().blocks
  await clickNative(blockElement(editor, 'carousel').querySelector('.oe-carousel-block__action-btn--danger'))
  const expected = structuredClone(before)
  expected[0].data.slides.shift()
  delete expected[0].inline.first
  equal(editor.save().blocks, expected)
  editor.undo()
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
  editor.redo()
  equal(editor.save().blocks, expected)
})

test('Dynamic inline presentation blocks reentrant plugin and host mutations before producers', async () => {
  const definition = createPersonPlugin(), failures = []
  let editor, created = 0, producers = 0
  const probe = {
    type: 'probe', label: { key: 'title', fallback: 'Probe' }, icon: '', schema: createMentionPlugin().schema,
    setup(runtime) {
      return {
        create(_id, data, context) {
          if (++created === 2) {
            for (const operation of [
              () => context.updateData(current => { producers++; return { ...current, name: 'Changed' } }),
              () => editor.blocks.update('person', current => { producers++; return current }),
              () => editor.setReadOnly(true),
            ]) {
              try { operation() } catch (error) { failures.push(error.message) }
            }
          }
          const element = runtime.ownerDocument.createElement('span')
          element.textContent = data.name
          return { element, update(next) { element.textContent = next.name }, setReadOnly() {}, destroy() {} }
        },
        destroy() {},
      }
    },
  }
  editor = make([{ id: 'person', type: 'person', dataVersion: definition.schema.currentVersion, data: { persons: [
    { id: 'first', avatar: '', name: '{{first}}', role: '', bio: '', links: [] },
    { id: 'second', avatar: '', name: '{{second}}', role: '', bio: '', links: [] },
  ] }, inline: {
    first: { ...mention('Ada'), type: 'probe' }, second: { ...mention('Grace'), type: 'probe' },
  } }], { plugins: [definition], defaultBlock: 'person', inlinePlugins: [probe], injectStyles: true })
  const before = editor.save().blocks
  await clickNative(blockElement(editor, 'person').querySelector('[data-person-id="second"] .oe-person__tab-select'))
  await pause()
  equal(producers, 0, 'Presentation callbacks entered an authoring producer')
  equal(created, 2, 'Presentation did not mount the newly visible inline instance')
  equal(failures.length, 3, 'Presentation callbacks bypassed the mutation guard')
  assert(failures.every(message => /presentation/.test(message)), 'An unrelated failure masked a missing presentation guard: ' + failures.join('; '))
  equal(editor.readOnly, false)
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
})

test('Repeated editableFields queries retain the presentation mutation guard', async () => {
  const original = createPersonPlugin(), failures = []
  let armed = false, producers = 0, queries = 0
  const definition = {
    ...original,
    setup(runtime) {
      const mounted = original.setup(runtime)
      return {
        ...mounted,
        create(initial, context) {
          const instance = mounted.create(initial, context)
          return {
            ...instance,
            editableFields() {
              if (armed) {
                queries++
                try { context.updateData(current => { producers++; return current }) }
                catch (error) { failures.push(error.message) }
              }
              return instance.editableFields()
            },
          }
        },
      }
    },
  }
  const editor = make([{ id: 'person', type: 'person', dataVersion: definition.schema.currentVersion, data: { persons: [
    { id: 'first', avatar: '', name: 'Ada', role: '', bio: '', links: [] },
  ] } }], { plugins: [definition], defaultBlock: 'person' })
  const before = editor.save().blocks
  armed = true
  editor.blocks.focus('person', { fieldKey: 'person:first:name', offset: 'start' })
  await pause()
  assert(queries > 0, 'The public focus query did not enumerate fields')
  equal(producers, 0, 'A repeated field query entered an authoring producer')
  equal(failures.length, queries, 'A field callback escaped the presentation guard')
  assert(failures.every(message => /presentation/.test(message)))
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
})

await run()
