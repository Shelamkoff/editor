export const historyGestureCases = ['count', 'undefined-bytes', 'tiny', 'wide'].flatMap(budget => ['insert', 'typing', 'typing-boundary', 'structural', 'branch'].map(kind => ({ id: budget + '/' + kind, budget, kind })))

export async function runHistoryGestureCase({ sourceBase = '../../', legacy = false, spec, nativeInput }) {
  const base = new URL(sourceBase, import.meta.url)
  const [core, paragraph] = await Promise.all(['core/index.js', 'plugins/paragraph/index.js'].map(path => import(new URL(path, base))))
  const copy = structuredClone, pause = () => new Promise(resolve => setTimeout(resolve, 70)), tiny = spec.budget === 'tiny', boundary = spec.kind === 'typing-boundary'
  const record = (id, text) => ({ id, type: 'paragraph', ...(!legacy ? { dataVersion: 2 } : {}), data: { text } })
  const data = { version: legacy ? '1.0.5' : '2.0.0', blocks: [record('seed', 'Alpha'), ...(boundary ? [record('tail', 'Beta')] : [])] }, original = copy(data)
  const holder = document.createElement('section'); holder.style.cssText = 'width:850px;margin:150px auto'; document.body.append(holder)
  const byteLimit = tiny ? 1 : spec.budget === 'wide' ? 1048576 : undefined
  const options = legacy ? { tuning: { undo: { maxStack: 2 } } } : { historyMaxStack: 2, ...(spec.budget === 'count' ? {} : { historyMaxBytes: byteLimit }) }
  const observations = [], nativeEvents = [], transactions = [], diagnostics = [], identities = new Map([['seed', 'seed'], ...(boundary ? [['tail', 'tail']] : [])])
  const unsupported = legacy ? [{ property: 'currentObservers', reason: 'Legacy transaction diagnostics are absent; empty arrays are not measured zero events.' }, ...(['tiny', 'wide'].includes(spec.budget) ? [{ property: 'historyMaxBytes', reason: 'The immutable legacy UndoManager tuning exposes maxStack/debounceMs and no byte-budget option.' }] : [])] : []
  const planned = ['load', 'author', 'undo', 'redo', 'dispose'], completedPhases = []
  const editor = core.createEditor({ holder, plugins: [legacy ? new paragraph.Paragraph() : paragraph.createParagraphPlugin()], inlinePlugins: [], inlineTools: [], injectStyles: true, data, ...options, onDiagnostic: value => diagnostics.push(value) })
  if (!legacy) editor.on('transaction:committed', e => transactions.push({ action: e.action, origin: e.origin, name: e.name, history: e.history }))
  let phase = 'load', error = null
  const state = () => editor.save().blocks, canonical = () => state().map(block => ({ ...block, id: identities.get(block.id) ?? 'unknown:' + block.id })), flags = () => [editor.canUndo, editor.canRedo], fields = () => [...holder.querySelectorAll('.oe-paragraph')]
  const check = (property, actual, expected) => observations.push({ phase, property, actual: copy(actual), expected: copy(expected), status: JSON.stringify(actual) === JSON.stringify(expected) ? 'PASS' : 'FAIL' })
  const snap = (blocks, history) => { check('canonical', canonical(), blocks); check('history', flags(), history) }
  const inserted = labels => [record('seed', 'Alpha'), ...labels.map(label => record(label, label))]
  const boundaryState = (first, second) => [record('seed', first ? 'AlphaX' : 'Alpha'), record('tail', second ? 'BetaY' : 'Beta')]
  const focusAt = (index, offset) => { const field = fields()[index]; field.focus(); const range = document.createRange(); range.setStart(field.firstChild, offset); range.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(range) }
  const selection = (index, offset) => {
    const all = fields(), s = getSelection(), position = (field, node, end) => { if (!field.contains(node)) return null; const range = document.createRange(); range.setStart(field, 0); range.setEnd(node, end); return range.toString().length }
    check('nativeSelection', { field: all.indexOf(document.activeElement), anchor: all.map(f => position(f, s.anchorNode, s.anchorOffset)), focus: all.map(f => position(f, s.focusNode, s.focusOffset)) }, { field: index, anchor: all.map((_, i) => i === index ? offset : null), focus: all.map((_, i) => i === index ? offset : null) })
  }
  const dispatch = async (key, modifiers, role) => {
    const [code, number] = key === 'Enter' ? ['Enter', 13] : ['KeyZ', 90]
    document.addEventListener('keydown', e => nativeEvents.push({ role, type: 'keydown', key: e.key, trusted: e.isTrusted, modifiers: (e.ctrlKey ? 2 : 0) | (e.shiftKey ? 8 : 0) }), { capture: true, once: true })
    for (const type of ['rawKeyDown', 'keyUp']) await nativeInput('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: number, nativeVirtualKeyCode: number, modifiers }); await pause()
  }
  const replay = async (modifiers, role) => { holder.querySelector('.oe-editor').focus(); await dispatch('z', modifiers, role) }
  const type = async (text, index) => { const field = fields()[index]; field.addEventListener('input', e => nativeEvents.push({ role: 'type-' + text, type: 'input', trusted: e.isTrusted, inputType: e.inputType }), { once: true }); await nativeInput('Input.insertText', { text }); await pause() }
  const captureNew = (index, label) => { const block = state()[index]; check('newIdentity', !!block && typeof block.id === 'string' && !identities.has(block.id), true); if (block) identities.set(block.id, label) }
  const insert = async (label, index) => { if (legacy) editor.blocks.insert('paragraph', { text: label }, index); else editor.blocks.insert({ type: 'paragraph', data: { text: label } }, index); await pause(); captureNew(index, label) }
  try {
    await nativeInput('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 }); await pause(); snap(data.blocks, [false, false]); completedPhases.push(phase)
    phase = 'author'
    if (spec.kind === 'typing' || boundary) {
      focusAt(0, 5); await type('X', 0)
      if (boundary) focusAt(1, 4)
      await type('Y', boundary ? 1 : 0)
      snap(boundary ? boundaryState(true, true) : [record('seed', 'AlphaXY')], [true, false]); selection(boundary ? 1 : 0, boundary ? 5 : 7)
    } else if (spec.kind === 'structural') {
      focusAt(0, 2); await dispatch('Enter', 0, 'split'); captureNew(1, 'split'); snap([record('seed', 'Al'), record('split', 'pha')], [true, false]); selection(1, 0)
    } else {
      for (const [label, index] of [['A', 1], ['B', 2], ['C', 3]]) await insert(label, index)
      snap(inserted(['A', 'B', 'C']), [true, false])
      if (spec.kind === 'branch') { await replay(2, 'branch-undo'); snap(inserted(['A', 'B']), [!tiny, true]); if (legacy) editor.blocks.move(0, 0); else editor.blocks.move('seed', 0); await pause(); snap(inserted(['A', 'B']), [!tiny, true]); await insert('D', 3); snap(inserted(['A', 'B', 'D']), [true, false]) }
    }
    completedPhases.push(phase); phase = 'undo'
    if (spec.kind === 'typing' || spec.kind === 'structural') { await replay(2, 'undo-1'); snap([record('seed', 'Alpha')], [false, true]); selection(0, spec.kind === 'typing' ? 5 : 2) }
    else if (boundary) for (let n = 1; n <= 2; n++) { await replay(2, 'undo-' + n); snap(boundaryState(tiny || n === 1, false), [!tiny && n === 1, true]); if (n === 1 || !tiny) selection(n === 1 ? 1 : 0, n === 1 ? 4 : 5) }
    else for (let n = 1; n <= 3; n++) { await replay(2, 'undo-' + n); snap(inserted(tiny || n === 1 ? ['A', 'B'] : ['A']), [!tiny && n === 1, true]) }
    completedPhases.push(phase); phase = 'redo'
    if (spec.kind === 'typing' || spec.kind === 'structural') { await replay(10, 'redo-1'); snap(spec.kind === 'typing' ? [record('seed', 'AlphaXY')] : [record('seed', 'Al'), record('split', 'pha')], [true, false]); selection(spec.kind === 'typing' ? 0 : 1, spec.kind === 'typing' ? 7 : 0) }
    else if (boundary) for (let n = 1; n <= 2; n++) { await replay(10, 'redo-' + n); snap(boundaryState(true, tiny || n === 2), [true, !tiny && n === 1]); if (n === 1 || !tiny) selection(tiny || n === 2 ? 1 : 0, tiny || n === 2 ? 5 : 6) }
    else for (let n = 1; n <= 3; n++) { await replay(10, 'redo-' + n); snap(inserted(tiny || n >= 2 ? ['A', 'B', spec.kind === 'branch' ? 'D' : 'C'] : ['A', 'B']), [true, !tiny && n === 1]) }
    check('caller', data, original); check('diagnostics', diagnostics, []); completedPhases.push(phase)
    phase = 'dispose'; editor.destroy(); check('rootRemoved', !holder.querySelector('.oe-editor'), true); completedPhases.push(phase)
  } catch (caught) { error = String(caught.stack ?? caught) } finally { editor.destroy(); holder.remove() }
  return { id: spec.id, spec, observations, nativeEvents, transactions, diagnostics, unsupported, planned, completedPhases, error, identities: [...identities] }
}
