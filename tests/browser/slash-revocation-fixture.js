export const slashRevocationCases = ['caret', 'selection'].flatMap(method => ['click', 'cancel'].map(action => ({ id: method + '/' + action, method, action })))

export async function runSlashRevocationCase({ sourceBase = '../../', legacy = false, spec, nativeInput }) {
  const base = new URL(sourceBase, import.meta.url)
  const [core, paragraph, quote] = await Promise.all([
    'core/index.js', 'plugins/paragraph/index.js', 'plugins/quote/index.js',
  ].map(path => import(new URL(path, base))))
  const holder = document.createElement('section')
  holder.style.cssText = 'width:850px;margin:100px auto'
  document.body.append(holder)
  const input = { version: legacy ? '1.0.5' : '2.0.0', blocks: [{
    id: 'a', type: 'paragraph', ...(!legacy ? { dataVersion: 2 } : {}), data: { text: '' },
  }] }
  const copy = value => JSON.parse(JSON.stringify(value))
  const original = copy(input), observations = [], nativeEvents = [], transactions = [], diagnostics = []
  const unsupported = legacy ? [{ property: 'currentObservers', reason: 'Legacy transaction/diagnostic subscriptions are absent; their empty arrays are not legacy event counts.' }] : []
  const planned = ['load', 'query', 'revoke', 'retired', 'fresh', 'action', 'undo', 'redo', 'dispose'], completedPhases = []
  const editor = core.createEditor({ holder, injectStyles: true,
    plugins: legacy ? [new paragraph.Paragraph(), new quote.Quote()] : [paragraph.createParagraphPlugin(), quote.createQuotePlugin()],
    data: input, onDiagnostic: value => diagnostics.push(value),
  })
  if (!legacy) editor.on('transaction:committed', event => transactions.push({ action: event.action, origin: event.origin, name: event.name }))
  const pause = () => new Promise(resolve => setTimeout(resolve, 65))
  const state = () => editor.save().blocks, flags = () => [editor.canUndo, editor.canRedo]
  const field = () => holder.querySelector('.oe-paragraph'), menu = () => holder.querySelector('.oe-slash-menu')
  const items = () => Array.from(menu()?.querySelectorAll('.oe-slash-menu__item') ?? [])
  const visible = () => !!menu() && getComputedStyle(menu()).display !== 'none'
  const check = (property, actual, expected) => observations.push({ phase, property, actual: copy(actual), expected: copy(expected), status: JSON.stringify(actual) === JSON.stringify(expected) ? 'PASS' : 'FAIL' })
  const type = async (text, role) => {
    const f = field(); if (!f) throw Error('Slash source field was replaced')
    f.focus(); const range = document.createRange(); range.selectNodeContents(f); range.collapse(false)
    getSelection().removeAllRanges(); getSelection().addRange(range)
    f.addEventListener('input', event => nativeEvents.push({ role, type: 'input', trusted: event.isTrusted }), { once: true })
    await nativeInput('Input.insertText', { text }); await pause()
  }
  const key = async (key, code, number, modifiers = 0, role = key) => {
    document.addEventListener('keydown', event => nativeEvents.push({ role, type: 'keydown', key: event.key, trusted: event.isTrusted, modifiers: (event.ctrlKey ? 2 : 0) | (event.shiftKey ? 8 : 0) }), { capture: true, once: true })
    for (const type of ['rawKeyDown', 'keyUp']) await nativeInput('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: number, nativeVirtualKeyCode: number, modifiers })
    await pause()
  }
  const click = async (element, role) => {
    if (!element) throw Error('Missing Slash control ' + role)
    element.scrollIntoView({ block: 'nearest' }); await pause()
    const rect = element.getBoundingClientRect(), x = rect.x + rect.width / 2, y = rect.y + rect.height / 2
    if (!rect.width || !rect.height) throw Error('Hidden Slash control ' + role)
    await nativeInput('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await pause()
    let hit = false
    document.addEventListener('mousedown', event => { hit = event.isTrusted && element.contains(event.target); nativeEvents.push({ role, type: 'mousedown', trusted: event.isTrusted, hit }) }, { capture: true, once: true })
    await nativeInput('Input.click', { x, y }); await pause(); check(role + 'Delivered', hit, true)
  }
  let phase = 'load', error = null, retiredHost
  try {
    await nativeInput('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 }); await pause()
    check('canonical', state(), input.blocks); check('history', flags(), [false, false]); completedPhases.push(phase)
    phase = 'query'; await type('/', 'query'); const typed = state(), held = items()[1]
    check('visible', visible(), true); check('choices', items().length, 2); check('history', flags(), [true, false]); completedPhases.push(phase)
    phase = 'revoke'
    if (spec.method === 'caret') await key('ArrowLeft', 'ArrowLeft', 37)
    else await key('Home', 'Home', 36, 8)
    const selection = getSelection()
    check('nativeSelection', { anchor: selection.anchorOffset, focus: selection.focusOffset, collapsed: selection.isCollapsed }, spec.method === 'caret' ? { anchor: 0, focus: 0, collapsed: true } : { anchor: 1, focus: 0, collapsed: false })
    check('closed', !visible(), true); check('canonical', state(), typed); check('history', flags(), [true, false])
    if (spec.action === 'cancel') { await key('Escape', 'Escape', 27, 0, 'retired-cancel'); check('cancelCanonical', state(), typed); check('cancelHistory', flags(), [true, false]) }
    completedPhases.push(phase)
    phase = 'retired'; retiredHost = document.createElement('div'); retiredHost.style.cssText = 'width:260px;margin:auto'; retiredHost.append(held); holder.after(retiredHost)
    await click(held, 'retired'); check('canonical', state(), typed); check('history', flags(), [true, false]); check('closed', !visible(), true); completedPhases.push(phase)
    phase = 'fresh'; await type('q', 'fresh-query'); const fresh = state(), freshItem = items()[0]
    check('meaning', state().map(b => ({ type: b.type, data: b.data })), [{ type: 'paragraph', data: { text: '/q' } }]); check('choices', items().length, 1); check('visible', visible(), true)
    menu().append(held); retiredHost.remove(); retiredHost = null; await click(held, 'retired-with-fresh')
    check('canonical', state(), fresh); check('history', flags(), [true, false]); check('successorVisible', visible() && items()[0] === freshItem && freshItem.isConnected, true)
    field().focus(); held.remove(); completedPhases.push(phase)
    phase = 'action'; await click(freshItem, 'confirm'); const after = state()
    check('meaning', after.map(b => ({ type: b.type, data: b.data })), [{ type: 'quote', data: { text: '', caption: '' } }])
    if (!legacy) check('canonical', after, [{ id: 'a', type: 'quote', dataVersion: 1, data: { text: '', caption: '' } }])
    check('closed', !visible(), true); check('history', flags(), [true, false]); completedPhases.push(phase)
    phase = 'undo'; await key('z', 'KeyZ', 90, 2, 'undo'); check('canonical', state(), fresh); check('history', flags(), [true, true]); completedPhases.push(phase)
    phase = 'redo'; await key('z', 'KeyZ', 90, 10, 'redo'); check('canonical', state(), after); check('history', flags(), [true, false]); check('caller', input, original); check('diagnostics', diagnostics, []); completedPhases.push(phase)
    phase = 'dispose'; editor.destroy(); check('rootRemoved', !holder.querySelector('.oe-editor'), true); completedPhases.push(phase)
  } catch (caught) { error = String(caught.stack ?? caught) }
  finally { retiredHost?.remove(); editor.destroy(); holder.remove() }
  return { id: spec.id, spec, observations, nativeEvents, transactions, diagnostics, unsupported, planned, completedPhases, error }
}
