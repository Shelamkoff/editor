const mainCases = ['apply', 'enter', 'reset'].flatMap(action => ['single', 'cross', 'fields'].flatMap(shape =>
  ['Text', 'Element'].flatMap(boundary => [false, true].map(backward => ({
    id: [action, shape, boundary, backward ? 'backward' : 'forward'].join('/'), action, shape, boundary, backward,
  })))))
const partialCases = ['apply', 'reset'].flatMap(action => ['Text', 'Element'].flatMap(boundary => [false, true].map(backward => ({
  id: ['partial', action, boundary, backward ? 'backward' : 'forward'].join('/'), action, shape: 'single', boundary, backward, partial: true,
}))))
const noops = ['plain-reset', 'atomic-apply', 'atomic-reset'].flatMap(noop => [false, true].map(backward => ({
  id: ['noop', noop, backward ? 'backward' : 'forward'].join('/'), action: noop.endsWith('apply') ? 'apply' : 'reset', shape: 'single', boundary: 'Element', backward, noop,
})))
const cancels = ['escape', 'outside'].flatMap(action => ['Text', 'Element'].flatMap(boundary => [false, true].map(backward => ({
  id: ['cancel', action, boundary, backward ? 'backward' : 'forward'].join('/'), action, shape: 'single', boundary, backward, cancel: true,
}))))
const lifetimeCases = ['read-only', 'destroy', 'render'].map(lifetime => ({ id: 'lifetime/' + lifetime, lifetime }))
export const bgColorToolCases = [...mainCases, ...partialCases, ...noops, ...cancels, ...lifetimeCases]
const pause = (ms = 35) => new Promise(resolve => setTimeout(resolve, ms))
const copy = value => JSON.parse(JSON.stringify(value))
const lead = 'un<b>Alpha</b> <i>Beta</i><br><span style="background-color:#0000ff;color:#800000;font-size:24px">γ <a href="/kept" rel="noopener noreferrer" target="articlePreview">T<i>ai</i>l</a></span> {{swatch}} tail'
const tail = '<b>Bravo</b> rest'
const aliases = { strong: 'b', em: 'i', strike: 's', del: 's' }
const decode = value => value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_, entity) => {
  if (entity[0] === '#') return String.fromCodePoint(parseInt(entity.slice(entity[1]?.toLowerCase() === 'x' ? 2 : 1), entity[1]?.toLowerCase() === 'x' ? 16 : 10))
  return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' }[entity.toLowerCase()]
})
function colorValue(value) {
  const clean = value.trim().toLowerCase(), hex = clean.match(/^#([\da-f]{3}|[\da-f]{6})$/)
  if (hex) return '#' + (hex[1].length === 3 ? [...hex[1]].map(c => c + c).join('') : hex[1])
  const rgb = clean.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/)
  if (rgb) return '#' + rgb.slice(1, 4).map(c => Number(c).toString(16).padStart(2, '0')).join('') + (rgb[4] !== undefined && Number(rgb[4]) !== 1 ? '@' + Number(rgb[4]) : '')
  return clean
}
function styles(value) {
  return Object.fromEntries(value.split(';').filter(s => s.trim()).map(declaration => {
    const colon = declaration.indexOf(':'), name = declaration.slice(0, colon).trim().toLowerCase(), raw = declaration.slice(colon + 1).trim()
    return [name, name.endsWith('color') ? colorValue(raw) : raw]
  }))
}
const initialStyle = () => ({ marks: [], bg: null, color: null, size: null })
function childStyle(parent, tag, attrs) {
  const state = { ...parent, marks: [...parent.marks] }, css = styles(attrs.style ?? '')
  if (css['background-color']) state.bg = css['background-color']
  if (css.color) state.color = css.color
  if (css['font-size']) state.size = css['font-size']
  const other = Object.entries(css).filter(([name]) => !['background-color', 'color', 'font-size'].includes(name)).sort()
  if (other.length) state.marks.push('css:' + JSON.stringify(other))
  const attributes = Object.entries(attrs).filter(([name]) => name !== 'style').sort()
  if (tag !== 'span' || attributes.length) state.marks.push((aliases[tag] ?? tag) + (attributes.length ? ':' + JSON.stringify(attributes) : ''))
  state.marks = [...new Set(state.marks)].sort()
  return state
}
function textUnits(text, state) {
  const result = []
  for (const part of text.split(/(\{\{swatch\}\})/)) {
    if (part === '{{swatch}}') result.push({ kind: 'widget', text: part, ...initialStyle() })
    else for (let index = 0; index < part.length; index++) result.push({ kind: 'text', text: part[index], ...state })
  }
  return result
}
// A deliberately small wire parser for these fixed author fixtures. It never
// writes an HTML sink, imports a sanitizer or invokes a production normalizer.
export function bgColorWireMeaning(html) {
  const result = [], stack = [{ tag: null, state: initialStyle() }]
  for (const token of html.match(/<[^>]*>|[^<]+/g) ?? []) {
    if (token.startsWith('</')) {
      const tag = token.slice(2, -1).trim().toLowerCase(), index = stack.findLastIndex(entry => entry.tag === tag)
      if (index < 1) throw Error('Unexpected wire closing tag: ' + tag)
      stack.splice(index); continue
    }
    if (token.startsWith('<')) {
      const tag = token.match(/^<([\w-]+)/)?.[1]?.toLowerCase()
      if (!tag) throw Error('Unexpected author wire token: ' + token)
      if (tag === 'br') { result.push({ kind: 'break', text: '\n', ...initialStyle() }); continue }
      const attrs = {}
      for (const match of token.slice(tag.length + 1, -1).matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[match[1].toLowerCase()] = decode(match[2] ?? match[3])
      stack.push({ tag, state: childStyle(stack.at(-1).state, tag, attrs) }); continue
    }
    result.push(...textUnits(decode(token), stack.at(-1).state))
  }
  if (stack.length !== 1) throw Error('Unclosed author wire tag')
  return result
}
function visibleMeaning(field) {
  const result = []
  const walk = (node, state) => {
    if (node.nodeType === 3) { result.push(...textUnits(node.data, state)); return }
    if (node.nodeType === 1) {
      if (node.hasAttribute('data-inline-plugin')) { result.push({ kind: 'widget', text: '{{' + node.getAttribute('data-id') + '}}', ...initialStyle() }); return }
      if (node.localName === 'br') { result.push({ kind: 'break', text: '\n', ...initialStyle() }); return }
      state = childStyle(state, node.localName, Object.fromEntries([...node.attributes].map(a => [a.name, a.value])))
    }
    for (const child of node.childNodes) walk(child, state)
  }
  for (const child of field.childNodes) walk(child, initialStyle())
  return result
}
function logicalLength(node) {
  if (node.nodeType === 3) return node.data.replace(/\{\{swatch\}\}/g, '\ufffc').length
  if (node.nodeType === 1 && (node.hasAttribute('data-inline-plugin') || node.localName === 'br')) return 1
  return [...node.childNodes].reduce((sum, child) => sum + logicalLength(child), 0)
}
function logicalOffset(field, target, offset) {
  let total = 0, found = false
  const visit = node => {
    if (node === target) { total += node.nodeType === 3 ? offset : [...node.childNodes].slice(0, offset).reduce((sum, child) => sum + logicalLength(child), 0); found = true; return }
    if (node.nodeType === 3 || (node.nodeType === 1 && (node.hasAttribute('data-inline-plugin') || node.localName === 'br'))) total += logicalLength(node)
    else for (const child of node.childNodes) { visit(child); if (found) break }
  }
  visit(field); return found ? total : null
}
export async function runBgColorToolCase({ sourceBase = '../../', legacy = false, spec, nativeInput }) {
  if (spec.lifetime) return runBgColorLifetimeCase({ sourceBase, legacy, spec, nativeInput })
  const base = new URL(sourceBase, import.meta.url)
  const [core, paragraph, quote, color, defaults] = await Promise.all([
    'core/index.js', 'plugins/paragraph/index.js', 'plugins/quote/index.js', 'inline-plugins/color.js', ...(!legacy ? ['inline-tools/defaults.js'] : []),
  ].map(path => import(new URL(path, base))))
  const holder = document.createElement('section'); holder.style.cssText = 'width:850px;margin:100px auto'; document.body.append(holder)
  const observations = [], completedPhases = [], diagnostics = [], transactions = [], unsupported = [], trusted = []
  const check = (phase, property, actual, expected) => {
    const a = copy(actual), e = copy(expected)
    observations.push({ phase, property, actual: a, expected: e, status: JSON.stringify(a) === JSON.stringify(e) ? 'PASS' : 'FAIL' })
  }
  const idleAction = !!(spec.noop || spec.cancel)
  const planned = idleAction ? ['load', 'input', 'prepare-redo', 'selection', 'action', 'redo-input', 'undo-input', 'dispose']
    : ['load', 'input', 'selection', 'action', 'undo-action', 'undo-input', 'redo-input', 'redo-action', 'dispose']
  const texts = spec.shape === 'single' ? [lead + ' ' + tail] : [lead, tail]
  const sidecar = { swatch: { type: 'color', ...(!legacy ? { dataVersion: 1 } : {}), data: { value: '#aBcDef' } } }
  const input = { version: legacy ? '1.0.5' : '2.0.0', blocks: spec.shape === 'fields' ? [{
    id: 'a', type: 'quote', ...(!legacy ? { dataVersion: 1 } : {}), data: { text: texts[0], caption: texts[1] }, inline: sidecar,
  }] : texts.map((text, index) => ({ id: index ? 'b' : 'a', type: 'paragraph', ...(!legacy ? { dataVersion: 2 } : {}), data: { text }, ...(!index ? { inline: sidecar } : {}) })) }
  const originalInput = JSON.stringify(input)
  let editor, phase = 'load', producerCalls = 0
  holder.addEventListener('input', event => trusted.push({ type: 'input', inputType: event.inputType, trusted: event.isTrusted }))
  holder.addEventListener('keydown', event => { if (event.key.toLowerCase() === 'z') trusted.push({ type: 'history', trusted: event.isTrusted }) })
  const tools = legacy ? ['bgcolor'] : defaults.createDefaultInlineTools({ types: ['bgcolor'] }).map(tool => ({ ...tool,
    onMount(button, context) { return tool.onMount(button, { ...context, mutate(bookmark, operation) {
      return context.mutate(bookmark, (...args) => { producerCalls++; return operation(...args) })
    } }) },
  }))
  if (legacy) unsupported.push({ property: 'currentTransactionAndProducerPorts', reason: 'The real legacy resolver owns its selection controller. Its absent v2 observation ports are not simulated; public actions and history execute.' })
  const click = async element => {
    if (!element) throw Error('Missing named native control')
    element.scrollIntoView({ block: 'nearest' }); await pause(); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const r = element.getBoundingClientRect(); if (!r.width || !r.height) throw Error('Named native control is not visible')
    let seen = false
    const observe = event => { seen = event.isTrusted && element.contains(event.target) }
    element.ownerDocument.addEventListener('mousedown', observe, { capture: true, once: true })
    try { await nativeInput('Input.click', { x: r.left + r.width / 2, y: r.top + r.height / 2 }) }
    finally { element.ownerDocument.removeEventListener('mousedown', observe, true) }
    await pause(); return seen
  }
  const key = async (key, modifiers = 0) => {
    const codes = { z: ['KeyZ', 90], a: ['KeyA', 65], Enter: ['Enter', 13], Escape: ['Escape', 27] }, [code, num] = codes[key]
    for (const type of ['rawKeyDown', 'keyUp']) await nativeInput('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: num, nativeVirtualKeyCode: num, modifiers })
    await pause()
  }
  try {
    editor = core.createEditor({ holder, injectStyles: true, plugins: [legacy ? new paragraph.Paragraph() : paragraph.createParagraphPlugin(), legacy ? new quote.Quote() : quote.createQuotePlugin()],
      inlinePlugins: [color.createColorSwatchPlugin()], inlineTools: tools, data: input, onDiagnostic: value => diagnostics.push(value) })
    if (!legacy) editor.on('transaction:committed', event => transactions.push({ action: event.action, origin: event.origin, name: event.name }))
    const fields = () => [...holder.querySelectorAll(spec.shape === 'fields' ? '.oe-quote__text, .oe-quote__caption' : '.oe-paragraph')]
    const state = () => editor.save().blocks
    const savedTexts = () => spec.shape === 'fields' ? [state()[0].data.text, state()[0].data.caption] : state().map(block => block.data.text)
    const meaning = () => savedTexts().map(bgColorWireMeaning)
    const availability = () => [editor.canUndo, editor.canRedo]
    const actions = () => transactions.map(event => event.action)
    const selectionState = () => {
      const native = window.getSelection(), current = fields()
      const endpoint = (node, offset) => { const index = current.findIndex(f => f === node || f.contains(node)); return { field: index < 0 ? null : index, offset: index < 0 ? null : logicalOffset(current[index], node, offset) } }
      return { anchor: endpoint(native.anchorNode, native.anchorOffset), focus: endpoint(native.focusNode, native.focusOffset), collapsed: native.isCollapsed }
    }
    const start = { field: 0, offset: spec.partial ? 16 : spec.noop ? (spec.noop.startsWith('atomic') ? 20 : 0) : spec.boundary === 'Text' ? 5 : 2 }
    const end = { field: texts.length - 1, offset: spec.partial ? 18 : spec.noop ? (spec.noop.startsWith('atomic') ? 21 : 2) : (texts.length === 1 ? 27 : 0) + (spec.boundary === 'Text' ? 3 : 5) }
    const expectedSelection = { anchor: spec.backward ? end : start, focus: spec.backward ? start : end, collapsed: false }
    const expectedBefore = texts.map(bgColorWireMeaning), expectedTyped = expectedBefore.map((units, index) => index === texts.length - 1 ? [...units, ...textUnits('X', initialStyle())] : units)
    const expectedAfter = idleAction ? expectedBefore : expectedTyped.map((units, field) => units.map((unit, index) => unit.kind === 'text' && (field > start.field || index >= start.offset) && (field < end.field || index < end.offset)
      ? { ...unit, bg: spec.action === 'reset' ? null : '#ff0000' } : unit))
    const visible = (phase, intended) => {
      check(phase, 'visibleMeaning', fields().map(visibleMeaning), intended)
      check(phase, 'widgets', fields().map(f => [...f.querySelectorAll('[data-inline-plugin]')].map(w => ({ id: w.dataset.id, type: w.dataset.inlinePlugin, value: w.dataset.value, label: w.querySelector('.oe-ip__label')?.textContent ?? null, dot: w.querySelector('.oe-ip__dot')?.style.backgroundColor ?? null, editable: w.getAttribute('contenteditable') }))),
        texts.map((_, index) => index ? [] : [{ id: 'swatch', type: 'color', value: '#aBcDef', label: '#aBcDef', dot: 'rgb(171, 205, 239)', editable: 'false' }]))
    }
    await pause(60)
    const initial = state()
    check(phase, 'fixedMeaning', meaning(), expectedBefore); visible(phase, expectedBefore)
    check(phase, 'idsAndTypes', initial.map(b => [b.id, b.type]), spec.shape === 'fields' ? [['a', 'quote']] : texts.map((_, i) => [i ? 'b' : 'a', 'paragraph']))
    check(phase, 'sidecar', initial[0].inline, sidecar); check(phase, 'history', availability(), [false, false]); completedPhases.push(phase)
    phase = 'input'
    const last = fields().at(-1), native = window.getSelection(); last.focus(); native.setBaseAndExtent(last.lastChild, last.lastChild.textContent.length, last.lastChild, last.lastChild.textContent.length)
    await nativeInput('Input.insertText', { text: 'X' }); await pause()
    const typed = state()
    check(phase, 'independentEdit', meaning(), expectedTyped); visible(phase, expectedTyped)
    check(phase, 'trustedInput', trusted.some(e => e.type === 'input' && e.inputType === 'insertText' && e.trusted), true)
    if (!legacy) check(phase, 'events', actions(), ['commit']); completedPhases.push(phase)
    if (idleAction) {
      phase = 'prepare-redo'; await key('z', 2)
      check(phase, 'exactCanonical', state(), initial); check(phase, 'history', availability(), [false, true]); visible(phase, expectedBefore); completedPhases.push(phase)
    }
    phase = 'selection'
    const all = fields(), firstMark = all[0].querySelector('b'), lastMark = [...all.at(-1).querySelectorAll('b')].at(-1)
    let from = spec.boundary === 'Text' ? firstMark.firstChild : firstMark, to = spec.boundary === 'Text' ? lastMark.firstChild : lastMark
    let fromOffset = spec.boundary === 'Text' ? 3 : 0, toOffset = spec.boundary === 'Text' ? 3 : 1
    if (spec.partial) {
      const italic = all[0].querySelector('a i'); from = to = spec.boundary === 'Text' ? italic.firstChild : italic
      fromOffset = 0; toOffset = spec.boundary === 'Text' ? 2 : 1
    } else if (spec.noop) {
      from = to = spec.noop.startsWith('atomic') ? all[0] : all[0].firstChild
      fromOffset = spec.noop.startsWith('atomic') ? [...all[0].childNodes].indexOf(all[0].querySelector('[data-inline-plugin]')) : 0
      toOffset = fromOffset + (spec.noop.startsWith('atomic') ? 1 : 2)
    }
    all[0].focus(); native.setBaseAndExtent(spec.backward ? to : from, spec.backward ? toOffset : fromOffset, spec.backward ? from : to, spec.backward ? fromOffset : toOffset)
    document.dispatchEvent(new Event('selectionchange')); await pause(60)
    check(phase, 'endpoints', selectionState(), expectedSelection)
    const widget = all[0].querySelector('[data-inline-plugin]'), children = [...widget.childNodes], markup = widget.innerHTML, attrs = [...widget.attributes].map(a => [a.name, a.value]).sort()
    completedPhases.push(phase); phase = 'action'
    check(phase, 'trustedPicker', await click(holder.querySelector('[data-tool="bgcolor"]')), true)
    const inputEl = holder.querySelector('.oe-color-hex')
    check(phase, 'trustedAuxiliaryInput', await click(inputEl), true); check(phase, 'auxiliaryFocus', document.activeElement === inputEl, true)
    await key('a', 2); await nativeInput('Input.insertText', { text: '#ff0000' }); await pause()
    check(phase, 'beforeApplyCanonical', state(), idleAction ? initial : typed); check(phase, 'beforeApplyHistory', availability(), idleAction ? [false, true] : [true, false])
    if (spec.cancel) {
      if (spec.action === 'escape') { let trustedCancel = false; const observe = event => { trustedCancel = event.key === 'Escape' && event.isTrusted }; document.addEventListener('keydown', observe, { capture: true, once: true }); try { await key('Escape') } finally { document.removeEventListener('keydown', observe, true) }; check(phase, 'trustedCancel', trustedCancel, true) }
      else {
        const outside = document.createElement('button'); outside.textContent = 'Application action'; holder.after(outside)
        try { check(phase, 'trustedOutside', await click(outside), true); check(phase, 'outsideFocus', document.activeElement === outside, true) } finally { outside.remove() }
      }
    } else if (spec.action === 'enter') { let trustedEnter = false; inputEl.addEventListener('keydown', e => { if (e.key === 'Enter') trustedEnter = e.isTrusted }, { once: true }); await key('Enter'); check(phase, 'trustedAction', trustedEnter, true) }
    else check(phase, 'trustedAction', await click(holder.querySelector(spec.action === 'reset' ? '.oe-color-btn--remove' : '.oe-color-btn--apply')), true)
    const after = state()
    check(phase, 'intendedMeaning', meaning(), expectedAfter); visible(phase, expectedAfter)
    check(phase, 'widgetIdentity', widget.isConnected && fields()[0].querySelector('[data-inline-plugin]') === widget && children.length === widget.childNodes.length && children.every((n, i) => widget.childNodes[i] === n), true)
    check(phase, 'widgetMarkup', widget.innerHTML, markup); check(phase, 'widgetAttributes', [...widget.attributes].map(a => [a.name, a.value]).sort(), attrs)
    check(phase, 'sidecars', after.map(b => b.inline ?? null), typed.map(b => b.inline ?? null)); check(phase, 'idsAndTypes', after.map(b => [b.id, b.type]), initial.map(b => [b.id, b.type]))
    if (!(spec.cancel && spec.action === 'outside')) check(phase, 'selection', selectionState(), expectedSelection); check(phase, 'history', availability(), idleAction ? [false, true] : [true, false])
    if (idleAction) check(phase, 'canonicalNoop', state(), initial)
    check(phase, 'pickerClosed', !holder.querySelector('.oe-color-dropdown')?.getBoundingClientRect().height, true)
    if (!legacy) {
      check(phase, 'producerCalls', producerCalls, spec.cancel ? 0 : 1); check(phase, 'events', actions(), idleAction ? ['commit', 'undo'] : ['commit', 'commit'])
      if (!idleAction) check(phase, 'semanticTransaction', transactions.at(-1), { action: 'commit', origin: 'user', name: 'inline.bgcolor' })
    }
    completedPhases.push(phase)
    if (spec.cancel) { const current = fields()[0]; current.focus(); native.setBaseAndExtent(current.firstChild, 0, current.firstChild, 0) }
    const replays = idleAction ? [['redo-input', true, typed, expectedTyped, [true, false]], ['undo-input', false, initial, expectedBefore, [false, true]]] : [
      ['undo-action', false, typed, expectedTyped, [true, true]], ['undo-input', false, initial, expectedBefore, [false, true]],
      ['redo-input', true, typed, expectedTyped, [true, true]], ['redo-action', true, after, expectedAfter, [true, false]],
    ]
    for (const [next, redo, intended, expected, history] of replays) {
      phase = next; await key('z', redo ? 10 : 2)
      check(phase, 'exactCanonical', state(), intended); check(phase, 'meaning', meaning(), expected); visible(phase, expected); check(phase, 'history', availability(), history)
      if (phase.endsWith('action')) check(phase, 'selection', selectionState(), expectedSelection)
      completedPhases.push(phase)
    }
    check(phase, 'trustedHistory', trusted.filter(e => e.type === 'history').map(e => e.trusted), idleAction ? [true, true, true] : [true, true, true, true])
    if (!legacy) check(phase, 'events', actions(), idleAction ? ['commit', 'undo', 'redo', 'undo'] : ['commit', 'commit', 'undo', 'undo', 'redo', 'redo'])
    check(phase, 'inputNotMutated', JSON.stringify(input), originalInput)
    phase = 'dispose'; editor.destroy(); check(phase, 'rootRemoved', !holder.querySelector('.oe-editor'), true); completedPhases.push(phase)
    return { id: spec.id, spec, planned, completedPhases, observations, diagnostics, transactions, trusted, unsupported, error: null }
  } catch (error) {
    if (legacy && spec.noop?.startsWith('atomic') && phase === 'action' && error.message === 'Named native control is not visible') unsupported.push({ property: 'atomicOnlyToolbarActivation', reason: 'The valid atomic-only range exists, but the real v1 toolbar does not expose the named action. No substitute action or history pass is fabricated.' })
    return { id: spec.id, spec, planned, completedPhases, observations, diagnostics, transactions, trusted, unsupported, phase, error: String(error?.stack ?? error) }
  } finally { editor?.destroy(); holder.remove() }
}

export async function runBgColorLifetimeCase({ sourceBase = '../../', legacy = false, spec, nativeInput }) {
  const base = new URL(sourceBase, import.meta.url), [core, paragraph, color, defaults] = await Promise.all([
    'core/index.js', 'plugins/paragraph/index.js', 'inline-plugins/color.js', ...(!legacy ? ['inline-tools/defaults.js'] : []),
  ].map(path => import(new URL(path, base))))
  const holder = document.createElement('section'); holder.style.cssText = 'width:850px;margin:100px auto'; document.body.append(holder)
  const observations = [], completedPhases = [], diagnostics = [], transactions = [], unsupported = []
  const planned = ['load', 'inactive', 'live', 'undo', 'redo', 'dispose']
  const check = (phase, property, actual, expected) => observations.push({ phase, property, actual: copy(actual), expected: copy(expected), status: JSON.stringify(actual) === JSON.stringify(expected) ? 'PASS' : 'FAIL' })
  if (legacy) unsupported.push({ property: 'currentTransactionAndProducerPorts', reason: 'Real retained legacy controls and live successors execute. The absent v2 observer and mounted producer ports are not fabricated.' })
  const html = '<b><span style="background-color:#0000ff;color:#800000">Alpha</span></b> {{swatch}} tail'
  const data = suffix => ({ version: legacy ? '1.0.5' : '2.0.0', blocks: [{ id: 'same-id', type: 'paragraph', ...(!legacy ? { dataVersion: 2 } : {}), data: { text: html + suffix }, inline: { swatch: { type: 'color', ...(!legacy ? { dataVersion: 1 } : {}), data: { value: '#aBcDef' } } } }] })
  const key = async (key, modifiers = 0) => { const [code, num] = { a: ['KeyA', 65], z: ['KeyZ', 90] }[key]; for (const type of ['rawKeyDown', 'keyUp']) await nativeInput('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: num, nativeVirtualKeyCode: num, modifiers }); await pause() }
  const click = async element => { if (!element) throw Error('Missing native color control'); element.scrollIntoView({ block: 'nearest' }); await pause(); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); const r = element.getBoundingClientRect(); if (!r.height || !r.width) throw Error('Native color control hidden'); let trusted = false; const observe = e => { trusted = e.isTrusted && element.contains(e.target) }; document.addEventListener('mousedown', observe, { capture: true, once: true }); try { await nativeInput('Input.click', { x: r.left + r.width / 2, y: r.top + r.height / 2 }) } finally { document.removeEventListener('mousedown', observe, true) }; await pause(); return trusted }
  const create = () => {
    const state = { calls: 0, events: [] }
    const tools = legacy ? ['bgcolor'] : defaults.createDefaultInlineTools({ types: ['bgcolor'] }).map(tool => ({ ...tool, onMount(button, context) { return tool.onMount(button, { ...context, mutate(bookmark, operation) { return context.mutate(bookmark, (...args) => { state.calls++; return operation(...args) }) } }) } }))
    const editor = core.createEditor({ holder, injectStyles: true, plugins: [legacy ? new paragraph.Paragraph() : paragraph.createParagraphPlugin()], inlinePlugins: [color.createColorSwatchPlugin()], inlineTools: tools, data: data(''), onDiagnostic: value => diagnostics.push(value) })
    if (!legacy) editor.on('transaction:committed', event => { const value = { action: event.action, origin: event.origin, name: event.name }; state.events.push(value); transactions.push(value) })
    return { editor, state }
  }
  const field = () => holder.querySelector('.oe-paragraph')
  const select = async () => { const f = field(), text = f.querySelector('b span').firstChild; f.focus(); window.getSelection().setBaseAndExtent(text, 5, text, 0); document.dispatchEvent(new Event('selectionchange')); await pause(60) }
  let current, original, phase = 'load'
  try {
    original = current = create(); await pause(60); const initial = current.editor.save().blocks
    check(phase, 'canonicalText', initial[0].data.text.replace(/style="[^"]*"/, 'style="colors"'), html.replace(/style="[^"]*"/, 'style="colors"'))
    check(phase, 'history', [current.editor.canUndo, current.editor.canRedo], [false, false])
    await select(); check(phase, 'trustedOpen', await click(holder.querySelector('[data-tool="bgcolor"]')), true)
    const input = holder.querySelector('.oe-color-hex'), apply = holder.querySelector('.oe-color-btn--apply'), remove = holder.querySelector('.oe-color-btn--remove'), oldField = field()
    check(phase, 'trustedAuxiliary', await click(input), true); await key('a', 2); await nativeInput('Input.insertText', { text: '#ff0000' }); await pause(); completedPhases.push(phase)
    phase = 'inactive'
    if (spec.lifetime === 'read-only') current.editor.setReadOnly(true)
    else if (spec.lifetime === 'destroy') { current.editor.destroy(); current = create(); await pause(60) }
    else { current.editor.render(data(' updated')); await pause(60) }
    const beforeInactive = current.editor.save().blocks, oldMarkup = oldField.innerHTML, calls = original.state.calls, events = copy(original.state.events), history = [current.editor.canUndo, current.editor.canRedo]
    apply.click(); remove.click(); input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await pause()
    check(phase, 'retiredCanonical', current.editor.save().blocks, beforeInactive); check(phase, 'retiredHistory', [current.editor.canUndo, current.editor.canRedo], history); check(phase, 'retiredAuthorDom', oldField.innerHTML, oldMarkup)
    if (!legacy) { check(phase, 'retiredProducer', original.state.calls, calls); check(phase, 'retiredEvents', original.state.events, events); check(phase, 'noPriorProducer', calls, 0) }
    if (spec.lifetime === 'read-only') { check(phase, 'actualReadOnly', field().getAttribute('contenteditable'), 'false'); current.editor.setReadOnly(false) }
    completedPhases.push(phase); phase = 'live'
    await select(); const before = current.editor.save().blocks, beforeCalls = current.state.calls, beforeEvents = current.state.events.length
    check(phase, 'trustedOpen', await click(holder.querySelector('[data-tool="bgcolor"]')), true)
    const liveInput = holder.querySelector('.oe-color-hex'); check(phase, 'trustedInput', await click(liveInput), true); await key('a', 2); await nativeInput('Input.insertText', { text: '#ff0000' }); await pause()
    check(phase, 'trustedApply', await click(holder.querySelector('.oe-color-btn--apply')), true)
    const after = current.editor.save().blocks
    check(phase, 'authorText', field().textContent.replace('#aBcDef', '{{swatch}}'), 'Alpha {{swatch}} tail' + (spec.lifetime === 'render' ? ' updated' : ''))
    const alpha = field().querySelector('b span')
    check(phase, 'intendedBackground', alpha.style.backgroundColor, 'rgb(255, 0, 0)'); check(phase, 'otherColor', alpha.style.color, 'rgb(128, 0, 0)')
    check(phase, 'sidecars', after[0].inline, initial[0].inline); check(phase, 'history', [current.editor.canUndo, current.editor.canRedo], [true, false])
    if (!legacy) { check(phase, 'liveProducer', current.state.calls - beforeCalls, 1); check(phase, 'liveEvent', current.state.events.slice(beforeEvents), [{ action: 'commit', origin: 'user', name: 'inline.bgcolor' }]) }
    completedPhases.push(phase)
    phase = 'undo'; await key('z', 2); check(phase, 'exactCanonical', current.editor.save().blocks, before); completedPhases.push(phase)
    phase = 'redo'; await key('z', 10); check(phase, 'exactCanonical', current.editor.save().blocks, after); completedPhases.push(phase)
    phase = 'dispose'; current.editor.destroy(); original.editor.destroy(); check(phase, 'rootRemoved', !holder.querySelector('.oe-editor'), true); completedPhases.push(phase)
    return { id: spec.id, spec, planned, completedPhases, observations, diagnostics, transactions, unsupported, error: null }
  } catch (error) { return { id: spec.id, spec, planned, completedPhases, observations, diagnostics, transactions, unsupported, phase, error: String(error?.stack ?? error) } }
  finally { current?.editor.destroy(); original?.editor.destroy(); holder.remove() }
}
