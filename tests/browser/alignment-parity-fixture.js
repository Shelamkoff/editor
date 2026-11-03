export const alignmentCases = []
for (const value of ['left', 'center', 'right', 'justify']) {
  for (const shape of ['single', 'cross', 'fields']) for (const boundary of ['Text', 'Element']) for (const backward of [false, true]) {
    alignmentCases.push({ id: [value, shape, boundary, backward ? 'backward' : 'forward'].join('/'), value, shape, boundary, backward })
  }
  for (const kind of ['atomic', 'noop', 'mixed']) for (const backward of [false, true]) alignmentCases.push({
    id: [value, kind, backward ? 'backward' : 'forward'].join('/'), value, kind,
    shape: kind === 'mixed' ? 'cross' : 'single', boundary: kind === 'atomic' ? 'Element' : 'Text', backward,
  })
  for (const lifetime of ['read-only', 'destroy']) alignmentCases.push({ id: [value, lifetime].join('/'), value, lifetime, shape: 'single', boundary: 'Text', backward: true })
}

const pause = () => new Promise(resolve => setTimeout(resolve, 40))
const copy = value => JSON.parse(JSON.stringify(value))
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))
const lead = 'un<i>Alpha</i> &amp; <b>MiXeD</b><br><a href="/kept" rel="noopener noreferrer">Link</a> {{swatch}} {{mention}}'
const tail = '<i>Bravo</i> rest'
const values = ['left', 'center', 'right', 'justify']
const target = spec => spec.value === 'left' ? null : spec.value
function wantedSelection(spec) {
  const typed = !spec.lifetime && spec.kind !== 'noop' ? 1 : 0
  const names = spec.shape === 'fields' ? ['quote.text', 'quote.caption'] : ['a', spec.shape === 'single' ? 'a' : 'b']
  const start = spec.kind === 'atomic' ? 2 + typed : (spec.boundary === 'Element' ? 2 : 4) + typed
  const end = spec.kind === 'atomic' ? 3 + typed : (spec.shape === 'single' ? 25 + typed : 0) + (spec.boundary === 'Element' ? 5 : 3)
  const positions = [{ field: names[0], offset: start }, { field: names[1], offset: end }]
  return { anchor: positions[spec.backward ? 1 : 0], focus: positions[spec.backward ? 0 : 1], collapsed: false }
}
function initialAlign(spec, index = 0) {
  if (spec.kind === 'noop') return target(spec)
  if (spec.kind === 'mixed') return index ? 'justify' : 'center'
  return spec.value === 'left' ? 'center' : null
}
function records(spec, legacy, typed = false, applied = false) {
  const first = spec.kind === 'atomic' ? 'un{{swatch}} {{mention}} rest' : spec.shape === 'single' ? lead + ' ' + tail : lead
  const widget = (type, data) => ({ type, ...(!legacy ? { dataVersion: 1 } : {}), data })
  const result = [{ id: 'a', type: spec.shape === 'fields' ? 'quote' : 'paragraph',
    ...(!legacy ? { dataVersion: spec.shape === 'fields' ? 1 : 2 } : {}),
    data: { text: (typed ? 'X' : '') + first, ...(spec.shape === 'fields' ? { caption: tail } : {}) },
    inline: { swatch: widget('color', { value: '#aBcDef' }), mention: widget('mention', { id: 'ada', name: 'Ada' }) } }]
  if (spec.shape === 'cross') result.push({ id: 'b', type: 'paragraph', ...(!legacy ? { dataVersion: 2 } : {}), data: { text: tail } })
  for (const [index, block] of result.entries()) {
    const value = applied ? target(spec) : initialAlign(spec, index)
    if (value) block.tunes = { textAlign: value }
    if (legacy && block.type === 'paragraph' && value) block.data.align = value
  }
  result.push({ id: 'c', type: 'paragraph', ...(!legacy ? { dataVersion: 2 } : {}),
    data: { text: 'Neighbor' }, tunes: { textAlign: spec.value === 'right' ? 'center' : 'right' } })
  if (legacy) result.at(-1).data.align = result.at(-1).tunes.textAlign
  return result
}
const text = node => node.nodeType === 3 ? node : node.ownerDocument.createTreeWalker(node, NodeFilter.SHOW_TEXT).nextNode()
function length(node) {
  if (node.nodeType === 3) return node.data.length
  if (node.nodeType === 1 && (node.hasAttribute('data-inline-plugin') || node.localName === 'br')) return 1
  return [...node.childNodes].reduce((sum, child) => sum + length(child), 0)
}
function offset(root, target, at) {
  let count = 0, found = false
  const visit = node => {
    if (node === target) { count += node.nodeType === 3 ? at : [...node.childNodes].slice(0, at).reduce((sum, child) => sum + length(child), 0); found = true; return }
    if (node.nodeType === 3 || node.nodeType === 1 && (node.hasAttribute('data-inline-plugin') || node.localName === 'br')) count += length(node)
    else for (const child of node.childNodes) { visit(child); if (found) break }
  }
  visit(root); return found ? count : null
}
async function click(button, nativeInput) {
  if (!button) throw new Error('Alignment action is missing')
  button.scrollIntoView({ block: 'nearest' }); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  const rect = button.getBoundingClientRect(); if (!rect.width || !rect.height) throw new Error('Alignment action is not visible')
  let trusted = false
  const capture = event => { trusted = event.isTrusted && button.contains(event.target) }
  button.ownerDocument.addEventListener('mousedown', capture, { capture: true, once: true })
  try { await nativeInput('Input.click', { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }) }
  finally { button.ownerDocument.removeEventListener('mousedown', capture, true) }
  await pause(); return trusted
}
async function history(nativeInput, redo) {
  for (const type of ['rawKeyDown', 'keyUp']) await nativeInput('Input.dispatchKeyEvent', {
    type, key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90, modifiers: redo ? 10 : 2,
  })
  await pause()
}

