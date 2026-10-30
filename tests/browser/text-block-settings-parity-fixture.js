// The expected documents below come from fixed authored records and the named
// user action. Adapters only translate the historical wire and control names.
const pause = (ms = 30) => new Promise(resolve => setTimeout(resolve, ms))
const clone = value => structuredClone(value)
const stable = value => Array.isArray(value) ? value.map(stable)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value
const same = (left, right) => JSON.stringify(stable(left)) === JSON.stringify(stable(right))

export const textBlockSettingsCases = [
  ...['settings', 'inline', 'toolbox'].flatMap(route => [2, 3, 4, 5, 6].map(level => ({
    id: `HEADING_LEVEL/${route}/h${level}`, type: 'heading', route, level,
    initial: level === 3 ? 4 : 3, backward: level % 2 === 1,
  }))),
  ...['settings', 'inline'].map(route => ({ id: `HEADING_LEVEL/${route}/no-op`, type: 'heading', route, level: 3, initial: 3, backward: true })),
  ...['unordered', 'ordered'].flatMap(initial => ['unordered', 'ordered'].map(style => ({
    id: `LIST_STYLE/${initial}/${style}`, type: 'list', route: 'settings', initial, style,
  }))),
]

function markup(html) {
  const template = document.createElement('template')
  template.innerHTML = html
  const visit = node => node.nodeType === Node.TEXT_NODE ? node.data : {
    tag: node.localName,
    attributes: Object.fromEntries([...node.attributes].map(attribute => [attribute.name, attribute.value]).sort(([a], [b]) => a.localeCompare(b))),
    children: [...node.childNodes].map(visit),
  }
  return [...template.content.childNodes].map(visit)
}

function authoredMarkup(element) {
  const copy = element.cloneNode(true)
  for (const widget of copy.querySelectorAll('[data-inline-plugin]')) widget.replaceWith(document.createTextNode(`{{${widget.dataset.id}}}`))
  return markup(copy.innerHTML)
}

function caret(field) {
  const selection = getSelection()
  const offset = (node, at) => {
    if (!node || !field.contains(node)) return null
    const range = document.createRange(); range.selectNodeContents(field); range.setEnd(node, at)
    const content = range.cloneContents()
    for (const widget of content.querySelectorAll('[data-inline-plugin]')) widget.replaceWith(document.createTextNode('\uFFFC'))
    return content.textContent.length
  }
  return { focused: document.activeElement === field, anchor: offset(selection.anchorNode, selection.anchorOffset),
    focus: offset(selection.focusNode, selection.focusOffset), collapsed: selection.isCollapsed }
}

async function settled() {
  const deadline = Date.now() + 10000
  while ([...document.querySelectorAll('link[rel="stylesheet"]')].some(link => !link.disabled && !link.sheet)) {
    if (Date.now() > deadline) throw new Error('Text-block styles did not load')
    await pause()
  }
  await pause()
}

