import { createPersonPlugin } from '../../../plugins/person/index.js'
import { createParagraphPlugin } from '../../../plugins/paragraph/index.js'
import { createMentionPlugin } from '../../../inline-plugins/mention/index.js'
import { createColorSwatchPlugin } from '../../../inline-plugins/color.js'
import { getTextOffset } from '../../../shared/textOffset.js'
import { clickNative, dispatchKey, printable } from '../native-input-helpers.js'
import { test, make, para, blockElement, equal, assert, pause } from './harness.js'

function records(widgets = false) {
  const result = [para('before', 'Before'), {
    id: 'person', type: 'person', dataVersion: 2, data: { persons: [
      { id: 'alpha', name: 'Alpha', role: 'Owner', bio: 'First biography', avatar: '',
        links: [{ id: 'alpha-site', type: 'website', url: 'https://example.com/alpha' }] },
      { id: 'bravo', name: 'Bravo', role: 'Editor', bio: 'Second biography', avatar: '',
        links: [{ id: 'bravo-site', type: 'website', url: 'https://example.com/bravo' }] },
      { id: 'charlie', name: 'Charlie', role: 'Author', bio: 'Third biography', avatar: '',
        links: [{ id: 'charlie-site', type: 'website', url: 'https://example.com/charlie' }] },
    ] },
  }, para('after', 'After')]
  if (widgets) {
    const inline = {}
    for (const person of result[1].data.persons) {
      person.name = `<b>${person.name}</b> {{${person.id}Mention}}`
      person.role = `<i>${person.role}</i> {{${person.id}Color}}`
      person.bio = `<i>${person.bio}</i> {{${person.id}Bio}} tail`
      inline[person.id + 'Mention'] = { type: 'mention', dataVersion: 1, data: { id: person.id, name: person.id.toUpperCase() } }
      inline[person.id + 'Color'] = { type: 'color', dataVersion: 1, data: { value: '#123456' } }
      inline[person.id + 'Bio'] = { type: 'mention', dataVersion: 1, data: { id: person.id + '-bio', name: 'Writer' } }
    }
    result[1].inline = inline
  }
  return result
}

function fixture(original) {
  let providers = 0
  const editor = make(original, { plugins: [createParagraphPlugin(), createPersonPlugin()], injectStyles: true,
    inlinePlugins: [createMentionPlugin({ searchFunction: async () => { providers++; return [] } }), createColorSwatchPlugin()],
  })
  return { editor, providerCalls: () => providers }
}

function bioCaret(wrapper, offset) {
  const field = wrapper.querySelector('.oe-person__bio'), selection = getSelection()
  equal(document.activeElement, field, 'Native history did not reveal its original biography field')
  assert(selection.isCollapsed && field.contains(selection.anchorNode))
  equal(getTextOffset(field, selection.anchorNode, selection.anchorOffset), offset, 'Native history restored the wrong biography caret')
}

for (const widgets of [false, true]) test(`Person card removal keeps keyboard history for the active ${widgets ? 'widget' : 'literal'} profile and its preceding native edit`, async () => {
  const original = records(widgets), caller = structuredClone(original)
  const { editor, providerCalls } = fixture(original)
  const wrapper = () => blockElement(editor, 'person').querySelector('.oe-person')
  await clickNative(wrapper().querySelector('[data-person-id="bravo"] .oe-person__tab-select'))
  const bio = wrapper().querySelector('.oe-person__bio')
  await clickNative(bio)
  await dispatchKey('End', 'End', 35)
  await printable('X')
  const edited = structuredClone(original)
  edited[1].data.persons[1].bio += 'X'
  equal(editor.save().blocks, edited, 'Native biography editing changed hidden profiles or neighboring blocks')
  await clickNative(wrapper().querySelector('[data-person-id="bravo"] .oe-person__tab-remove'))
  const removed = structuredClone(edited)
  removed[1].data.persons.splice(1, 1)
  if (widgets) for (const key of ['bravoMention', 'bravoColor', 'bravoBio']) delete removed[1].inline[key]
  equal(editor.save().blocks, removed, 'Removing the active profile lost surviving non-name data')
  assert(wrapper().contains(document.activeElement), 'Removing the active profile left keyboard history outside Person')
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, edited, 'First keyboard Undo must restore the removed profile including its edited biography')
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, original, 'Second keyboard Undo must restore only the preceding native biography edit')
  bioCaret(wrapper(), widgets ? 23 : 16)
  equal(editor.canUndo, false)
  await dispatchKey('z', 'KeyZ', 90, 2 | 8)
  equal(editor.save().blocks, edited)
  bioCaret(wrapper(), widgets ? 24 : 17)
  await dispatchKey('z', 'KeyZ', 90, 2 | 8)
  equal(editor.save().blocks, removed)
  equal(editor.canRedo, false)
  equal(original, caller, 'Person card actions mutated the caller document')
  equal(providerCalls(), 0, 'Card actions must not start mention searches')
})

