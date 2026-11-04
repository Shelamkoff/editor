export const residualCutCases = ['warning', 'toggle', 'spoiler'].flatMap(family => ['first', 'last'].flatMap(side => ['text', 'widget', 'empty'].flatMap(survivor => [false, true].map(backward => ({ id: [family, side, survivor, backward ? 'backward' : 'forward'].join('/'), family, side, survivor, backward })))))

export async function runResidualCutCase({ sourceBase = '../../', legacy = false, spec, nativeInput }) {
  const base = new URL(sourceBase, import.meta.url)
  const [core, paragraph, warning, toggle, spoiler, color] = await Promise.all(['core/index.js', 'plugins/paragraph/index.js', 'plugins/warning/index.js', 'plugins/toggle/index.js', 'plugins/spoiler/index.js', 'inline-plugins/color.js'].map(path => import(new URL(path, base))))
  const config = ({ warning: { module: warning, factory: 'createWarningPlugin', ctor: 'Warning', keys: ['title', 'message'], selectors: ['.oe-warning__title', '.oe-warning__message'] }, toggle: { module: toggle, factory: 'createTogglePlugin', ctor: 'Toggle', keys: ['title', 'content'], selectors: ['.oe-toggle__title', '.oe-toggle__body'], button: '.oe-toggle__chevron' }, spoiler: { module: spoiler, factory: 'createSpoilerPlugin', ctor: 'Spoiler', keys: ['label', 'content'], selectors: ['.oe-spoiler__label', '.oe-spoiler__content'], button: '.oe-spoiler__toggle' } })[spec.family]
  const copy = value => JSON.parse(JSON.stringify(value)), pause = (ms = 60) => new Promise(resolve => setTimeout(resolve, ms))
  const survivor = spec.survivor === 'text' ? '<i>Keep</i> {{swatch}}' : spec.survivor === 'widget' ? '{{swatch}}' : '<i></i>'
  const selected = spec.side === 'first' ? 0 : 1, other = 1 - selected, data = { [config.keys[0]]: selected === 0 ? '<b>Alpha</b>' : survivor, [config.keys[1]]: selected === 1 ? '<b>Alpha</b>' : survivor, ...(spec.family === 'toggle' ? { open: true } : {}) }
  const record = (id, type, value) => ({ id, type, ...(!legacy ? { dataVersion: type === 'paragraph' ? 2 : 1 } : {}), data: value })
  const subject = record('subject', spec.family, data)
  if (spec.survivor !== 'empty') subject.inline = { swatch: { type: 'color', ...(!legacy ? { dataVersion: 1 } : {}), data: { value: '#aBcDef' } } }
  const input = { version: legacy ? '1.0.5' : '2.0.0', blocks: [record('prefix', 'paragraph', { text: 'Before' }), subject, record('suffix', 'paragraph', { text: 'After' })] }, original = copy(input)
  const holder = document.createElement('section'); holder.style.cssText = 'width:850px;margin:100px auto'; document.body.append(holder)
  const observations = [], nativeEvents = [], transactions = [], clipboard = [], diagnostics = [], unsupported = legacy ? [{ property: 'currentObservers', reason: 'Legacy transaction/diagnostic subscriptions are absent; empty bookkeeping arrays are not legacy event counts.' }] : [], planned = ['load', 'select', 'cut', 'undo', 'redo', 'dispose'], completedPhases = []
  const editor = core.createEditor({ holder, injectStyles: true, plugins: [legacy ? new paragraph.Paragraph() : paragraph.createParagraphPlugin(), legacy ? new config.module[config.ctor]() : config.module[config.factory]()], inlinePlugins: [color.createColorSwatchPlugin()], inlineTools: [], data: input, onDiagnostic: value => diagnostics.push(value) })
  if (!legacy) editor.on('transaction:committed', event => transactions.push({ action: event.action, origin: event.origin, name: event.name }))
  const state = () => editor.save().blocks, flags = () => [editor.canUndo, editor.canRedo], fields = () => config.selectors.map(selector => holder.querySelector(selector)), roots = () => Array.from(holder.querySelectorAll('.oe-block'))
  const empty = value => /^(?:\s|<\/?(?:b|i|strong|em)>|<br\s*\/?>)*$/i.test(value)
  const normalized = value => value.map(block => block.id !== 'subject' ? block : { ...block, data: { ...block.data, [config.keys[selected]]: empty(block.data[config.keys[selected]]) ? '' : block.data[config.keys[selected]] } })
  const check = (property, actual, expected) => observations.push({ phase, property, actual: copy(actual), expected: copy(expected), status: JSON.stringify(actual) === JSON.stringify(expected) ? 'PASS' : 'FAIL' })
  const key = async (key, code, number, modifiers, role) => {
    document.addEventListener('keydown', event => nativeEvents.push({ role, type: 'keydown', key: event.key, trusted: event.isTrusted, modifiers: (event.ctrlKey ? 2 : 0) | (event.shiftKey ? 8 : 0) }), { capture: true, once: true })
    for (const type of ['rawKeyDown', 'keyUp']) await nativeInput('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: number, nativeVirtualKeyCode: number, modifiers })
    await pause(90)
  }
  let phase = 'load', error = null
  try {
    await nativeInput('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 }); await pause(100)
    if (!fields()[1].getClientRects().length && config.button) {
      const button = holder.querySelector(config.button), r = button.getBoundingClientRect(); await nativeInput('Input.click', { x: r.x + r.width / 2, y: r.y + r.height / 2 }); await pause()
    }
    const initial = state(), oldRoots = roots(), survivorField = fields()[other], oldWidget = survivorField.querySelector('[data-inline-plugin]')
    check('canonical', initial, input.blocks); check('history', flags(), [false, false]); check('selectedFieldVisible', !!fields()[selected].getClientRects().length, true); completedPhases.push(phase)
    phase = 'select'; const paragraphs = holder.querySelectorAll('.oe-paragraph'), alpha = fields()[selected].querySelector('b').firstChild
    const start = spec.side === 'first' ? { field: paragraphs[0], node: paragraphs[0].firstChild, offset: 2 } : { field: fields()[1], node: alpha, offset: 0 }
    const end = spec.side === 'first' ? { field: fields()[0], node: alpha, offset: 5 } : { field: paragraphs[1], node: paragraphs[1].firstChild, offset: 2 }
    const anchor = spec.backward ? end : start, focus = spec.backward ? start : end; anchor.field.focus(); getSelection().setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset); await pause()
    check('nativeRange', { anchor: getSelection().anchorNode === anchor.node && getSelection().anchorOffset === anchor.offset, focus: getSelection().focusNode === focus.node && getSelection().focusOffset === focus.offset, selectedOnly: getSelection().getRangeAt(0).toString().includes('Alpha') && !getSelection().getRangeAt(0).toString().includes('Keep') && !getSelection().getRangeAt(0).toString().includes('#aBcDef') }, { anchor: true, focus: true, selectedOnly: true }); check('canonical', state(), initial); check('history', flags(), [false, false]); completedPhases.push(phase)
    phase = 'cut'; const root = holder.querySelector('.oe-editor')
    root.addEventListener('cut', event => { const values = Object.fromEntries(Array.from(event.clipboardData.types, type => [type, event.clipboardData.getData(type)])); clipboard.push({ trusted: event.isTrusted, prevented: event.defaultPrevented, values }); nativeEvents.push({ role: 'cut-event', type: 'cut', trusted: event.isTrusted }) }, { capture: true, once: true })
    await key('x', 'KeyX', 88, 2, 'cut')
    const after = state(), expected = copy(initial); expected[0].data.text = spec.side === 'first' ? 'Be' : 'Before'; expected[2].data.text = spec.side === 'first' ? 'After' : 'ter'
    if (spec.survivor === 'empty') expected.splice(1, 1); else expected[1].data[config.keys[selected]] = ''
    check('canonical', normalized(after), expected); check('history', flags(), [true, false]); check('clipboardEvents', clipboard.length, 1)
    check('trustedCut', clipboard[0]?.trusted ?? false, true); const plain = clipboard[0]?.values['text/plain'] ?? ''; check('selectedPlainOnly', plain.includes('Alpha') && !plain.includes('Keep') && !plain.includes('#aBcDef'), true)
    check('privateFragment', Object.keys(clipboard[0]?.values ?? {}).some(type => type.includes('rector')), true)
    check('neighborsRetained', roots()[0] === oldRoots[0] && roots().at(-1) === oldRoots[2], true)
    check('subjectPresence', !!holder.querySelector(config.selectors[0]), spec.survivor !== 'empty')
    if (spec.survivor !== 'empty') {
      check('survivorHostRetained', fields()[other] === survivorField, true)
      check('survivorWidget', { retained: survivorField.contains(oldWidget), id: oldWidget?.dataset.id, value: oldWidget?.dataset.value, label: oldWidget?.querySelector('.oe-ip__label')?.textContent, dot: oldWidget?.querySelector('.oe-ip__dot')?.style.backgroundColor }, { retained: true, id: 'swatch', value: '#aBcDef', label: '#aBcDef', dot: 'rgb(171, 205, 239)' })
    }
    completedPhases.push(phase)
    phase = 'undo'; await key('z', 'KeyZ', 90, 2, 'undo'); check('canonical', state(), initial); check('history', flags(), [false, true]); completedPhases.push(phase)
    phase = 'redo'; await key('z', 'KeyZ', 90, 10, 'redo'); check('canonical', state(), after); check('normalized', normalized(state()), expected); check('history', flags(), [true, false]); check('caller', input, original); check('diagnostics', diagnostics, []); completedPhases.push(phase)
    phase = 'dispose'; editor.destroy(); check('rootRemoved', !holder.querySelector('.oe-editor'), true); completedPhases.push(phase)
  } catch (caught) { error = String(caught.stack ?? caught) }
  finally { editor.destroy(); holder.remove() }
  return { id: spec.id, spec, observations, nativeEvents, transactions, clipboard, diagnostics, unsupported, planned, completedPhases, error }
}
