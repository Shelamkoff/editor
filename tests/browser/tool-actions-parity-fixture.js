// Fixed public-editor actions shared by the native regression and the
// immutable three-source runner. Expected text is authored below, never
// calculated by calling the production tool or its normalizer.
export const toolActionCases = []
for (const tool of ['clearFormatting', 'caseTransform']) {
  for (const variant of tool === 'caseTransform' ? ['mixed', 'upper'] : ['mixed']) {
    for (const shape of ['single', 'cross', 'fields']) for (const boundary of ['Text', 'Element']) for (const backward of [false, true]) {
      toolActionCases.push({ id: [tool, variant, shape, boundary, backward ? 'backward' : 'forward'].join('/'),
        tool, variant, shape, boundary, backward })
    }
  }
  for (const noop of ['text', 'atomic']) for (const backward of [false, true]) {
    toolActionCases.push({ id: [tool, 'noop', noop, backward ? 'backward' : 'forward'].join('/'),
      tool, noop, shape: 'single', boundary: noop === 'atomic' ? 'Element' : 'Text', backward })
  }
  for (const lifetime of ['read-only', 'destroy']) toolActionCases.push({
    id: [tool, 'lifetime', lifetime].join('/'), tool, lifetime,
  })
}

const pause = (ms = 25) => new Promise(resolve => setTimeout(resolve, ms))
const aliases = { strong: 'b', em: 'i', strike: 's', del: 's' }
const widgetPattern = /\{\{swatch\}\}/g
const colorData = { value: '#aBcDef' }

function richMiddle(word, greek) {
  return '<span style="font-size:24px;color:#800000;background-color:#ffff00">'
    + '<em><strong><sup><sub><s><code><mark>' + word
    + '</mark></code></s></sub></sup></strong></em> ' + greek + '</span>'
}

function contentFor(spec) {
  if (spec.noop) {
    const text = spec.noop === 'atomic' ? 'un{{swatch}} rest'
      : 'un' + (spec.tool === 'caseTransform' ? '<b>123!?🙂</b>' : '123!?🙂')
        + ' {{swatch}} <a href="/kept" rel="noopener noreferrer">678</a> rest'
    return { before: [text], after: [text] }
  }
  const lower = spec.variant === 'upper'
  const first = lower ? 'MIXED' : 'MiXeD', last = lower ? 'BRAVO' : 'BrAvO'
  const middle = richMiddle(lower ? 'STRASSE' : 'straße', lower ? 'İΟ<b>Σ</b>' : 'Ο<b>Σ</b>')
  const tail = lower ? 'TAIL' : 'Tail'
  const lead = 'un<b>' + first + '</b> ' + middle + '<br><a href="/kept" rel="noopener noreferrer"><i>'
    + tail + '</i></a> {{swatch}} '
  const end = '<b>' + last + '</b> rest'
  const full = spec.boundary === 'Element'
  let transformedLead, transformedEnd
  if (spec.tool === 'clearFormatting') {
    transformedLead = 'un' + (full ? first : '<b>Mi</b>XeD') + ' straße ΟΣ<br>'
      + '<a href="/kept" rel="noopener noreferrer">Tail</a> {{swatch}} '
    transformedEnd = full ? 'BrAvO rest' : 'BrA<b>vO</b> rest'
  } else {
    transformedLead = 'un<b>' + (lower ? (full ? 'mixed' : 'MIxed') : (full ? 'MIXED' : 'MiXED')) + '</b> '
      + richMiddle(lower ? 'strasse' : 'STRASSE', lower ? 'i\u0307ο<b>ς</b>' : 'Ο<b>Σ</b>')
      + '<br><a href="/kept" rel="noopener noreferrer"><i>' + (lower ? 'tail' : 'TAIL') + '</i></a> {{swatch}} '
    transformedEnd = '<b>' + (lower ? (full ? 'bravo' : 'braVO') : (full ? 'BRAVO' : 'BRAvO')) + '</b> rest'
  }
  return spec.shape !== 'single'
    ? { before: [lead, end], after: [transformedLead, transformedEnd] }
    : { before: [lead + end], after: [transformedLead + transformedEnd] }
}

