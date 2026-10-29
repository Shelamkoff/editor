// Public-boundary ROUNDTRIP cases. Expected author data is fixed independently
// of the editor's initial save and translated only for the historical wire API.
const paragraph = {
  type: 'paragraph', version: 2, className: 'Paragraph',
  fieldSelector: '.oe-paragraph',
  defaultData: { text: '' },
  populatedData: { text: '<b>Alpha</b> <i>{{mention}}</i> <s>{{swatch}}</s> tail' },
}
const heading = {
  type: 'heading', version: 2, className: 'Heading',
  fieldSelector: '.oe-heading',
  defaultData: { text: '', level: 2 },
  populatedData: { text: '<b>Alpha</b> <i>{{mention}}</i> <s>{{swatch}}</s> tail', level: 3 },
}

export const blockRoundtripCases = [paragraph, heading].flatMap(block => {
  const prefix = 'BLOCK_' + block.type.toUpperCase() + '_ROUNDTRIP/'
  return [false, true].map(populated => ({
    ...block, populated, id: prefix + (populated ? 'populated' : 'default'),
  })).concat([{
    ...block, populated: true, id: prefix + 'populated-unwrapped-control',
    populatedData: { ...block.populatedData, text: '<b>Alpha</b> {{mention}} {{swatch}} tail' },
  }])
})

const pause = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms))
const clone = value => JSON.parse(JSON.stringify(value))
const stable = value => {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]))
  return value
}

function markupMeaning(html) {
  const template = document.createElement('template')
  template.innerHTML = html
  const visit = node => node.nodeType === Node.TEXT_NODE ? node.data : {
    tag: node.localName,
    attributes: Object.fromEntries([...node.attributes].map(attribute => [attribute.name,
      attribute.name === 'style' ? node.style.cssText : attribute.value]).sort(([a], [b]) => a.localeCompare(b))),
    children: [...node.childNodes].map(visit),
  }
  return [...template.content.childNodes].map(visit)
}

function authoredMarkup(field) {
  const copy = field.cloneNode(true)
  for (const widget of copy.querySelectorAll('[data-inline-plugin]')) {
    widget.replaceWith(document.createTextNode('{{' + widget.getAttribute('data-id') + '}}'))
  }
  return markupMeaning(copy.innerHTML)
}

function logicalLength(html) {
  const template = document.createElement('template')
  template.innerHTML = html.replace(/\{\{[\w-]+\}\}/g, '\uFFFC')
  return template.content.textContent.length
}

function caretIn(field) {
  const selection = getSelection()
  const point = (node, offset) => {
    if (!node || !field.contains(node)) return null
    const range = document.createRange()
    range.selectNodeContents(field)
    range.setEnd(node, offset)
    const fragment = range.cloneContents()
    for (const widget of fragment.querySelectorAll('[data-inline-plugin]')) widget.replaceWith(document.createTextNode('\uFFFC'))
    return fragment.textContent.length
  }
  return { focused: document.activeElement === field, anchor: point(selection.anchorNode, selection.anchorOffset),
    focus: point(selection.focusNode, selection.focusOffset), collapsed: selection.isCollapsed }
}

function nativeSelectionOwner() {
  const selection = getSelection()
  const point = (node, offset) => {
    const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement
    return { block: element?.closest('[data-block-id]')?.dataset.blockId ?? null,
      node: node?.nodeName ?? null, text: node?.textContent ?? null, offset }
  }
  return {
    active: { block: document.activeElement?.closest('[data-block-id]')?.dataset.blockId ?? null,
      node: document.activeElement?.nodeName ?? null, className: document.activeElement?.className ?? null },
    anchor: point(selection.anchorNode, selection.anchorOffset),
    focus: point(selection.focusNode, selection.focusOffset),
  }
}

async function settled() {
  const deadline = Date.now() + 10_000
  while ([...document.querySelectorAll('link[rel="stylesheet"]')].some(link => !link.disabled && !link.sheet)) {
    if (Date.now() > deadline) throw new Error('Roundtrip styles did not load')
    await pause(20)
  }
  await document.fonts?.ready
  await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {})))
  await pause(20)
}

