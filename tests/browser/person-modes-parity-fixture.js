// Fixed authored Person records and real public focus/native controls. The v1
// adapter translates only wire spelling; missing keyed focus and persistent
// widget capabilities remain explicitly unavailable.
const clone = value => structuredClone(value)
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value
const same = (left, right) => JSON.stringify(stable(left)) === JSON.stringify(stable(right))
const pause = (ms = 25) => new Promise(resolve => setTimeout(resolve, ms))
const people = [
  { id: 'alpha', name: 'Alpha', role: 'Owner', bio: 'First biography', color: '#123456' },
  { id: 'bravo', name: 'Bravo', role: 'Editor', bio: 'Second biography', color: '#654321' },
  { id: 'charlie', name: 'Charlie', role: 'Writer', bio: 'Third biography', color: '#abcdef' },
]

export const personModeCases = [
  ...[false, true].flatMap(widgets => [0, 1].flatMap(start => ['name', 'role', 'bio', 'url'].map(field => ({
    id: `PERSON_HIDDEN_FOCUS/${widgets ? 'widgets' : 'literal'}/${start}/${field}`,
    kind: 'focus', widgets, start, target: start ? 0 : 1, field, backward: start === 1 && field !== 'url',
  })))),
  ...[0, 1].map(start => ({ id: `PERSON_HIDDEN_FOCUS/widgets/${start}/after-widget`, kind: 'focus', widgets: true,
    start, target: start ? 0 : 1, field: start ? 'role' : 'bio', backward: start === 1, afterWidget: true })),
  ...[0, 1].map(start => ({ id: `PERSON_HIDDEN_FOCUS/literal/${start}/numeric-url`, kind: 'focus', widgets: false,
    start, target: start ? 0 : 1, field: 'url', backward: false, numericUrl: true })),
  ...[false, true].flatMap(widgets => [false, true].map(initialReadOnly => ({
    id: `PERSON_READONLY_TABS/${widgets ? 'widgets' : 'literal'}/${initialReadOnly ? 'constructed-readonly' : 'mode-transition'}`,
    kind: 'readonly', widgets, initialReadOnly, keyboard: false,
  }))),
  ...[false, true].map(initialReadOnly => ({
    id: `PERSON_READONLY_TABS/keyboard/${initialReadOnly ? 'constructed-readonly' : 'mode-transition'}`,
    kind: 'readonly', widgets: false, initialReadOnly, keyboard: true,
  })),
  ...[0, 1].map(start => ({ id: `PERSON_PUBLIC_FOCUS_NATIVE_NAVIGATION/${start}`,
    kind: 'public-navigation', widgets: false, start, target: start ? 0 : 1, field: 'name', backward: false })),
]

function markup(html) {
  const template = document.createElement('template'); template.innerHTML = html
  const visit = node => node.nodeType === Node.TEXT_NODE ? node.data : {
    tag: node.localName, attributes: Object.fromEntries([...node.attributes].map(attribute => [attribute.name, attribute.value]).sort()),
    children: [...node.childNodes].map(visit),
  }
  return [...template.content.childNodes].map(visit)
}

function authorMarkup(element) {
  const copy = element.cloneNode(true)
  for (const widget of copy.querySelectorAll('[data-inline-plugin]')) widget.replaceWith(document.createTextNode(`{{${widget.getAttribute('data-id')}}}`))
  return markup(copy.innerHTML)
}

function logicalText(html) {
  const template = document.createElement('template'); template.innerHTML = html.replace(/\{\{[^}]+\}\}/g, '\uFFFC')
  for (const br of template.content.querySelectorAll('br')) br.replaceWith(document.createTextNode('\n'))
  return template.content.textContent
}

