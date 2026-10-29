import { createPersonPlugin } from '../../../plugins/person/index.js'
import { test, make, blockElement, assert, equal, pause, expectError } from './harness.js'
import { clickNative, dispatchKey, waitForStyles } from '../native-input-helpers.js'

for (const adopted of ['none', 'wrapper', 'icon']) test(`Person URL owner ${adopted === 'wrapper' ? 'does not update the foreign social icon after whole-wrapper adoption' : adopted === 'icon' ? 'keeps the source URL editable when only its auxiliary icon is adopted' : 'updates its current social icon after trusted provider change'}`, async () => {
  const definition = createPersonPlugin(), initialUrl = 'https://example.com/ada', nextUrl = 'https://github.com/ada'
  const editor = make([{ id: 'person', type: definition.type, dataVersion: definition.schema.currentVersion,
    data: { persons: [{ id: 'ada', name: 'Ada', role: '', bio: '', avatar: '', links: [
      { id: 'profile', type: 'website', url: initialUrl },
    ] }] } }], { defaultBlock: definition.type, plugins: [definition], injectStyles: true, inlineTools: [] })
  await waitForStyles(document)
  const block = blockElement(editor, 'person'), wrapper = block.querySelector('.oe-person')
  const input = wrapper.querySelector('.oe-person__link-url'), icon = input.parentNode.querySelector('.oe-person__link-icon')
  const before = editor.save().blocks, beforeIcon = icon.innerHTML, inputs = [], commits = []
  const foreign = document.createElement('aside'), parent = wrapper.parentNode, next = wrapper.nextSibling
  foreign.className = 'oe-editor'; foreign.style.cssText = 'padding:20px;min-height:100px'
  editor.on('transaction:committed', event => commits.push(event))
  input.addEventListener('input', event => inputs.push({ trusted: event.isTrusted, type: event.inputType, value: input.value }))
  if (adopted !== 'none') {
    document.body.append(foreign); foreign.append(adopted === 'wrapper' ? wrapper : icon)
    icon.textContent = 'Foreign social icon sentinel'
  }
  try {
    await clickNative(input)
    await dispatchKey('a', 'KeyA', 65, 2)
    await window.__testInput('Input.insertText', { text: nextUrl })
    await pause(20)
    equal(inputs, [{ trusted: true, type: 'insertText', value: nextUrl }])
    equal(input.value, nextUrl, 'The browser must actually edit the URL control')
    if (adopted === 'wrapper') {
      equal(editor.save().blocks, before); equal(commits, [])
      assert(!editor.canUndo && !editor.canRedo)
      assert(wrapper.parentNode === foreign && icon.parentNode === input.parentNode)
      equal(icon.textContent, 'Foreign social icon sentinel', 'The retained URL listener wrote into a foreign auxiliary view')
      assert(!icon.querySelector('svg'))
    } else {
      const after = structuredClone(before)
      after[0].data.persons[0].links[0] = { id: 'profile', type: 'github', url: nextUrl }
      equal(editor.save().blocks, after); equal(commits.length, 1)
      if (adopted === 'icon') {
        equal(icon.textContent, 'Foreign social icon sentinel')
        assert(icon.parentNode === foreign)
      } else assert(icon.querySelector('svg') && icon.innerHTML !== beforeIcon, 'A genuine provider change must update the owned icon')
      assert(document.activeElement === input && block.querySelector('.oe-person__link-url') === input)
      await window.__testInput('Input.insertText', { text: 'x' }); await pause(20)
      after[0].data.persons[0].links[0].url += 'x'
      equal(editor.save().blocks, after); equal(commits.length, 2)
      equal(inputs.at(-1), { trusted: true, type: 'insertText', value: nextUrl + 'x' })
      await dispatchKey('z', 'KeyZ', 90, 2)
      equal(editor.save().blocks, before); assert(!editor.canUndo && editor.canRedo)
      await dispatchKey('z', 'KeyZ', 90, 2 | 8)
      equal(editor.save().blocks, after); assert(editor.canUndo && !editor.canRedo)
    }
  } finally {
    if (adopted === 'wrapper') parent.insertBefore(wrapper, next)
    foreign.remove()
  }
})

for (const shell of [false, true]) for (const operation of ['flush', 'mode']) test(`Person URL owner preserves an adopted ${shell ? 'shell' : 'wrapper'} icon and control during a later ${operation}`, async () => {
  const base = createPersonPlugin(), captured = []
  const definition = { ...base, setup(runtimeContext) {
    const runtime = base.setup(runtimeContext)
    return { ...runtime, create(data, context) {
      const instance = runtime.create(data, context)
      captured.push({ instance, context })
      return instance
    } }
  } }
  const editor = make([{ id: 'person', type: definition.type, dataVersion: definition.schema.currentVersion,
    data: { persons: [{ id: 'ada', name: 'Ada', role: '', bio: '', avatar: '', links: [
      { id: 'profile', type: 'website', url: 'https://example.com/ada' },
    ] }] } }], { defaultBlock: definition.type, plugins: [definition], injectStyles: true, inlineTools: [] })
  await waitForStyles(document)
  const original = captured[0], wrapper = original.instance.element, foreign = document.createElement('aside')
  const input = wrapper.querySelector('.oe-person__link-url'), icon = input.parentNode.querySelector('.oe-person__link-icon')
  const before = editor.save().blocks, commits = []
  editor.on('transaction:committed', event => commits.push(event))
  const moved = shell ? wrapper.parentNode : wrapper
  document.body.append(foreign); foreign.append(moved)
  input.value = 'https://github.com/ada'; icon.textContent = 'Foreign social icon sentinel'
  try {
    let failed = false
    try {
      if (operation === 'flush') original.context.commitDomMutation(() => {})
      else editor.setReadOnly(true)
    } catch { failed = true }
    assert(failed, 'A read/control attempt must reject its adopted author view')
    equal(editor.save().blocks, before); equal(commits, [])
    equal(icon.textContent, 'Foreign social icon sentinel', 'A later read/control attempt refreshed a foreign auxiliary icon')
    assert(moved.parentNode === foreign && wrapper.querySelector('.oe-person__link-url') === input,
      'Read/control recovery removed the adopted control')
    assert(original.context.signal.aborted, 'The failed old occurrence must retire')
  } finally { foreign.remove() }
})

