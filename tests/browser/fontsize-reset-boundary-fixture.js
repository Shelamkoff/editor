export const fontSizeResetBoundaryCases = ['p', 'span'].flatMap(tag => [false, true].flatMap(styled => ['Text', 'Element'].flatMap(boundary => [false, true].map(backward => ({
  id: [tag, styled ? 'styled' : 'plain', boundary, backward ? 'backward' : 'forward'].join('/'), tag, styled, boundary, backward,
})))))
const copy = value => JSON.parse(JSON.stringify(value))
const pause = (ms = 35) => new Promise(resolve => setTimeout(resolve, ms))
function authorMeaning(html) {
  return { text: html.replace(/<[^>]*>/g, ''), sizes: [...html.matchAll(/font-size:\s*([^;"<>]+)/g)].map(m => m[1].trim()),
    colors: [...html.matchAll(/(?:^|[;"\s])color:\s*([^;"<>]+)/g)].map(m => /^(?:#800000|rgb\(128,\s*0,\s*0\))$/.test(m[1].trim()) ? '#800000' : m[1].trim()) }
}
export async function runFontSizeResetBoundaryCase({ sourceBase, legacy, spec, nativeInput }) {
  const base = new URL(sourceBase, import.meta.url), [core, paragraph, kit, defaults] = await Promise.all([
    'core/index.js', 'plugins/paragraph/index.js', ...(!legacy ? ['plugin-kit/index.js', 'inline-tools/defaults.js'] : []),
  ].map(path => import(new URL(path, base))))
  const holder = document.createElement('section'); holder.style.cssText = 'width:850px;margin:100px auto'; document.body.append(holder)
  const observations = [], completedPhases = [], diagnostics = [], transactions = [], unsupported = [], planned = ['load', 'selection', 'reset', 'undo', 'redo', 'dispose']
  const check = (phase, property, actual, expected) => observations.push({ phase, property, actual: copy(actual), expected: copy(expected), status: JSON.stringify(actual) === JSON.stringify(expected) ? 'PASS' : 'FAIL' })
  let editor, phase = 'load'
  try {
    const original = legacy ? null : paragraph.createParagraphPlugin({ injectStyles: false })
    const defineField = (document, data, editable) => { const element = document.createElement(spec.tag); element.className = 'audit-font-field'; element.contentEditable = editable ? 'true' : 'false'; element.style.display = 'block'; if (spec.styled) element.style.fontSize = '36px'; if (!legacy) kit.setSanitizedHtml(element, data.text); return element }
    const definition = legacy ? new class extends paragraph.Paragraph {
      type = 'span-text'
      render(...args) { const original = super.render(...args), element = defineField(original.ownerDocument, null, original.getAttribute('contenteditable') === 'true'); element.append(...original.childNodes); return element }
    }() : { ...original, type: 'span-text', setup() { return { create(data, context) { const element = defineField(context.ownerDocument, data, !context.isReadOnly()); return { element, read: () => ({ text: element.innerHTML }), update(next) { kit.setSanitizedHtml(element, next.text) }, editableFields: () => [{ key: 'text', element, mode: 'rich-text' }], setReadOnly(value) { element.contentEditable = value ? 'false' : 'true' }, focus() { element.focus() }, destroy() {} } }, destroy() {} } } }
    const input = { version: legacy ? '1.0.5' : '2.0.0', blocks: ['Alpha', 'Bravo'].map((text, i) => ({ id: i ? 'b' : 'a', type: 'span-text', ...(!legacy ? { dataVersion: 2 } : {}), data: { text: '<span style="font-size:24px;color:#800000">' + text + '</span>' } })) }
    editor = core.createEditor({ holder, injectStyles: true, plugins: [definition], inlineTools: legacy ? ['fontSize'] : defaults.createDefaultInlineTools({ types: ['fontSize'] }), data: input, onDiagnostic: value => diagnostics.push(value) })
    if (!legacy) editor.on('transaction:committed', e => transactions.push({ action: e.action, origin: e.origin, name: e.name })); else unsupported.push({ property: 'currentTransactionPort', reason: 'Real legacy field reset and history execute; the absent v2 transaction observer is not fabricated.' })
    const fields = () => [...holder.querySelectorAll('.audit-font-field')], state = () => editor.save().blocks, meaning = () => state().map(b => authorMeaning(b.data.text)), fieldStyles = () => fields().map(f => f.style.fontSize), history = () => [editor.canUndo, editor.canRedo]
    const beforeMeaning = ['Alpha', 'Bravo'].map(text => ({ text, sizes: ['24px'], colors: ['#800000'] })), afterMeaning = ['Alpha', 'Bravo'].map(text => ({ text, sizes: [], colors: ['#800000'] })), styles = [spec.styled ? '36px' : '', spec.styled ? '36px' : '']
    const click = async element => { if (!element) throw Error('Missing font-size native control'); element.scrollIntoView({ block: 'nearest' }); await pause(); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); const r = element.getBoundingClientRect(); if (!r.width || !r.height) throw Error('Font-size control is hidden'); let trusted = false; const observe = e => { trusted = e.isTrusted && element.contains(e.target) }; document.addEventListener('mousedown', observe, { capture: true, once: true }); try { await nativeInput('Input.click', { x: r.left + r.width / 2, y: r.top + r.height / 2 }) } finally { document.removeEventListener('mousedown', observe, true) }; await pause(); return trusted }
    const selected = () => { const s = window.getSelection(), current = fields(); const endpoint = (node, at) => { const index = current.findIndex(f => f === node || f.contains(node)); if (index < 0) return { field: null, offset: null }; const range = document.createRange(); range.selectNodeContents(current[index]); range.setEnd(node, at); return { field: index, offset: range.toString().length } }; return { anchor: endpoint(s.anchorNode, s.anchorOffset), focus: endpoint(s.focusNode, s.focusOffset), collapsed: s.isCollapsed } }
    const begin = { field: 0, offset: 0 }, end = { field: 1, offset: 5 }, expectedSelection = { anchor: spec.backward ? end : begin, focus: spec.backward ? begin : end, collapsed: false }
    await pause(60); const initial = state()
    check(phase, 'authorMeaning', meaning(), beforeMeaning); check(phase, 'fieldStyles', fieldStyles(), styles); check(phase, 'history', history(), [false, false]); completedPhases.push(phase)
    phase = 'selection'
    const all = fields(), startSpan = all[0].querySelector('span'), endSpan = all[1].querySelector('span'), from = spec.boundary === 'Text' ? startSpan.firstChild : startSpan, to = spec.boundary === 'Text' ? endSpan.firstChild : endSpan
    const a = 0, b = spec.boundary === 'Text' ? 5 : 1
    all[0].focus(); window.getSelection().setBaseAndExtent(spec.backward ? to : from, spec.backward ? b : a, spec.backward ? from : to, spec.backward ? a : b); document.dispatchEvent(new Event('selectionchange')); await pause(60)
    check(phase, 'exactRange', selected(), expectedSelection); completedPhases.push(phase); phase = 'reset'
    check(phase, 'trustedOpen', await click(holder.querySelector('[data-tool="fontSize"]')), true)
    const auxiliary = holder.querySelector('.oe-font-size-input'); check(phase, 'prefill', auxiliary.value, '24'); check(phase, 'trustedAuxiliary', await click(auxiliary), true); check(phase, 'auxiliaryFocus', document.activeElement === auxiliary, true)
    check(phase, 'beforeReset', state(), initial); check(phase, 'beforeResetHistory', history(), [false, false]); check(phase, 'trustedReset', await click(holder.querySelector('.oe-font-size-reset')), true)
    const after = state()
    check(phase, 'authorMeaning', meaning(), afterMeaning); check(phase, 'fieldStyles', fieldStyles(), styles); check(phase, 'history', history(), [true, false]); check(phase, 'selection', selected(), expectedSelection); completedPhases.push(phase)
    for (const redo of [false, true]) { phase = redo ? 'redo' : 'undo'; check(phase, 'available', redo ? editor.redo() : editor.undo(), true); check(phase, 'exactCanonical', state(), redo ? after : initial); check(phase, 'authorMeaning', meaning(), redo ? afterMeaning : beforeMeaning); check(phase, 'fieldStyles', fieldStyles(), styles); check(phase, 'history', history(), redo ? [true, false] : [false, true]); completedPhases.push(phase) }
    phase = 'dispose'; editor.destroy(); check(phase, 'rootRemoved', !holder.querySelector('.oe-editor'), true); completedPhases.push(phase)
    return { id: spec.id, spec, planned, completedPhases, observations, diagnostics, transactions, unsupported, error: null }
  } catch (error) { return { id: spec.id, spec, planned, completedPhases, observations, diagnostics, transactions, unsupported, phase, error: String(error?.stack ?? error) } }
  finally { editor?.destroy(); holder.remove() }
}
