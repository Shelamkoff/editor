// Fixed public-editor actions shared by the native regression and the
// immutable three-source runner. Expected text is authored below, never
// calculated by calling the production tool or its normalizer.
export const basicMarkCases = []
for (const tool of ['bold', 'italic', 'strikethrough']) {
  for (const variant of ['apply', 'mixed', 'nested']) {
    for (const shape of variant === 'nested' ? ['single'] : ['single', 'cross', 'fields']) {
      for (const boundary of ['Text', 'Element']) for (const backward of [false, true]) {
        basicMarkCases.push({ id: [tool, variant, shape, boundary, backward ? 'backward' : 'forward'].join('/'),
          tool, variant, shape, boundary, backward })
      }
    }
  }
  for (const backward of [false, true]) basicMarkCases.push({
    id: [tool, 'noop', 'atomic', backward ? 'backward' : 'forward'].join('/'),
    tool, noop: 'atomic', shape: 'single', boundary: 'Element', backward,
  })
  for (const lifetime of ['read-only', 'destroy']) basicMarkCases.push({
    id: [tool, 'lifetime', lifetime].join('/'), tool, lifetime,
  })
}
const markTags = { bold: 'b', italic: 'i', strikethrough: 's' }
const edgeTags = { bold: 'i', italic: 'b', strikethrough: 'b' }
const middleTags = { bold: 's', italic: 's', strikethrough: 'i' }
const wrap = (tag, text) => '<' + tag + '>' + text + '</' + tag + '>'

const pause = (ms = 25) => new Promise(resolve => setTimeout(resolve, ms))
const aliases = { strong: 'b', em: 'i', strike: 's', del: 's' }
const widgetPattern = /\{\{(?:swatch|mention)\}\}/g
const colorData = { value: '#aBcDef' }
const mentionData = { id: 'ada', name: 'Ada' }

function createCheck(observations) {
  const snapshot = value => value === undefined ? { $undefined: true } : JSON.parse(JSON.stringify(value))
  return (phase, property, actual, expected) => {
    // Event arrays and canonical values can be reused by later phases. Store
    // the observation now, so its values cannot drift after its verdict.
    const observed = snapshot(actual), intended = snapshot(expected)
    observations.push({ phase, property, actual: observed, expected: intended,
      status: JSON.stringify(observed) === JSON.stringify(intended) ? 'PASS' : 'FAIL' })
  }
}

function contentFor(spec) {
  if (spec.noop) {
    const text = 'un{{swatch}} {{mention}} rest'
    return { before: [text], after: [text] }
  }
  const tag = markTags[spec.tool], edge = edgeTags[spec.tool], middle = middleTags[spec.tool]
  const full = spec.boundary === 'Element'
  if (spec.variant === 'nested') {
    const before = 'un' + wrap(edge, wrap(tag, wrap(tag, 'Alpha'))) + ' {{swatch}} {{mention}} rest'
    const after = 'un' + wrap(edge, full ? 'Alpha' : wrap(tag, 'Al') + 'p' + wrap(tag, 'ha')) + ' {{swatch}} {{mention}} rest'
    return { before: [before], after: [after] }
  }
  const styled = value => '<span style="color:#800000">' + wrap(middle, value) + '</span>'
  const link = value => '<a href="/kept" rel="noopener noreferrer">' + wrap(edge, value) + '</a>'
  const separator = spec.shape === 'single' ? ' ' : ''
  let lead, end, transformedLead, transformedEnd
  if (spec.variant === 'apply') {
    lead = 'un' + wrap(edge, 'Alpha') + ' Plain ' + styled('MiXeD &amp; tail') + '<br>' + link('Link') + ' {{swatch}} {{mention}}' + separator
    end = wrap(edge, 'Bravo') + ' rest'
    transformedLead = 'un' + wrap(edge, full ? wrap(tag, 'Alpha') : 'Al' + wrap(tag, 'pha'))
      + wrap(tag, ' Plain ') + styled(wrap(tag, 'MiXeD &amp; tail')) + '<br>' + link(wrap(tag, 'Link'))
      + wrap(tag, ' ') + '{{swatch}}' + wrap(tag, ' ') + '{{mention}}' + (separator ? wrap(tag, separator) : '')
    transformedEnd = wrap(edge, full ? wrap(tag, 'Bravo') : wrap(tag, 'Bra') + 'vo') + ' rest'
  } else {
    lead = 'un' + wrap(edge, wrap(tag, 'Alpha')) + ' Plain ' + wrap(tag, styled(wrap(tag, 'MiXeD &amp; tail')))
      + '<br>' + link(wrap(tag, 'Link')) + ' {{swatch}} {{mention}}' + separator
    end = wrap(edge, wrap(tag, 'Bravo')) + ' rest'
    transformedLead = 'un' + wrap(edge, full ? 'Alpha' : wrap(tag, 'Al') + 'pha')
      + ' Plain ' + styled('MiXeD &amp; tail') + '<br>' + link('Link') + ' {{swatch}} {{mention}}' + separator
    transformedEnd = wrap(edge, full ? 'Bravo' : 'Bra' + wrap(tag, 'vo')) + ' rest'
  }
  return spec.shape === 'single' ? { before: [lead + end], after: [transformedLead + transformedEnd] }
    : { before: [lead, end], after: [transformedLead, transformedEnd] }
}

