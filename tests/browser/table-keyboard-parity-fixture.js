// This fixture supplies author expectations independently of the shortcut,
// range-replacement and field-discovery implementations under comparison.
const pause = (ms = 30) => new Promise(resolve => setTimeout(resolve, ms))
const clone = value => structuredClone(value)
const stable = value => Array.isArray(value) ? value.map(stable)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value
const same = (left, right) => JSON.stringify(stable(left)) === JSON.stringify(stable(right))
const enterVariants = ['start', 'middle', 'mark-end', 'forward-range', 'backward-range', 'before-widget', 'after-widget']
export const tableKeyboardCases = [
  ...[false, true].flatMap(headings => [
    { id: `TABLE_KEYBOARD/${headings ? 'headed' : 'body'}/navigation`, headings, action: 'navigation' },
    ...enterVariants.map(variant => ({ id: `TABLE_KEYBOARD/${headings ? 'headed' : 'body'}/enter-${variant}`, headings, action: 'enter', variant })),
    { id: `TABLE_KEYBOARD/${headings ? 'headed' : 'body'}/shift-enter-backward-range`, headings, action: 'enter', variant: 'backward-range', shift: true },
  ]),
  { id: 'TABLE_KEYBOARD/ownership/auxiliary-native', headings: true, action: 'auxiliary' },
  { id: 'TABLE_KEYBOARD/ownership/missing-key', headings: false, action: 'missing' },
  { id: 'TABLE_KEYBOARD/ownership/retired-key', headings: true, action: 'retired' },
]

function markup(html) {
  const template = document.createElement('template'); template.innerHTML = html
  const visit = node => node.nodeType === Node.TEXT_NODE ? node.data : {
    tag: node.localName, attributes: Object.fromEntries([...node.attributes].map(attribute => [attribute.name, attribute.value]).sort()),
    children: [...node.childNodes].map(visit),
  }
  return [...template.content.childNodes].map(visit)
}

function authorMarkup(field) {
  const copy = field.cloneNode(true)
  for (const node of copy.querySelectorAll('[data-oe-caret-padding]')) node.remove()
  for (const widget of copy.querySelectorAll('[data-inline-plugin]')) widget.replaceWith(document.createTextNode(`{{${widget.getAttribute('data-id')}}}`))
  return markup(copy.innerHTML)
}

function logicalLength(fragment) {
  const copy = fragment.cloneNode(true)
  for (const node of copy.querySelectorAll('[data-oe-caret-padding]')) node.remove()
  for (const widget of copy.querySelectorAll('[data-inline-plugin]')) widget.replaceWith(document.createTextNode('\uFFFC'))
  for (const br of copy.querySelectorAll('br')) br.replaceWith(document.createTextNode('\n'))
  return copy.textContent.length
}

function selectionIn(fields) {
  const selection = getSelection()
  const point = (node, offset) => {
    const index = fields.findIndex(field => node && field.contains(node))
    if (index < 0) return null
    const range = document.createRange(); range.selectNodeContents(fields[index]); range.setEnd(node, offset)
    return { field: index, offset: logicalLength(range.cloneContents()) }
  }
  return { focused: fields.indexOf(document.activeElement), anchor: point(selection.anchorNode, selection.anchorOffset),
    focus: point(selection.focusNode, selection.focusOffset), collapsed: selection.isCollapsed }
}

const selected = (field, anchor, focus = anchor) => ({ focused: field, anchor: { field, offset: anchor },
  focus: { field, offset: focus }, collapsed: anchor === focus })

async function settled() {
  const deadline = Date.now() + 10000
  while ([...document.querySelectorAll('link[rel="stylesheet"]')].some(link => !link.disabled && !link.sheet)) {
    if (Date.now() > deadline) throw new Error('Table keyboard styles did not load')
    await pause()
  }
  await pause()
}