export async function runBlockRoundtripCase(specification, { sourceBase, legacy = false, focusField, typeText, shortcut }) {
  const base = new URL(sourceBase, import.meta.url)
  const [{ createEditor }, module, paragraphModule, { EditorRenderer }, mentionModule, colorModule] = await Promise.all([
    import(new URL('core/index.js', base).href),
    import(new URL(`plugins/${specification.type}/index.js`, base).href),
    import(new URL('plugins/paragraph/index.js', base).href),
    import(new URL('renderer/index.js', base).href),
    import(new URL('inline-plugins/mention/index.js', base).href),
    import(new URL('inline-plugins/color.js', base).href),
  ])
  const widget = (type, data) => ({ type, ...(!legacy ? { dataVersion: 1 } : {}), data })
  const inline = {
    mention: widget('mention', { id: 'ada', name: 'Ada' }),
    swatch: widget('color', { value: '#123456' }),
  }
  const record = (id, data, sidecars, block = paragraph) => ({ id, type: block.type, ...(!legacy ? { dataVersion: block.version } : {}), data,
    ...(sidecars ? { inline: sidecars } : {}) })
  const input = specification.populated ? {
    version: legacy ? '1.0.5' : '2.0.0',
    blocks: [record('prefix', { text: '<b>Before</b>' }), record('probe', clone(specification.populatedData), clone(inline), specification),
      record('suffix', { text: '<i>After</i>' })],
  } : undefined
  const originalInput = input ? JSON.stringify(input) : null
  const beforeStyles = new Set(document.querySelectorAll('link[data-oe-style]'))
  const holder = document.createElement('section')
  const mounted = document.createElement('section')
  const detachedMount = document.createElement('section')
  const outside = document.createElement('button')
  outside.textContent = 'Independent host control'
  holder.style.width = mounted.style.width = detachedMount.style.width = '640px'
  document.body.append(outside, holder, mounted, detachedMount)
  const observations = [], phases = [], trusted = []
  const check = (phase, property, actual, expected) => observations.push({ phase, property,
    status: JSON.stringify(stable(actual)) === JSON.stringify(stable(expected)) ? 'PASS' : 'FAIL', actual, expected })
  let editor, renderer, destroyed = false, providerCalls = 0, currentPhase = 'create'
  try {
    const definition = legacy ? new module[specification.className]() : module[`create${specification.className}Plugin`]()
    const definitions = specification.type === 'paragraph' ? [definition]
      : [legacy ? new paragraphModule.Paragraph() : paragraphModule.createParagraphPlugin(), definition]
    editor = createEditor({ holder, plugins: definitions, defaultBlock: specification.type,
      inlineTools: [], inlinePlugins: [mentionModule.createMentionPlugin({ searchFunction: async () => { providerCalls++; return [] } }), colorModule.createColorSwatchPlugin()],
      injectStyles: true, ...(input ? { data: input } : {}),
    })
    renderer = new EditorRenderer({ blockTypes: [...new Set(['paragraph', specification.type])], injectStyles: true,
      ...(legacy
        ? { inlinePlugins: [mentionModule.createMentionWidget(), colorModule.createColorSwatchPlugin()] }
        : { inlineRenderers: [mentionModule.createMentionRenderer(), colorModule.createColorSwatchRenderer()] }),
    })
    await settled()
    const first = editor.save().blocks
    const id = specification.populated ? 'probe' : first[0]?.id
    check('create', 'generatedDefaultIdentity', typeof id === 'string' && id.length > 0, true)
    const shell = blockId => holder.querySelector(`[data-block-id="${blockId}"]`)
    const field = () => shell(id).querySelector(specification.fieldSelector)
    let previousShells = [...holder.querySelectorAll('.oe-block[data-block-id]')].map(element => [element.dataset.blockId, element])
    let previousWidgets = [...field().querySelectorAll('[data-inline-plugin]')].map(element => [element.dataset.id, element])
    const baseData = clone(specification.populated ? specification.populatedData : specification.defaultData)
    const baseText = baseData.text
    const expectedBlocks = text => specification.populated
      ? [record('prefix', { text: '<b>Before</b>' }), record('probe', { ...baseData, text }, clone(inline), specification), record('suffix', { text: '<i>After</i>' })]
      : [record(id, { ...baseData, text }, undefined, specification)]
    const expectedTag = block => block.type === 'heading' ? 'H' + block.data.level : 'P'
    const canonical = blocks => blocks.map(block => ({ ...block, data: { ...block.data, text: markupMeaning(block.data.text) } }))
    const expectedWidgets = specification.populated ? [
      { id: 'mention', type: 'mention', text: '@Ada', value: 'ada' },
      { id: 'swatch', type: 'color', text: '#123456', value: '#123456' },
    ] : []
    const widgets = root => [...root.querySelectorAll('[data-inline-plugin]')].map(element => ({
      id: element.dataset.id, type: element.dataset.inlinePlugin, text: element.textContent, value: element.dataset.value,
    }))
    for (const type of ['mousedown', 'beforeinput', 'input', 'keydown']) holder.addEventListener(type, event => trusted.push({
      type, key: event.key ?? null, inputType: event.inputType ?? null, trusted: event.isTrusted,
    }), { capture: true })

    async function rendered(phase, saved, expected) {
      const sourceBefore = JSON.stringify(saved)
      const detached = renderer.render(saved)
      check(phase, 'detachedOutputOwnership', { connected: detached.isConnected, parent: detached.parentNode === null }, { connected: false, parent: true })
      const inspectOutput = (root, name) => {
        const blocks = [...root.querySelectorAll('[data-block-id][data-block-type]')]
        check(phase, name + 'BlockCount', blocks.length, expected.length)
        check(phase, name + 'BlockOrderAndTags', blocks.map(element => ({ id: element.dataset.blockId,
          type: element.dataset.blockType, tag: element.tagName })), expected.map(block => ({ id: block.id, type: block.type, tag: expectedTag(block) })))
        check(phase, name + 'AuthoredMarkup', blocks.map(authoredMarkup), expected.map(block => markupMeaning(block.data.text)))
        check(phase, name + 'Widgets', widgets(root), expectedWidgets)
      }
      inspectOutput(detached, 'detached')
      detachedMount.append(detached)
      inspectOutput(detached, 'attachedDetached')
      renderer.renderTo(saved, mounted)
      await settled()
      inspectOutput(mounted, 'mounted')
      check(phase, 'rendererInputUnchanged', JSON.stringify(saved), sourceBefore)
      renderer.destroy(detached)
      check(phase, 'detachedDisposal', detached.childNodes.length, 0)
      detached.remove()
    }

    const snapshots = {}
    async function inspect(phase, text, readOnly, history, selectionOffset) {
      currentPhase = phase
      const saved = editor.save()
      snapshots[phase] = saved.blocks
      const expected = expectedBlocks(text)
      check(phase, 'canonicalRecords', canonical(saved.blocks), canonical(expected))
      check(phase, 'editorFieldTag', field().tagName, expectedTag(expected.find(block => block.id === id)))
      check(phase, 'editorAuthoredMarkup', authoredMarkup(field()), markupMeaning(text))
      check(phase, 'editorWidgets', widgets(field()), expectedWidgets)
      check(phase, 'modeState', { readOnly: editor.readOnly, editable: field().isContentEditable }, { readOnly, editable: !readOnly })
      check(phase, 'historyState', { canUndo: editor.canUndo, canRedo: editor.canRedo }, history)
      check(phase, 'blockDomIdentity', previousShells.map(([blockId, element]) => shell(blockId) === element), previousShells.map(() => true))
      check(phase, 'widgetDomIdentity', previousWidgets.map(([widgetId, element]) => field().querySelector(`[data-id="${widgetId}"]`) === element), previousWidgets.map(() => true))
      if (selectionOffset !== undefined) check(phase, 'nativeSelection', caretIn(field()), {
        focused: true, anchor: selectionOffset, focus: selectionOffset, collapsed: true,
      })
      if (input) check(phase, 'callerInputUnchanged', JSON.stringify(input), originalInput)
      await rendered(phase, saved, expected)
      phases.push({ phase, blocks: saved.blocks, editorHtml: field().innerHTML,
        mountedHtml: mounted.innerHTML, selection: caretIn(field()),
        selectionOwner: nativeSelectionOwner(), readOnly: editor.readOnly })
      previousShells = [...holder.querySelectorAll('.oe-block[data-block-id]')].map(element => [element.dataset.blockId, element])
      previousWidgets = [...field().querySelectorAll('[data-inline-plugin]')].map(element => [element.dataset.id, element])
    }

    await inspect('load', baseText, false, { canUndo: false, canRedo: false })
    outside.focus()
    currentPhase = 'read-only-transition'
    editor.setReadOnly(true)
    await settled()
    check('read-only', 'foreignFocusPreserved', document.activeElement === outside, true)
    await inspect('read-only', baseText, true, { canUndo: false, canRedo: false })
    currentPhase = 'editable-transition'
    editor.setReadOnly(false)
    await settled()
    check('editable-again', 'foreignFocusPreserved', document.activeElement === outside, true)
    await inspect('editable-again', baseText, false, { canUndo: false, canRedo: false })
    currentPhase = 'edit'
    const author = field()
    author.scrollIntoView({ block: 'nearest' })
    await settled()
    await focusField(author)
    const range = document.createRange()
    range.selectNodeContents(author)
    range.collapse(false)
    getSelection().removeAllRanges()
    getSelection().addRange(range)
    const offset = logicalLength(baseText)
    check('edit', 'fixtureCaret', caretIn(author), { focused: true, anchor: offset, focus: offset, collapsed: true })
    check('edit', 'trustedFieldFocus', trusted.some(event => event.type === 'mousedown' && event.trusted), true)
    await typeText('X')
    await settled()
    await inspect('edit', baseText + 'X', false, { canUndo: true, canRedo: false }, offset + 1)
    check('edit', 'trustedInput', trusted.some(event => event.type === 'input' && event.inputType === 'insertText' && event.trusted), true)
    currentPhase = 'undo'
    await shortcut('undo')
    await settled()
    await inspect('undo', baseText, false, { canUndo: false, canRedo: true }, offset)
    check('undo', 'exactOriginalRecords', snapshots.undo, snapshots.load)
    currentPhase = 'redo'
    await shortcut('redo')
    await settled()
    await inspect('redo', baseText + 'X', false, { canUndo: true, canRedo: false }, offset + 1)
    check('redo', 'exactEditedRecords', snapshots.redo, snapshots.edit)
    check('redo', 'trustedHistory', trusted.filter(event => event.type === 'keydown' && event.key.toLowerCase() === 'z').map(event => event.trusted), [true, true])
    check('redo', 'providerNotInvokedByRoundtrip', providerCalls, 0)
    currentPhase = 'dispose'
    renderer.destroy(mounted)
    check('dispose', 'mountedOutputRemoved', mounted.childNodes.length, 0)
    renderer.destroy()
    editor.destroy()
    editor.destroy()
    destroyed = true
    await settled()
    check('dispose', 'editorRootRemoved', holder.querySelector('.oe-editor'), null)
    check('dispose', 'ownedStylesReleased', [...document.querySelectorAll('link[data-oe-style]')].filter(link => !beforeStyles.has(link)).map(link => link.href), [])
    return { id: specification.id, phases, completedPhases: [...phases.map(phase => phase.phase), 'dispose'], trusted, observations,
      failures: observations.filter(observation => observation.status !== 'PASS') }
  } catch (error) {
    const failure = { phase: currentPhase, property: 'execution', status: 'ERROR', actual: error.message ?? String(error) }
    return { id: specification.id, phases, completedPhases: phases.map(phase => phase.phase), trusted, observations, error: error.stack ?? String(error),
      failures: [...observations.filter(observation => observation.status !== 'PASS'), failure],
      incompletePhases: ['load', 'read-only', 'editable-again', 'edit', 'undo', 'redo', 'dispose'].filter(phase => !phases.some(entry => entry.phase === phase)),
    }
  } finally {
    try { renderer?.destroy() } finally {
      try { if (!destroyed) editor?.destroy() } finally { holder.remove(); mounted.remove(); detachedMount.remove(); outside.remove() }
    }
  }
}
