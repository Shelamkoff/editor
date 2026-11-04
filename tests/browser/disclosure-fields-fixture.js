// Fixed wire/DOM readers adapted from the accepted Link fixture; no production parser or HTML sink.
const pause=(ms=30)=>new Promise(resolve=>setTimeout(resolve,ms)),copy=value=>JSON.parse(JSON.stringify(value))
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
function fontSizeValue(value) {
  return /^calc\(\s*(?:10px\s*\+\s*1em|1em\s*\+\s*10px)\s*\)$/i.test(value.trim()) ? 'calc(10px + 1em)' : value.trim()
}
function styles(value) {
  return Object.fromEntries(value.split(';').filter(s => s.trim()).map(declaration => {
    const colon = declaration.indexOf(':'), name = declaration.slice(0, colon).trim().toLowerCase(), raw = declaration.slice(colon + 1).trim()
    return [name, name.endsWith('color') ? colorValue(raw) : name === 'font-size' ? fontSizeValue(raw) : raw]
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
  for (const part of text.split(/(\{\{(?:swatch|capref)\}\})/)) {
    if (part === '{{swatch}}' || part === '{{capref}}') result.push({ kind: 'widget', text: part, ...initialStyle() })
    else for (let index = 0; index < part.length; index++) result.push({ kind: 'text', text: part[index], ...state })
  }
  return result
}
// A deliberately small wire parser for these fixed author fixtures. It never
// writes an HTML sink, imports a sanitizer or invokes a production normalizer.
export function linkWireMeaning(html) {
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
  if (node.nodeType === 3) return node.data.replace(/\{\{(?:swatch|capref)\}\}/g, '\ufffc').length
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

const baseCases = [
  ...['title', 'content'].flatMap(field => [false, true].map(backward => ({ id: 'edit/' + field + '/' + (backward ? 'backward' : 'caret'), kind: 'edit', field, backward }))),
  ...['apply', 'remove'].flatMap(action => ['Text', 'Element'].flatMap(boundary => [false, true].map(backward => ({ id: 'format/' + action + '/' + boundary + '/' + (backward ? 'backward' : 'forward'), kind: 'format', action, boundary, backward })))),
  ...['title', 'content'].map(field => ({ id: 'empty/' + field, kind: 'empty', field })),
  ...['title', 'content'].map(field => ({ id: 'navigate/' + field, kind: 'navigate', field })),
  { id: 'navigate/title-enter', kind: 'navigate', field: 'title', enter: true },
]

export const disclosureFieldsCases=['toggle','spoiler'].flatMap(family=>baseCases.filter(s=>s.kind!=='navigate').map(s=>({...s,id:family+'/'+s.id.replace('/title','/'+(family==='toggle'?'title':'label')),...(s.field?{field:s.field==='title'?(family==='toggle'?'title':'label'):s.field}:{}),family})))
export async function runDisclosureFieldsCase({ sourceBase = '../../', legacy = false, spec, nativeInput }) {
  const base = new URL(sourceBase, import.meta.url), family=spec.family, firstKey=family==='toggle'?'title':'label', second='content', selectors=family==='toggle'?['.oe-toggle__title','.oe-toggle__body']:['.oe-spoiler__label','.oe-spoiler__content'], button=family==='toggle'?'.oe-toggle__chevron':'.oe-spoiler__toggle'
  const [core, paragraph, disclosure, color, defaults] = await Promise.all([
    'core/index.js', 'plugins/paragraph/index.js', 'plugins/'+family+'/index.js', 'inline-plugins/color.js', ...(!legacy ? ['inline-tools/defaults.js'] : []),
  ].map(path => import(new URL(path, base))))
  const holder = document.createElement('section'); holder.style.cssText = 'width:850px;margin:100px auto'; document.body.append(holder)
  const main = (spec.kind === 'format' && spec.action === 'apply' ? '<b>Al</b>pha' : '<b>Alpha</b>') + ' {{swatch}}<br>tail', content = '<i>Beta</i> {{capref}}<br>finish'
  const record = (id, type, data, inline) => ({ id, type, ...(!legacy ? { dataVersion: type === family ? 1 : 2 } : {}), data, ...(inline ? { inline } : {}) })
  const ref = value => ({ type: 'color', ...(!legacy ? { dataVersion: 1 } : {}), data: { value } })
  const textData = { [firstKey]: spec.kind === 'empty' && spec.field === firstKey ? '' : main, content: spec.kind === 'empty' && spec.field === 'content' ? '' : content, ...(family==='toggle'?{open:true}:{}) }
  const refs = { ...(textData[firstKey] ? { swatch: ref('#aBcDef') } : {}), ...(textData.content ? { capref: ref('#123456') } : {}) }
  const input = { version: legacy ? '1.0.5' : '2.0.0', blocks: [record('prefix', 'paragraph', { text: 'Before' }), record('subject', family, textData, refs), record('suffix', 'paragraph', { text: 'After' })] }, original = copy(input)
  const observations = [], nativeEvents = [], transactions = [], diagnostics = [], unsupported = legacy ? [{ property: 'currentObservers', reason: 'Legacy transaction/diagnostic subscriptions are absent; empty fixture arrays are not legacy event counts.' }] : [], completedPhases = []
  const active = ['edit', 'format'].includes(spec.kind), planned = ['load', 'action', ...(spec.kind === 'navigate' ? ['navigate'] : []), ...(active ? ['undo', 'redo'] : []), 'roundtrip', 'dispose']
  const plugins = () => [legacy ? new paragraph.Paragraph() : paragraph.createParagraphPlugin(), legacy ? new disclosure[family==='toggle'?'Toggle':'Spoiler']() : disclosure[family==='toggle'?'createTogglePlugin':'createSpoilerPlugin']()]
  const create = (target, data, readOnly = false) => core.createEditor({ holder: target, plugins: plugins(), inlinePlugins: [color.createColorSwatchPlugin()], inlineTools: legacy ? ['bold'] : defaults.createDefaultInlineTools({ types: ['bold'] }), injectStyles: true, readOnly, data, onDiagnostic: value => diagnostics.push(value) })
  let editor, mirror, mirrorHolder, phase = 'load', error = null
  const state = () => editor.save().blocks, flags = () => [editor.canUndo, editor.canRedo]
  const fields = (target = holder) => selectors.map(selector=>target.querySelector(selector))
  const ownField = () => fields()[spec.field === 'content' ? 1 : 0]
  const check = (property, actual, expected) => observations.push({ phase, property, actual: copy(actual), expected: copy(expected), status: JSON.stringify(actual) === JSON.stringify(expected) ? 'PASS' : 'FAIL' })
  const meaning = blocks => blocks.map(block => ({ id: block.id, type: block.type, data: block.type === family ? Object.fromEntries(Object.entries(block.data).map(([key,value])=>[key,typeof value==='string'?linkWireMeaning(value):value])) : block.data }))
  const view = (wanted, target = holder) => {
    check('visible', fields(target).map(visibleMeaning), [firstKey, second].map(key => linkWireMeaning(wanted.find(b => b.id === 'subject').data[key])))
    check('widgets', fields(target).map(field => Array.from(field.querySelectorAll('[data-inline-plugin]'), w => ({ id: w.dataset.id, type: w.dataset.inlinePlugin, value: w.dataset.value, label: w.querySelector('.oe-ip__label')?.textContent ?? null, dot: w.querySelector('.oe-ip__dot')?.style.backgroundColor ?? null, editable: w.getAttribute('contenteditable') }))), [firstKey, second].map(key => !wanted[1].data[key] ? [] : [{ id: key === firstKey ? 'swatch' : 'capref', type: 'color', value: key === firstKey ? '#aBcDef' : '#123456', label: key === firstKey ? '#aBcDef' : '#123456', dot: key === firstKey ? 'rgb(171, 205, 239)' : 'rgb(18, 52, 86)', editable: 'false' }]))
  }
  const select = (field, anchor, focus = anchor) => { field.focus(); getSelection().setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset) }
  const key = async (key, modifiers = 0, role = key) => {
    const [code, number] = ({ Enter: ['Enter', 13], Tab: ['Tab', 9], Backspace: ['Backspace', 8], Delete: ['Delete', 46], z: ['KeyZ', 90] })[key]
    document.addEventListener('keydown', event => nativeEvents.push({ role, type: 'keydown', key: event.key, trusted: event.isTrusted, modifiers: (event.ctrlKey ? 2 : 0) | (event.shiftKey ? 8 : 0) }), { capture: true, once: true })
    for (const type of ['rawKeyDown', 'keyUp']) await nativeInput('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: number, nativeVirtualKeyCode: number, modifiers })
    await pause(65)
  }
  const click = async element => {
    if (!element) throw Error('Missing Disclosure Bold control')
    element.scrollIntoView({ block: 'nearest' }); await pause(65); const rect = element.getBoundingClientRect()
    if (!rect.width || !rect.height) throw Error('Hidden Disclosure Bold control')
    let hit = false; document.addEventListener('mousedown', event => { hit = event.isTrusted && element.contains(event.target); nativeEvents.push({ role: 'bold', type: 'mousedown', trusted: event.isTrusted, hit }) }, { capture: true, once: true })
    await nativeInput('Input.click', { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }); await pause(65); check('boldDelivered', hit, true)
  }
  const focusPoint = () => { const s = getSelection(), all = fields(); return { field: all.findIndex(f => f === document.activeElement), anchor: all.map(f => f.contains(s.anchorNode) ? logicalOffset(f, s.anchorNode, s.anchorOffset) : null), focus: all.map(f => f.contains(s.focusNode) ? logicalOffset(f, s.focusNode, s.focusOffset) : null) } }
  const selectionCheck = undo => { if(!active)return;let anchor,focus;if(spec.kind==='format'){anchor=spec.backward?[null,2]:[2,null];focus=spec.backward?[2,null]:[null,2]}else{const index=spec.field===firstKey?0:1,wordLength=index===0?5:4,a=undo?(spec.backward?wordLength-1:2):(spec.backward?2:3),f=undo?(spec.backward?1:2):a;anchor=[index===0?a:null,index===1?a:null];focus=[index===0?f:null,index===1?f:null]}const point=focusPoint();check('nativeSelection',{anchor:point.anchor,focus:point.focus},{anchor,focus}) }
  try {
    await nativeInput('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 }); editor = create(holder, input); await pause(100)
    if (!legacy) editor.on('transaction:committed', e => transactions.push({ action: e.action, origin: e.origin, name: e.name }))
    if(!fields()[1].getClientRects().length){const b=holder.querySelector(button),r=b.getBoundingClientRect();await nativeInput('Input.click',{x:r.x+r.width/2,y:r.y+r.height/2});await pause(80)}
    const initial = state(), neighbors = [holder.querySelectorAll('.oe-block')[0], holder.querySelectorAll('.oe-block')[2]], originalFields = fields(), originalWidgets = fields().map(f => Array.from(f.querySelectorAll('[data-inline-plugin]')))
    check('canonical', initial, input.blocks); check('history', flags(), [false, false]); view(initial); completedPhases.push(phase)
    phase = 'action'; let wanted = copy(initial)
    if (spec.kind === 'edit') {
      const field = ownField(), node = field.querySelector(spec.field === firstKey ? 'b' : 'i').firstChild, word = spec.field === firstKey ? 'Alpha' : 'Beta'
      select(field, { node, offset: spec.backward ? word.length - 1 : 2 }, { node, offset: spec.backward ? 1 : 2 })
      field.addEventListener('input', event => nativeEvents.push({ role: 'edit', type: 'input', trusted: event.isTrusted, inputType: event.inputType }), { once: true })
      await nativeInput('Input.insertText', { text: 'X' }); await pause(70)
      wanted[1].data[spec.field===firstKey?firstKey:second] = wanted[1].data[spec.field===firstKey?firstKey:second].replace(word, spec.backward ? word[0] + 'X' + word.at(-1) : word.slice(0, 2) + 'X' + word.slice(2))
    } else if (spec.kind === 'format') {
      const all = fields(), first = all[0].querySelector('b'), last = all[1].querySelector('i'); let a = { node: first.firstChild, offset: 2 }, b = { node: last.firstChild, offset: 2 }
      if (spec.boundary === 'Element') { first.firstChild.splitText(2); last.firstChild.splitText(2); a = { node: first, offset: 1 }; b = { node: last, offset: 1 } }
      select(all[spec.backward ? 1 : 0], spec.backward ? b : a, spec.backward ? a : b); await pause(80)
      check('directedSelection', { anchor: [logicalOffset(all[0], getSelection().anchorNode, getSelection().anchorOffset), logicalOffset(all[1], getSelection().anchorNode, getSelection().anchorOffset)], focus: [logicalOffset(all[0], getSelection().focusNode, getSelection().focusOffset), logicalOffset(all[1], getSelection().focusNode, getSelection().focusOffset)] }, spec.backward ? { anchor: [null, 2], focus: [2, null] } : { anchor: [2, null], focus: [null, 2] })
      await click(holder.querySelector('.oe-inline-tool[data-tool="bold"]'))
      wanted[1].data[firstKey] = spec.action === 'apply' ? '<b>Alpha </b>{{swatch}}<br><b>tail</b>' : '<b>Al</b>pha {{swatch}}<br>tail'; wanted[1].data.content = spec.action === 'apply' ? '<i><b>Be</b>ta</i> {{capref}}<br>finish' : content
    } else if (spec.kind === 'empty') {
      const field = ownField(); select(field, { node: field, offset: 0 }); await key('Backspace'); await key('Delete')
    }
    const after = state(); check('meaning', meaning(after), meaning(wanted)); check('sidecars', after.map(b => b.inline ?? null), initial.map(b => b.inline ?? null)); check('history', flags(), active ? [true, false] : [false, false]); view(wanted); selectionCheck(false)
    if (spec.kind !== 'format') check('canonical', after, wanted)
    check('neighborsRetained', holder.querySelectorAll('.oe-block')[0] === neighbors[0] && holder.querySelectorAll('.oe-block')[2] === neighbors[1], true)
    check('fieldsRetained', fields().every((f, i) => f === originalFields[i]), true); if (spec.kind !== 'format') check('widgetsRetained', fields().every((f, i) => originalWidgets[i].every(w => f.contains(w))), true); completedPhases.push(phase)
    if (spec.kind === 'navigate') {
      phase = 'navigate'; const field = ownField(); const r = document.createRange(); field.focus(); r.selectNodeContents(field); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r)
      await key(spec.enter ? 'Enter' : 'Tab', spec.field === 'content' ? 8 : 0, 'next-field'); const destination = spec.field === 'content' ? 0 : 1, offset = destination === 0 ? logicalLength(fields()[0]) : 0
      check('firstFocus', focusPoint(), { field: destination, anchor: [destination === 0 ? offset : null, destination === 1 ? offset : null], focus: [destination === 0 ? offset : null, destination === 1 ? offset : null] })
      await key('Tab', spec.field === 'content' ? 0 : 8, 'return-field'); const origin = spec.field === 'content' ? 1 : 0, finalOffset = origin === 0 ? logicalLength(fields()[0]) : 0
      check('returnFocus', focusPoint(), { field: origin, anchor: [origin === 0 ? finalOffset : null, origin === 1 ? finalOffset : null], focus: [origin === 0 ? finalOffset : null, origin === 1 ? finalOffset : null] }); check('canonical', state(), after); check('history', flags(), active ? [true, false] : [false, false]); completedPhases.push(phase)
    }
    if (active) { phase = 'undo'; await key('z', 2, 'undo'); check('canonical', state(), initial); check('history', flags(), [false, true]); view(initial); selectionCheck(true); completedPhases.push(phase); phase = 'redo'; await key('z', 10, 'redo'); check('canonical', state(), after); check('history', flags(), [true, false]); view(wanted); selectionCheck(false); completedPhases.push(phase) }
    phase = 'roundtrip'; const saved = editor.save(), savedCopy = copy(saved); mirrorHolder = document.createElement('section'); holder.after(mirrorHolder); mirror = create(mirrorHolder, saved, true); await pause(80)
    check('canonical', mirror.save().blocks, after); check('history', [mirror.canUndo, mirror.canRedo], [false, false]); check('readerFields', fields(mirrorHolder).map(f => f.getAttribute('contenteditable')), ['false', 'false']); view(wanted, mirrorHolder); check('readerInitialVisibility',!!fields(mirrorHolder)[1].getClientRects().length,family==='toggle');for(const [role,visible]of(family==='spoiler'?[['initialReveal',true],['conceal',false],['reveal',true]]:[['conceal',false],['reveal',true]])){const b=mirrorHolder.querySelector(button),r=b.getBoundingClientRect();document.addEventListener('mousedown',e=>nativeEvents.push({role,type:e.type,trusted:e.isTrusted}),{capture:true,once:true});await nativeInput('Input.click',{x:r.x+r.width/2,y:r.y+r.height/2});await pause(80);check(role+'Visible',!!fields(mirrorHolder)[1].getClientRects().length,visible);check(role+'Canonical',mirror.save().blocks,after);check(role+'History',[mirror.canUndo,mirror.canRedo],[false,false])}check('savedCaller', saved, savedCopy); check('caller', input, original); check('diagnostics', diagnostics, []); completedPhases.push(phase)
    phase = 'dispose'; mirror.destroy(); editor.destroy(); check('rootsRemoved', !holder.querySelector('.oe-editor') && !mirrorHolder.querySelector('.oe-editor'), true); completedPhases.push(phase)
  } catch (caught) { error = String(caught.stack ?? caught) }
  finally { mirror?.destroy(); editor?.destroy(); mirrorHolder?.remove(); holder.remove() }
  return { id: spec.id, spec, observations, nativeEvents, transactions, diagnostics, unsupported, planned, completedPhases, error }
}