export async function runAlignmentCase({ sourceBase = '../../', legacy = false, spec, nativeInput }) {
  const base = new URL(sourceBase, import.meta.url)
  const [core, paragraph, quote, defaults, color, mention] = await Promise.all([
    'core/index.js', 'plugins/paragraph/index.js', 'plugins/quote/index.js', 'inline-tools/defaults.js', 'inline-plugins/color.js', 'inline-plugins/mention/index.js',
  ].map(path => import(new URL(path, base))))
  const observations = [], transactions = [], trusted = [], diagnostics = [], unsupported = [], completedPhases = []
  const check = (phase, property, actual, expected) => {
    const a = actual === undefined ? { $undefined: true } : copy(actual), e = expected === undefined ? { $undefined: true } : copy(expected)
    observations.push({ phase, property, actual: a, expected: e, status: same(a, e) ? 'PASS' : 'FAIL' })
  }
  if (legacy) unsupported.push({ property: 'currentPanelPortAndTransactionEvents', reason: 'Legacy default-tool resolution supplies its own selection port; current scalar-port/event observations are not emulated. Actual public UI, data, styles and history still execute.' })
  const holder = document.createElement('section'); holder.style.cssText = 'width:900px;margin:80px auto'; document.body.append(holder)
  const panels = []
  const make = () => {
    const tools = legacy ? ['align'] : defaults.createDefaultInlineTools({ types: ['align'] }).map(tool => ({ ...tool,
      renderActions(ctx) {
        const record = { reads: [], writes: [], context: ctx }
        panels.push(record)
        record.element = tool.renderActions({ ...ctx,
          getTextAlign() { const value = ctx.getTextAlign(); record.reads.push(value); return value },
          setTextAlign(value) { const result = ctx.setTextAlign(value); record.writes.push({ value, result }); return result },
        })
        return record.element
      },
    }))
    const editor = core.createEditor({ holder, injectStyles: true,
      plugins: [legacy ? new paragraph.Paragraph() : paragraph.createParagraphPlugin(), legacy ? new quote.Quote() : quote.createQuotePlugin()],
      inlinePlugins: [color.createColorSwatchPlugin(), mention.createMentionPlugin({ searchFunction: async () => [] })], inlineTools: tools,
      onDiagnostic: value => diagnostics.push(value), data: { version: legacy ? '1.0.5' : '2.0.0', blocks: records(spec, legacy) } })
    if (!legacy) editor.on('transaction:committed', event => transactions.push({ action: event.action, origin: event.origin, name: event.name }))
    return editor
  }
  holder.addEventListener('input', event => trusted.push({ kind: 'input', type: event.inputType, trusted: event.isTrusted }))
  holder.addEventListener('keydown', event => { if (event.key.toLowerCase() === 'z') trusted.push({ kind: 'keydown', key: event.key, trusted: event.isTrusted }) })
  const fields = () => {
    const list = [...holder.querySelectorAll(spec.shape === 'fields' ? '.oe-quote__text, .oe-quote__caption' : '.oe-paragraph')]
    return list.slice(0, spec.shape === 'single' ? 1 : 2)
  }
  const selection = () => {
    const native = window.getSelection(), list = fields(), names = spec.shape === 'fields' ? ['quote.text', 'quote.caption'] : ['a', 'b']
    const position = (node, at) => {
      const index = list.findIndex(field => field === node || field.contains(node))
      return index < 0 ? null : { field: names[index], offset: offset(list[index], node, at) }
    }
    return { anchor: position(native.anchorNode, native.anchorOffset), focus: position(native.focusNode, native.focusOffset), collapsed: native.isCollapsed }
  }
  const choose = async () => {
    const list = fields(), a = list[0], b = list.at(-1), atomic = spec.kind === 'atomic'
    const first = atomic ? a : a.querySelector('i'), last = atomic ? a : b.querySelectorAll('i')[b.querySelectorAll('i').length - 1]
    const from = atomic || spec.boundary === 'Element' ? first : text(first), to = atomic || spec.boundary === 'Element' ? last : text(last)
    const start = atomic ? [...a.childNodes].indexOf(a.querySelector('[data-inline-plugin="color"]')) : spec.boundary === 'Element' ? 0 : 2
    const end = atomic ? start + 1 : spec.boundary === 'Element' ? 1 : 3
    a.focus(); window.getSelection().setBaseAndExtent(spec.backward ? to : from, spec.backward ? end : start, spec.backward ? from : to, spec.backward ? start : end)
    document.dispatchEvent(new Event('selectionchange')); await pause()
  }
  const effective = field => {
    const style = getComputedStyle(field), value = style.textAlign
    return value === 'start' ? style.direction === 'rtl' ? 'right' : 'left' : value === 'end' ? style.direction === 'rtl' ? 'left' : 'right' : value
  }
  const styles = () => [...fields().map(effective), effective(holder.querySelectorAll('.oe-paragraph')[spec.shape === 'fields' ? 0 : spec.shape === 'cross' ? 2 : 1])]
  const wantedStyles = applied => [...Array.from({ length: spec.shape === 'single' ? 1 : 2 }, (_, index) => {
    const value = applied ? target(spec) : initialAlign(spec, spec.shape === 'fields' ? 0 : index); return value ?? 'left'
  }), spec.value === 'right' ? 'center' : 'right']
  let editor, old, phase = 'load'
  const planned = spec.lifetime ? ['load', 'inactive', 'apply', 'undo', 'redo', 'dispose'] : spec.kind === 'noop'
    ? ['load', 'input', 'prepare-redo', 'selection', 'apply', 'redo-input', 'undo-input', 'dispose']
    : ['load', 'input', 'selection', 'apply', 'undo-action', 'undo-input', 'redo-input', 'redo-action', 'dispose']
  try {
    editor = make(); await pause()
    check(phase, 'canonical', editor.save().blocks, records(spec, legacy)); check(phase, 'styles', styles(), wantedStyles(false))
    check(phase, 'history', [editor.canUndo, editor.canRedo], [false, false])
    completedPhases.push(phase)
    if (!spec.lifetime) {
      phase = 'input'; const field = fields()[0]; field.focus(); window.getSelection().setBaseAndExtent(field.firstChild, 0, field.firstChild, 0)
      await nativeInput('Input.insertText', { text: 'X' }); await pause()
      check(phase, 'canonical', editor.save().blocks, records(spec, legacy, true)); check(phase, 'history', [editor.canUndo, editor.canRedo], [true, false]); completedPhases.push(phase)
      if (spec.kind === 'noop') { phase = 'prepare-redo'; await history(nativeInput, false); check(phase, 'canonical', editor.save().blocks, records(spec, legacy)); check(phase, 'history', [editor.canUndo, editor.canRedo], [false, true]); completedPhases.push(phase) }
    }
    phase = spec.lifetime ? 'inactive' : 'selection'; await choose()
    check(phase, 'selectionBefore', selection(), wantedSelection(spec))
    check(phase, 'trustedParent', await click(holder.querySelector('[data-tool="align"]'), nativeInput), true)
    let panel = holder.querySelector('.oe-inline-toolbar__align-panel')
    if (!panel) throw new Error('Alignment panel did not open')
    let button = panel.querySelectorAll('.oe-inline-tool')[values.indexOf(spec.value) + 1]
    if (spec.lifetime) {
      const stale = button
      const stalePort = panels.at(-1)
      if (spec.lifetime === 'destroy') { old = editor; old.destroy(); editor = make(); await pause() }
      else { editor.setReadOnly(true); editor.setReadOnly(false) }
      await choose(); await click(holder.querySelector('[data-tool="align"]'), nativeInput)
      panel = holder.querySelector('.oe-inline-toolbar__align-panel'); if (!panel) throw new Error('Live replacement alignment panel did not open')
      button = panel.querySelectorAll('.oe-inline-tool')[values.indexOf(spec.value) + 1]
      const active = document.activeElement, beforeSelection = selection()
      stale.click(); await pause()
      check(phase, 'retiredCanonical', editor.save().blocks, records(spec, legacy)); check(phase, 'successorPanel', panel.isConnected, true)
      check(phase, 'retiredFocus', document.activeElement === active, true); check(phase, 'retiredSelection', selection(), beforeSelection)
      if (!legacy) {
        check(phase, 'staleScalarPort', stalePort.writes, [{ value: target(spec), result: false }])
        check(phase, 'staleRead', stalePort.context.getTextAlign(), 'mixed')
      }
      check(phase, 'noHistory', [editor.canUndo, editor.canRedo, transactions.length], [false, false, 0]); completedPhases.push(phase)
    } else completedPhases.push(phase)
    phase = 'apply'
    const list = fields(), widgets = [...list[0].querySelectorAll('[data-inline-plugin]')], children = widgets.map(widget => [...widget.childNodes]), html = list.map(field => field.innerHTML), beforeSelection = selection()
    check(phase, 'panelFocus', panel.contains(document.activeElement), true)
    check(phase, 'activeValues', [...panel.querySelectorAll('.oe-inline-tool')].flatMap((item, index) => index && item.classList.contains('oe-inline-tool--active') ? [values[index - 1]] : []),
      spec.kind === 'mixed' ? [] : [initialAlign(spec) ?? 'left'])
    check(phase, 'trustedMode', await click(button, nativeInput), true)
    const typed = !spec.lifetime && spec.kind !== 'noop'
    check(phase, 'canonical', editor.save().blocks, records(spec, legacy, typed, true)); check(phase, 'styles', styles(), wantedStyles(true))
    check(phase, 'richDomPreserved', fields().map(field => field.innerHTML), html)
    check(phase, 'widgetIdentity', widgets.every((widget, index) => widget.isConnected && fields()[0].querySelectorAll('[data-inline-plugin]')[index] === widget && children[index].length === widget.childNodes.length && children[index].every((node, at) => widget.childNodes[at] === node)), true)
    check(phase, 'selection', selection(), beforeSelection); check(phase, 'panelClosed', !panel.isConnected, true)
    check(phase, 'history', [editor.canUndo, editor.canRedo], spec.kind === 'noop' ? [false, true] : [true, false])
    if (!legacy) {
      check(phase, 'scalarPort', panels.at(-1).writes, [{ value: target(spec), result: spec.kind !== 'noop' }])
      check(phase, 'scalarRead', panels.at(-1).reads, [spec.kind === 'mixed' ? 'mixed' : initialAlign(spec) ?? 'left'])
    }
    completedPhases.push(phase)
    const sequence = spec.lifetime ? [['undo', false, false, false], ['redo', true, false, true]] : spec.kind === 'noop'
      ? [['redo-input', true, true, false], ['undo-input', false, false, false]]
      : [['undo-action', false, true, false], ['undo-input', false, false, false], ['redo-input', true, true, false], ['redo-action', true, true, true]]
    for (const [name, redo, hasInput, aligned] of sequence) {
      phase = name; await history(nativeInput, redo)
      check(phase, 'canonical', editor.save().blocks, records(spec, legacy, hasInput, aligned)); check(phase, 'styles', styles(), wantedStyles(aligned))
      const expectedHistory = aligned ? [true, false] : hasInput ? [true, spec.kind !== 'noop'] : [false, true]
      check(phase, 'history', [editor.canUndo, editor.canRedo], expectedHistory)
      completedPhases.push(phase)
    }
    phase = 'dispose'; editor.destroy(); check(phase, 'rootRemoved', !holder.querySelector('.oe-editor'), true); completedPhases.push(phase)
    return { id: spec.id, spec, observations, transactions, trusted, diagnostics, unsupported, planned, completedPhases, error: null }
  } catch (error) { return { id: spec.id, spec, observations, transactions, trusted, diagnostics, unsupported, planned, completedPhases, phase, error: String(error?.stack ?? error) } }
  finally { editor?.destroy(); old?.destroy(); holder.remove() }
}
