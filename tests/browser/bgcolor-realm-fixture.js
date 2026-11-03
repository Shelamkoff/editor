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

export const bgColorRealmCases = [false, true].flatMap(trustedTypes => ['apply', 'enter', 'reset', 'escape', 'outside', 'alpha'].map(action => ({
  id: [trustedTypes ? 'trusted' : 'plain', action].join('/'), trustedTypes, action,
})))
const pause = (ms = 40) => new Promise(resolve => setTimeout(resolve, ms))
const copy = value => JSON.parse(JSON.stringify(value))
export async function runBgColorRealmCase({ sourceBase = '../../', spec, nativeInput }) {
  const observations = [], completedPhases = [], diagnostics = [], transactions = []
  const planned = ['load', 'auxiliary', 'action', 'undo', 'redo', 'dispose']
  const check = (phase, property, actual, expected) => observations.push({ phase, property, actual: copy(actual), expected: copy(expected), status: JSON.stringify(actual) === JSON.stringify(expected) ? 'PASS' : 'FAIL' })
  const base = new URL(sourceBase, import.meta.url), [core, paragraph, defaults] = await Promise.all(['core/index.js', 'plugins/paragraph/index.js', 'inline-tools/defaults.js'].map(path => import(new URL(path, base))))
  const frame = document.createElement('iframe'); frame.style.cssText = 'display:block;border:0;width:1050px;height:850px;margin:0 auto'
  const loaded = new Promise((resolve, reject) => { frame.onload = resolve; frame.onerror = reject })
  frame.src = new URL(spec.trustedTypes ? './bgcolor-realm-trusted-host.html' : './bgcolor-realm-host.html', import.meta.url).href
  document.body.append(frame); await loaded
  const doc = frame.contentDocument, view = frame.contentWindow, holder = doc.createElement('section'), parentPickers = document.querySelectorAll('.oe-color-dropdown').length
  holder.style.cssText = 'width:850px;margin:120px auto'; doc.body.append(holder)
  const outside = doc.createElement('button'); outside.textContent = 'Application action'; holder.after(outside)
  let editor, phase = 'load', producerCalls = 0
  const before = '<b><span style="background-color:#0000ff;color:#800000">Alpha</span></b> rest'
  const key = async (key, modifiers = 0) => {
    const [code, num] = { a: ['KeyA', 65], z: ['KeyZ', 90], Enter: ['Enter', 13], Escape: ['Escape', 27] }[key]
    for (const type of ['rawKeyDown', 'keyUp']) await nativeInput('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: num, nativeVirtualKeyCode: num, modifiers })
    await pause()
  }
  const click = async element => {
    if (!element) throw Error('Missing realm control')
    frame.scrollIntoView({ block: 'nearest' }); element.scrollIntoView({ block: 'nearest' }); await pause()
    const r = element.getBoundingClientRect(), f = frame.getBoundingClientRect(); if (!r.width || !r.height) throw Error('Realm control is not visible')
    let trusted = false
    const observe = event => { trusted = event.isTrusted && element.contains(event.target) }
    doc.addEventListener('mousedown', observe, { capture: true, once: true })
    try { await nativeInput('Input.click', { x: f.left + r.left + r.width / 2, y: f.top + r.top + r.height / 2 }) }
    finally { doc.removeEventListener('mousedown', observe, true) }
    await pause(); return trusted
  }
  const field = () => holder.querySelector('.oe-paragraph')
  const select = async () => { const f = field(), text = f.querySelector('span').firstChild; f.focus(); view.getSelection().setBaseAndExtent(text, 5, text, 0); doc.dispatchEvent(new view.Event('selectionchange')); await pause(60) }
  const selection = () => { const s = view.getSelection(); const offset = (node, at) => { const range = doc.createRange(); range.selectNodeContents(field()); range.setEnd(node, at); return range.toString().length }; return { anchor: offset(s.anchorNode, s.anchorOffset), focus: offset(s.focusNode, s.focusOffset), text: s.toString(), field: field().contains(s.anchorNode) && field().contains(s.focusNode), collapsed: s.isCollapsed } }
  const selected = { anchor: 5, focus: 0, text: 'Alpha', field: true, collapsed: false }
  try {
    let blocked = false
    try { doc.createElement('div').innerHTML = '<b>untrusted</b>' } catch (error) { blocked = error instanceof view.TypeError }
    check(phase, 'actualTrustedTypesPolicy', blocked, spec.trustedTypes)
    const tools = defaults.createDefaultInlineTools({ types: ['bgcolor'] }).map(tool => ({ ...tool, onMount(button, context) { return tool.onMount(button, { ...context, mutate(bookmark, operation) { return context.mutate(bookmark, (...args) => { producerCalls++; return operation(...args) }) } }) } }))
    editor = core.createEditor({ holder, injectStyles: true, plugins: [paragraph.createParagraphPlugin()], inlineTools: tools,
      data: { version: '2.0.0', blocks: [{ id: 'a', type: 'paragraph', dataVersion: 2, data: { text: before } }] }, onDiagnostic: value => diagnostics.push(value) })
    editor.on('transaction:committed', event => transactions.push({ action: event.action, origin: event.origin, name: event.name }))
    const state = () => editor.save().blocks, meaning = () => bgColorWireMeaning(state()[0].data.text), availability = () => [editor.canUndo, editor.canRedo]
    await pause(60); const initial = state()
    check(phase, 'initialMeaning', meaning(), bgColorWireMeaning(before)); check(phase, 'history', availability(), [false, false]); await select(); check(phase, 'selection', selection(), selected); completedPhases.push(phase)
    phase = 'auxiliary'
    check(phase, 'trustedPicker', await click(holder.querySelector('[data-tool="bgcolor"]')), true)
    const picker = holder.querySelector('.oe-color-dropdown'), input = picker.querySelector('.oe-color-hex'), apply = picker.querySelector('.oe-color-btn--apply')
    check(phase, 'nativeRealmOwner', { owner: picker.ownerDocument === doc, fallback: picker.classList.contains('oe-color-dropdown--native-realm'), parentPickers: document.querySelectorAll('.oe-color-dropdown').length }, { owner: true, fallback: true, parentPickers })
    check(phase, 'trustedInput', await click(input), true); check(phase, 'auxiliaryFocus', doc.activeElement === input && document.activeElement === frame, true)
    await key('a', 2); await nativeInput('Input.insertText', { text: '#ff0000' }); await pause()
    check(phase, 'beforeAction', state(), initial); check(phase, 'beforeActionHistory', availability(), [false, false]); completedPhases.push(phase)
    phase = 'action'
    if (spec.action === 'escape' || spec.action === 'outside') {
      if (spec.action === 'escape') await key('Escape'); else check(phase, 'trustedOutside', await click(outside), true)
      check(phase, 'cancelCanonical', state(), initial); check(phase, 'cancelHistory', availability(), [false, false]); check(phase, 'cancelProducer', producerCalls, 0)
      check(phase, 'cancelClosed', !picker.getBoundingClientRect().height, true)
      if (spec.action === 'escape') check(phase, 'cancelRestoredSelection', selection(), selected)
      await select(); check(phase, 'trustedReopen', await click(holder.querySelector('[data-tool="bgcolor"]')), true)
      check(phase, 'trustedReinput', await click(input), true); await key('a', 2); await nativeInput('Input.insertText', { text: '#ff0000' }); await pause()
    }
    if (spec.action === 'alpha') {
      check(phase, 'typedColorBeforeOpacity', input.value, '#ff0000')
      const alpha = picker.querySelector('.oe-color-native-realm__alpha'); check(phase, 'trustedAlpha', await click(alpha), true); check(phase, 'alphaValue', alpha.value, '0.5')
    }
    if (spec.action === 'enter') { let trusted = false; input.addEventListener('keydown', e => { trusted = e.key === 'Enter' && e.isTrusted }, { once: true }); await key('Enter'); check(phase, 'trustedAction', trusted, true) }
    else check(phase, 'trustedAction', await click(spec.action === 'reset' ? picker.querySelector('.oe-color-btn--remove') : apply), true)
    const intendedColor = spec.action === 'reset' ? null : spec.action === 'alpha' ? '#ff0000@0.5' : '#ff0000'
    const expected = bgColorWireMeaning(before).map((unit, index) => index < 5 ? { ...unit, bg: intendedColor } : unit)
    const after = state()
    check(phase, 'intendedMeaning', meaning(), expected); check(phase, 'producer', producerCalls, 1); check(phase, 'events', transactions, [{ action: 'commit', origin: 'user', name: 'inline.bgcolor' }]); check(phase, 'history', availability(), [true, false]); check(phase, 'closed', !picker.getBoundingClientRect().height, true); check(phase, 'selection', selection(), selected); completedPhases.push(phase)
    phase = 'undo'; await key('z', 2); check(phase, 'exactCanonical', state(), initial); check(phase, 'history', availability(), [false, true]); completedPhases.push(phase)
    phase = 'redo'; await key('z', 10); check(phase, 'exactCanonical', state(), after); check(phase, 'meaning', meaning(), expected); check(phase, 'history', availability(), [true, false]); completedPhases.push(phase)
    phase = 'dispose'; editor.destroy(); apply.click(); check(phase, 'retiredProducer', producerCalls, 1); check(phase, 'ownedRootRemoved', !holder.querySelector('.oe-editor') && !picker.isConnected, true); check(phase, 'noParentLeak', document.querySelectorAll('.oe-color-dropdown').length, parentPickers); completedPhases.push(phase)
    return { id: spec.id, spec, planned, completedPhases, observations, diagnostics, transactions, unsupported: [], error: null }
  } catch (error) { return { id: spec.id, spec, planned, completedPhases, observations, diagnostics, transactions, unsupported: [], phase, error: String(error?.stack ?? error) } }
  finally { editor?.destroy(); frame.remove() }
}
