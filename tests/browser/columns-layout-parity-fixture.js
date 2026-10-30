// Real Columns authoring controls, shared by the native regression page and
// the exact-source historical runner. Legacy translation is wire/API spelling
// only; v1 has no stable column IDs or settings-menu layout actions.
const pause = (ms = 25) => new Promise(resolve => setTimeout(resolve, ms))
const clone = value => structuredClone(value)
const stable = value => Array.isArray(value) ? value.map(stable)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value
const same = (left, right) => JSON.stringify(stable(left)) === JSON.stringify(stable(right))
const layouts = {
  '1-1': { label: '50 / 50', tracks: '1fr 1fr', weights: [1, 1] },
  '1-2': { label: '33 / 67', tracks: '1fr 2fr', weights: [1, 2] },
  '2-1': { label: '67 / 33', tracks: '2fr 1fr', weights: [2, 1] },
  '1-1-1': { label: '33 / 33 / 33', tracks: '1fr 1fr 1fr', weights: [1, 1, 1] },
}

export const columnsLayoutCases = ['direct', 'menu'].flatMap(surface => [
  ...['1-1', '1-2', '2-1'].map(target => ({
    id: `COLUMNS_LAYOUT/${surface}/reduce-rich-${target}`, surface, initial: '1-1-1', target, expand: true,
  })),
  { id: `COLUMNS_LAYOUT/${surface}/expand-1-1-1`, surface, initial: '1-1', target: '1-1-1', expand: false },
  { id: `COLUMNS_LAYOUT/${surface}/empty-removed`, surface, initial: '1-1-1', target: '1-2', expand: true, empty: 'removed' },
  { id: `COLUMNS_LAYOUT/${surface}/empty-destination`, surface, initial: '1-1-1', target: '2-1', expand: true, empty: 'destination' },
])

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

function authorMarkup(field) {
  const copy = field.cloneNode(true)
  for (const widget of copy.querySelectorAll('[data-inline-plugin]')) widget.replaceWith(document.createTextNode(`{{${widget.getAttribute('data-id')}}}`))
  return markup(copy.innerHTML)
}

function caret(field) {
  const selection = getSelection()
  const point = (node, offset) => {
    if (!node || !field.contains(node)) return null
    const range = document.createRange()
    range.selectNodeContents(field)
    range.setEnd(node, offset)
    const copy = range.cloneContents()
    for (const widget of copy.querySelectorAll('[data-inline-plugin]')) widget.replaceWith(document.createTextNode('\uFFFC'))
    return copy.textContent.length
  }
  return { focused: document.activeElement === field, anchor: point(selection.anchorNode, selection.anchorOffset),
    focus: point(selection.focusNode, selection.focusOffset), collapsed: selection.isCollapsed }
}

async function settled() {
  const deadline = Date.now() + 10000
  while ([...document.querySelectorAll('link[rel="stylesheet"]')].some(link => !link.disabled && !link.sheet)) {
    if (Date.now() > deadline) throw new Error('Columns styles did not load')
    await pause()
  }
  await document.fonts?.ready
  await pause()
}