export async function runTextBlockSettingsCase(specification, { sourceBase = '../../', legacy = false, native }) {
  if (legacy && specification.route === 'toolbox' && specification.level !== 2) {
    return { id: specification.id, unsupported: 'v1 exposes a single H2 toolbox entry; H2–H6 remain executable through its settings and inline controls.',
      observations: [], phases: [], completedPhases: [], trusted: [], error: null }
  }
  const base = new URL(sourceBase, import.meta.url)
  const [{ createEditor }, heading, list, { EditorRenderer }, mention, color] = await Promise.all([
    import(new URL('core/index.js', base).href), import(new URL('plugins/heading/index.js', base).href),
    import(new URL('plugins/list/index.js', base).href), import(new URL('renderer/index.js', base).href),
    import(new URL('inline-plugins/mention/index.js', base).href), import(new URL('inline-plugins/color.js', base).href),
  ])
  const definition = specification.type === 'heading'
    ? legacy ? new heading.Heading() : heading.createHeadingPlugin()
    : legacy ? new list.List() : list.createListPlugin()
  const holder = document.createElement('section'), output = document.createElement('section')
  holder.style.cssText = 'width:640px;margin:100px 80px 40px'
  output.style.cssText = 'width:640px;margin:40px 80px'
  document.body.append(holder, output)
  const originalTexts = ['<b>Alpha</b> {{mention}} {{swatch}} tail', '<i>Bravo &amp; tail</i>']
    .slice(0, specification.type === 'heading' ? 1 : 2)
  const originalItems = originalTexts.map((text, index) => ({ id: `item-${index}`, text }))
  const widget = (type, data) => ({ type, ...(!legacy ? { dataVersion: 1 } : {}), data })
  const inline = { mention: widget('mention', { id: 'ada', name: 'Ada' }), swatch: widget('color', { value: '#123456' }) }
  const input = { version: legacy ? '1.0.5' : '2.0.0', blocks: [{ id: 'subject', type: specification.type,
    ...(!legacy ? { dataVersion: definition.schema.currentVersion } : {}),
    data: specification.type === 'heading' ? { text: originalTexts[0], level: specification.initial }
      : { style: specification.initial, items: legacy ? clone(originalTexts) : clone(originalItems) }, inline: clone(inline) }] }
  const supplied = clone(input), observations = [], phases = [], trusted = [], transactions = [], completedPhases = [], pageErrors = []
  const check = (phase, property, actual, expected) => observations.push({ phase, property, actual, expected, status: same(actual, expected) ? 'PASS' : 'FAIL' })
  let editor, renderer, currentPhase = 'load', providers = 0, savedControl, retiredAlternative
  const captureError = event => pageErrors.push({ phase: currentPhase, message: event.message ?? String(event.reason),
    stack: (event.error ?? event.reason)?.stack ?? null })
  addEventListener('error', captureError)
  addEventListener('unhandledrejection', captureError)
  const logicalLength = 'Alpha \uFFFC \uFFFC tail'.length
  try {
    editor = createEditor({ holder, injectStyles: true, defaultBlock: specification.type, plugins: [definition], inlineTools: [], data: input,
      inlinePlugins: [mention.createMentionPlugin({ searchFunction: async () => { providers++; return [] } }), color.createColorSwatchPlugin()],
    })
    renderer = new EditorRenderer({ blockTypes: [specification.type], injectStyles: true,
      ...(legacy ? { inlinePlugins: [mention.createMentionWidget(), color.createColorSwatchPlugin()] }
        : { inlineRenderers: [mention.createMentionRenderer(), color.createColorSwatchRenderer()] }),
    })
    if (!legacy) editor.on('transaction:committed', event => transactions.push(event))
    holder.addEventListener('input', event => trusted.push({ phase: currentPhase, type: event.type, trusted: event.isTrusted, inputType: event.inputType }))
    await settled()
    const root = () => holder.querySelector('.oe-editor')
    const firstField = () => holder.querySelector(specification.type === 'heading' ? '.oe-heading' : '.oe-list__item')
    const initial = clone(editor.save().blocks)
    const focusEnd = () => {
      const field = firstField(); field.focus()
      const range = document.createRange(); range.selectNodeContents(field); range.collapse(false)
      getSelection().removeAllRanges(); getSelection().addRange(range)
    }
    const selectMiddle = () => {
      const field = firstField(); field.focus()
      const text = field.querySelector('b').firstChild
      getSelection().setBaseAndExtent(text, specification.backward ? 4 : 1, text, specification.backward ? 1 : 4)
    }
    const capture = (phase, texts, setting, history, count, added = false) => {
      currentPhase = phase
      const saved = editor.save(), block = saved.blocks[0]
      const actualTexts = specification.type === 'heading' ? [block.data.text] : block.data.items.map(item => legacy ? item : item.text)
      const tag = specification.type === 'heading' ? `H${setting}` : setting === 'ordered' ? 'OL' : 'UL'
      check(phase, 'canonicalTextAndMarks', actualTexts.map(markup), texts.map(markup))
      check(phase, 'setting', specification.type === 'heading' ? block.data.level : block.data.style, setting)
      check(phase, 'sidecars', block.inline, inline)
      check(phase, 'authorIdentity', [block.id, block.type], ['subject', specification.type])
      check(phase, 'documentLength', saved.blocks.length, added ? 2 : 1)
      if (!legacy && specification.type === 'list') check(phase, 'itemIds', block.data.items.map(item => item.id), ['item-0', 'item-1'])
      check(phase, 'editorTag', specification.type === 'heading' ? firstField().tagName : firstField().parentElement.tagName, tag)
      check(phase, 'editorFields', [...holder.querySelectorAll(specification.type === 'heading' ? '.oe-heading' : '.oe-list__item')].slice(0, texts.length).map(authoredMarkup), texts.map(markup))
      check(phase, 'realWidgets', [...firstField().querySelectorAll('[data-inline-plugin]')].map(node => node.textContent), ['@Ada', '#123456'])
      check(phase, 'history', { canUndo: editor.canUndo, canRedo: editor.canRedo }, history)
      check(phase, 'callerInput', input, supplied)
      check(phase, 'providerCalls', providers, 0)
      if (!legacy) check(phase, 'completedActions', transactions.length, count)
      renderer.renderTo(saved, output)
      const rendered = output.querySelector(specification.type === 'heading' ? 'h2,h3,h4,h5,h6' : 'ol,ul')
      check(phase, 'rendererTag', rendered?.tagName, tag)
      check(phase, 'rendererFields', (specification.type === 'heading' ? [rendered] : [...rendered.children]).map(authoredMarkup), texts.map(markup))
      if (added) {
        const addedBlock = saved.blocks[1], headings = [...holder.querySelectorAll('.oe-heading')], renderedHeadings = [...output.querySelectorAll('h2,h3,h4,h5,h6')]
        check(phase, 'toolboxData', { type: addedBlock.type, data: addedBlock.data }, { type: 'heading', data: { text: '', level: specification.level } })
        check(phase, 'toolboxUniqueId', typeof addedBlock.id === 'string' && addedBlock.id.length > 0 && addedBlock.id !== 'subject', true)
        check(phase, 'toolboxTags', [headings[1].tagName, renderedHeadings[1].tagName], [`H${specification.level}`, `H${specification.level}`])
      }
      phases.push({ phase, blocks: clone(saved.blocks), caret: caret(firstField()) }); completedPhases.push(phase)
    }
    const clicked = async element => {
      if (!element) throw new Error(`Missing ${specification.type} control during ${currentPhase}`)
      await settled(); element.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const rect = element.getBoundingClientRect(), x = rect.left + rect.width / 2, y = rect.top + rect.height / 2
      if (!rect.width || !rect.height || !element.contains(document.elementFromPoint(x, y))) throw new Error(`Unavailable control: ${element.outerHTML}`)
      const captureEvent = event => trusted.push({ phase: currentPhase, type: 'click', trusted: event.isTrusted, intendedControl: element.contains(event.target) })
      document.addEventListener('click', captureEvent, { capture: true, once: true })
      try { await native('click', { x, y }); await pause() }
      finally { document.removeEventListener('click', captureEvent, true) }
    }
    capture('load', originalTexts, specification.initial, { canUndo: false, canRedo: false }, 0)
    focusEnd(); await pause(); currentPhase = 'input'
    await native('type', 'X'); await pause()
    const typedTexts = [...originalTexts]; typedTexts[0] += 'X'
    capture('input', typedTexts, specification.initial, { canUndo: true, canRedo: false }, 1)
    const typed = clone(editor.save().blocks)
    check('input', 'nativeCaret', caret(firstField()), { focused: true, anchor: logicalLength + 1, focus: logicalLength + 1, collapsed: true })
    currentPhase = 'control'
    if (specification.route === 'inline') {
      selectMiddle(); await pause(100)
      await clicked(root().querySelector('.oe-inline-toolbar__level-select'))
      savedControl = [...root().querySelectorAll('.oe-inline-toolbar__level-dropdown [role^="menuitem"]')]
        .find(element => element.textContent.trim() === `Heading ${specification.level}`)
      retiredAlternative = [...root().querySelectorAll('.oe-inline-toolbar__level-dropdown [role^="menuitem"]')]
        .find(element => element.textContent.trim() === `Heading ${specification.level === 2 ? 3 : 2}`)
      await clicked(savedControl)
    } else if (specification.route === 'toolbox') {
      await clicked(root().querySelector('.oe-toolbar__btn:not(.oe-toolbar__drag)'))
      savedControl = [...root().querySelectorAll('.oe-toolbox__item')].find(element => element.querySelector('.oe-toolbox__label')?.textContent === 'Heading')
      await clicked(savedControl)
      if (!legacy) {
        savedControl = [...root().querySelectorAll('.oe-toolbox__item')].find(element => element.querySelector('.oe-toolbox__label')?.textContent === `Heading ${specification.level}`)
        await clicked(savedControl)
      }
    } else {
      await clicked(root().querySelector('.oe-toolbar__drag'))
      const label = specification.type === 'heading' ? `Heading ${specification.level}` : specification.style === 'ordered' ? 'Numbered List' : 'Bulleted List'
      savedControl = [...root().querySelectorAll('.oe-settings-menu [role^="menuitem"]')].find(element => element.querySelector('.oe-settings-menu__label')?.textContent === label)
      const alternativeLabel = specification.type === 'heading' ? `Heading ${specification.level === 2 ? 3 : 2}`
        : specification.style === 'ordered' ? 'Bulleted List' : 'Numbered List'
      retiredAlternative = [...root().querySelectorAll('.oe-settings-menu [role^="menuitem"]')]
        .find(element => element.querySelector('.oe-settings-menu__label')?.textContent === alternativeLabel)
      await clicked(savedControl)
    }
    const added = specification.route === 'toolbox'
    const nextSetting = added ? specification.initial : specification.type === 'heading' ? specification.level : specification.style
    const changes = added || nextSetting !== specification.initial
    capture('control', typedTexts, nextSetting, { canUndo: true, canRedo: false }, changes ? 2 : 1, added)
    const after = clone(editor.save().blocks)
    if (specification.route === 'inline') check('control', 'selectedRange', caret(firstField()), {
      focused: true, anchor: specification.backward ? 4 : 1, focus: specification.backward ? 1 : 4, collapsed: false,
    })
    if (added) check('control', 'toolboxCaret', caret(holder.querySelectorAll('.oe-heading')[1]), { focused: true, anchor: 0, focus: 0, collapsed: true })
    // A recorded menu caret is not silently repaired. The explicit refocus
    // below makes the separate input/action history proof available to v1 too.
    check('control', 'focusInsideEditor', root().contains(document.activeElement), true)
    focusEnd(); await pause(); currentPhase = 'undo-control'
    await native('undo'); await pause()
    if (changes) {
      capture('undo-control', typedTexts, specification.initial, { canUndo: true, canRedo: true }, 3)
      check('undo-control', 'exactTypedRecords', editor.save().blocks, typed)
      await native('undo'); await pause()
    }
    capture('undo-input', originalTexts, specification.initial, { canUndo: false, canRedo: true }, changes ? 4 : 2)
    check('undo-input', 'exactInitialRecords', editor.save().blocks, initial)
    check('undo-input', 'nativeCaret', caret(firstField()), { focused: true, anchor: logicalLength, focus: logicalLength, collapsed: true })
    await native('redo'); await pause()
    capture('redo-input', typedTexts, specification.initial, { canUndo: true, canRedo: changes }, changes ? 5 : 3)
    check('redo-input', 'nativeCaret', caret(firstField()), { focused: true, anchor: logicalLength + 1, focus: logicalLength + 1, collapsed: true })
    if (changes) {
      await native('redo'); await pause()
      capture('redo-control', typedTexts, nextSetting, { canUndo: true, canRedo: false }, 6, added)
      check('redo-control', 'exactFinalRecords', editor.save().blocks, after)
      if (specification.route === 'inline') check('redo-control', 'selectedRange', caret(firstField()), {
        focused: true, anchor: specification.backward ? 4 : 1, focus: specification.backward ? 1 : 4, collapsed: false,
      })
    }
    currentPhase = 'retired-control'
    // A stale choice of the already active setting could be an accidental
    // no-op. Choose the opposite setting so an unauthorized action is visible.
    const stale = added ? savedControl : retiredAlternative
    if (!stale) throw new Error('Missing decisive alternate control')
    editor.setReadOnly(true); await pause(); stale.click(); await pause()
    check('retired-control', 'readOnlyUnchanged', editor.save().blocks, after)
    editor.setReadOnly(false); await pause(); stale.click(); await pause()
    check('retired-control', 'canonicalUnchanged', editor.save().blocks, after)
    check('retired-control', 'historyUnchanged', { canUndo: editor.canUndo, canRedo: editor.canRedo }, { canUndo: true, canRedo: false })
    if (!legacy) check('retired-control', 'noCompletedAction', transactions.length, changes ? 6 : 3)
    completedPhases.push('retired-control')
    check('execution', 'completedPhases', completedPhases, ['load', 'input', 'control',
      ...(changes ? ['undo-control'] : []), 'undo-input', 'redo-input', ...(changes ? ['redo-control'] : []), 'retired-control'])
    check('gestures', 'trustedInput', trusted.some(event => event.type === 'input' && event.inputType === 'insertText' && event.trusted), true)
    const clicks = trusted.filter(event => event.type === 'click')
    check('gestures', 'trustedClicks', clicks.map(event => [event.trusted, event.intendedControl]), Array.from({ length: added && !legacy ? 3 : 2 }, () => [true, true]))
    check('cleanup', 'providerCalls', providers, 0)
    return { id: specification.id, observations, phases, completedPhases, trusted, pageErrors, error: null }
  } catch (error) {
    return { id: specification.id, observations, phases, completedPhases, trusted, pageErrors, error: error.stack ?? String(error) }
  } finally {
    renderer?.destroy(); editor?.destroy(); holder.remove(); output.remove()
    removeEventListener('error', captureError)
    removeEventListener('unhandledrejection', captureError)
  }
}