function parse(html) {
  const template = document.createElement('template')
  template.innerHTML = html
  return template.content
}

// Compare author meaning while allowing equivalent strong/b and em/i wire
// spelling and CSS declaration order. No source-specific result is excused.
function meaning(html) {
  return meaningNodes(parse(html).childNodes)
}

function meaningNodes(nodes) {
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
      const parts = node.data.split(/(\{\{(?:swatch|mention)\}\})/)
      for (const part of parts) append(part, marks, /^\{\{(?:swatch|mention)\}\}$/.test(part) ? 'widget' : 'text')
      return
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.hasAttribute('data-inline-plugin')) {
        append('{{' + node.getAttribute('data-id') + '}}', marks, 'widget')
        return
      }
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
  for (const node of nodes) walk(node)
  return result
}

const expectedWidgets = (readOnly = false) => [
  { id: 'swatch', type: 'color', value: '#aBcDef', label: '#aBcDef', dot: 'rgb(171, 205, 239)', contenteditable: 'false' },
  { id: 'mention', type: 'mention', value: 'ada', label: '@Ada', dot: null, contenteditable: readOnly ? 'false' : null },
]
function visibleWidgets(field) {
  return [...field.querySelectorAll('[data-inline-plugin]')].map(widget => ({
    id: widget.getAttribute('data-id'), type: widget.getAttribute('data-inline-plugin'), value: widget.getAttribute('data-value'),
    label: widget.getAttribute('data-inline-plugin') === 'mention' ? widget.textContent : widget.querySelector('.oe-ip__label')?.textContent ?? null,
    dot: widget.querySelector('.oe-ip__dot')?.style.backgroundColor ?? null,
    contenteditable: widget.getAttribute('contenteditable'),
  }))
}
function firstText(node) {
  if (node.nodeType === Node.TEXT_NODE) return node
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
  return walker.nextNode()
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

export async function runBasicMarkCase({ sourceBase = '../../', legacy = false, spec, nativeInput }) {
  if (spec.lifetime) return runBasicMarkLifetimeCase({ sourceBase, legacy, spec, nativeInput })
  const base = new URL(sourceBase, import.meta.url)
  const [{ createEditor }, paragraph, defaults, color, mention, quote] = await Promise.all([
    import(new URL('core/index.js', base)), import(new URL('plugins/paragraph/index.js', base)),
    import(new URL('inline-tools/defaults.js', base)), import(new URL('inline-plugins/color.js', base)),
    import(new URL('inline-plugins/mention/index.js', base)),
    spec.shape === 'fields' ? import(new URL('plugins/quote/index.js', base)) : null,
  ])
  const observations = [], completedPhases = [], transactions = [], trusted = [], unsupported = [], diagnostics = []
  const check = createCheck(observations)
  const holder = document.createElement('section')
  holder.style.cssText = 'width:900px; margin:80px auto;'
  document.body.append(holder)
  holder.addEventListener('input', event => trusted.push({ type: event.type, inputType: event.inputType, trusted: event.isTrusted }))
  holder.addEventListener('keydown', event => {
    if (event.key.toLowerCase() === 'z') trusted.push({ type: event.type, key: event.key, trusted: event.isTrusted })
  })
  const content = contentFor(spec)
  const widgetData = { swatch: { type: 'color', ...(!legacy ? { dataVersion: 1 } : {}), data: { ...colorData } },
    mention: { type: 'mention', ...(!legacy ? { dataVersion: 1 } : {}), data: { ...mentionData } } }
  const input = { version: legacy ? '1.0.5' : '2.0.0', blocks: spec.shape === 'fields' ? [{
    id: 'a', type: 'quote', ...(!legacy ? { dataVersion: 1 } : {}),
    data: { text: content.before[0], caption: content.before[1] }, inline: widgetData,
  }] : content.before.map((text, index) => ({
    id: index ? 'b' : 'a', type: 'paragraph', ...(!legacy ? { dataVersion: 2 } : {}), data: { text },
    ...(!index ? { inline: widgetData } : {}),
  })) }
  const originalInput = JSON.stringify(input)
  let producerCalls = 0, providerCalls = 0
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
      inlinePlugins: [color.createColorSwatchPlugin(), mention.createMentionPlugin({ searchFunction: async () => { providerCalls++; return [] } })], inlineTools: tools, injectStyles: true, data: input,
      onDiagnostic: value => diagnostics.push({ code: value.code, message: value.message }),
    })
    if (!legacy) editor.on('transaction:committed', event => transactions.push({ action: event.action, origin: event.origin, name: event.name }))
    const fields = () => [...holder.querySelectorAll(spec.shape === 'fields' ? '.oe-quote__text, .oe-quote__caption' : '.oe-paragraph')]
    const fieldNames = spec.shape === 'fields' ? ['quote.text', 'quote.caption'] : ['a', 'b']
    const states = () => editor.save().blocks
    const texts = () => spec.shape === 'fields' ? [states()[0].data.text, states()[0].data.caption] : states().map(block => block.data.text)
    const fieldMeaning = () => texts().map(meaning)
    const checkVisible = (phase, expectedTexts) => {
      check(phase, 'visibleTextAndMarks', fields().map(field => meaningNodes(field.childNodes)), expectedTexts.map(meaning))
      check(phase, 'visibleWidgets', fields().map(visibleWidgets), expectedTexts.map((_, index) => index ? [] : expectedWidgets()))
    }
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
      const end = { field: fieldNames[spec.shape === 'single' ? 0 : 1], offset: spec.variant === 'nested'
        ? (spec.boundary === 'Element' ? 8 : 6) : length(parse(expected.at(-1))) - 5 - (spec.boundary === 'Text' ? 2 : 0) }
      return { anchor: spec.backward ? end : start, focus: spec.backward ? start : end, collapsed: false }
    }
    const historyState = () => ({ canUndo: editor.canUndo, canRedo: editor.canRedo })
    const eventActions = () => transactions.map(event => event.action)
    await pause(50)
    const initial = states()
    check('load', 'fixedInputMeaning', fieldMeaning(), content.before.map(meaning))
    checkVisible('load', content.before)
    check('load', 'fixedWidgetPayload', Object.fromEntries(Object.entries(initial[0].inline ?? {}).map(([id, widget]) => [id, { type: widget.type, data: widget.data }])),
      { swatch: { type: 'color', data: colorData }, mention: { type: 'mention', data: mentionData } })
    check('load', 'history', historyState(), { canUndo: false, canRedo: false })
    completedPhases.push('load')
    phase = 'input'
    const first = fields()[0], native = window.getSelection()
    first.focus(); native.setBaseAndExtent(first.firstChild, 0, first.firstChild, 0)
    await nativeInput('Input.insertText', { text: 'X' }); await pause()
    const typed = states(), beforeTexts = content.before.map((text, index) => (index ? '' : 'X') + text)
    check('input', 'independentPrecedingEdit', fieldMeaning(), beforeTexts.map(meaning))
    checkVisible('input', beforeTexts)
    check('input', 'trustedInsert', trusted.some(value => value.type === 'input' && value.inputType === 'insertText' && value.trusted), true)
    if (!legacy) check('input', 'completedActions', eventActions(), ['commit'])
    completedPhases.push('input')
    let selectionTexts = beforeTexts
    if (spec.noop) {
      phase = 'prepare-redo'; await history(nativeInput, false)
      check(phase, 'exactCanonicalDocument', states(), initial)
      checkVisible(phase, content.before)
      check(phase, 'redoAvailableBeforeNoop', historyState(), { canUndo: false, canRedo: true })
      selectionTexts = content.before
      completedPhases.push(phase)
    }
    phase = 'selection'
    const all = fields(), edge = edgeTags[spec.tool], firstMark = all[0].querySelector(edge), lastMark = spec.variant === 'nested' ? firstMark : [...all.at(-1).querySelectorAll(edge)].at(-1)
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
      from = element ? firstMark : firstText(firstMark); to = element ? lastMark : firstText(lastMark)
      fromOffset = element ? 0 : 2; toOffset = element ? 1 : 3
    }
    all[0].focus()
    native.setBaseAndExtent(spec.backward ? to : from, spec.backward ? toOffset : fromOffset,
      spec.backward ? from : to, spec.backward ? fromOffset : toOffset)
    document.dispatchEvent(new Event('selectionchange')); await pause(50)
    check('selection', 'exactInitialEndpoints', selectionState(), selectedState(selectionTexts))
    const widgets = [...all[0].querySelectorAll('[data-inline-plugin]')]
    if (widgets.length !== 2) throw new Error('Real Color and Mention widgets did not mount')
    const widgetChildren = widgets.map(widget => [...widget.childNodes]), widgetMarkup = widgets.map(widget => widget.innerHTML)
    completedPhases.push('selection')
    phase = 'apply'
    check('apply', 'trustedNamedButton', await click(holder.querySelector(`[data-tool="${spec.tool}"]`), nativeInput), true)
    const after = states(), afterTexts = spec.noop ? content.after : content.after.map((text, index) => (index ? '' : 'X') + text)
    check('apply', 'intendedTextAndMarks', fieldMeaning(), afterTexts.map(meaning))
    checkVisible('apply', afterTexts)
    check('apply', 'sidecars', after.map(block => block.inline), typed.map(block => block.inline))
    check('apply', 'liveWidgetIdentity', widgets.every((widget, index) => widget.isConnected
      && all[0].querySelectorAll('[data-inline-plugin]')[index] === widget
      && widgetChildren[index].every((child, at) => widget.childNodes[at] === child)), true)
    check('apply', 'liveWidgetPayloadAndMarkup', widgets.map(widget => widget.innerHTML), widgetMarkup)
    check('apply', 'blockIdentities', after.map(block => [block.id, block.type]), initial.map(block => [block.id, block.type]))
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
      checkVisible(phase, beforeTexts)
      check(phase, 'history', historyState(), { canUndo: true, canRedo: false })
      completedPhases.push(phase)
      phase = 'undo-input'; await history(nativeInput, false)
      check(phase, 'onlyOriginalEditWasUndoable', states(), initial)
      checkVisible(phase, content.before)
      check(phase, 'history', historyState(), { canUndo: false, canRedo: true })
      check(phase, 'trustedHistory', trusted.filter(value => value.type === 'keydown').map(value => value.trusted), [true, true, true])
      if (!legacy) check(phase, 'exactCompletedActions', eventActions(), ['commit', 'undo', 'redo', 'undo'])
      completedPhases.push(phase)
    } else {
    phase = 'undo-action'; await history(nativeInput, false)
    check(phase, 'exactCanonicalDocument', states(), typed)
    checkVisible(phase, beforeTexts)
    check(phase, 'selection', selectionState(), selectedState(beforeTexts))
    check(phase, 'history', historyState(), { canUndo: true, canRedo: true })
    completedPhases.push(phase)
    phase = 'undo-input'; await history(nativeInput, false)
    check(phase, 'exactCanonicalDocument', states(), initial)
    checkVisible(phase, content.before)
    check(phase, 'history', historyState(), { canUndo: false, canRedo: true })
    completedPhases.push(phase)
    phase = 'redo-input'; await history(nativeInput, true)
    check(phase, 'exactCanonicalDocument', states(), typed)
    checkVisible(phase, beforeTexts)
    check(phase, 'history', historyState(), { canUndo: true, canRedo: true })
    completedPhases.push(phase)
    phase = 'redo-action'; await history(nativeInput, true)
    check(phase, 'exactCanonicalDocument', states(), after)
    check(phase, 'intendedTextAndMarks', fieldMeaning(), afterTexts.map(meaning))
    checkVisible(phase, afterTexts)
    check(phase, 'selection', selectionState(), selectedState(afterTexts))
    check(phase, 'history', historyState(), { canUndo: true, canRedo: false })
    check(phase, 'trustedHistory', trusted.filter(value => value.type === 'keydown').map(value => value.trusted), [true, true, true, true])
    if (!legacy) check(phase, 'exactCompletedActions', eventActions(), ['commit', 'commit', 'undo', 'undo', 'redo', 'redo'])
    completedPhases.push(phase)
    }
    check(phase, 'inputNotMutated', JSON.stringify(input), originalInput)
    check(phase, 'providerCalls', providerCalls, 0)
    phase = 'dispose'; editor.destroy()
    check(phase, 'rootRemoved', holder.querySelector('.oe-editor'), null)
    completedPhases.push(phase)
    return { id: spec.id, spec, observations, completedPhases, planned, trusted, unsupported, diagnostics, transactions, error: null }
  } catch (error) {
    if (legacy && spec.noop === 'atomic' && phase === 'apply'
      && error.message === 'Named public toolbar action is not visible') unsupported.push({
      property: 'atomicOnlyToolbarActivation',
      reason: 'The valid atomic-only range is recorded above, but v1 does not expose the named toolbar action for it. No operation or history equivalence is inferred.',
    })
    return { id: spec.id, spec, observations, completedPhases, planned, trusted, unsupported, diagnostics, transactions, phase, error: error.stack ?? String(error) }
  } finally { editor?.destroy(); holder.remove() }
}