export async function runColumnsLayoutCase(specification, { sourceBase = '../../', legacy = false, native }) {
  if (legacy && specification.surface === 'menu') return {
    id: specification.id, observations: [], phases: [], completedPhases: [], trusted: [], error: null,
    unsupported: 'v1 Columns has direct layout buttons, but no settings-menu layout actions. No adapter substitutes another UI surface.',
  }
  const base = new URL(sourceBase, import.meta.url)
  const [{ createEditor }, columnsModule, { EditorRenderer }, mentionModule, colorModule] = await Promise.all([
    import(new URL('core/index.js', base).href), import(new URL('plugins/columns/index.js', base).href),
    import(new URL('renderer/index.js', base).href), import(new URL('inline-plugins/mention/index.js', base).href),
    import(new URL('inline-plugins/color.js', base).href),
  ])
  const holder = document.createElement('section'), output = document.createElement('section')
  holder.style.width = output.style.width = '900px'
  document.body.append(holder, output)
  const original = [
    '<b>Alpha</b> {{leftMention}} {{leftColor}} tail',
    '<i>Bravo</i> {{middleMention}} {{middleColor}} tail',
    '<s>Charlie</s> {{rightMention}} {{rightColor}} tail',
  ].slice(0, specification.initial === '1-1-1' ? 3 : 2)
  if (specification.empty === 'removed') original[2] = ''
  if (specification.empty === 'destination') original[1] = ''
  const ids = ['left', 'middle', 'right']
  const widget = (type, data) => ({ type, ...(!legacy ? { dataVersion: 1 } : {}), data })
  const allInline = {
    leftMention: widget('mention', { id: 'ada', name: 'Ada' }), leftColor: widget('color', { value: '#123456' }),
    middleMention: widget('mention', { id: 'grace', name: 'Grace' }), middleColor: widget('color', { value: '#654321' }),
    rightMention: widget('mention', { id: 'linus', name: 'Linus' }), rightColor: widget('color', { value: '#abcdef' }),
  }
  const sidecarsFor = texts => Object.fromEntries(Object.entries(allInline).filter(([id]) => texts.some(text => text.includes(`{{${id}}}`))))
  const input = { version: legacy ? '1.0.5' : '2.0.0', blocks: [{ id: 'columns', type: 'columns', ...(!legacy ? { dataVersion: 2 } : {}),
    data: { layout: specification.initial, columns: original.map((content, index) => ({ ...(!legacy ? { id: ids[index] } : {}), content })) }, inline: sidecarsFor(original) }] }
  const supplied = clone(input), observations = [], phases = [], trusted = [], transactions = [], completedPhases = []
  const check = (phase, property, actual, expected) => observations.push({ phase, property, actual, expected, status: same(actual, expected) ? 'PASS' : 'FAIL' })
  let editor, renderer, providerCalls = 0, currentPhase = 'load'
  try {
    editor = createEditor({ holder, injectStyles: true, defaultBlock: 'columns', inlineTools: [],
      plugins: [legacy ? new columnsModule.Columns() : columnsModule.createColumnsPlugin()], data: input,
      inlinePlugins: [mentionModule.createMentionPlugin({ searchFunction: async () => { providerCalls++; return [] } }), colorModule.createColorSwatchPlugin()],
    })
    renderer = new EditorRenderer({ blockTypes: ['columns'], injectStyles: true,
      ...(legacy ? { inlinePlugins: [mentionModule.createMentionWidget(), colorModule.createColorSwatchPlugin()] }
        : { inlineRenderers: [mentionModule.createMentionRenderer(), colorModule.createColorSwatchRenderer()] }),
    })
    if (!legacy) editor.on('transaction:committed', event => transactions.push(event))
    holder.addEventListener('input', event => trusted.push({ phase: currentPhase, type: event.type, trusted: event.isTrusted, inputType: event.inputType }))
    await settled()
    const root = () => holder.querySelector('.oe-editor')
    const wrapper = () => holder.querySelector('.oe-columns')
    const fields = () => [...wrapper().querySelectorAll('.oe-columns__col')]
    const first = () => fields()[0]
    const initialHosts = fields(), initialWidgets = [...first().querySelectorAll('[data-inline-plugin]')]
    const initialSaved = clone(editor.save().blocks), retainedSnapshot = editor.save().blocks, retainedCopy = clone(retainedSnapshot)
    const firstLength = 'Alpha \uFFFC \uFFFC tail'.length
    const widgetRecords = columnFields => columnFields.map(field => [...field.querySelectorAll('[data-inline-plugin]')].map(node => ({
      id: node.getAttribute('data-id'), type: node.getAttribute('data-inline-plugin'), text: node.textContent,
    })))
    const expectedWidgets = texts => texts.map(text => [...text.matchAll(/\{\{(\w+)\}\}/g)].map(([, id]) => ({
      id, type: allInline[id].type, text: allInline[id].type === 'mention' ? `@${allInline[id].data.name}` : allInline[id].data.value,
    })))
    const layoutShape = (phase, prefix, grid, columns, layout) => {
      const { weights, tracks } = layouts[layout]
      check(phase, `${prefix}.trackDefinition`, grid.style.gridTemplateColumns, tracks)
      check(phase, `${prefix}.gridDisplay`, getComputedStyle(grid).display, 'grid')
      const widths = columns.map(column => column.getBoundingClientRect().width)
      const unit = widths.reduce((sum, width) => sum + width, 0) / weights.reduce((sum, weight) => sum + weight, 0)
      check(phase, `${prefix}.widthRatios`, widths.length === weights.length && widths.every((width, index) => width > 0 && Math.abs(width - unit * weights[index]) < 1), true)
      return widths
    }
    const capture = async (phase, texts, layout, history, expectedTransactions) => {
      currentPhase = phase
      const saved = editor.save(), block = saved.blocks[0]
      check(phase, 'canonicalColumns', block.data.columns.map(column => markup(column.content)), texts.map(markup))
      check(phase, 'canonicalLayout', block.data.layout, layout)
      check(phase, 'sidecars', block.inline, sidecarsFor(texts))
      check(phase, 'singleBlockIdentity', saved.blocks.map(value => ({ id: value.id, type: value.type })), [{ id: 'columns', type: 'columns' }])
      check(phase, 'editorColumns', fields().map(authorMarkup), texts.map(markup))
      check(phase, 'editorWidgets', widgetRecords(fields()), expectedWidgets(texts))
      check(phase, 'firstWidgets', [...first().querySelectorAll('[data-inline-plugin]')].map(node => ({ id: node.getAttribute('data-id'), text: node.textContent })),
        [{ id: 'leftMention', text: '@Ada' }, { id: 'leftColor', text: '#123456' }])
      check(phase, 'layoutControls', [...wrapper().querySelectorAll('.oe-columns__layout-btn')].map(button => ({ label: button.getAttribute('aria-label'), pressed: button.getAttribute('aria-pressed') })),
        Object.entries(layouts).map(([key, definition]) => ({ label: `Layout ${definition.label}`, pressed: String(key === layout) })))
      check(phase, 'history', { canUndo: editor.canUndo, canRedo: editor.canRedo }, history)
      check(phase, 'callerInput', input, supplied)
      check(phase, 'retainedSnapshot', retainedSnapshot, retainedCopy)
      check(phase, 'providerCalls', providerCalls, 0)
      if (!legacy) {
        check(phase, 'completedActions', transactions.length, expectedTransactions)
        const columnIds = block.data.columns.map(column => column.id)
        check(phase, 'survivingIds', columnIds.slice(0, 2), ['left', 'middle'])
        check(phase, 'uniqueIds', columnIds.every(id => typeof id === 'string' && id.length > 0) && new Set(columnIds).size === columnIds.length, true)
      }
      renderer.renderTo(saved, output)
      await settled()
      const rendered = output.querySelector('.editor-columns'), renderedFields = [...rendered.querySelectorAll('.editor-columns__col')]
      check(phase, 'rendererColumns', renderedFields.map(authorMarkup), texts.map(markup))
      check(phase, 'rendererWidgets', widgetRecords(renderedFields), expectedWidgets(texts))
      const widths = {
        editor: layoutShape(phase, 'editor', wrapper().querySelector('.oe-columns__grid'), fields(), layout),
        renderer: layoutShape(phase, 'renderer', rendered, renderedFields, layout),
      }
      phases.push({ phase, blocks: clone(saved.blocks), caret: caret(first()), widths })
      completedPhases.push(phase)
      return clone(saved.blocks)
    }
    await capture('load', original, specification.initial, { canUndo: false, canRedo: false }, 0)
    const focusEnd = () => {
      const field = first(); field.focus()
      const range = document.createRange(); range.selectNodeContents(field); range.collapse(false)
      getSelection().removeAllRanges(); getSelection().addRange(range)
    }
    focusEnd(); await pause()
    currentPhase = 'input'; await native('type', 'X'); await pause()
    const typed = [...original]; typed[0] += 'X'
    const inputSaved = await capture('input', typed, specification.initial, { canUndo: true, canRedo: false }, 1)
    check('input', 'nativeCaret', caret(first()), { focused: true, anchor: firstLength + 1, focus: firstLength + 1, collapsed: true })
    const clicked = async element => {
      if (!element) throw new Error(`Missing Columns control during ${currentPhase}`)
      await settled(); element.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const rect = element.getBoundingClientRect()
      if (!rect.width || !rect.height) throw new Error(`Invisible Columns control: ${element.outerHTML}`)
      const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2
      if (!element.contains(document.elementFromPoint(x, y))) throw new Error(`Covered Columns control: ${element.outerHTML}`)
      const captureClick = event => trusted.push({ phase: currentPhase, type: event.type, trusted: event.isTrusted, intendedControl: element.contains(event.target) })
      document.addEventListener('click', captureClick, { capture: true, once: true })
      try { await native('click', { x, y }); await pause() }
      finally { document.removeEventListener('click', captureClick, true) }
    }
    const retainedMenuControls = []
    const choose = async layout => {
      let button
      if (specification.surface === 'menu') {
        await clicked(root().querySelector('.oe-toolbar__drag'))
        const items = [...root().querySelectorAll('.oe-settings-menu [role^="menuitem"]')]
        for (const [key, definition] of Object.entries(layouts)) {
          const node = items.find(item => item.querySelector('.oe-settings-menu__label')?.textContent === definition.label)
          if (node) retainedMenuControls.push({ layout: key, node })
        }
        button = items.find(item => item.querySelector('.oe-settings-menu__label')?.textContent === layouts[layout].label)
      } else button = [...wrapper().querySelectorAll('.oe-columns__layout-btn')]
        .find(item => item.getAttribute('aria-label') === `Layout ${layouts[layout].label}`)
      await clicked(button)
    }
    currentPhase = 'layout'
    await choose(specification.target)
    // Literal expectations derive from the authored fixture, independently of
    // fitColumns: the removed third field follows the second after one break.
    const changed = specification.target === '1-1-1' ? [typed[0], typed[1], '']
      : original.length === 2 || specification.empty === 'removed' ? [typed[0], typed[1]]
        : specification.empty === 'destination' ? [typed[0], typed[2]] : [typed[0], `${typed[1]}<br>${typed[2]}`]
    const layoutSaved = await capture('layout', changed, specification.target, { canUndo: true, canRedo: false }, 2)
    check('layout', 'unchangedFirstHost', first() === initialHosts[0], true)
    check('layout', 'survivingHosts', fields().slice(0, 2).map((field, index) => field === initialHosts[index]), [true, true])
    check('layout', 'unchangedFirstWidgets', [...first().querySelectorAll('[data-inline-plugin]')].map((node, index) => node === initialWidgets[index]), [true, true])
    check('layout', 'focusInsideEditor', root().contains(document.activeElement), true)
    if (!legacy && original.length === 3 && changed.length === 2) check('layout', 'removedHostDisconnected', initialHosts[2].isConnected, false)
    let finalSaved = layoutSaved, finalTexts = changed, finalLayout = specification.target, actionCount = 2
    if (specification.expand) {
      currentPhase = 'expand'; await choose('1-1-1')
      finalTexts = [changed[0], changed[1], '']; finalLayout = '1-1-1'; actionCount = 3
      finalSaved = await capture('expand', finalTexts, finalLayout, { canUndo: true, canRedo: false }, actionCount)
      if (!legacy) check('expand', 'newLastIdentity', !ids.includes(finalSaved[0].data.columns[2].id), true)
    }
    // Native shortcuts need an editing host in every source, including v1
    // whose layout rebuild can strand focus on body. Record that above, then
    // establish the same first-field end caret before the history sequence.
    focusEnd(); await pause()
    let completed = actionCount
    if (specification.expand) {
      currentPhase = 'undo-expand'; await native('undo'); await pause()
      await capture('undo-expand', changed, specification.target, { canUndo: true, canRedo: true }, ++completed)
      check('undo-expand', 'exactLayoutRecords', editor.save().blocks, layoutSaved)
    }
    currentPhase = 'undo-layout'; await native('undo'); await pause()
    await capture('undo-layout', typed, specification.initial, { canUndo: true, canRedo: true }, ++completed)
    check('undo-layout', 'exactInputRecords', editor.save().blocks, inputSaved)
    currentPhase = 'undo-input'; await native('undo'); await pause()
    await capture('undo-input', original, specification.initial, { canUndo: false, canRedo: true }, ++completed)
    check('undo-input', 'exactInitialRecords', editor.save().blocks, initialSaved)
    check('undo-input', 'nativeCaret', caret(first()), { focused: true, anchor: firstLength, focus: firstLength, collapsed: true })
    currentPhase = 'redo-input'; await native('redo'); await pause()
    await capture('redo-input', typed, specification.initial, { canUndo: true, canRedo: true }, ++completed)
    check('redo-input', 'exactInputRecords', editor.save().blocks, inputSaved)
    check('redo-input', 'nativeCaret', caret(first()), { focused: true, anchor: firstLength + 1, focus: firstLength + 1, collapsed: true })
    currentPhase = 'redo-layout'; await native('redo'); await pause()
    await capture('redo-layout', changed, specification.target, { canUndo: true, canRedo: specification.expand }, ++completed)
    check('redo-layout', 'exactLayoutRecords', editor.save().blocks, layoutSaved)
    if (specification.expand) {
      currentPhase = 'redo-expand'; await native('redo'); await pause()
      await capture('redo-expand', finalTexts, finalLayout, { canUndo: true, canRedo: false }, ++completed)
    }
    check('history', 'exactFinalRecords', editor.save().blocks, finalSaved)
    // Probe an action that would really change the final layout. The menu
    // owner must stay retired after read-only is enabled AND disabled, so a
    // read-only guard or canonical no-op cannot disguise an obsolete action.
    // Direct controls remain live; their separate negative is read-only.
    currentPhase = 'retired-control'
    editor.setReadOnly(true); await pause()
    if (specification.surface === 'menu') {
      editor.setReadOnly(false); await pause()
      const retired = retainedMenuControls.find(control => control.layout !== finalLayout)
      if (!retired) throw new Error('A decisive retained-menu probe requires a different layout')
      check('retired-control', 'editableBeforeProbe', first().isContentEditable, true)
      check('retired-control', 'differentLayout', retired.layout !== finalLayout, true)
      retired.node.click()
      await pause()
    } else {
      const target = Object.keys(layouts).find(layout => layout !== finalLayout)
      const button = [...wrapper().querySelectorAll('.oe-columns__layout-btn')]
        .find(item => item.getAttribute('aria-label') === `Layout ${layouts[target].label}`)
      check('retired-control', 'readOnlyBeforeProbe', first().isContentEditable, false)
      check('retired-control', 'differentLayout', target !== finalLayout, true)
      button.click(); await pause()
      editor.setReadOnly(false); await pause()
    }
    check('retired-control', 'canonicalUnchanged', editor.save().blocks, finalSaved)
    check('retired-control', 'historyUnchanged', { canUndo: editor.canUndo, canRedo: editor.canRedo }, { canUndo: true, canRedo: false })
    if (!legacy) check('retired-control', 'noCompletedAction', transactions.length, completed)
    completedPhases.push('retired-control')
    check('gestures', 'trustedInput', trusted.some(event => event.type === 'input' && event.inputType === 'insertText' && event.trusted), true)
    check('gestures', 'trustedClicks', trusted.filter(event => event.type === 'click').map(event => ({ trusted: event.trusted, intendedControl: event.intendedControl })),
      Array((specification.expand ? 2 : 1) * (specification.surface === 'menu' ? 2 : 1)).fill({ trusted: true, intendedControl: true }))
    return { id: specification.id, observations, phases, completedPhases, trusted, error: null }
  } catch (error) {
    return { id: specification.id, observations, phases, completedPhases, trusted, error: error.stack ?? String(error) }
  } finally {
    renderer?.destroy(); editor?.destroy(); holder.remove(); output.remove()
  }
}
