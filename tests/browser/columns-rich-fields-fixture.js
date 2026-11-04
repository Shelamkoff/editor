export const columnsRichFieldsCases = [
  ...[0, 1, 2].map(field => ({ id: `edit/${field}`, kind: 'edit', field })),
  ...[0, 1, 2].flatMap(field => ['apply', 'remove'].flatMap(mode => [false, true].map(backward => ({ id: `local/${field}/${mode}/${backward}`, kind: 'local', field, mode, backward })))),
  ...[[0, 1], [1, 2], [0, 2]].flatMap(([first, last]) => ['apply', 'remove'].flatMap(mode => [false, true].map(backward => ({ id: `cross/${first}-${last}/${mode}/${backward}`, kind: 'cross', first, last, mode, backward })))),
]

const chars = (text, marks = []) => [...text].map(text => ({ kind: 'text', text, marks: [...marks].sort() }))
function wire(html) {
  const units = [], marks = []
  for (const token of html.match(/<[^>]*>|\{\{swatch[A-C]\}\}|[^<{]+|[<{]/g) ?? []) {
    if (/^\{\{swatch[A-C]\}\}$/.test(token)) { units.push({ kind: 'widget', id: token.slice(2, -2) }); continue }
    if (token.startsWith('<')) {
      const closing = token.startsWith('</'), raw = token.match(/^<\/?([a-z]+)>$/)?.[1], tag = ({ strong: 'b', em: 'i' })[raw] ?? raw
      if (!['b', 'i'].includes(tag)) throw Error('Unexpected fixed-fixture markup: ' + token)
      if (closing) { if (marks.pop() !== tag) throw Error('Unbalanced mark') } else marks.push(tag)
      continue
    }
    const text = token.replace(/&(nbsp|amp|lt|gt);/g, (_, key) => ({ nbsp: '\u00a0', amp: '&', lt: '<', gt: '>' })[key])
    units.push(...chars(text, [...new Set(marks)]))
  }
  if (marks.length) throw Error('Unclosed mark')
  return units
}
function visible(field) {
  const units = []
  const visit = (node, marks = []) => {
    if (node.nodeType === 3) { units.push(...chars(node.data, marks)); return }
    if (node.nodeType !== 1) return
    if (node.hasAttribute('data-inline-plugin')) { units.push({ kind: 'widget', id: node.getAttribute('data-id') }); return }
    if (node.hasAttribute('data-oe-caret-padding')) return
    const tag = ({ strong: 'b', em: 'i' })[node.localName] ?? node.localName
    if (['b', 'i'].includes(tag)) marks = [...new Set([...marks, tag])].sort()
    for (const child of node.childNodes) visit(child, marks)
  }
  for (const node of field.childNodes) visit(node)
  return units
}

export async function runColumnsRichFieldsCase({ sourceBase = '../../', legacy = false, spec, nativeInput }) {
  const base = new URL(sourceBase, import.meta.url), [core, paragraph, columns, color, defaults] = await Promise.all(['core/index.js', 'plugins/paragraph/index.js', 'plugins/columns/index.js', 'inline-plugins/color.js', 'inline-tools/defaults.js'].map(path => import(new URL(path, base))))
  const copy = structuredClone, pause = () => new Promise(resolve => setTimeout(resolve, 70)), ids = ['a', 'b', 'c'], refs = ['swatchA', 'swatchB', 'swatchC'], values = ['#aBcDef', '#123456', '#fedcba'], dots = ['rgb(171, 205, 239)', 'rgb(18, 52, 86)', 'rgb(254, 220, 186)'], mark = spec.kind === 'edit' || spec.mode === 'remove' ? 'b' : 'i'
  const record = (id, type, data, inline) => ({ id, type, ...(!legacy ? { dataVersion: 2 } : {}), data, ...(inline ? { inline } : {}) })
  const subject = record('columns', 'columns', { layout: '1-1-1', columns: ids.map((id, index) => ({ ...(!legacy ? { id } : {}), content: `<${mark}>Alpha</${mark}> {{${refs[index]}}}` })) }, Object.fromEntries(refs.map((id, index) => [id, { type: 'color', ...(!legacy ? { dataVersion: 1 } : {}), data: { value: values[index] } }])))
  const input = { version: legacy ? '1.0.5' : '2.0.0', blocks: [record('prefix', 'paragraph', { text: 'Before' }), subject, record('suffix', 'paragraph', { text: 'After' })] }, caller = copy(input), holder = document.createElement('section')
  holder.style.cssText = 'width:850px;margin:140px auto'; document.body.append(holder)
  const observations = [], nativeEvents = [], transactions = [], diagnostics = [], unsupported = legacy ? [{ property: 'currentObservers', reason: 'Legacy transaction/diagnostic observers are absent; empty arrays are not measured zero events.' }] : [], planned = ['load', 'select', 'action', 'undo', 'redo', 'dispose'], completedPhases = []
  const editor = core.createEditor({ holder, plugins: [legacy ? new paragraph.Paragraph() : paragraph.createParagraphPlugin(), legacy ? new columns.Columns() : columns.createColumnsPlugin()], inlinePlugins: [color.createColorSwatchPlugin()], inlineTools: legacy ? ['bold'] : defaults.createDefaultInlineTools({ types: ['bold'] }), injectStyles: true, data: input, onDiagnostic: value => diagnostics.push(value) })
  if (!legacy) editor.on('transaction:committed', event => transactions.push({ action: event.action, origin: event.origin, name: event.name }))
  let phase = 'load', error = null
  const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value
  const check = (property, actual, expected) => observations.push({ phase, property, actual: copy(actual), expected: copy(expected), status: JSON.stringify(stable(actual)) === JSON.stringify(stable(expected)) ? 'PASS' : 'FAIL' })
  const fields = () => [...holder.querySelectorAll('.oe-columns__col')], state = () => editor.save().blocks, flags = () => [editor.canUndo, editor.canRedo]
  const length = node => node.nodeType === 3 ? node.data.length : node.nodeType === 1 && node.hasAttribute('data-inline-plugin') ? 1 : [...node.childNodes].reduce((sum, child) => sum + length(child), 0)
  const point = (root, offset) => { let left = offset; for (const node of root.childNodes) { const size = length(node); if (left <= size) { if (node.nodeType === 3) return [node, left]; if (node.hasAttribute?.('data-inline-plugin')) return [root, [...root.childNodes].indexOf(node) + (left ? 1 : 0)]; return point(node, left) } left -= size } return [root, root.childNodes.length] }
  const offset = (field, target, end) => { let total = 0, found = false; const walk = node => { if (node === target) { total += node.nodeType === 3 ? end : [...node.childNodes].slice(0, end).reduce((sum, child) => sum + length(child), 0); found = true } else if (node.nodeType === 3 || node.nodeType === 1 && node.hasAttribute('data-inline-plugin')) total += length(node); else for (const child of node.childNodes) { walk(child); if (found) break } }; walk(field); return found ? total : null }
  const range = (first, a, last = first, f = a) => { const selection = getSelection(); check('selection', { anchor: fields().map(field => offset(field, selection.anchorNode, selection.anchorOffset)), focus: fields().map(field => offset(field, selection.focusNode, selection.focusOffset)) }, { anchor: ids.map((_, index) => index === first ? a : null), focus: ids.map((_, index) => index === last ? f : null) }) }
  const meaning = blocks => blocks.map(block => block.type === 'columns' ? { ...block, data: { ...block.data, columns: block.data.columns.map(column => ({ ...column, content: wire(column.content) })) } } : block)
  const widgetState = () => fields().map(field => [...field.querySelectorAll('[data-inline-plugin]')].map(node => ({ id: node.getAttribute('data-id'), value: node.dataset.value, label: node.querySelector('.oe-ip__label')?.textContent, dot: node.querySelector('.oe-ip__dot')?.style.backgroundColor })))
  const key = async (key, modifiers, role) => { document.addEventListener('keydown', event => nativeEvents.push({ role, type: 'keydown', key: event.key, trusted: event.isTrusted, modifiers: (event.ctrlKey ? 2 : 0) | (event.shiftKey ? 8 : 0) }), { once: true, capture: true }); for (const type of ['rawKeyDown', 'keyUp']) await nativeInput('Input.dispatchKeyEvent', { type, key, code: key === 'b' ? 'KeyB' : 'KeyZ', windowsVirtualKeyCode: key === 'b' ? 66 : 90, nativeVirtualKeyCode: key === 'b' ? 66 : 90, modifiers }); await pause() }
  try {
    await nativeInput('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 }); await pause()
    const initial = state(), roots = [...holder.querySelectorAll('.oe-block')], first = spec.kind === 'cross' ? spec.first : spec.field, last = spec.kind === 'cross' ? spec.last : spec.field, start = spec.kind === 'edit' || spec.kind === 'cross' ? 2 : 1, end = spec.kind === 'edit' ? 2 : spec.kind === 'cross' ? 3 : 4
    check('canonical', initial, input.blocks); check('history', flags(), [false, false]); completedPhases.push(phase)
    phase = 'select'; fields()[first].focus(); const a = point(fields()[spec.backward ? last : first], spec.backward ? end : start), f = point(fields()[spec.backward ? first : last], spec.backward ? start : end); getSelection().setBaseAndExtent(...a, ...f); await pause(); range(spec.backward ? last : first, spec.backward ? end : start, spec.backward ? first : last, spec.backward ? start : end); check('history', flags(), [false, false]); completedPhases.push(phase)
    phase = 'action'
    if (spec.kind === 'edit') { const field = fields()[first]; field.addEventListener('input', event => nativeEvents.push({ role: 'action', type: 'input', trusted: event.isTrusted, inputType: event.inputType, data: event.data }), { once: true }); await nativeInput('Input.insertText', { text: 'X' }); await pause() } else await key('b', 2, 'action')
    const after = state(), wanted = meaning(initial)
    for (let index = 0; index < 3; index++) {
      let units = wanted[1].data.columns[index].content
      if (spec.kind === 'edit' && index === first) units = [...chars('AlXpha', ['b']), ...chars(' '), { kind: 'widget', id: refs[index] }]
      else if (spec.kind !== 'edit' && index >= first && index <= last) units = units.map((unit, position) => unit.kind === 'text' && position >= (index === first ? start : 0) && position < (index === last ? end : 7) ? { ...unit, marks: spec.mode === 'apply' ? [...new Set([...unit.marks, 'b'])].sort() : unit.marks.filter(mark => mark !== 'b') } : unit)
      wanted[1].data.columns[index].content = units
    }
    check('meaning', meaning(after), wanted); check('visible', fields().map(visible), wanted[1].data.columns.map(column => column.content)); check('widgets', widgetState(), refs.map((id, index) => [{ id, value: values[index], label: values[index], dot: dots[index] }])); check('history', flags(), [true, false]); check('neighborsRetained', holder.querySelector('.oe-block') === roots[0] && [...holder.querySelectorAll('.oe-block')].at(-1) === roots[2], true)
    if (spec.kind === 'edit') range(first, 3); else range(spec.backward ? last : first, spec.backward ? end : start, spec.backward ? first : last, spec.backward ? start : end)
    completedPhases.push(phase)
    phase = 'undo'; await key('z', 2, 'undo'); check('canonical', state(), initial); check('history', flags(), [false, true]); range(spec.backward ? last : first, spec.backward ? end : start, spec.backward ? first : last, spec.backward ? start : end); completedPhases.push(phase)
    phase = 'redo'; await key('z', 10, 'redo'); check('canonical', state(), after); check('meaning', meaning(state()), wanted); check('visible', fields().map(visible), wanted[1].data.columns.map(column => column.content)); check('history', flags(), [true, false]); if (spec.kind === 'edit') range(first, 3); else range(spec.backward ? last : first, spec.backward ? end : start, spec.backward ? first : last, spec.backward ? start : end); check('caller', input, caller); check('diagnostics', diagnostics, []); completedPhases.push(phase)
    phase = 'dispose'; editor.destroy(); check('rootRemoved', !holder.querySelector('.oe-editor'), true); completedPhases.push(phase)
  } catch (caught) { error = String(caught.stack ?? caught) } finally { editor.destroy(); holder.remove() }
  return { id: spec.id, spec, observations, nativeEvents, transactions, diagnostics, unsupported, planned, completedPhases, error }
}