function selection(field) {
  if (field instanceof HTMLInputElement) return { focused: document.activeElement === field,
    anchor: field.selectionDirection === 'backward' ? field.selectionEnd : field.selectionStart,
    focus: field.selectionDirection === 'backward' ? field.selectionStart : field.selectionEnd,
    collapsed: field.selectionStart === field.selectionEnd }
  const range = getSelection()
  const point = (node, offset) => {
    if (!node || !(node === field || field.contains(node))) return null
    const part = document.createRange(); part.selectNodeContents(field); part.setEnd(node, offset)
    const content = part.cloneContents()
    for (const widget of content.querySelectorAll('[data-inline-plugin]')) widget.replaceWith(document.createTextNode('\uFFFC'))
    for (const br of content.querySelectorAll('br')) br.replaceWith(document.createTextNode('\n'))
    return content.textContent.length
  }
  return { focused: document.activeElement === field, anchor: point(range.anchorNode, range.anchorOffset),
    focus: point(range.focusNode, range.focusOffset), collapsed: range.isCollapsed }
}

async function settled() {
  const deadline = Date.now() + 10000
  while ([...document.querySelectorAll('link[rel="stylesheet"]')].some(link => !link.disabled && !link.sheet)) {
    if (Date.now() > deadline) throw new Error('Person styles did not load')
    await pause()
  }
  await pause()
}

