export const elementRangeCases = []
for (const variant of ['apply', 'remove', 'foreign', 'read-only', 'destroy']) for (const boundary of ['Text', 'Element']) for (const backward of [false, true]) {
  elementRangeCases.push({ id: [variant, boundary, backward ? 'backward' : 'forward'].join('/'), variant, boundary, backward })
}
const pause = () => new Promise(resolve => setTimeout(resolve, 35))
const copy = value => JSON.parse(JSON.stringify(value))
async function click(button, nativeInput) {
  button.scrollIntoView({ block: 'nearest' }); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  const rect = button.getBoundingClientRect(); if (!rect.width || !rect.height) throw Error('Bold button is not visible')
  let trusted = false
  const capture = event => { trusted = event.isTrusted && button.contains(event.target) }
  button.ownerDocument.addEventListener('mousedown', capture, { capture: true, once: true })
  try { await nativeInput('Input.click', { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }) }
  finally { button.ownerDocument.removeEventListener('mousedown', capture, true) }
  await pause(); return trusted
}
export async function runElementRangeCase({ sourceBase = '../../', legacy = false, spec, nativeInput }) {
  const base = new URL(sourceBase, import.meta.url)
  const [core, paragraph, defaults] = await Promise.all(['core/index.js', 'plugins/paragraph/index.js', 'inline-tools/defaults.js'].map(path => import(new URL(path, base))))
  const observations = [], transactions = [], trusted = [], diagnostics = [], unsupported = [], completedPhases = []
  if (legacy) unsupported.push({ property: 'currentTransactionEvents', reason: 'The current transaction event observation is not emulated; real legacy Bold actions, canonical data, selection and native history still execute.' })
  const check = (phase, property, actual, expected) => {
    const a = copy(actual), e = copy(expected)
    observations.push({ phase, property, actual: a, expected: e, status: JSON.stringify(a) === JSON.stringify(e) ? 'PASS' : 'FAIL' })
  }
  const remove = spec.variant === 'remove'
  const initial = '<i>' + (remove ? '<b>alpha</b>' : 'alpha') + '</i> rest'
  const wanted = '<i>' + (remove ? 'alpha' : '<b>alpha</b>') + '</i> rest'
  const records = text => [{ id: 'a', type: 'paragraph', ...(!legacy ? { dataVersion: 2 } : {}), data: { text } },
    { id: 'neighbor', type: 'paragraph', ...(!legacy ? { dataVersion: 2 } : {}), data: { text: 'Untouched' } }]
  const holder = document.createElement('section'); holder.style.cssText = 'width:800px;margin:80px auto'; document.body.append(holder)
  const other = document.createElement('section'); other.style.cssText = holder.style.cssText
  for (const target of [holder, other]) target.addEventListener('keydown', event => { if (event.key.toLowerCase() === 'z') trusted.push({ key: 'z', trusted: event.isTrusted }) })
  const make = (target = holder) => {
    const editor = core.createEditor({ holder: target, injectStyles: true, plugins: [legacy ? new paragraph.Paragraph() : paragraph.createParagraphPlugin()],
      inlineTools: legacy ? ['bold'] : defaults.createDefaultInlineTools({ types: ['bold'] }), onDiagnostic: value => diagnostics.push(value),
      data: { version: legacy ? '1.0.5' : '2.0.0', blocks: records(initial) } })
    if (!legacy) editor.on('transaction:committed', event => transactions.push({ action: event.action, origin: event.origin, name: event.name }))
    return editor
  }
  const field = target => target.querySelector('.oe-paragraph')
  const select = async target => {
    const editable = field(target), wrapper = editable.querySelector('i'), leaf = document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT).nextNode()
    const range = document.createRange()
    if (spec.boundary === 'Element') range.selectNodeContents(wrapper)
    else { range.setStart(leaf, 0); range.setEnd(leaf, 5) }
    editable.focus(); window.getSelection().setBaseAndExtent(spec.backward ? range.endContainer : range.startContainer,
      spec.backward ? range.endOffset : range.startOffset, spec.backward ? range.startContainer : range.endContainer,
      spec.backward ? range.startOffset : range.endOffset)
    document.dispatchEvent(new Event('selectionchange')); await pause()
  }
  const selection = target => {
    const native = window.getSelection(), editable = field(target)
    const at = (node, offset) => {
      if (!node || !editable?.contains(node)) return null
      const range = document.createRange(); range.selectNodeContents(editable); range.setEnd(node, offset); return range.toString().length
    }
    return { anchor: at(native.anchorNode, native.anchorOffset), focus: at(native.focusNode, native.focusOffset), text: native.toString() }
  }
  const selected = { anchor: spec.backward ? 5 : 0, focus: spec.backward ? 0 : 5, text: 'alpha' }
  const planned = ['load', ...(spec.variant === 'foreign' || spec.variant === 'read-only' || spec.variant === 'destroy' ? ['retire'] : []), 'apply', 'undo', 'redo', 'dispose']
  let editor, old, foreign, phase = 'load'
  try {
    editor = make(); await pause(); check(phase, 'canonical', editor.save().blocks, records(initial)); await select(holder)
    check(phase, 'selection', selection(holder), selected); completedPhases.push(phase)
    if (planned.includes('retire')) {
      phase = 'retire'; const stale = holder.querySelector('[data-tool="bold"]')
      if (spec.variant === 'destroy') { old = editor; old.destroy(); editor = make(); await pause(); await select(holder) }
      else if (spec.variant === 'read-only') editor.setReadOnly(true)
      else { document.body.append(other); foreign = make(other); await pause(); await select(other) }
      const target = foreign ? other : holder, before = selection(target), active = document.activeElement
      stale.click(); await pause()
      check(phase, 'canonical', editor.save().blocks, records(initial)); check(phase, 'selectionStable', JSON.stringify(selection(target)) === JSON.stringify(before), true)
      check(phase, 'focus', document.activeElement === active, true); check(phase, 'history', [editor.canUndo, editor.canRedo, transactions.length], [false, false, 0])
      if (foreign) check(phase, 'foreignCanonical', foreign.save().blocks, records(initial))
      completedPhases.push(phase)
      if (spec.variant === 'read-only') { editor.setReadOnly(false); await select(holder) }
    }
    phase = 'apply'; const target = foreign ? other : holder, live = foreign ?? editor
    check(phase, 'trustedBold', await click(target.querySelector('[data-tool="bold"]'), nativeInput), true)
    check(phase, 'canonical', live.save().blocks, records(wanted)); check(phase, 'selection', selection(target), selected)
    if (foreign) check(phase, 'foreignOwnerUnchanged', editor.save().blocks, records(initial))
    check(phase, 'history', [live.canUndo, live.canRedo], [true, false]); completedPhases.push(phase)
    for (const redo of [false, true]) {
      phase = redo ? 'redo' : 'undo'
      for (const type of ['rawKeyDown', 'keyUp']) await nativeInput('Input.dispatchKeyEvent', { type, key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90, modifiers: redo ? 10 : 2 })
      await pause(); check(phase, 'canonical', live.save().blocks, records(redo ? wanted : initial)); check(phase, 'selection', selection(target), selected)
      if (foreign) check(phase, 'foreignOwnerUnchanged', editor.save().blocks, records(initial))
      check(phase, 'history', [live.canUndo, live.canRedo], redo ? [true, false] : [false, true]); completedPhases.push(phase)
    }
    phase = 'dispose'; foreign?.destroy(); editor.destroy(); check(phase, 'rootsRemoved', !holder.querySelector('.oe-editor') && !other.querySelector('.oe-editor'), true); completedPhases.push(phase)
    return { id: spec.id, spec, observations, transactions, trusted, diagnostics, unsupported, completedPhases, planned, error: null }
  } catch (error) { return { id: spec.id, spec, observations, transactions, trusted, diagnostics, unsupported, completedPhases, planned, phase, error: String(error?.stack ?? error) } }
  finally { foreign?.destroy(); editor?.destroy(); old?.destroy(); holder.remove(); other.remove() }
}