for (const shell of [false, true]) test(`Person URL owner rejects a social resolver that adopts its ${shell ? 'whole shell' : 'wrapper'} before auxiliary assignment`, async () => {
  let armed = false, transfers = 0, wrapper, input, icon, moved
  const foreign = document.createElement('aside')
  document.body.append(foreign)
  const definition = createPersonPlugin({ socialResolvers: [{
    test(url) {
      if (armed && url === 'https://github.com/ada') {
        armed = false; transfers++
        moved = shell ? wrapper.parentNode : wrapper
        foreign.append(moved)
        icon.textContent = 'Resolver foreign icon sentinel'
      }
      return false
    }, type: 'website',
  }] })
  const editor = make([{ id: 'person', type: definition.type, dataVersion: definition.schema.currentVersion,
    data: { persons: [{ id: 'ada', name: 'Ada', role: '', bio: '', avatar: '', links: [
      { id: 'profile', type: 'website', url: 'https://example.com/ada' },
    ] }] } }], { defaultBlock: definition.type, plugins: [definition], injectStyles: true, inlineTools: [] })
  await waitForStyles(document)
  wrapper = blockElement(editor, 'person').querySelector('.oe-person')
  input = wrapper.querySelector('.oe-person__link-url'); icon = input.parentNode.querySelector('.oe-person__link-icon')
  const before = editor.save().blocks, events = [], commits = []
  input.addEventListener('input', event => events.push(event.isTrusted))
  editor.on('transaction:committed', event => commits.push(event))
  try {
    await clickNative(input); await dispatchKey('a', 'KeyA', 65, 2)
    armed = true
    expectError(/ownership|owning block|accepted owner|not mounted/)
    await window.__testInput('Input.insertText', { text: 'https://github.com/ada' })
    await pause(20)
    equal(events, [true]); equal(transfers, 1)
    equal(icon.textContent, 'Resolver foreign icon sentinel', 'The resolver transferred ownership before the icon write')
    assert(moved.parentNode === foreign && wrapper.querySelector('.oe-person__link-url') === input,
      'Failed read recovery reclaimed the resolver-adopted view')
    equal(editor.save().blocks, before); equal(commits, [])
    assert(!editor.canUndo && !editor.canRedo)
  } finally { foreign.remove() }
})

test('Person URL owner keeps a healthy name editable after one URL control is adopted', async () => {
  const definition = createPersonPlugin()
  const editor = make([{ id: 'person', type: definition.type, dataVersion: definition.schema.currentVersion,
    data: { persons: [{ id: 'ada', name: 'Ada', role: '', bio: '', avatar: '', links: [
      { id: 'profile', type: 'website', url: 'https://example.com/ada' },
    ] }] } }], { defaultBlock: definition.type, plugins: [definition], injectStyles: true, inlineTools: [] })
  await waitForStyles(document)
  const wrapper = blockElement(editor, 'person').querySelector('.oe-person')
  const input = wrapper.querySelector('.oe-person__link-url'), name = wrapper.querySelector('.oe-person__name')
  const icon = input.parentNode.querySelector('.oe-person__link-icon'), foreign = document.createElement('aside')
  const before = editor.save().blocks, events = [], commits = []
  document.body.append(foreign); foreign.append(input, icon)
  input.value = 'https://github.com/foreign'; icon.textContent = 'Foreign URL icon sentinel'
  name.addEventListener('input', event => events.push(event.isTrusted))
  editor.on('transaction:committed', event => commits.push(event))
  try {
    await clickNative(name); await dispatchKey('End', 'End', 35)
    await window.__testInput('Input.insertText', { text: 'X' }); await pause(20)
    equal(events, [true])
    const after = structuredClone(before); after[0].data.persons[0].name = 'AdaX'
    equal(editor.save().blocks, after, 'A healthy name edit must preserve the missing URL control canonical data')
    equal(wrapper.querySelector('.oe-person__tab-label').textContent, 'AdaX')
    assert(wrapper.querySelector('.oe-person__name') === name && document.activeElement === name)
    equal(commits.length, 1)
    await dispatchKey('z', 'KeyZ', 90, 2)
    equal(editor.save().blocks, before); assert(!editor.canUndo && editor.canRedo)
    assert(input.parentNode === foreign && icon.parentNode === foreign)
    equal(input.value, 'https://github.com/foreign'); equal(icon.textContent, 'Foreign URL icon sentinel')
  } finally { foreign.remove() }
})
