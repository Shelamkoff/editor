// Bounded observational comparison of literal Person card actions.
// Input envelopes adapt only documented v1/v2 data shapes; expectations are
// fixed author records, never an initial editor.save() result.
export const personCardCases = ['remove', 'reorder', 'add'].map(action => ({ id: 'PERSON_CARDS/literal-' + action, action }))
const clone = value => JSON.parse(JSON.stringify(value))
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value
const pause = (ms = 20) => new Promise(resolve => setTimeout(resolve, ms))
const ids = ['alpha', 'bravo', 'charlie']
const names = ['Alpha', 'Bravo', 'Charlie']
const roles = ['Owner', 'Editor', 'Author']
const bios = ['First biography', 'Second biography', 'Third biography']

export async function runPersonCardCase(specification, { sourceBase, legacy = false, input }) {
  const base = new URL(sourceBase, import.meta.url)
  const [{ createEditor }, person, paragraph] = await Promise.all([
    import(new URL('core/index.js', base).href), import(new URL('plugins/person/index.js', base).href),
    import(new URL('plugins/paragraph/index.js', base).href),
  ])
  const record = (id, type, data) => ({ id, type, ...(!legacy ? { dataVersion: 2 } : {}), data })
  const profile = (index, edited) => ({ ...(!legacy ? { id: ids[index] } : {}), name: names[index], role: roles[index],
    bio: bios[index] + (edited && index === 1 ? 'X' : ''), avatar: '',
    links: [{ ...(!legacy ? { id: ids[index] + '-site' } : {}), type: 'website', url: 'https://example.com/' + ids[index] }],
  })
  const expected = (order = [0, 1, 2], edited = false, addedId = null) => [
    record('before', 'paragraph', { text: 'Before' }),
    record('person', 'person', { persons: [...order.map(index => profile(index, edited)), ...(addedId === null ? [] : [{
      ...(!legacy ? { id: addedId } : {}), name: '', role: '', bio: '', avatar: '', links: [],
    }])] }),
    record('after', 'paragraph', { text: 'After' }),
  ]
  const original = { version: legacy ? '1.0.5' : '2.0.0', blocks: clone(expected()) }
  const originalBytes = JSON.stringify(original)
  const holder = document.createElement('section')
  holder.style.width = '920px'
  document.body.append(holder)
  let editor, phase = 'create'
  const observations = [], phases = [], events = []
  const check = (property, actual, wanted) => observations.push({ phase, property, actual, expected: wanted,
    status: JSON.stringify(stable(actual)) === JSON.stringify(stable(wanted)) ? 'PASS' : 'FAIL' })
  const capture = event => events.push({ phase, type: event.type, trusted: event.isTrusted,
    key: event.key ?? null, className: event.target.className ?? null,
    personId: event.target.closest?.('[data-person-id]')?.dataset.personId ?? null,
    inside: holder.contains(event.target), active: document.activeElement?.className ?? null })
  for (const type of ['click', 'input', 'dragstart', 'drop', 'keydown']) document.addEventListener(type, capture, true)
  const wrapper = () => holder.querySelector('.oe-person')
  const tabs = () => [...wrapper().querySelectorAll('div.oe-person__tab')]
  const settled = async () => {
    const deadline = Date.now() + 10000
    while ([...document.querySelectorAll('link[rel="stylesheet"]')].some(link => !link.disabled && !link.sheet)) {
      if (Date.now() > deadline) throw new Error('Person styles failed to load')
      await pause()
    }
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    await pause()
  }
  const point = element => {
    if (!(element instanceof HTMLElement)) throw new Error('Person native target is missing')
    const rect = element.getBoundingClientRect()
    if (!rect.width || !rect.height) throw new Error('Person native target is not visible')
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  }
  const click = async element => { element.scrollIntoView({ block: 'nearest' }); await settled(); await input('click', point(element)); await settled() }
  const inspect = async (name, wanted, canUndo, canRedo) => {
    phase = name; await settled()
    const blocks = editor.save().blocks
    check('canonicalRecords', blocks, wanted)
    check('history', { canUndo: editor.canUndo, canRedo: editor.canRedo }, { canUndo, canRedo })
    check('callerInputUnchanged', JSON.stringify(original), originalBytes)
    phases.push({ phase, blocks, canUndo: editor.canUndo, canRedo: editor.canRedo,
      active: { inside: wrapper().contains(document.activeElement), tag: document.activeElement?.tagName,
        className: document.activeElement?.className ?? null },
      tabs: tabs().map(tab => tab.querySelector('.oe-person__tab-label')?.textContent),
      author: ['name', 'role', 'bio'].map(field => wrapper().querySelector('.oe-person__' + field)?.innerHTML),
    })
  }
  try {
    editor = createEditor({ holder, injectStyles: true, defaultBlock: 'paragraph', data: original, inlineTools: [],
      plugins: legacy ? [new paragraph.Paragraph(), new person.Person()] : [paragraph.createParagraphPlugin(), person.createPersonPlugin()],
    })
    await inspect('load', expected(), false, false)
    phase = 'edit'
    await click(tabs()[1].querySelector(legacy ? '.oe-person__tab-label' : '.oe-person__tab-select'))
    await click(wrapper().querySelector('.oe-person__bio'))
    await input('end')
    await input('type', 'X')
    await inspect('edit', expected([0, 1, 2], true), true, false)
    check('trustedInput', events.filter(event => event.phase === 'edit' && event.type === 'input').map(event => event.trusted), [true])
    phase = specification.action
    let order = [0, 1, 2], addedId = null
    if (specification.action === 'remove') {
      await click(tabs()[1].querySelector('.oe-person__tab-remove'))
      order = [0, 2]
    } else if (specification.action === 'reorder') {
      await input('drag', { from: point(tabs()[0].querySelector('.oe-person__tab-grip')), to: point(tabs()[2].querySelector('.oe-person__tab-grip')) })
      order = [1, 2, 0]
      check('trustedDrag', events.filter(event => event.phase === phase && ['dragstart', 'drop'].includes(event.type)).map(event => ({ type: event.type, trusted: event.trusted })),
        [{ type: 'dragstart', trusted: true }, { type: 'drop', trusted: true }])
    } else {
      await click(wrapper().querySelector('.oe-person__tab-add'))
      addedId = legacy ? 'legacy-draft-without-id' : editor.save().blocks[1].data.persons.at(-1)?.id
      if (!legacy) check('allocatedIdentity', typeof addedId === 'string' && addedId.length > 0 && !ids.includes(addedId), true)
    }
    const changed = expected(order, true, addedId)
    await inspect(specification.action, changed, true, false)
    check('keyboardOwnerAfterAction', wrapper().contains(document.activeElement), true)
    for (const [name, action, wanted, canUndo, canRedo] of [
      ['undo-action', 'undo', expected([0, 1, 2], true), true, true], ['undo-edit', 'undo', expected(), false, true],
      ['redo-edit', 'redo', expected([0, 1, 2], true), true, true], ['redo-action', 'redo', changed, true, false],
    ]) {
      phase = name; await input(action); await inspect(name, wanted, canUndo, canRedo)
      check('trustedShortcut', events.filter(event => event.phase === name && event.type === 'keydown' && event.key?.toLowerCase() === 'z').map(event => event.trusted), [true])
    }
    phase = 'dispose'; editor.destroy(); check('released', holder.childElementCount, 0); phases.push({ phase })
  } catch (error) {
    observations.push({ phase, property: 'execution', status: 'ERROR', actual: error.stack ?? String(error) })
  } finally {
    editor?.destroy(); holder.remove()
    for (const type of ['click', 'input', 'dragstart', 'drop', 'keydown']) document.removeEventListener(type, capture, true)
  }
  return { ...specification, legacy, phases, observations, events, failures: observations.filter(entry => entry.status !== 'PASS') }
}