export async function runPersonModeCase(spec, { sourceBase = '../../', legacy = false, native }) {
  let unsupported
  if (legacy && spec.kind === 'focus') unsupported = 'v1 exposes public block.focus(), but no keyed/numeric editor.blocks.focus command or boolean acknowledgment. Separate native-navigation controls execute its real surface.'
  else if (legacy && spec.widgets) unsupported = 'v1 Person has inlineTools=false and no mapTextFields declaration for persistent rich-field widgets. Literal read-only/tab controls execute separately.'
  else if (legacy && spec.keyboard) unsupported = 'v1 Person tabs are non-focusable div click targets without keyboard activation. Its real pointer tab controls execute separately.'
  if (unsupported) return { id: spec.id, spec: clone(spec), unsupported, observations: [], snapshots: [], trusted: [],
    plannedPhases: [], completedPhases: [], pageErrors: [], diagnostics: [], error: null }

  const base = new URL(sourceBase, import.meta.url)
  const [{ createEditor }, personModule, paragraphModule, mention, color] = await Promise.all([
    import(new URL('core/index.js', base).href), import(new URL('plugins/person/index.js', base).href),
    import(new URL('plugins/paragraph/index.js', base).href), import(new URL('inline-plugins/mention/index.js', base).href),
    import(new URL('inline-plugins/color.js', base).href),
  ])
  const personDefinition = legacy ? new personModule.Person() : personModule.createPersonPlugin()
  const paragraphDefinition = legacy ? new paragraphModule.Paragraph() : paragraphModule.createParagraphPlugin()
  const inline = {}
  const persons = people.map(({ id, name, role, bio, color: value }) => {
    if (spec.widgets) {
      inline[id + 'Name'] = { type: 'mention', dataVersion: 1, data: { id, name: name + ' Person' } }
      inline[id + 'Role'] = { type: 'color', dataVersion: 1, data: { value } }
      inline[id + 'Bio'] = { type: 'mention', dataVersion: 1, data: { id: id + '-bio', name: 'Author' } }
    }
    return { ...(!legacy ? { id } : {}), avatar: '', name: `<b>${name}</b>` + (spec.widgets ? ` <i>{{${id}Name}}</i> tail` : ''),
      role: `<i>${role}</i>` + (spec.widgets ? ` {{${id}Role}} tail` : ''),
      bio: `<mark>${bio}</mark>` + (spec.widgets ? ` {{${id}Bio}} tail` : ''),
      links: [{ ...(!legacy ? { id: id + '-site' } : {}), type: 'website', url: `https://example.com/${id}` }] }
  })
  const record = (id, type, data, definition) => ({ id, type, ...(!legacy ? { dataVersion: definition.schema.currentVersion } : {}), data })
  const original = [record('before', 'paragraph', { text: 'Before' }, paragraphDefinition),
    { ...record('profiles', 'person', { persons }, personDefinition), ...(spec.widgets ? { inline } : {}) },
    record('after', 'paragraph', { text: 'After' }, paragraphDefinition)]
  const supplied = { version: legacy ? '1.0.5' : '2.0.0', blocks: clone(original) }, caller = clone(supplied)
  const holder = document.createElement('section'); holder.style.cssText = 'width:780px;margin:60px 70px'; document.body.append(holder)
  const observations = [], snapshots = [], trusted = [], plannedPhases = [], completedPhases = [], pageErrors = [], diagnostics = [], transactions = []
  let editor, phase = 'load', providers = 0, currentEvents = []
  const check = (property, actual, expected) => observations.push({ phase, property, actual: clone(actual), expected: clone(expected), status: same(actual, expected) ? 'PASS' : 'FAIL' })
  const errorListener = event => pageErrors.push({ phase, message: event.message ?? String(event.reason), stack: (event.error ?? event.reason)?.stack ?? null })
  addEventListener('error', errorListener); addEventListener('unhandledrejection', errorListener)
  const root = () => holder.querySelector('.oe-person')
  const tabs = () => [...root().querySelectorAll('.oe-person__tab')].filter(tab => !tab.classList.contains('oe-person__tab-add'))
  const tabTarget = index => legacy ? tabs()[index] : tabs()[index].querySelector('.oe-person__tab-select')
  const activeIndex = () => tabs().findIndex(tab => tab.classList.contains('oe-person__tab--active'))
  const field = kind => root().querySelector(kind === 'url' ? '.oe-person__link-url' : '.oe-person__' + kind)
  const requestKey = (index, kind) => kind === 'url' ? `person:${people[index].id}:link:${people[index].id}-site:url` : `person:${people[index].id}:${kind}`
  const caretExpected = (anchor, focus = anchor) => ({ focused: true, anchor, focus, collapsed: anchor === focus })
  const nativeClick = async element => {
    if (!element) throw new Error('Expected Person control is missing')
    const received = []
    const observe = event => received.push({ trusted: event.isTrusted, inside: event.target === element || element.contains(event.target) })
    element.addEventListener('click', observe, { once: true })
    const rect = element.getBoundingClientRect()
    await native('click', { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }); await pause()
    element.removeEventListener('click', observe)
    check('nativeClick', received, [{ trusted: true, inside: true }]); trusted.push({ phase, kind: 'click', ...received[0] })
  }
  const clickTab = async (index, keyboard = false) => {
    const element = tabTarget(index)
    if (keyboard) {
      element.focus()
      const received = []
      const observe = event => received.push(event.isTrusted)
      element.addEventListener('click', observe, { once: true })
      await native('key', 'Enter'); await pause()
      element.removeEventListener('click', observe)
      check('nativeKeyboardActivation', received, [true]); trusted.push({ phase, kind: 'keyboard-tab', trusted: received[0] })
    } else await nativeClick(element)
  }
  const appendBio = (records, index, character) => {
    const next = clone(records), person = next[1].data.persons[index]
    person.bio = spec.widgets ? person.bio + character : person.bio.replace('</mark>', character + '</mark>')
    return next
  }
  const targetEdit = (records, index, kind, backward) => {
    const next = clone(records), person = next[1].data.persons[index]
    if (kind === 'url') person.links[0].url = spec.numericUrl
      ? person.links[0].url.slice(0, 22) + 'X' + person.links[0].url.slice(22) : person.links[0].url + 'X'
    else if (spec.afterWidget) person[kind] = person[kind].replace(' tail', backward ? ' tXil' : ' taXil')
    else {
      const text = people[index][kind], opening = kind === 'name' ? '<b>' : kind === 'role' ? '<i>' : '<mark>'
      const edited = backward ? text.slice(0, 1) + 'X' + text.slice(2) : text.slice(0, 2) + 'X' + text.slice(2)
      person[kind] = person[kind].replace(opening + text, opening + edited)
    }
    return next
  }
  const capture = (name, expected, active, history, count, selected = null) => {
    phase = name
    const actual = clone(editor.save().blocks)
    check('canonicalRecords', actual, expected)
    check('activeProfile', activeIndex(), active)
    check('history', [editor.canUndo, editor.canRedo], history)
    check('callerInput', supplied, caller)
    check('providerCalls', providers, 0)
    check('tabCount', tabs().length, 3)
    check('tabLabels', tabs().map(tab => tab.querySelector('.oe-person__tab-label').textContent),
      expected[1].data.persons.map((person, index) => spec.widgets
        ? logicalText(person.name).replace('\uFFFC', '@' + people[index].name + ' Person') : logicalText(person.name)))
    const expectedPerson = expected[1].data.persons[active]
    for (const kind of ['name', 'role', 'bio']) check(kind + 'Markup', authorMarkup(field(kind)), markup(expectedPerson[kind]))
    check('urlValue', field('url').value, expectedPerson.links[0].url)
    const widgets = [...root().querySelectorAll('[data-inline-plugin][data-id]')]
    check('visibleWidgets', widgets.map(widget => ({ id: widget.dataset.id, type: widget.dataset.inlinePlugin, text: widget.textContent })), spec.widgets ? [
      { id: people[active].id + 'Name', type: 'mention', text: '@' + people[active].name + ' Person' },
      { id: people[active].id + 'Role', type: 'color', text: people[active].color },
      { id: people[active].id + 'Bio', type: 'mention', text: '@Author' },
    ] : [])
    if (!legacy) {
      check('transactionCount', transactions.length, count)
      check('pressedTab', tabs().map(tab => tab.querySelector('button').getAttribute('aria-pressed')), people.map((_, index) => String(index === active)))
    }
    if (selected) check('selection', selection(field(selected.kind)), caretExpected(selected.anchor, selected.focus ?? selected.anchor))
    snapshots.push({ phase, actual, active: activeIndex(), selection: selected ? selection(field(selected.kind)) : null,
      transactions: clone(transactions), history: [editor.canUndo, editor.canRedo] })
    completedPhases.push(name)
  }
  try {
    editor = createEditor({ holder, injectStyles: true, data: supplied, readOnly: Boolean(spec.initialReadOnly),
      plugins: [paragraphDefinition, personDefinition], inlineTools: [],
      inlinePlugins: [mention.createMentionPlugin({ searchFunction: async () => { providers++; return [] } }), color.createColorSwatchPlugin()],
      onDiagnostic: value => diagnostics.push({ phase, code: value.code, message: value.message }),
    })
    if (!legacy) {
      editor.on('transaction:committed', event => transactions.push({ name: event.name, origin: event.origin }))
      editor.on('currentBlock:changed', event => currentEvents.push({ id: event.currentId, active: activeIndex() }))
    }
    holder.addEventListener('input', event => trusted.push({ phase, kind: 'input', trusted: event.isTrusted, inputType: event.inputType }))
    await settled()
    if (legacy) {
      check('keyedPublicFocusUnavailable', typeof editor.blocks.focus, 'undefined')
      check('persistentWidgetFieldsUnavailable', typeof personDefinition.mapTextFields, 'undefined')
      check('inlineToolsUnavailable', personDefinition.inlineTools, false)
    }
    plannedPhases.push('load')
    capture('load', original, 0, [false, false], 0)

    if (spec.kind !== 'readonly') {
      plannedPhases.push('prepared', 'preceding-input', 'focus', 'target-range', 'target-input', 'undo-target', 'undo-first', 'redo-first', 'redo-target')
      if (!legacy) plannedPhases.push('invalid-key')
      phase = 'prepared'
      if (spec.start) await clickTab(spec.start)
      capture('prepared', original, spec.start, [false, false], 0)
      phase = 'preceding-input'
      await nativeClick(field('bio')); await native('key', 'End'); await native('type', 'A'); await pause()
      const preceding = appendBio(original, spec.start, 'A')
      const bioEnd = logicalText(original[1].data.persons[spec.start].bio).length
      capture('preceding-input', preceding, spec.start, [true, false], 1, { kind: 'bio', anchor: bioEnd + 1 })
      phase = 'focus'; currentEvents = []
      const offset = spec.afterWidget ? logicalText(original[1].data.persons[spec.target][spec.field]).length - 2
        : spec.field === 'url' ? spec.numericUrl ? 22 : original[1].data.persons[spec.target].links[0].url.length : 2
      if (spec.kind === 'focus') {
        const accepted = editor.blocks.focus('profiles', { fieldKey: requestKey(spec.target, spec.field),
          offset: spec.field === 'url' && !spec.numericUrl ? 'end' : offset })
        check('firstRequestAccepted', accepted, true)
      } else {
        await clickTab(spec.target)
        if (legacy) editor.blocks.getBlockById('profiles').focus()
        else check('publicFocusAccepted', editor.blocks.focus('profiles'), true)
        await native('key', 'Home'); await native('key', 'ArrowRight'); await native('key', 'ArrowRight')
      }
      capture('focus', preceding, spec.target, [true, false], 1, { kind: spec.field, anchor: offset })
      if (!legacy) check('sameBlockCurrentEvents', currentEvents, [])
      phase = 'target-range'
      if (spec.backward) await native('key', 'Shift+ArrowLeft')
      capture('target-range', preceding, spec.target, [true, false], 1,
        { kind: spec.field, anchor: offset, focus: spec.backward ? offset - 1 : offset })
      phase = 'target-input'; await native('type', 'X'); await pause()
      const final = targetEdit(preceding, spec.target, spec.field, spec.backward)
      const finalOffset = offset + (spec.backward ? 0 : 1)
      capture('target-input', final, spec.target, [true, false], 2, { kind: spec.field, anchor: finalOffset })
      phase = 'undo-target'; await native('key', 'Control+z'); await pause()
      capture('undo-target', preceding, spec.target, [true, true], 3,
        { kind: spec.field, anchor: offset, focus: spec.backward ? offset - 1 : offset })
      phase = 'undo-first'; await native('key', 'Control+z'); await pause()
      capture('undo-first', original, spec.start, [false, true], 4, { kind: 'bio', anchor: bioEnd })
      phase = 'redo-first'; await native('key', 'Control+Shift+z'); await pause()
      capture('redo-first', preceding, spec.start, [true, true], 5, { kind: 'bio', anchor: bioEnd + 1 })
      phase = 'redo-target'; await native('key', 'Control+Shift+z'); await pause()
      capture('redo-target', final, spec.target, [true, false], 6, { kind: spec.field, anchor: finalOffset })
      if (!legacy) {
        phase = 'invalid-key'
        check('invalidHiddenKeyRejected', editor.blocks.focus('profiles', { fieldKey: 'person:missing:bio', offset: 2 }), false)
        capture('invalid-key', final, spec.target, [true, false], 6, { kind: spec.field, anchor: finalOffset })
      }
    } else {
      const browse = async (prefix, expected, history, count) => {
        for (const index of [1, 2, 0]) {
          const name = prefix + '-profile-' + index; plannedPhases.push(name); phase = name
          await clickTab(index, spec.keyboard)
          check('readonlyRichFields', ['name', 'role', 'bio'].map(kind => field(kind).isContentEditable), [false, false, false])
          check('readonlyUrl', field('url').readOnly, true)
          check('authorControlsAbsent', root().querySelectorAll('.oe-person__tab-add,.oe-person__tab-remove,.oe-person__link-add,.oe-person__link-remove,.oe-person__avatar-upload').length, 0)
          check('tabsNotDraggable', tabs().map(tab => tab.draggable), [false, false, false])
          for (const kind of ['name', 'url']) {
            await nativeClick(field(kind))
            const attempts = [], observe = event => attempts.push({ key: event.key, trusted: event.isTrusted })
            document.addEventListener('keydown', observe, true)
            try { await native('type', 'Z') } finally { document.removeEventListener('keydown', observe, true) }
            check('readonlyKeyAttempt:' + kind, attempts, [{ key: 'Z', trusted: true }])
          }
          await pause()
          check('readonlyInputEvents', trusted.filter(event => event.kind === 'input' && event.phase === name), [])
          capture(name, expected, index, history, count)
        }
      }
      if (spec.initialReadOnly) {
        await browse('initial-readonly', original, [false, false], 0)
        plannedPhases.push('initial-editable'); phase = 'initial-editable'; editor.setReadOnly(false); await pause()
        capture('initial-editable', original, 0, [false, false], 0)
      }
      plannedPhases.push('preceding-input', 'read-only', 'retired-readonly')
      phase = 'preceding-input'; await clickTab(1)
      await nativeClick(field('bio')); await native('key', 'End'); await native('type', 'A'); await pause()
      const preceding = appendBio(original, 1, 'A'), bioEnd = logicalText(original[1].data.persons[1].bio).length
      capture('preceding-input', preceding, 1, [true, false], 1, { kind: 'bio', anchor: bioEnd + 1 })
      const retired = [...root().querySelectorAll('.oe-person__tab-add,.oe-person__tab--add,.oe-person__tab-remove,.oe-person__link-add,.oe-person__link-remove')]
      check('decisiveRetiredControlsPresent', retired.length, legacy ? 5 : 6)
      phase = 'read-only'; editor.setReadOnly(true); await pause()
      capture('read-only', preceding, 1, [false, false], 1)
      phase = 'retired-readonly'; check('retiredControlsDetached', retired.map(button => button.isConnected), retired.map(() => false))
      retired.forEach(button => button.click()); await pause()
      capture('retired-readonly', preceding, 1, [false, false], 1)
      await browse('readonly', preceding, [false, false], 1)
      plannedPhases.push('editable-return', 'retired-editable', 'continued-input', 'undo-continuation', 'undo-first', 'redo-first', 'redo-continuation')
      phase = 'editable-return'; editor.setReadOnly(false); await pause()
      capture('editable-return', preceding, 0, [true, false], 1)
      check('editableRichFields', ['name', 'role', 'bio'].map(kind => field(kind).isContentEditable), [true, true, true])
      check('editableUrl', field('url').readOnly, false)
      phase = 'retired-editable'; check('retiredControlsDetached', retired.map(button => button.isConnected), retired.map(() => false))
      retired.forEach(button => button.click()); await pause()
      capture('retired-editable', preceding, 0, [true, false], 1)
      phase = 'continued-input'; await nativeClick(field('bio')); await native('key', 'End'); await native('type', 'X'); await pause()
      const final = appendBio(preceding, 0, 'X'), finalBioEnd = logicalText(original[1].data.persons[0].bio).length
      capture('continued-input', final, 0, [true, false], 2, { kind: 'bio', anchor: finalBioEnd + 1 })
      phase = 'undo-continuation'; await native('key', 'Control+z'); await pause()
      capture('undo-continuation', preceding, 0, [true, true], 3, { kind: 'bio', anchor: finalBioEnd })
      phase = 'undo-first'; await native('key', 'Control+z'); await pause()
      capture('undo-first', original, 1, [false, true], 4, { kind: 'bio', anchor: bioEnd })
      phase = 'redo-first'; await native('key', 'Control+Shift+z'); await pause()
      capture('redo-first', preceding, 1, [true, true], 5, { kind: 'bio', anchor: bioEnd + 1 })
      phase = 'redo-continuation'; await native('key', 'Control+Shift+z'); await pause()
      capture('redo-continuation', final, 0, [true, false], 6, { kind: 'bio', anchor: finalBioEnd + 1 })
    }
    phase = 'complete'
    check('completePhases', completedPhases, plannedPhases)
    check('trustedNativeEdits', trusted.filter(event => event.kind === 'input' && event.phase === 'preceding-input').map(event => event.trusted), [true])
    check('callerInput', supplied, caller)
    check('healthyDiagnostics', diagnostics, [])
    return { id: spec.id, spec: clone(spec), observations, snapshots, trusted, plannedPhases, completedPhases, pageErrors, diagnostics, error: null,
      unsupportedObservations: legacy ? ['v1 has no v2 transaction:committed observer; first keyed request and invalid keyed request are not substituted in native-navigation controls.'] : [] }
  } catch (error) {
    return { id: spec.id, spec: clone(spec), observations, snapshots, trusted, plannedPhases, completedPhases, pageErrors, diagnostics,
      error: { phase, message: error.message, stack: error.stack } }
  } finally {
    editor?.destroy(); holder.remove(); removeEventListener('error', errorListener); removeEventListener('unhandledrejection', errorListener)
  }
}
