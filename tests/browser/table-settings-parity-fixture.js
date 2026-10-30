// Public Table settings proof. The legacy adapter translates wire/API names;
// every source receives the same authored cells and trusted browser gestures.
const pause = (ms = 25) => new Promise(resolve => setTimeout(resolve, ms))
const clone = value => structuredClone(value)
const stable = value => Array.isArray(value) ? value.map(stable)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value
const same = (left, right) => JSON.stringify(stable(left)) === JSON.stringify(stable(right))

const labels = { header: 'Toggle header', 'row-add': 'Add row', 'row-del': 'Delete row', 'col-add': 'Add column', 'col-del': 'Delete column' }
export const tableSettingsCases = [
  ...[false, true].flatMap(headings => Object.keys(labels).map(action => ({
    id: `TABLE_SETTINGS/${headings ? 'headed' : 'body'}/${action}`, headings, action, minimum: false,
  }))),
  ...['row-del', 'col-del'].map(action => ({ id: `TABLE_SETTINGS/minimum/${action}`, headings: true, action, minimum: true })),
  ...['row-del', 'col-del'].map(action => ({ id: `TABLE_SETTINGS/removed-widgets/${action}`, headings: action === 'col-del', action, minimum: false, removedWidgets: true })),
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
    if (Date.now() > deadline) throw new Error('Table styles did not load')
    await pause()
  }
  await pause()
}