for (const widgets of [false, true]) test(`Person card native reorder retains its active ${widgets ? 'widget' : 'literal'} author body and both keyboard history steps`, async () => {
  const original = records(widgets), caller = structuredClone(original)
  const { editor, providerCalls } = fixture(original)
  const wrapper = () => blockElement(editor, 'person').querySelector('.oe-person')
  await clickNative(wrapper().querySelector('[data-person-id="bravo"] .oe-person__tab-select'))
  const bio = wrapper().querySelector('.oe-person__bio')
  const name = wrapper().querySelector('.oe-person__name')
  const link = wrapper().querySelector('.oe-person__link-url')
  const inline = [...wrapper().querySelectorAll('[data-inline-plugin][data-id]')]
  await clickNative(bio)
  await dispatchKey('End', 'End', 35)
  await printable('X')
  const edited = structuredClone(original)
  edited[1].data.persons[1].bio += 'X'
  equal(editor.save().blocks, edited)
  const point = element => {
    const rect = element.getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  }
  const events = []
  const record = event => events.push({ type: event.type, trusted: event.isTrusted, id: event.target.closest('[data-person-id]')?.dataset.personId })
  wrapper().addEventListener('dragstart', record, true)
  wrapper().addEventListener('drop', record, true)
  const from = point(wrapper().querySelector('[data-person-id="alpha"] .oe-person__tab-grip'))
  const to = point(wrapper().querySelector('[data-person-id="charlie"] .oe-person__tab-grip'))
  await window.__testInput('Input.drag', { from, to, via: [to] })
  await pause(30)
  equal(events, [{ type: 'dragstart', trusted: true, id: 'alpha' }, { type: 'drop', trusted: true, id: 'charlie' }])
  const reordered = structuredClone(edited)
  reordered[1].data.persons = [edited[1].data.persons[1], edited[1].data.persons[2], edited[1].data.persons[0]]
  equal(editor.save().blocks, reordered, 'Native tab drag changed profiles beyond their order')
  equal(wrapper().querySelector('.oe-person__bio'), bio, 'Reordering tabs detached the active biography')
  equal(wrapper().querySelector('.oe-person__name'), name)
  equal(wrapper().querySelector('.oe-person__link-url'), link)
  equal([...wrapper().querySelectorAll('[data-inline-plugin][data-id]')], inline, 'Tab order must retain active widget occurrences')
  assert(wrapper().contains(document.activeElement), 'Native tab drop left keyboard history outside Person')
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, edited, 'First keyboard Undo must restore the original card order')
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, original, 'Second keyboard Undo must restore the original biography')
  bioCaret(wrapper(), widgets ? 23 : 16)
  equal(editor.canUndo, false)
  await dispatchKey('z', 'KeyZ', 90, 2 | 8)
  equal(editor.save().blocks, edited)
  bioCaret(wrapper(), widgets ? 24 : 17)
  await dispatchKey('z', 'KeyZ', 90, 2 | 8)
  equal(editor.save().blocks, reordered)
  equal(editor.canRedo, false)
  equal(original, caller)
  equal(providerCalls(), 0)
})