function parse(html) {
  const template = document.createElement('template')
  template.innerHTML = html
  return template.content
}

// Compare author meaning while allowing equivalent strong/b and em/i wire
// spelling and CSS declaration order. No source-specific result is excused.
function meaning(html) {
  const result = []
  const append = (text, marks, kind = 'text') => {
    if (!text) return
    const signature = [...new Set(marks)].sort()
    const previous = result.at(-1)
    if (kind === 'text' && previous?.kind === kind && JSON.stringify(previous.marks) === JSON.stringify(signature)) previous.text += text
    else result.push({ kind, text, marks: signature })
  }
  const walk = (node, marks = []) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const parts = node.data.split(/(\{\{swatch\}\})/)
      for (const part of parts) append(part, marks, part === '{{swatch}}' ? 'widget' : 'text')
      return
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = node.localName
      if (tag === 'br') { append('\n', marks, 'break'); return }
      if (tag === 'span') {
        const styles = [...node.style].sort().map(key => key + ':' + node.style.getPropertyValue(key).trim())
        if (styles.length) marks = [...marks, 'style(' + styles.join(';') + ')']
      } else if (tag === 'a') {
        const attributes = [...node.attributes].map(value => [value.name, value.value]).sort()
        marks = [...marks, 'a' + JSON.stringify(attributes)]
      } else marks = [...marks, aliases[tag] ?? tag]
    }
    for (const child of node.childNodes) walk(child, marks)
  }
  walk(parse(html))
  return result
}

function length(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.data.replace(widgetPattern, '\uFFFC').length
  if (node.nodeType === Node.ELEMENT_NODE && (node.hasAttribute('data-inline-plugin') || node.localName === 'br')) return 1
  return [...node.childNodes].reduce((total, child) => total + length(child), 0)
}

function offset(field, target, targetOffset) {
  let total = 0, found = false
  const visit = node => {
    if (node === target) {
      total += node.nodeType === Node.TEXT_NODE ? targetOffset
        : [...node.childNodes].slice(0, targetOffset).reduce((sum, child) => sum + length(child), 0)
      found = true
      return
    }
    if (node.nodeType === Node.TEXT_NODE || (node.nodeType === Node.ELEMENT_NODE
      && (node.hasAttribute('data-inline-plugin') || node.localName === 'br'))) total += length(node)
    else for (const child of node.childNodes) { visit(child); if (found) break }
  }
  visit(field)
  return found ? total : null
}

async function click(button, nativeInput) {
  if (!button) throw new Error('Named public toolbar action is missing')
  button.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  const rect = button.getBoundingClientRect()
  if (!rect.width || !rect.height) throw new Error('Named public toolbar action is not visible')
  let trusted = false
  const observe = event => { trusted = event.isTrusted && button.contains(event.target) }
  button.ownerDocument.addEventListener('mousedown', observe, { capture: true, once: true })
  try { await nativeInput('Input.click', { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }) }
  finally { button.ownerDocument.removeEventListener('mousedown', observe, true) }
  await pause()
  return trusted
}