export async function runTableSettingsCase(specification, { sourceBase = '../../', legacy = false, native }) {
  const base = new URL(sourceBase, import.meta.url)
  const [{ createEditor }, tableModule, { EditorRenderer }, mentionModule, colorModule] = await Promise.all([
    import(new URL('core/index.js', base).href), import(new URL('plugins/table/index.js', base).href),
    import(new URL('renderer/index.js', base).href), import(new URL('inline-plugins/mention/index.js', base).href),
    import(new URL('inline-plugins/color.js', base).href),
  ])
  const holder = document.createElement('section'), output = document.createElement('section')
  holder.style.width = output.style.width = '640px'
  document.body.append(holder, output)
  const originalGrid = specification.minimum ? [['<b>Alpha</b> {{mention}} {{swatch}} tail']]
    : [['<b>Alpha</b> {{mention}} {{swatch}} tail', '<i>Bravo</i> tail'], ['Charlie &amp; tail', '<s>Delta</s> tail']]
  if (specification.removedWidgets) originalGrid[1][1] = '<s>Delta</s> {{removedMention}} {{removedSwatch}} tail'
  const originalRows = originalGrid.map((row, rowIndex) => ({ id: `row-${rowIndex}`, cells: row.map((text, columnIndex) => ({ id: `cell-${rowIndex}-${columnIndex}`, text })) }))
  const widget = (type, data) => ({ type, ...(!legacy ? { dataVersion: 1 } : {}), data })
  const inline = { mention: widget('mention', { id: 'ada', name: 'Ada' }), swatch: widget('color', { value: '#123456' }) }
  if (specification.removedWidgets) Object.assign(inline, {
    removedMention: widget('mention', { id: 'grace', name: 'Grace' }), removedSwatch: widget('color', { value: '#654321' }),
  })
  const input = { version: legacy ? '1.0.5' : '2.0.0', blocks: [{ id: 'table', type: 'table', ...(!legacy ? { dataVersion: 2 } : {}),
    data: { withHeadings: specification.headings, ...(legacy ? { content: clone(originalGrid) } : { rows: clone(originalRows) }) }, inline: clone(inline) }] }
  const supplied = clone(input), observations = [], phases = [], trusted = [], transactions = []
  const check = (phase, property, actual, expected) => observations.push({ phase, property, actual, expected, status: same(actual, expected) ? 'PASS' : 'FAIL' })
  let editor, renderer, providerCalls = 0, currentPhase = 'load'
  const completedPhases = []
  try {
    editor = createEditor({ holder, injectStyles: true, defaultBlock: 'table', inlineTools: [],
      plugins: [legacy ? new tableModule.Table() : tableModule.createTablePlugin()], data: input,
      inlinePlugins: [mentionModule.createMentionPlugin({ searchFunction: async () => { providerCalls++; return [] } }), colorModule.createColorSwatchPlugin()],
    })
    renderer = new EditorRenderer({ blockTypes: ['table'], injectStyles: true,
      ...(legacy ? { inlinePlugins: [mentionModule.createMentionWidget(), colorModule.createColorSwatchPlugin()] }
        : { inlineRenderers: [mentionModule.createMentionRenderer(), colorModule.createColorSwatchRenderer()] }),
    })
    if (!legacy) editor.on('transaction:committed', event => transactions.push(event))
    holder.addEventListener('input', event => trusted.push({ phase: currentPhase, type: event.type, trusted: event.isTrusted, inputType: event.inputType }))
    await settled()
    const root = () => holder.querySelector('.oe-editor')
    const table = () => holder.querySelector('.oe-table')
    const fields = () => [...table().rows].flatMap(row => [...row.cells])
    const firstField = () => fields()[0]
    const initialHosts = fields(), initialWidgets = [...firstField().querySelectorAll('[data-inline-plugin]')]
    const initialSaved = clone(editor.save().blocks)
    const identities = () => editor.save().blocks[0].data.rows.map(row => ({ id: row.id, cells: row.cells.map(cell => cell.id) }))
    const initialIds = !legacy ? identities() : null
    const originalLogicalLength = 'Alpha \uFFFC \uFFFC tail'.length
    const capture = (phase, grid, headings, history, expectedTransactions) => {
      currentPhase = phase
      const saved = editor.save(), block = saved.blocks[0]
      const actualGrid = legacy ? block.data.content : block.data.rows.map(row => row.cells.map(cell => cell.text))
      check(phase, 'canonicalCells', actualGrid.map(row => row.map(markup)), grid.map(row => row.map(markup)))
      check(phase, 'canonicalHeadings', block.data.withHeadings, headings)
      check(phase, 'sidecars', block.inline, Object.fromEntries(Object.entries(inline).filter(([id]) => grid.flat().some(text => text.includes(`{{${id}}}`)))))
      check(phase, 'singleBlockIdentity', saved.blocks.map(value => ({ id: value.id, type: value.type })), [{ id: 'table', type: 'table' }])
      check(phase, 'editorCells', [...table().rows].map((row, index) => [...row.cells].map(cell => ({ tag: cell.tagName, markup: authorMarkup(cell) }))),
        grid.map((row, index) => row.map(text => ({ tag: headings && index === 0 ? 'TH' : 'TD', markup: markup(text) }))))
      check(phase, 'visibleWidgets', [...firstField().querySelectorAll('[data-inline-plugin]')].map(node => node.textContent), ['@Ada', '#123456'])
      check(phase, 'history', { canUndo: editor.canUndo, canRedo: editor.canRedo }, history)
      check(phase, 'callerInput', input, supplied)
      check(phase, 'providerCalls', providerCalls, 0)
      if (!legacy) check(phase, 'completedActions', transactions.length, expectedTransactions)
      renderer.renderTo(saved, output)
      const rendered = output.querySelector('table')
      check(phase, 'rendererCells', [...rendered.rows].map(row => [...row.cells].map(cell => ({ tag: cell.tagName, markup: authorMarkup(cell) }))),
        grid.map((row, index) => row.map(text => ({ tag: headings && index === 0 ? 'TH' : 'TD', markup: markup(text) }))))
      check(phase, 'rendererSections', [...rendered.children].map(section => section.tagName),
        [...(headings ? ['THEAD'] : []), ...(grid.length > (headings ? 1 : 0) ? ['TBODY'] : [])])
      phases.push({ phase, blocks: clone(saved.blocks), caret: caret(firstField()), ...(legacy ? {} : { identities: identities() }) })
      completedPhases.push(phase)
    }
    capture('load', originalGrid, specification.headings, { canUndo: false, canRedo: false }, 0)
    const focusEnd = () => {
      const field = firstField(); field.focus()
      const range = document.createRange(); range.selectNodeContents(field); range.collapse(false)
      getSelection().removeAllRanges(); getSelection().addRange(range)
    }
    focusEnd(); await pause()
    currentPhase = 'input'
    await native('type', 'X'); await pause()
    const typedGrid = clone(originalGrid); typedGrid[0][0] += 'X'
    capture('input', typedGrid, specification.headings, { canUndo: true, canRedo: false }, 1)
    check('input', 'nativeCaret', caret(firstField()), { focused: true, anchor: originalLogicalLength + 1, focus: originalLogicalLength + 1, collapsed: true })
    const clicked = async element => {
      if (!element) throw new Error(`Missing Table control during ${currentPhase}`)
      await settled(); element.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const rect = element.getBoundingClientRect()
      if (!rect.width || !rect.height) throw new Error(`Invisible Table control: ${element.outerHTML}`)
      const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2, hit = document.elementFromPoint(x, y)
      const blockedDisabledPointer = specification.minimum && element.getAttribute('aria-disabled') === 'true'
        && getComputedStyle(element).pointerEvents === 'none' && element.closest('.oe-settings-menu')?.contains(hit)
      if (!element.contains(hit) && !blockedDisabledPointer) throw new Error(`Covered Table control: ${element.outerHTML}`)
      const capture = event => trusted.push({ phase: currentPhase, type: event.type, trusted: event.isTrusted, intendedControl: element.contains(event.target) })
      document.addEventListener('click', capture, { capture: true, once: true })
      try { await native('click', { x, y }); await pause() }
      finally { document.removeEventListener('click', capture, true) }
    }
    currentPhase = 'settings'
    await clicked(root().querySelector('.oe-toolbar__drag'))
    const menu = root().querySelector('.oe-settings-menu')
    const button = [...menu.querySelectorAll('[role^="menuitem"]')].find(item => item.querySelector('.oe-settings-menu__label')?.textContent === labels[specification.action])
    await clicked(button)
    const changedGrid = clone(typedGrid)
    if (specification.action === 'row-add') changedGrid.push(Array(changedGrid[0].length).fill(''))
    if (specification.action === 'row-del' && !specification.minimum) changedGrid.pop()
    if (specification.action === 'col-add') for (const row of changedGrid) row.push('')
    if (specification.action === 'col-del' && !specification.minimum) for (const row of changedGrid) row.pop()
    const changedHeadings = specification.action === 'header' ? !specification.headings : specification.headings
    const actionCount = specification.minimum ? 1 : 2
    capture('settings', changedGrid, changedHeadings, { canUndo: true, canRedo: false }, actionCount)
    const after = clone(editor.save().blocks)
    const retainedIndexes = specification.action === 'header' ? [2, 3] : specification.action === 'row-del' && !specification.minimum ? [0, 1]
      : specification.action === 'col-del' && !specification.minimum ? [0, 2] : initialHosts.map((_, index) => index)
    check('settings', 'survivingCellHosts', retainedIndexes.filter(index => index < initialHosts.length).map(index => table().contains(initialHosts[index])),
      retainedIndexes.filter(index => index < initialHosts.length).map(() => true))
    if (specification.action !== 'header') check('settings', 'survivingWidgetHosts', [...firstField().querySelectorAll('[data-inline-plugin]')].map((node, index) => node === initialWidgets[index]), [true, true])
    if (!legacy) {
      const nextIds = identities()
      check('settings', 'survivingIds', nextIds.slice(0, changedGrid.length).map((row, rowIndex) => ({ id: row.id, cells: row.cells.slice(0, originalGrid[rowIndex]?.length ?? 0) })),
        initialIds.slice(0, changedGrid.length).map(row => ({ id: row.id, cells: row.cells.slice(0, changedGrid[0].length) }))
          .concat(specification.action === 'row-add' ? [{ id: nextIds.at(-1).id, cells: [] }] : []))
      const rowIds = nextIds.map(row => row.id), cellIds = nextIds.flatMap(row => row.cells)
      check('settings', 'uniqueIds', [rowIds.every(id => typeof id === 'string' && id.length > 0), new Set(rowIds).size === rowIds.length,
        cellIds.every(id => typeof id === 'string' && id.length > 0), new Set(cellIds).size === cellIds.length], [true, true, true, true])
    }
    check('settings', 'focusInsideEditor', root().contains(document.activeElement)
      || specification.minimum && menu.contains(document.activeElement), true)
    // Keep browser keyboard ownership available even for references that
    // strand it after a menu or mode transition. Capture that defect above.
    focusEnd()
    currentPhase = 'undo-setting'
    await native('undo'); await pause()
    if (!specification.minimum) {
      capture('undo-setting', typedGrid, specification.headings, { canUndo: true, canRedo: true }, 3)
      check('undo-setting', 'exactTypedRecords', editor.save().blocks, phases.find(phase => phase.phase === 'input').blocks)
      await native('undo'); await pause()
    }
    capture('undo-input', originalGrid, specification.headings, { canUndo: false, canRedo: true }, specification.minimum ? 2 : 4)
    check('undo-input', 'exactInitialRecords', editor.save().blocks, initialSaved)
    check('undo-input', 'nativeCaret', caret(firstField()), { focused: true, anchor: originalLogicalLength, focus: originalLogicalLength, collapsed: true })
    await native('redo'); await pause()
    capture('redo-input', typedGrid, specification.headings, { canUndo: true, canRedo: !specification.minimum }, specification.minimum ? 3 : 5)
    check('redo-input', 'nativeCaret', caret(firstField()), { focused: true, anchor: originalLogicalLength + 1, focus: originalLogicalLength + 1, collapsed: true })
    if (!specification.minimum) {
      await native('redo'); await pause()
      capture('redo-setting', changedGrid, changedHeadings, { canUndo: true, canRedo: false }, 6)
      check('redo-setting', 'exactFinalRecords', editor.save().blocks, after)
    }
    // Do the retained-UI negative after the complete positive replay so a
    // historical stale-control defect cannot contaminate the history proof.
    currentPhase = 'retired-control'
    if (specification.minimum) {
      editor.setReadOnly(true); await pause(); button.click(); await pause(); editor.setReadOnly(false); await pause()
    } else { button.click(); await pause() }
    check('retired-control', 'canonicalUnchanged', editor.save().blocks, after)
    check('retired-control', 'historyUnchanged', { canUndo: editor.canUndo, canRedo: editor.canRedo }, { canUndo: true, canRedo: false })
    if (!legacy) check('retired-control', 'noCompletedAction', transactions.length, specification.minimum ? 3 : 6)
    completedPhases.push('retired-control')
    check('gestures', 'trustedInput', trusted.some(event => event.type === 'input' && event.inputType === 'insertText' && event.trusted), true)
    check('gestures', 'trustedClicks', trusted.filter(event => event.type === 'click').map(event => ({ trusted: event.trusted, intendedControl: event.intendedControl })),
      [{ trusted: true, intendedControl: true }, { trusted: true, intendedControl: legacy || !specification.minimum }])
    return { id: specification.id, observations, phases, completedPhases, trusted, error: null }
  } catch (error) {
    return { id: specification.id, observations, phases, completedPhases, trusted, error: error.stack ?? String(error) }
  } finally {
    renderer?.destroy(); editor?.destroy(); holder.remove(); output.remove()
  }
}