export async function runTableKeyboardCase(specification, { sourceBase = '../../', legacy = false, native }) {
  const plannedPhases = specification.action === 'navigation'
    ? ['load', 'input', 'tab-1', 'tab-2', 'tab-3', 'tab-last', 'shift-tab-2', 'shift-tab-1', 'shift-tab-0', 'shift-tab-first', 'undo-input', 'redo-input']
    : specification.action === 'enter'
      ? ['load', 'input', 'selection', 'enter', 'continuation', 'undo-continuation', 'undo-enter', 'undo-input', 'redo-input', 'redo-enter', 'redo-continuation']
      : ['load', 'input', ...(specification.action === 'retired' ? ['remove-row'] : []), 'control-focus', 'control-enter', 'control-input', 'control-undo',
        ...(specification.action === 'retired' ? ['undo-remove'] : []), 'undo-input', 'redo-input', ...(specification.action === 'retired' ? ['redo-remove'] : [])]
  const observations = [], phases = [], completedPhases = [], trusted = [], pageErrors = [], transactions = [], diagnostics = []
  const check = (phase, property, actual, expected) => observations.push({ phase, property, actual: clone(actual), expected: clone(expected), status: same(actual, expected) ? 'PASS' : 'FAIL' })
  if (legacy && ['missing', 'retired'].includes(specification.action)) return {
    id: specification.id, specification, plannedPhases, completedPhases, observations, phases, trusted, pageErrors, diagnostics, error: null,
    unsupported: 'v1 has no keyed editable-field focus API or boolean admission result; no adapter invents one.',
  }
  const base = new URL(sourceBase, import.meta.url)
  const [{ createEditor }, tableModule, { EditorRenderer }, mentionModule, colorModule] = await Promise.all([
    import(new URL('core/index.js', base).href), import(new URL('plugins/table/index.js', base).href),
    import(new URL('renderer/index.js', base).href), import(new URL('inline-plugins/mention/index.js', base).href),
    import(new URL('inline-plugins/color.js', base).href),
  ])
  const beforeButton = document.createElement('button'), afterButton = document.createElement('button')
  beforeButton.textContent = 'Before editor'; afterButton.textContent = 'After editor'
  const holder = document.createElement('section'), output = document.createElement('section'), foreign = document.createElement('section')
  holder.style.width = output.style.width = '700px'; document.body.append(beforeButton, holder, afterButton, foreign, output)
  const originalGrid = [['<b>Alpha</b> {{mention}} {{swatch}} tail', '<i>Bravo</i> tail'],
    ['<s>Charlie</s> &amp; tail', '<b>Delta</b> {{otherMention}} {{otherSwatch}} fin']]
  const originalRows = originalGrid.map((row, r) => ({ id: `row-${r}`, cells: row.map((text, c) => ({ id: `cell-${r}-${c}`, text })) }))
  const widget = (type, data) => ({ type, ...(!legacy ? { dataVersion: 1 } : {}), data })
  const inline = { mention: widget('mention', { id: 'ada', name: 'Ada' }), swatch: widget('color', { value: '#123456' }),
    otherMention: widget('mention', { id: 'grace', name: 'Grace' }), otherSwatch: widget('color', { value: '#654321' }) }
  const input = { version: legacy ? '1.0.5' : '2.0.0', blocks: [{ id: 'table', type: 'table', ...(!legacy ? { dataVersion: 2 } : {}),
    data: { withHeadings: specification.headings, ...(legacy ? { content: clone(originalGrid) } : { rows: clone(originalRows) }) }, inline: clone(inline) }] }
  const supplied = clone(input)
  let editor, renderer, providerCalls = 0, currentPhase = 'load'
  const observeError = event => pageErrors.push({ phase: currentPhase, message: event.error?.stack ?? event.message })
  const observeKey = event => trusted.push({ phase: currentPhase, type: event.type, key: event.key, shift: event.shiftKey,
    inputType: event.inputType ?? null, trusted: event.isTrusted, target: event.target?.tagName })
  window.addEventListener('error', observeError)
  document.addEventListener('keydown', observeKey, true); document.addEventListener('input', observeKey, true)
  try {
    editor = createEditor({ holder, injectStyles: true, defaultBlock: 'table', inlineTools: [], data: input,
      plugins: [legacy ? new tableModule.Table() : tableModule.createTablePlugin()],
      inlinePlugins: [mentionModule.createMentionPlugin({ searchFunction: async () => { providerCalls++; return [] } }), colorModule.createColorSwatchPlugin()],
      onDiagnostic: diagnostic => diagnostics.push(clone(diagnostic)),
    })
    renderer = new EditorRenderer({ blockTypes: ['table'], injectStyles: true,
      ...(legacy ? { inlinePlugins: [mentionModule.createMentionWidget(), colorModule.createColorSwatchPlugin()] }
        : { inlineRenderers: [mentionModule.createMentionRenderer(), colorModule.createColorSwatchRenderer()] }),
    })
    if (!legacy) editor.on('transaction:committed', event => transactions.push({ name: event.name, origin: event.origin }))
    await settled()
    const table = () => holder.querySelector('.oe-table')
    const fields = () => [...table().rows].flatMap(row => [...row.cells])
    const originalHosts = fields(), retainedInput = editor.save().blocks, retainedExpected = clone(retainedInput)
    const renderGrid = grid => grid.map((row, r) => row.map(text => ({ tag: specification.headings && r === 0 ? 'TH' : 'TD', markup: markup(text) })))
    const capture = (phase, grid, history, count, caret = null) => {
      currentPhase = phase
      const saved = editor.save(), block = saved.blocks[0]
      const actualGrid = legacy ? block.data.content : block.data.rows.map(row => row.cells.map(cell => cell.text))
      check(phase, 'canonicalCells', actualGrid.map(row => row.map(markup)), grid.map(row => row.map(markup)))
      check(phase, 'headings', block.data.withHeadings, specification.headings)
      check(phase, 'blockIdentity', saved.blocks.map(record => ({ id: record.id, type: record.type })), [{ id: 'table', type: 'table' }])
      check(phase, 'sidecars', block.inline, Object.fromEntries(Object.entries(inline).filter(([id]) => grid.flat().some(text => text.includes(`{{${id}}}`)))))
      check(phase, 'editorCells', [...table().rows].map(row => [...row.cells].map(field => ({ tag: field.tagName, markup: authorMarkup(field) }))), renderGrid(grid))
      check(phase, 'history', { canUndo: editor.canUndo, canRedo: editor.canRedo }, history)
      check(phase, 'callerInput', input, supplied)
      check(phase, 'retainedSnapshot', retainedInput, retainedExpected)
      check(phase, 'visibleWidgets', fields().flatMap(field => [...field.querySelectorAll('[data-inline-plugin]')].map(node => ({
        id: node.getAttribute('data-id'), type: node.getAttribute('data-inline-plugin'), text: node.textContent,
      }))), [
        { id: 'mention', type: 'mention', text: '@Ada' }, { id: 'swatch', type: 'color', text: '#123456' },
        { id: 'otherMention', type: 'mention', text: '@Grace' }, { id: 'otherSwatch', type: 'color', text: '#654321' },
      ].filter(widget => grid.flat().some(text => text.includes(`{{${widget.id}}}`))))
      check(phase, 'providerCalls', providerCalls, 0)
      if (!legacy) {
        check(phase, 'completedActions', transactions.length, count)
        check(phase, 'fieldIdentities', block.data.rows.map(row => ({ id: row.id, cells: row.cells.map(cell => cell.id) })),
          originalRows.slice(0, grid.length).map(row => ({ id: row.id, cells: row.cells.map(cell => cell.id) })))
      }
      renderer.renderTo(saved, output)
      check(phase, 'rendererCells', [...output.querySelector('table').rows].map(row => [...row.cells].map(field => ({ tag: field.tagName, markup: authorMarkup(field) }))), renderGrid(grid))
      if (caret) check(phase, 'selection', selectionIn(fields()), caret)
      phases.push({ phase, blocks: clone(saved.blocks), selection: selectionIn(fields()), activeTag: document.activeElement?.tagName,
        activeClass: document.activeElement?.className, ...(legacy ? {} : { transactions: clone(transactions) }) })
      completedPhases.push(phase)
    }
    const focusEnd = (index = 0) => {
      const field = fields()[index]; field.focus(); const range = document.createRange(); range.selectNodeContents(field); range.collapse(false)
      getSelection().removeAllRanges(); getSelection().addRange(range)
    }
    const key = async (phase, value) => { currentPhase = phase; await native('key', value); await pause() }
    const type = async (phase, value) => { currentPhase = phase; await native('type', value); await pause() }
    const history = (canUndo, canRedo) => ({ canUndo, canRedo })
    capture('load', originalGrid, history(false, false), 0)
    focusEnd(); await pause(); await type('input', 'X')
    const typed = clone(originalGrid); typed[0][0] += 'X'
    const initialLength = 'Alpha \uFFFC \uFFFC tail'.length
    capture('input', typed, history(true, false), 1, selected(0, initialLength + 1))
    const typedRecords = clone(editor.save().blocks)

    if (specification.action === 'navigation') {
      for (const index of [1, 2, 3]) {
        await key(`tab-${index}`, 'Tab'); capture(`tab-${index}`, typed, history(true, false), 1, selected(index, 0))
      }
      await key('tab-last', 'Tab'); capture('tab-last', typed, history(true, false), 1)
      check('tab-last', 'doesNotWrapToAnotherCell', fields().indexOf(document.activeElement), -1)
      focusEnd(3); await pause()
      for (const index of [2, 1, 0]) {
        await key(`shift-tab-${index}`, 'Shift+Tab')
        const length = index === 0 ? initialLength + 1 : index === 1 ? 'Bravo tail'.length : 'Charlie & tail'.length
        capture(`shift-tab-${index}`, typed, history(true, false), 1, selected(index, length))
      }
      await key('shift-tab-first', 'Shift+Tab'); capture('shift-tab-first', typed, history(true, false), 1)
      check('shift-tab-first', 'doesNotWrapToAnotherCell', fields().indexOf(document.activeElement), -1)
      if (!legacy) check('navigation', 'stableCellHosts', fields().map((field, index) => field === originalHosts[index]), [true, true, true, true])
      // The boundary Tab uses native tab order. Restore an authoring host only
      // after recording that outcome so the independent history check can run.
      focusEnd(); await pause()
      await key('undo-input', 'Control+z'); capture('undo-input', originalGrid, history(false, true), 2, selected(0, initialLength))
      await key('redo-input', 'Control+Shift+z'); capture('redo-input', typed, history(true, false), 3, selected(0, initialLength + 1))
      check('redo-input', 'exactReplay', editor.save().blocks, typedRecords)
    } else if (specification.action === 'enter') {
      const field = fields()[0], bold = field.querySelector('b').firstChild
      let anchor, focus, brokenText, continuationText
      if (specification.variant.endsWith('widget')) {
        const widget = field.querySelector('[data-inline-plugin="mention"]')
        const before = specification.variant === 'before-widget'
        const index = [...widget.parentNode.childNodes].indexOf(widget) + (before ? 0 : 1)
        anchor = focus = before ? 6 : 7
        getSelection().setBaseAndExtent(widget.parentNode, index, widget.parentNode, index)
        brokenText = before ? '<b>Alpha</b> <br>{{mention}} {{swatch}} tailX' : '<b>Alpha</b> {{mention}}<br> {{swatch}} tailX'
        continuationText = before ? '<b>Alpha</b> <br>Y{{mention}} {{swatch}} tailX' : '<b>Alpha</b> {{mention}}<br>Y {{swatch}} tailX'
      } else {
        ;[anchor, focus] = { start: [0, 0], middle: [2, 2], 'mark-end': [5, 5], 'forward-range': [1, 4], 'backward-range': [4, 1] }[specification.variant]
        getSelection().setBaseAndExtent(bold, anchor, bold, focus)
        const left = 'Alpha'.slice(0, Math.min(anchor, focus)), right = 'Alpha'.slice(Math.max(anchor, focus))
        brokenText = `<b>${left}<br>${right}</b> {{mention}} {{swatch}} tailX`
        continuationText = `<b>${left}<br>Y${right}</b> {{mention}} {{swatch}} tailX`
      }
      await pause(); capture('selection', typed, history(true, false), 1, selected(0, anchor, focus))
      const broken = clone(typed); broken[0][0] = brokenText
      const continued = clone(typed); continued[0][0] = continuationText
      const afterBreak = Math.min(anchor, focus) + 1
      await key('enter', specification.shift ? 'Shift+Enter' : 'Enter')
      capture('enter', broken, history(true, false), 2, selected(0, afterBreak))
      await type('continuation', 'Y'); capture('continuation', continued, history(true, false), 3, selected(0, afterBreak + 1))
      const finalRecords = clone(editor.save().blocks)
      await key('undo-continuation', 'Control+z'); capture('undo-continuation', broken, history(true, true), 4, selected(0, afterBreak))
      await key('undo-enter', 'Control+z'); capture('undo-enter', typed, history(true, true), 5, selected(0, anchor, focus))
      check('undo-enter', 'exactTypedRecords', editor.save().blocks, typedRecords)
      await key('undo-input', 'Control+z'); capture('undo-input', originalGrid, history(false, true), 6, selected(0, initialLength))
      check('undo-input', 'exactInitialRecords', editor.save().blocks, retainedInput)
      await key('redo-input', 'Control+Shift+z'); capture('redo-input', typed, history(true, true), 7, selected(0, initialLength + 1))
      await key('redo-enter', 'Control+Shift+z'); capture('redo-enter', broken, history(true, true), 8, selected(0, afterBreak))
      await key('redo-continuation', 'Control+Shift+z'); capture('redo-continuation', continued, history(true, false), 9, selected(0, afterBreak + 1))
      check('redo-continuation', 'exactFinalRecords', editor.save().blocks, finalRecords)
    } else {
      let grid = typed, count = 1
      if (specification.action === 'retired') {
        editor.blocks.update('table', record => ({ data: { ...record.data, rows: record.data.rows.slice(0, 1) } }))
        await pause(); grid = typed.slice(0, 1); count = 2
        capture('remove-row', grid, history(true, false), count)
      }
      const control = document.createElement('textarea'); control.value = 'Outside'
      if (specification.action === 'auxiliary') table().createCaption().append(control)
      else foreign.append(control)
      control.focus(); control.setSelectionRange(2, 4, 'backward')
      await pause()
      if (specification.action !== 'auxiliary') {
        const accepted = editor.blocks.focus('table', { fieldKey: specification.action === 'retired' ? 'cell:row-1:cell-1-1' : 'cell:unknown:missing', offset: 1 })
        check('control-focus', 'rejectedField', accepted, false)
      }
      check('control-focus', 'nativeControlOwnsFocus', document.activeElement === control, true)
      check('control-focus', 'nativeControlRange', [control.selectionStart, control.selectionEnd, control.selectionDirection], [2, 4, 'backward'])
      capture('control-focus', grid, history(true, false), count)
      await key('control-enter', 'Enter'); capture('control-enter', grid, history(true, false), count)
      check('control-enter', 'nativeControlText', control.value, 'Ou\nide')
      await type('control-input', 'Y'); capture('control-input', grid, history(true, false), count)
      check('control-input', 'nativeControlText', control.value, 'Ou\nYide')
      await key('control-undo', 'Control+z'); capture('control-undo', grid, history(true, false), count)
      // Native controls own their own editing history. The Table history is
      // replayed only after explicitly returning keyboard ownership to it.
      focusEnd(); await pause()
      if (specification.action === 'retired') {
        await key('undo-remove', 'Control+z'); capture('undo-remove', typed, history(true, true), ++count)
      }
      await key('undo-input', 'Control+z'); capture('undo-input', originalGrid, history(false, true), ++count, selected(0, initialLength))
      await key('redo-input', 'Control+Shift+z'); capture('redo-input', typed, history(true, specification.action === 'retired'), ++count, selected(0, initialLength + 1))
      if (specification.action === 'retired') {
        await key('redo-remove', 'Control+Shift+z'); capture('redo-remove', grid, history(true, false), ++count)
      }
    }
    check('completion', 'phaseOrder', completedPhases, plannedPhases)
    check('gestures', 'allNativeEventsTrusted', trusted.length > 0 && trusted.every(event => event.trusted), true)
    check('gestures', 'precedingNativeInput', trusted.some(event => event.phase === 'input' && event.type === 'input' && event.inputType === 'insertText'), true)
    for (const phase of plannedPhases.filter(phase => /^(?:tab|shift-tab|enter$|undo-|redo-|control-enter|control-undo)/.test(phase))) {
      check('gestures', `key:${phase}`, trusted.some(event => event.phase === phase && event.type === 'keydown'), true)
    }
    return { id: specification.id, specification, plannedPhases, completedPhases, observations, phases, trusted, pageErrors, diagnostics, error: null, unsupported: null }
  } catch (error) {
    return { id: specification.id, specification, plannedPhases, completedPhases, observations, phases, trusted, pageErrors, diagnostics, error: error.stack ?? String(error), unsupported: null }
  } finally {
    window.removeEventListener('error', observeError)
    document.removeEventListener('keydown', observeKey, true); document.removeEventListener('input', observeKey, true)
    renderer?.destroy(); editor?.destroy(); beforeButton.remove(); holder.remove(); afterButton.remove(); foreign.remove(); output.remove()
  }
}
