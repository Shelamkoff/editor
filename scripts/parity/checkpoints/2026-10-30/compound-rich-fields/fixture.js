export const cases = [
  { id: 'toggle/disclosure-rich-title', type: 'toggle', name: 'Toggle', version: 1, field: '.oe-toggle__title', control: '.oe-toggle__chevron' },
  { id: 'checklist/check-rich-item', type: 'checklist', name: 'Checklist', version: 2, field: '.oe-checklist__item:last-child .oe-checklist__text', control: '.oe-checklist__item:last-child .oe-checklist__checkbox' },
]
const rich = '<b>Alpha</b> {{mention}} {{swatch}} tail'
const clone = value => JSON.parse(JSON.stringify(value))
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value
const pause = (ms = 20) => new Promise(resolve => setTimeout(resolve, ms))

export async function runCase(spec, { sourceBase, legacy, input, onPhase }) {
  const base = new URL(sourceBase, location.href)
  const [core, paragraph, block, mention, color] = await Promise.all([
    import(new URL('core/index.js', base).href), import(new URL('plugins/paragraph/index.js', base).href),
    import(new URL(`plugins/${spec.type}/index.js`, base).href), import(new URL('inline-plugins/mention/index.js', base).href),
    import(new URL('inline-plugins/color.js', base).href),
  ])
  const record = (id, type, version, data, extra = {}) => ({ id, type, ...(!legacy ? { dataVersion: version } : {}), data, ...extra })
  const sidecar = (type, data) => ({ type, ...(!legacy ? { dataVersion: 1 } : {}), data })
  const inline = { mention: sidecar('mention', { id: 'ada', name: 'Ada' }), swatch: sidecar('color', { value: '#123456' }) }
  const records = (suffix = '', changed = false) => [
    record('before', 'paragraph', 2, { text: 'Before' }),
    record('subject', spec.type, spec.version, spec.type === 'toggle'
      ? { title: rich + suffix, content: '<i>Body</i>', open: changed }
      : { items: [{ ...(!legacy ? { id: 'other' } : {}), text: 'Other', checked: true },
        { ...(!legacy ? { id: 'active' } : {}), text: rich + suffix, checked: changed }] }, { inline }),
    record('after', 'paragraph', 2, { text: 'After' }),
  ]
  const initial = { version: legacy ? '1.0.5' : '2.0.0', blocks: records() }, callerBytes = JSON.stringify(initial)
  const holder = document.createElement('section'); holder.style.width = '640px'; document.body.append(holder)
  let editor, phase = 'create', providers = 0
  const observations = [], snapshots = [], events = []
  const check = (property, actual, expected) => observations.push({ phase, property,
    status: JSON.stringify(stable(actual)) === JSON.stringify(stable(expected)) ? 'PASS' : 'FAIL', actual, expected })
  const root = id => holder.querySelector(`.oe-block[data-block-id="${id}"]`)
  const field = () => root('subject')?.querySelector(spec.field)
  const control = () => root('subject')?.querySelector(spec.control)
  const setPhase = name => { phase = name; onPhase?.(name) }
  const capture = event => events.push({ phase, type: event.type, key: event.key ?? null, trusted: event.isTrusted,
    inputType: event.inputType ?? null, block: event.target.closest?.('[data-block-id]')?.dataset.blockId ?? null })
  for (const type of ['input', 'keydown', 'mousedown']) holder.addEventListener(type, capture, true)
  const snapshot = (name, suffix, changed) => {
    setPhase(name)
    const actual = editor.save().blocks
    snapshots.push({ phase, blocks: actual, activeBlock: document.activeElement?.closest('[data-block-id]')?.dataset.blockId ?? null,
      canUndo: editor.canUndo, canRedo: editor.canRedo })
    check('records', actual, records(suffix, changed))
    check('controlState', control().getAttribute(spec.type === 'toggle' ? 'aria-expanded' : 'aria-pressed'), String(changed))
    check('widgetText', [...field().querySelectorAll('[data-inline-plugin]')].map(node => ({ type: node.dataset.inlinePlugin, text: node.textContent })),
      [{ type: 'mention', text: '@Ada' }, { type: 'color', text: '#123456' }])
  }
  const caret = suffix => {
    const author = field(), tail = author?.lastChild, selection = getSelection()
    check('caret', { focused: document.activeElement === author, tail: tail?.textContent,
      anchor: selection?.anchorNode === tail, focus: selection?.focusNode === tail,
      anchorOffset: selection?.anchorOffset, focusOffset: selection?.focusOffset, collapsed: selection?.isCollapsed },
    { focused: true, tail: ' tail' + suffix, anchor: true, focus: true, anchorOffset: 5 + suffix.length, focusOffset: 5 + suffix.length, collapsed: true })
  }
  async function settled() {
    const deadline = Date.now() + 10000
    while ([...document.querySelectorAll('link[rel="stylesheet"]')].some(link => !link.disabled && !link.sheet)) {
      if (Date.now() > deadline) throw new Error('Compound stylesheets did not load')
      await pause()
    }
    await document.fonts.ready
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); await pause()
  }
  async function click(element) {
    element.scrollIntoView({ block: 'nearest' }); await settled()
    const rect = element.getBoundingClientRect()
    if (!rect.width || !rect.height) throw new Error('Native click target is invisible')
    await input('click', { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }); await settled()
  }
  const planned = ['load', 'edit', 'control', 'continue', 'undo-continue', 'undo-control', 'undo-edit', 'redo-edit', 'redo-control', 'redo-continue', 'dispose']
  try {
    editor = core.createEditor({ holder, injectStyles: true, defaultBlock: 'paragraph', data: initial, inlineTools: [],
      plugins: legacy ? [new paragraph.Paragraph(), new block[spec.name]()] : [paragraph.createParagraphPlugin(), block[`create${spec.name}Plugin`]()],
      inlinePlugins: [mention.createMentionPlugin({ searchFunction: async () => { providers++; return [] } }), color.createColorSwatchPlugin()],
    })
    await settled(); snapshot('load', '', false)
    await click(field())
    const originalField = field(), tail = originalField.lastChild, widgets = [...originalField.querySelectorAll('[data-inline-plugin]')]
    const range = document.createRange(); range.setStart(tail, tail.textContent.length); range.collapse(true)
    getSelection().removeAllRanges(); getSelection().addRange(range)
    setPhase('edit'); await input('type', 'X'); await settled(); snapshot('edit', 'X', false); caret('X')
    check('trustedInput', events.filter(value => value.phase === 'edit' && value.type === 'input').map(value => ({ trusted: value.trusted, type: value.inputType })), [{ trusted: true, type: 'insertText' }])
    setPhase('control'); await click(control()); snapshot('control', 'X', true); caret('X')
    check('nativeControl', events.filter(value => value.phase === 'control' && value.type === 'mousedown').map(value => value.trusted), [true])
    check('retainedAuthorField', field() === originalField, true)
    check('retainedAuthorText', field().lastChild === tail, true)
    check('retainedWidgets', widgets.map(node => field().contains(node)), [true, true])
    setPhase('continue'); await input('type', 'Y'); await settled(); snapshot('continue', 'XY', true); caret('XY')
    check('trustedContinuation', events.filter(value => value.phase === 'continue' && value.type === 'input').map(value => ({ trusted: value.trusted, type: value.inputType })), [{ trusted: true, type: 'insertText' }])
    for (const [name, action, suffix, changed, undo, redo] of [
      ['undo-continue', 'undo', 'X', true, true, true], ['undo-control', 'undo', 'X', false, true, true], ['undo-edit', 'undo', '', false, false, true],
      ['redo-edit', 'redo', 'X', false, true, true], ['redo-control', 'redo', 'X', true, true, true], ['redo-continue', 'redo', 'XY', true, true, false],
    ]) {
      setPhase(name); await input(action); await settled(); snapshot(name, suffix, changed); caret(suffix)
      check('historyAvailability', [editor.canUndo, editor.canRedo], [undo, redo])
      check('trustedHistory', events.filter(value => value.phase === name && value.key?.toLowerCase() === 'z').map(value => value.trusted), [true])
    }
    check('callerInputUnchanged', JSON.stringify(initial), callerBytes); check('providerSilence', providers, 0)
    setPhase('dispose'); editor.destroy(); check('releasedHolder', holder.childElementCount, 0); snapshots.push({ phase })
  } catch (error) { observations.push({ phase, property: 'execution', status: 'ERROR', actual: error.stack ?? String(error) }) }
  finally { editor?.destroy(); holder.remove() }
  return { ...spec, legacy, observations, snapshots, events, failures: observations.filter(value => value.status !== 'PASS'),
    incompletePhases: planned.filter(name => !snapshots.some(value => value.phase === name)) }
}