test('Person card add and native name role biography and URL edits replay independently without changing hidden widgets', async () => {
  const original = records(true), caller = structuredClone(original)
  const { editor, providerCalls } = fixture(original)
  const wrapper = () => blockElement(editor, 'person').querySelector('.oe-person')
  await clickNative(wrapper().querySelector('.oe-person__tab-add'))
  const created = editor.save().blocks[1].data.persons.at(-1)
  assert(typeof created.id === 'string' && created.id.length > 0 && !['alpha', 'bravo', 'charlie'].includes(created.id), 'Adding a profile must allocate a distinct stable ID')
  const added = structuredClone(original)
  added[1].data.persons.push({ id: created.id, name: '', role: '', bio: '', avatar: '', links: [] })
  equal(editor.save().blocks, added, 'Adding a draft changed the existing profiles or inline sidecars')
  const states = [original, added]
  for (const [key, text] of [['name', 'N'], ['role', 'R'], ['bio', 'B']]) {
    const field = wrapper().querySelector('.oe-person__' + key)
    await clickNative(field)
    await printable(text)
    const next = structuredClone(states.at(-1))
    next[1].data.persons.at(-1)[key] = text
    equal(editor.save().blocks, next, `Editing the new ${key} altered a hidden profile`)
    states.push(next)
  }
  await clickNative(wrapper().querySelector('.oe-person__link-add'))
  const linkId = editor.save().blocks[1].data.persons.at(-1).links[0]?.id
  assert(typeof linkId === 'string' && linkId.length > 0)
  const linked = structuredClone(states.at(-1))
  linked[1].data.persons.at(-1).links.push({ id: linkId, type: 'website', url: '' })
  equal(editor.save().blocks, linked)
  states.push(linked)
  const input = wrapper().querySelector('.oe-person__link-url')
  await clickNative(input)
  for (const character of 'https://example.com/new') await printable(character)
  const completed = structuredClone(linked)
  completed[1].data.persons.at(-1).links[0].url = 'https://example.com/new'
  equal(editor.save().blocks, completed)
  states.push(completed)
  for (let index = states.length - 2; index >= 0; index--) {
    await dispatchKey('z', 'KeyZ', 90, 2)
    equal(editor.save().blocks, states[index], `Keyboard Undo did not restore card action ${index}`)
  }
  equal(editor.canUndo, false)
  for (let index = 1; index < states.length; index++) {
    await dispatchKey('z', 'KeyZ', 90, 2 | 8)
    equal(editor.save().blocks, states[index], `Keyboard Redo did not restore card action ${index}`)
  }
  equal(editor.canRedo, false)
  equal(original, caller)
  equal(providerCalls(), 0)
})

test('Person card hidden URL focus succeeds on its first request after native biography input without a history step', async () => {
  const original = records(true), caller = structuredClone(original)
  const { editor, providerCalls } = fixture(original)
  const wrapper = () => blockElement(editor, 'person').querySelector('.oe-person')
  await clickNative(wrapper().querySelector('.oe-person__bio'))
  await dispatchKey('End', 'End', 35)
  await printable('X')
  const edited = structuredClone(original)
  edited[1].data.persons[0].bio += 'X'
  equal(editor.save().blocks, edited)
  const focusEvents = []
  editor.on('currentBlock:changed', event => focusEvents.push(event.currentId))
  const accepted = editor.blocks.focus('person', { fieldKey: 'person:bravo:link:bravo-site:url', offset: 'end' })
  equal(accepted, true, 'The first keyed focus request must reveal and focus the hidden URL field')
  const input = wrapper().querySelector('.oe-person__link-url')
  equal(input.value, 'https://example.com/bravo')
  equal(document.activeElement, input)
  equal([input.selectionStart, input.selectionEnd], [25, 25])
  equal(editor.save().blocks, edited, 'Revealing the hidden URL changed pending author data')
  equal(focusEvents.length, 0, 'Revealing a field in the same Person created a current-block transition')
  await printable('Y')
  const linked = structuredClone(edited)
  linked[1].data.persons[1].links[0].url += 'Y'
  equal(editor.save().blocks, linked)
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, edited)
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, original, 'The focus request created an extra history action')
  equal(editor.canUndo, false)
  await dispatchKey('z', 'KeyZ', 90, 2 | 8)
  equal(editor.save().blocks, edited)
  await dispatchKey('z', 'KeyZ', 90, 2 | 8)
  equal(editor.save().blocks, linked)
  equal(editor.canRedo, false)
  assert(editor.blocks.focus('before', { offset: 'end' }))
  equal(focusEvents, ['before'], 'The current-block observer must detect an actual transition')
  equal(original, caller)
  equal(providerCalls(), 0)
})