async function history(nativeInput, redo) {
  const params = { key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90, modifiers: redo ? 10 : 2 }
  await nativeInput('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...params })
  await nativeInput('Input.dispatchKeyEvent', { type: 'keyUp', ...params })
  await pause()
}

export async function runToolActionCase({ sourceBase = '../../', legacy = false, spec, nativeInput }) {
  if (spec.lifetime) return runToolLifetimeCase({ sourceBase, legacy, spec, nativeInput })
  const base = new URL(sourceBase, import.meta.url)
  const [{ createEditor }, paragraph, defaults, color, quote] = await Promise.all([
    import(new URL('core/index.js', base)), import(new URL('plugins/paragraph/index.js', base)),
    import(new URL('inline-tools/defaults.js', base)), import(new URL('inline-plugins/color.js', base)),
    spec.shape === 'fields' ? import(new URL('plugins/quote/index.js', base)) : null,
  ])
  const observations = [], completedPhases = [], transactions = [], trusted = [], unsupported = [], diagnostics = []
  const check = (phase, property, actual, expected) => observations.push({ phase, property, actual, expected,
    status: JSON.stringify(actual) === JSON.stringify(expected) ? 'PASS' : 'FAIL' })
  const holder = document.createElement('section')
  holder.style.cssText = 'width:900px; margin:80px auto;'
  document.body.append(holder)
  holder.addEventListener('input', event => trusted.push({ type: event.type, inputType: event.inputType, trusted: event.isTrusted }))
  holder.addEventListener('keydown', event => {
    if (event.key.toLowerCase() === 'z') trusted.push({ type: event.type, key: event.key, trusted: event.isTrusted })
  })
  const content = contentFor(spec)
  const widgetData = { swatch: { type: 'color', ...(!legacy ? { dataVersion: 1 } : {}), data: { ...colorData } } }
  const input = { version: legacy ? '1.0.5' : '2.0.0', blocks: spec.shape === 'fields' ? [{
    id: 'a', type: 'quote', ...(!legacy ? { dataVersion: 1 } : {}),
    data: { text: content.before[0], caption: content.before[1] }, inline: widgetData,
  }] : content.before.map((text, index) => ({
    id: index ? 'b' : 'a', type: 'paragraph', ...(!legacy ? { dataVersion: 2 } : {}), data: { text },
    ...(!index ? { inline: widgetData } : {}),
  })) }
  const originalInput = JSON.stringify(input)
  let producerCalls = 0
  const tools = legacy ? [spec.tool] : defaults.createDefaultInlineTools({ types: [spec.tool] }).map(tool => ({
    ...tool, toggle(selection) { producerCalls++; return tool.toggle(selection) },
  }))
  if (legacy) unsupported.push({ property: 'transactionEventsAndProducerCount', reason: 'v1 public default-tool resolution injects its selection controller internally; the v2 transaction event contract is absent. Exact public Undo/Redo and content checks still execute.' })
  let editor, phase = 'load'
  const planned = spec.noop ? ['load', 'input', 'prepare-redo', 'selection', 'apply', 'redo-input', 'undo-input', 'dispose']
    : ['load', 'input', 'selection', 'apply', 'undo-action', 'undo-input', 'redo-input', 'redo-action', 'dispose']
  try {
    editor = createEditor({ holder, plugins: [legacy ? new paragraph.Paragraph() : paragraph.createParagraphPlugin(),
      ...(quote ? [legacy ? new quote.Quote() : quote.createQuotePlugin()] : [])],
      inlinePlugins: [color.createColorSwatchPlugin()], inlineTools: tools, injectStyles: true, data: input,
      onDiagnostic: value => diagnostics.push({ code: value.code, message: value.message }),
    })
    if (!legacy) editor.on('transaction:committed', event => transactions.push({ action: event.action, origin: event.origin, name: event.name }))
    const fields = () => [...holder.querySelectorAll(spec.shape === 'fields' ? '.oe-quote__text, .oe-quote__caption' : '.oe-paragraph')]
    const fieldNames = spec.shape === 'fields' ? ['quote.text', 'quote.caption'] : ['a', 'b']
    const states = () => editor.save().blocks
    const texts = () => spec.shape === 'fields' ? [states()[0].data.text, states()[0].data.caption] : states().map(block => block.data.text)
    const fieldMeaning = () => texts().map(meaning)
    const selectionState = () => {
      const native = window.getSelection(), current = fields()
      const endpoint = (node, value) => {
        const index = current.findIndex(field => field === node || field.contains(node))
        return { field: index < 0 ? null : fieldNames[index], offset: index < 0 ? null : offset(current[index], node, value) }
      }
      return { anchor: endpoint(native.anchorNode, native.anchorOffset), focus: endpoint(native.focusNode, native.focusOffset), collapsed: native.isCollapsed }
    }
    const selectedState = expected => {
      if (spec.noop) {
        const start = { field: 'a', offset: spec.noop === 'atomic' ? 2 : 3 }
        const end = { field: 'a', offset: spec.noop === 'atomic' ? 3 : length(parse(expected[0])) - 6 }
        return { anchor: spec.backward ? end : start, focus: spec.backward ? start : end, collapsed: false }
      }
      const start = { field: fieldNames[0], offset: spec.boundary === 'Element' ? 3 : 5 }
      const end = { field: fieldNames[spec.shape === 'single' ? 0 : 1], offset: length(parse(expected.at(-1))) - 5 - (spec.boundary === 'Text' ? 2 : 0) }
      return { anchor: spec.backward ? end : start, focus: spec.backward ? start : end, collapsed: false }
    }
    const historyState = () => ({ canUndo: editor.canUndo, canRedo: editor.canRedo })
    const eventActions = () => transactions.map(event => event.action)
    await pause(50)
    const initial = states()
    check('load', 'fixedInputMeaning', fieldMeaning(), content.before.map(meaning))
    check('load', 'fixedWidgetPayload', { type: initial[0].inline?.swatch?.type, data: initial[0].inline?.swatch?.data }, { type: 'color', data: colorData })
    check('load', 'history', historyState(), { canUndo: false, canRedo: false })
    completedPhases.push('load')
    phase = 'input'
    const first = fields()[0], native = window.getSelection()
    first.focus(); native.setBaseAndExtent(first.firstChild, 0, first.firstChild, 0)
    await nativeInput('Input.insertText', { text: 'X' }); await pause()
    const typed = states(), beforeTexts = content.before.map((text, index) => (index ? '' : 'X') + text)
    check('input', 'independentPrecedingEdit', fieldMeaning(), beforeTexts.map(meaning))
    check('input', 'trustedInsert', trusted.some(value => value.type === 'input' && value.inputType === 'insertText' && value.trusted), true)
    if (!legacy) check('input', 'completedActions', eventActions(), ['commit'])
    completedPhases.push('input')
    let selectionTexts = beforeTexts
    if (spec.noop) {
      phase = 'prepare-redo'; await history(nativeInput, false)
      check(phase, 'exactCanonicalDocument', states(), initial)
      check(phase, 'redoAvailableBeforeNoop', historyState(), { canUndo: false, canRedo: true })
      selectionTexts = content.before
      completedPhases.push(phase)
    }
    phase = 'selection'
    const all = fields(), firstMark = all[0].querySelector('b'), lastMark = [...all.at(-1).querySelectorAll('b')].at(-1)
    const element = spec.boundary === 'Element'
    let from, to, fromOffset, toOffset
    if (spec.noop === 'atomic') {
      from = to = all[0]
      fromOffset = [...from.childNodes].indexOf(from.querySelector('[data-inline-plugin="color"]'))
      toOffset = fromOffset + 1
    } else if (spec.noop === 'text') {
      from = firstMark?.firstChild ?? all[0].firstChild
      to = all[0].querySelector('a').firstChild
      fromOffset = firstMark ? 1 : 3; toOffset = 2
    } else {
      from = element ? firstMark : firstMark.firstChild; to = element ? lastMark : lastMark.firstChild
      fromOffset = element ? 0 : 2; toOffset = element ? 1 : 3
    }
    all[0].focus()
    native.setBaseAndExtent(spec.backward ? to : from, spec.backward ? toOffset : fromOffset,
      spec.backward ? from : to, spec.backward ? fromOffset : toOffset)
    document.dispatchEvent(new Event('selectionchange')); await pause(50)
    check('selection', 'exactInitialEndpoints', selectionState(), selectedState(selectionTexts))
    const widget = all[0].querySelector('[data-inline-plugin="color"]')
    if (!widget) throw new Error('Real Color widget did not mount')
    const widgetChildren = [...widget.childNodes], widgetMarkup = widget.innerHTML
    completedPhases.push('selection')
    phase = 'apply'
    check('apply', 'trustedNamedButton', await click(holder.querySelector(`[data-tool="${spec.tool}"]`), nativeInput), true)
    const after = states(), afterTexts = spec.noop ? content.after : content.after.map((text, index) => (index ? '' : 'X') + text)
    check('apply', 'intendedTextAndMarks', fieldMeaning(), afterTexts.map(meaning))
    check('apply', 'sidecars', after.map(block => block.inline), typed.map(block => block.inline))
    check('apply', 'liveWidgetIdentity', widget.isConnected && all[0].querySelector('[data-inline-plugin="color"]') === widget
      && widgetChildren.every((child, index) => widget.childNodes[index] === child), true)
    check('apply', 'liveWidgetPayloadAndMarkup', widget.innerHTML, widgetMarkup)
    check('apply', 'selection', selectionState(), selectedState(afterTexts))
    check('apply', 'history', historyState(), spec.noop ? { canUndo: false, canRedo: true } : { canUndo: true, canRedo: false })
    if (spec.noop) check('apply', 'canonicalNoop', after, initial)
    if (!legacy) {
      check('apply', 'producerCalls', producerCalls, 1)
      check('apply', 'completedActions', eventActions(), spec.noop ? ['commit', 'undo'] : ['commit', 'commit'])
    }
    completedPhases.push('apply')
    if (spec.noop) {
      phase = 'redo-input'; await history(nativeInput, true)
      check(phase, 'originalRedoPreserved', states(), typed)
      check(phase, 'history', historyState(), { canUndo: true, canRedo: false })
      completedPhases.push(phase)
      phase = 'undo-input'; await history(nativeInput, false)
      check(phase, 'onlyOriginalEditWasUndoable', states(), initial)
      check(phase, 'history', historyState(), { canUndo: false, canRedo: true })
      check(phase, 'trustedHistory', trusted.filter(value => value.type === 'keydown').map(value => value.trusted), [true, true, true])
      if (!legacy) check(phase, 'exactCompletedActions', eventActions(), ['commit', 'undo', 'redo', 'undo'])
      completedPhases.push(phase)
    } else {
    phase = 'undo-action'; await history(nativeInput, false)
    check(phase, 'exactCanonicalDocument', states(), typed)
    check(phase, 'selection', selectionState(), selectedState(beforeTexts))
    check(phase, 'history', historyState(), { canUndo: true, canRedo: true })
    completedPhases.push(phase)
    phase = 'undo-input'; await history(nativeInput, false)
    check(phase, 'exactCanonicalDocument', states(), initial)
    check(phase, 'history', historyState(), { canUndo: false, canRedo: true })
    completedPhases.push(phase)
    phase = 'redo-input'; await history(nativeInput, true)
    check(phase, 'exactCanonicalDocument', states(), typed)
    check(phase, 'history', historyState(), { canUndo: true, canRedo: true })
    completedPhases.push(phase)
    phase = 'redo-action'; await history(nativeInput, true)
    check(phase, 'exactCanonicalDocument', states(), after)
    check(phase, 'intendedTextAndMarks', fieldMeaning(), afterTexts.map(meaning))
    check(phase, 'selection', selectionState(), selectedState(afterTexts))
    check(phase, 'history', historyState(), { canUndo: true, canRedo: false })
    check(phase, 'trustedHistory', trusted.filter(value => value.type === 'keydown').map(value => value.trusted), [true, true, true, true])
    if (!legacy) check(phase, 'exactCompletedActions', eventActions(), ['commit', 'commit', 'undo', 'undo', 'redo', 'redo'])
    completedPhases.push(phase)
    }
    check(phase, 'inputNotMutated', JSON.stringify(input), originalInput)
    phase = 'dispose'; editor.destroy()
    check(phase, 'rootRemoved', holder.querySelector('.oe-editor'), null)
    completedPhases.push(phase)
    return { id: spec.id, spec, observations, completedPhases, planned, trusted, unsupported, diagnostics, transactions, error: null }
  } catch (error) {
    return { id: spec.id, spec, observations, completedPhases, planned, trusted, unsupported, diagnostics, transactions, phase, error: error.stack ?? String(error) }
  } finally { editor?.destroy(); holder.remove() }
}

async function runToolLifetimeCase({ sourceBase, legacy, spec, nativeInput }) {
  const base = new URL(sourceBase, import.meta.url)
  const [{ createEditor }, paragraph, defaults, color] = await Promise.all([
    import(new URL('core/index.js', base)), import(new URL('plugins/paragraph/index.js', base)),
    import(new URL('inline-tools/defaults.js', base)), import(new URL('inline-plugins/color.js', base)),
  ])
  const observations = [], completedPhases = [], trusted = [], unsupported = [], diagnostics = [], transactions = []
  const planned = ['load', 'inactive-ui', 'live-action', 'undo', 'redo', 'dispose']
  const check = (phase, property, actual, expected) => observations.push({ phase, property, actual, expected,
    status: JSON.stringify(actual) === JSON.stringify(expected) ? 'PASS' : 'FAIL' })
  if (legacy) unsupported.push({ property: 'transactionEventsAndProducerCount', reason: 'The historical default-tool resolver owns its selection injection and has no v2 transaction-event contract. Public canonical/lifetime effects and exact Undo/Redo still execute.' })
  const holder = document.createElement('section')
  holder.style.cssText = 'width:900px; margin:80px auto;'
  document.body.append(holder)
  holder.addEventListener('keydown', event => {
    if (event.key.toLowerCase() === 'z') trusted.push({ type: event.type, key: event.key, trusted: event.isTrusted })
  })
  const html = '<b>Abc</b> {{swatch}} Tail'
  const create = () => {
    const state = { calls: 0, events: [] }
    const tools = legacy ? [spec.tool] : defaults.createDefaultInlineTools({ types: [spec.tool] }).map(tool => ({
      ...tool, toggle(selection) { state.calls++; return tool.toggle(selection) },
    }))
    const editor = createEditor({ holder, plugins: [legacy ? new paragraph.Paragraph() : paragraph.createParagraphPlugin()],
      inlinePlugins: [color.createColorSwatchPlugin()], inlineTools: tools, injectStyles: true,
      onDiagnostic: value => diagnostics.push({ code: value.code, message: value.message }),
      data: { version: legacy ? '1.0.5' : '2.0.0', blocks: [{ id: 'same-id', type: 'paragraph',
        ...(!legacy ? { dataVersion: 2 } : {}), data: { text: html },
        inline: { swatch: { type: 'color', ...(!legacy ? { dataVersion: 1 } : {}), data: { ...colorData } } },
      }] },
    })
    if (!legacy) editor.on('transaction:committed', event => {
      const value = { action: event.action, origin: event.origin, name: event.name }
      state.events.push(value); transactions.push(value)
    })
    return { editor, state }
  }
  const field = () => holder.querySelector('.oe-paragraph')
  const select = async () => {
    field().focus()
    const text = field().querySelector('b')?.firstChild ?? field().firstChild
    window.getSelection().setBaseAndExtent(text, 3, text, 0)
    document.dispatchEvent(new Event('selectionchange')); await pause(50)
  }
  const selection = () => {
    const native = window.getSelection(), current = field()
    return { anchor: offset(current, native.anchorNode, native.anchorOffset),
      focus: offset(current, native.focusNode, native.focusOffset), collapsed: native.isCollapsed }
  }
  let current, original, phase = 'load'
  try {
    original = current = create(); await pause(50); await select()
    const initial = current.editor.save().blocks
    check('load', 'fixedInputMeaning', meaning(initial[0].data.text), meaning(html))
    check('load', 'history', [current.editor.canUndo, current.editor.canRedo], [false, false])
    const retained = holder.querySelector(`[data-tool="${spec.tool}"]`), oldField = field()
    if (!retained) throw new Error('Named toolbar button did not mount')
    completedPhases.push('load')
    phase = 'inactive-ui'
    if (spec.lifetime === 'destroy') {
      current.editor.destroy()
      check(phase, 'retiredRootRemoved', holder.querySelector('.oe-editor'), null)
      current = create(); await pause(50); await select()
    } else current.editor.setReadOnly(true)
    // The lifecycle transition may legitimately update tab stops or remove
    // destroyed widgets. The late callback must have no additional effect.
    const beforeLate = current.editor.save().blocks, beforeSelection = selection(), oldMarkup = oldField.innerHTML
    retained.click()
    await pause()
    check(phase, 'retainedButtonCannotAuthor', current.editor.save().blocks, beforeLate)
    check(phase, 'retainedButtonCannotChangeHistory', [current.editor.canUndo, current.editor.canRedo], [false, false])
    check(phase, 'retainedButtonCannotMoveSelection', selection(), beforeSelection)
    check(phase, 'retainedProjectionUnchanged', oldField.innerHTML, oldMarkup)
    if (!legacy) {
      check(phase, 'oldProducerSilent', original.state.calls, 0)
      check(phase, 'currentProducerSilent', current.state.calls, 0)
      check(phase, 'noCompletedAction', transactions, [])
    }
    completedPhases.push(phase)
    if (spec.lifetime === 'read-only') current.editor.setReadOnly(false)
    await select()
    phase = 'live-action'
    check(phase, 'trustedLiveButton', await click(holder.querySelector(`[data-tool="${spec.tool}"]`), nativeInput), true)
    const after = current.editor.save().blocks
    const expected = spec.tool === 'caseTransform' ? '<b>ABC</b> {{swatch}} Tail' : 'Abc {{swatch}} Tail'
    check(phase, 'liveCapabilityStillWorks', meaning(after[0].data.text), meaning(expected))
    check(phase, 'sidecars', after[0].inline, initial[0].inline)
    check(phase, 'selection', selection(), { anchor: 3, focus: 0, collapsed: false })
    if (!legacy) {
      check(phase, 'currentProducerOnce', current.state.calls, 1)
      if (spec.lifetime === 'destroy') check(phase, 'retiredProducerStillSilent', original.state.calls, 0)
      check(phase, 'oneCompletedAction', transactions.map(event => event.action), ['commit'])
    }
    completedPhases.push(phase)
    phase = 'undo'; await history(nativeInput, false)
    check(phase, 'exactCanonicalDocument', current.editor.save().blocks, initial)
    check(phase, 'selection', selection(), { anchor: 3, focus: 0, collapsed: false })
    check(phase, 'history', [current.editor.canUndo, current.editor.canRedo], [false, true])
    completedPhases.push(phase)
    phase = 'redo'; await history(nativeInput, true)
    check(phase, 'exactCanonicalDocument', current.editor.save().blocks, after)
    check(phase, 'selection', selection(), { anchor: 3, focus: 0, collapsed: false })
    check(phase, 'history', [current.editor.canUndo, current.editor.canRedo], [true, false])
    check(phase, 'trustedHistory', trusted.map(value => value.trusted), [true, true])
    if (!legacy) check(phase, 'exactCompletedActions', transactions.map(event => event.action), ['commit', 'undo', 'redo'])
    completedPhases.push(phase)
    phase = 'dispose'; current.editor.destroy()
    check(phase, 'rootRemoved', holder.querySelector('.oe-editor'), null)
    completedPhases.push(phase)
    return { id: spec.id, spec, observations, completedPhases, planned, trusted, unsupported, diagnostics, transactions, error: null }
  } catch (error) {
    return { id: spec.id, spec, observations, completedPhases, planned, trusted, unsupported, diagnostics, transactions, phase, error: error.stack ?? String(error) }
  } finally { current?.editor.destroy(); original?.editor.destroy(); holder.remove() }
}
