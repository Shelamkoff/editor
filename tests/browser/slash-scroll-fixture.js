export const slashScrollCases = ['down', 'up', 'wrap', 'pointer'].map(method => ({ id: method, method }))

export async function runSlashScrollCase({ sourceBase = '../../', legacy = false, spec, nativeInput }) {
  const base = new URL(sourceBase, import.meta.url)
  const [core, paragraph, quote] = await Promise.all([
    'core/index.js', 'plugins/paragraph/index.js', 'plugins/quote/index.js',
  ].map(path => import(new URL(path, base))))
  const choices = Array.from({ length: 30 }, (_, index) => legacy
    ? new (class extends quote.Quote { type = 'choice-' + index; get title() { return 'Choice ' + index } })()
    : { ...quote.createQuotePlugin(), type: 'choice-' + index, label: { key: 'title', fallback: 'Choice ' + index } })
  const holder = document.createElement('section'); holder.style.cssText = 'width:850px;margin:100px auto'; document.body.append(holder)
  const input = { version: legacy ? '1.0.5' : '2.0.0', blocks: [{ id: 'a', type: 'paragraph', ...(!legacy ? { dataVersion: 2 } : {}), data: { text: '' } }] }
  const copy = value => JSON.parse(JSON.stringify(value)), original = copy(input), diagnostics = [], transactions = [], observations = [], nativeEvents = [], steps = []
  const unsupported = legacy ? [{ property: 'currentObservers', reason: 'Legacy transaction/diagnostic subscriptions are absent. Empty bookkeeping arrays are not legacy event counts.' }] : []
  const planned = ['load', 'input', 'hover', 'navigate', 'action', 'undo-action', 'undo-input', 'redo-input', 'redo-action', 'dispose'], completedPhases = []
  const editor = core.createEditor({ holder, injectStyles: true, plugins: [legacy ? new paragraph.Paragraph() : paragraph.createParagraphPlugin(), ...choices], data: input, onDiagnostic: value => diagnostics.push(value) })
  if (!legacy) editor.on('transaction:committed', event => transactions.push({ action: event.action, origin: event.origin, name: event.name }))
  const state = () => editor.save().blocks, flags = () => [editor.canUndo, editor.canRedo], field = () => holder.querySelector('.oe-paragraph'), menu = () => holder.querySelector('.oe-slash-menu')
  const items = () => Array.from(menu()?.children ?? []), active = () => items().findIndex(item => item.classList.contains('oe-slash-menu__item--active'))
  const pause = () => new Promise(resolve => setTimeout(resolve, 55))
  const check = (property, actual, expected) => observations.push({ phase, property, actual: copy(actual), expected: copy(expected), status: JSON.stringify(actual) === JSON.stringify(expected) ? 'PASS' : 'FAIL' })
  const key = async (key, code, number, modifiers = 0, role = key) => {
    document.addEventListener('keydown', event => nativeEvents.push({ role, type: 'keydown', key: event.key, trusted: event.isTrusted, modifiers: (event.ctrlKey ? 2 : 0) | (event.shiftKey ? 8 : 0) }), { capture: true, once: true })
    for (const type of ['rawKeyDown', 'keyUp']) await nativeInput('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: number, nativeVirtualKeyCode: number, modifiers })
    await pause()
  }
  const hover = async element => {
    if (!element) throw Error('Missing long-menu item')
    element.scrollIntoView({ block: 'nearest' }); await pause(); const rect = element.getBoundingClientRect()
    if (!rect.width || !rect.height) throw Error('Hidden long-menu item')
    const point = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
    await nativeInput('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point }); await pause(); return point
  }
  let phase = 'load', error = null
  try {
    await nativeInput('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 }); await pause()
    check('canonical', state(), input.blocks); check('history', flags(), [false, false]); completedPhases.push(phase)
    phase = 'input'; const f = field(); f.focus(); const range = document.createRange(); range.selectNodeContents(f); range.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(range)
    f.addEventListener('input', event => nativeEvents.push({ role: 'query', type: 'input', trusted: event.isTrusted }), { once: true })
    await nativeInput('Input.insertText', { text: '/' }); await pause(); const typed = state(), held = items()
    check('choices', held.length, 31); check('history', flags(), [true, false]); check('scrollable', menu().scrollHeight > menu().clientHeight, true); completedPhases.push(phase)
    phase = 'hover'; const start = spec.method === 'down' ? 1 : spec.method === 'up' ? 25 : 30; const point = await hover(items()[start]); const initialScroll = menu().scrollTop
    check('active', active(), start); completedPhases.push(phase)
    phase = 'navigate'; const count = ['down', 'up'].includes(spec.method) ? 20 : spec.method === 'wrap' ? 1 : 0, direction = spec.method === 'up' ? -1 : 1
    for (let step = 1; step <= count; step++) {
      await key(direction < 0 ? 'ArrowUp' : 'ArrowDown', direction < 0 ? 'ArrowUp' : 'ArrowDown', direction < 0 ? 38 : 40)
      const expected = (start + direction * step + 31) % 31; steps.push({ step, active: active(), scroll: menu().scrollTop }); check('active-' + step, active(), expected)
    }
    const targetIndex = spec.method === 'down' ? 21 : spec.method === 'up' ? 5 : spec.method === 'wrap' ? 0 : 30
    check('active', active(), targetIndex); check('nodesRetained', held.every((item, index) => items()[index] === item), true)
    check('scrollMoved', count ? menu().scrollTop !== initialScroll : menu().scrollTop === initialScroll, true); check('canonical', state(), typed); check('history', flags(), [true, false]); completedPhases.push(phase)
    phase = 'action'
    if (spec.method === 'pointer') {
      let delivered = false; const item = items()[30]
      document.addEventListener('mousedown', event => { delivered = event.isTrusted && item.contains(event.target); nativeEvents.push({ role: 'confirm', type: 'mousedown', trusted: event.isTrusted, hit: delivered }) }, { capture: true, once: true })
      await nativeInput('Input.click', point); await pause(); check('confirmDelivered', delivered, true)
    } else await key(spec.method === 'wrap' ? 'Tab' : 'Enter', spec.method === 'wrap' ? 'Tab' : 'Enter', spec.method === 'wrap' ? 9 : 13, 0, 'confirm')
    const after = state(), target = targetIndex === 0 ? 'paragraph' : 'choice-' + (targetIndex - 1), wanted = [{ type: target, data: targetIndex === 0 ? { text: '' } : { text: '', caption: '' } }]
    check('meaning', after.map(block => ({ type: block.type, data: block.data })), wanted)
    if (!legacy) check('canonical', after, [{ id: 'a', type: target, dataVersion: targetIndex === 0 ? 2 : 1, data: wanted[0].data }])
    check('closed', getComputedStyle(menu()).display === 'none', true); check('history', flags(), [true, false]); completedPhases.push(phase)
    for (const [name, redo, wanted, history] of [['undo-action', false, typed, [true, true]], ['undo-input', false, input.blocks, [false, true]], ['redo-input', true, typed, [true, true]], ['redo-action', true, after, [true, false]]]) {
      phase = name; await key('z', 'KeyZ', 90, redo ? 10 : 2, redo ? 'redo' : 'undo'); check('canonical', state(), wanted); check('history', flags(), history); completedPhases.push(phase)
    }
    check('caller', input, original); check('diagnostics', diagnostics, []); phase = 'dispose'; editor.destroy(); check('rootRemoved', !holder.querySelector('.oe-editor'), true); completedPhases.push(phase)
  } catch (caught) { error = String(caught.stack ?? caught) }
  finally { editor.destroy(); holder.remove() }
  return { id: spec.id, spec, observations, nativeEvents, transactions, diagnostics, unsupported, steps, planned, completedPhases, error }
}