async function runBasicMarkLifetimeCase({ sourceBase, legacy, spec, nativeInput }) {
  const base = new URL(sourceBase, import.meta.url)
  const [{ createEditor }, paragraph, defaults, color, mention] = await Promise.all([
    import(new URL('core/index.js', base)), import(new URL('plugins/paragraph/index.js', base)),
    import(new URL('inline-tools/defaults.js', base)), import(new URL('inline-plugins/color.js', base)),
    import(new URL('inline-plugins/mention/index.js', base)),
  ])
  const observations = [], completedPhases = [], trusted = [], unsupported = [], diagnostics = [], transactions = []
  const planned = ['load', 'inactive-ui', 'live-action', 'undo', 'redo', 'dispose']
  const check = createCheck(observations)
  if (legacy) unsupported.push({ property: 'transactionEventsAndProducerCount', reason: 'The historical default-tool resolver owns its selection injection and has no v2 transaction-event contract. Public canonical/lifetime effects and exact Undo/Redo still execute.' })
  const holder = document.createElement('section')
  holder.style.cssText = 'width:900px; margin:80px auto;'
  document.body.append(holder)
  holder.addEventListener('keydown', event => {
    if (event.key.toLowerCase() === 'z') trusted.push({ type: event.type, key: event.key, trusted: event.isTrusted })
  })
  const html = wrap(markTags[spec.tool], wrap(edgeTags[spec.tool], 'Abc')) + ' {{swatch}} {{mention}} Tail'
  const create = () => {
    const state = { calls: 0, events: [] }
    const tools = legacy ? [spec.tool] : defaults.createDefaultInlineTools({ types: [spec.tool] }).map(tool => ({
      ...tool, toggle(selection) { state.calls++; return tool.toggle(selection) },
    }))
    const editor = createEditor({ holder, plugins: [legacy ? new paragraph.Paragraph() : paragraph.createParagraphPlugin()],
      inlinePlugins: [color.createColorSwatchPlugin(), mention.createMentionPlugin({ searchFunction: async () => [] })], inlineTools: tools, injectStyles: true,
      onDiagnostic: value => diagnostics.push({ code: value.code, message: value.message }),
      data: { version: legacy ? '1.0.5' : '2.0.0', blocks: [{ id: 'same-id', type: 'paragraph',
        ...(!legacy ? { dataVersion: 2 } : {}), data: { text: html },
        inline: { swatch: { type: 'color', ...(!legacy ? { dataVersion: 1 } : {}), data: { ...colorData } },
          mention: { type: 'mention', ...(!legacy ? { dataVersion: 1 } : {}), data: { ...mentionData } } },
      }] },
    })
    if (!legacy) editor.on('transaction:committed', event => {
      const value = { action: event.action, origin: event.origin, name: event.name }
      state.events.push(value); transactions.push(value)
    })
    return { editor, state }
  }
  const field = () => holder.querySelector('.oe-paragraph')
  const checkVisible = (phase, expectedText, readOnly = false) => {
    check(phase, 'visibleTextAndMarks', meaningNodes(field().childNodes), meaning(expectedText))
    check(phase, 'visibleWidgets', visibleWidgets(field()), expectedWidgets(readOnly))
  }
  const select = async () => {
    field().focus()
    const text = firstText(field().querySelector(edgeTags[spec.tool]) ?? field())
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
    checkVisible('load', html)
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
    checkVisible(phase, html, spec.lifetime === 'read-only')
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
    const expected = wrap(edgeTags[spec.tool], 'Abc') + ' {{swatch}} {{mention}} Tail'
    check(phase, 'liveCapabilityStillWorks', meaning(after[0].data.text), meaning(expected))
    checkVisible(phase, expected)
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
    checkVisible(phase, html)
    check(phase, 'selection', selection(), { anchor: 3, focus: 0, collapsed: false })
    check(phase, 'history', [current.editor.canUndo, current.editor.canRedo], [false, true])
    completedPhases.push(phase)
    phase = 'redo'; await history(nativeInput, true)
    check(phase, 'exactCanonicalDocument', current.editor.save().blocks, after)
    checkVisible(phase, expected)
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
