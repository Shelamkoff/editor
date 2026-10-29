import { createImagePlugin, createPersonPlugin } from '../../../plugins/index.js'
import { test, make, blockElement, assert, equal, pause } from './harness.js'
import { clickNative, dispatchKey, waitForStyles } from '../native-input-helpers.js'
import { pixel } from '../plugin-parity-fixtures.js'

const fixtures = [
  {
    name: 'Image', definition: createImagePlugin(), wrapper: '.oe-image', field: '.oe-image__caption',
    target: '.oe-image__image', read: element => element.alt, write: (element, value) => { element.alt = value },
    data: { file: { url: pixel }, caption: 'Original', styles: { width: '320px' } },
    changed: data => ({ ...data, caption: 'OriginalX' }),
  },
  {
    name: 'Person', definition: createPersonPlugin(), wrapper: '.oe-person', field: '.oe-person__name',
    target: '.oe-person__tab-label', read: element => element.textContent,
    write: (element, value) => { element.textContent = value },
    data: { persons: [{ id: 'profile', name: 'Original', role: '', bio: '', avatar: '', links: [] }] },
    changed: data => ({ ...data, persons: data.persons.map(person => ({ ...person, name: 'OriginalX' })) }),
  },
]

for (const fixture of fixtures) {
  async function mount() {
    const { definition } = fixture
    const editor = make([{ id: 'a', type: definition.type, dataVersion: definition.schema.currentVersion,
      data: { ...definition.schema.createDefault(), ...fixture.data } }],
    { defaultBlock: definition.type, plugins: [definition], injectStyles: true, inlineTools: [] })
    await waitForStyles(document)
    const view = () => {
      const block = blockElement(editor, 'a')
      return { wrapper: block.querySelector(fixture.wrapper), field: block.querySelector(fixture.field),
        target: block.querySelector(fixture.target) }
    }
    const mounted = view()
    assert(mounted.wrapper && mounted.field && mounted.target, 'The real plugin view must be present')
    equal(fixture.read(mounted.target), 'Original')
    return { editor, view }
  }

  test(`${fixture.name} derived owner settles trusted text input and exact Undo/Redo`, async () => {
    const { editor, view } = await mount(), before = editor.save().blocks, source = view()
    const commits = []
    editor.on('transaction:committed', event => commits.push(event))
    let trusted = 0
    source.field.addEventListener('input', event => { if (event.isTrusted) trusted++ })
    await clickNative(source.field)
    await dispatchKey('End', 'End', 35)
    await window.__testInput('Input.insertText', { text: 'X' })
    await pause(20)
    const after = [{ ...before[0], data: fixture.changed(before[0].data) }]
    equal(trusted, 1, 'The scenario must use one trusted browser input')
    equal(editor.save().blocks, after)
    equal(view().field, source.field, 'A native text edit replaced its author host')
    equal(fixture.read(view().target), 'OriginalX', 'Accepted native text did not settle its derived presentation')
    equal(commits.length, 1)
    assert(editor.canUndo && !editor.canRedo)
    await dispatchKey('z', 'KeyZ', 90, 2)
    equal(editor.save().blocks, before)
    equal(fixture.read(view().target), 'Original')
    assert(!editor.canUndo && editor.canRedo)
    await dispatchKey('z', 'KeyZ', 90, 2 | 8)
    equal(editor.save().blocks, after)
    equal(fixture.read(view().target), 'OriginalX')
    equal(commits.length, 3, 'Derived presentation introduced extra history actions')
  })

  test(`${fixture.name} derived owner rejects trusted input after its entire view is adopted outside the editor`, async () => {
    const { editor, view } = await mount(), before = editor.save().blocks, source = view()
    const parent = source.wrapper.parentNode, next = source.wrapper.nextSibling
    const foreign = document.createElement('aside'), commits = []
    foreign.className = 'oe-editor'
    foreign.style.cssText = 'padding:20px;min-height:100px'
    document.body.append(foreign)
    editor.on('transaction:committed', event => commits.push(event))
    let trusted = 0
    source.field.addEventListener('input', event => { if (event.isTrusted) trusted++ })
    fixture.write(source.target, 'Foreign owner sentinel')
    foreign.append(source.wrapper)
    try {
      await clickNative(source.field)
      await dispatchKey('End', 'End', 35)
      await window.__testInput('Input.insertText', { text: 'X' })
      await pause(20)
      equal(trusted, 1, 'The detached editor view did not receive genuine browser input')
      equal(source.field.textContent, 'OriginalX', 'The browser must edit the adopted foreign host')
      equal(editor.save().blocks, before, 'Foreign input changed the original document')
      assert(!editor.canUndo && commits.length === 0, 'Foreign input created editor history')
      equal(fixture.read(source.target), 'Foreign owner sentinel',
        'A plugin listener refreshed presentation in a view no longer owned by this editor')
    } finally {
      parent.insertBefore(source.wrapper, next)
      foreign.remove()
    }
  })
}
