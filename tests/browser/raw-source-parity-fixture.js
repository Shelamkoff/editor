// Fixed authored text and selection expectations, shared by the three sources.
// No adapter implements an editor command or changes a historical verdict.
const source = '<p>Alpha &amp; Beta</p>\n\t<b>Bravo</b>\n<p>Tail</p>'
const indented = '  <p>Alpha &amp; Beta</p>\n  \t<b>Bravo</b>\n<p>Tail</p>'
const mixed = '\t<p>Alpha</p>\n  <p>Bravo</p>\n\t<p>Tail</p>'
const dedented = '<p>Alpha</p>\n<p>Bravo</p>\n\t<p>Tail</p>'
const range = (start, end = start, direction = 'forward') => ({ start, end, direction: start === end ? 'none' : direction })
const pause = () => new Promise(resolve => setTimeout(resolve, 25))
const clone = value => structuredClone(value)

export const rawSourceCases = [
  { id: 'RAW_SOURCE/tab-caret', kind: 'indent', source, selection: range(5), after: '<p>Al  pha &amp; Beta</p>\n\t<b>Bravo</b>\n<p>Tail</p>', afterSelection: range(7) },
  { id: 'RAW_SOURCE/tab-single-line-range', kind: 'indent', source, selection: range(3, 8), after: '<p>   &amp; Beta</p>\n\t<b>Bravo</b>\n<p>Tail</p>', afterSelection: range(5) },
  ...['forward', 'backward'].map(direction => ({ id: `RAW_SOURCE/tab-next-line-boundary-${direction}`, kind: 'indent', source, selection: range(0, 38, direction), after: indented, afterSelection: range(0, 42, direction) })),
  ...['forward', 'backward'].map(direction => ({ id: `RAW_SOURCE/tab-partial-lines-${direction}`, kind: 'indent', source, selection: range(3, 32, direction), after: indented, afterSelection: range(0, 36, direction) })),
  { id: 'RAW_SOURCE/tab-empty-lines', kind: 'indent', source: '\n\n<p>Tail</p>', selection: range(0, 2), after: '  \n  \n<p>Tail</p>', afterSelection: range(0, 6) },
  { id: 'RAW_SOURCE/tab-final-newline', kind: 'indent', source: '<p>Alpha</p>\n<p>Bravo</p>\n', selection: range(0, 26, 'backward'), after: '  <p>Alpha</p>\n  <p>Bravo</p>\n', afterSelection: range(0, 30, 'backward') },
  ...['forward', 'backward'].map(direction => ({ id: `RAW_SOURCE/dedent-mixed-prefixes-${direction}`, kind: 'indent', shift: true, source: mixed, selection: range(1, 29, direction), after: dedented, afterSelection: range(0, 26, direction) })),
  { id: 'RAW_SOURCE/dedent-caret-inside-spaces', kind: 'indent', shift: true, source: '  <p>Alpha</p>\n<p>Tail</p>', selection: range(1), after: '<p>Alpha</p>\n<p>Tail</p>', afterSelection: range(0) },
  { id: 'RAW_SOURCE/dedent-unindented-no-op', kind: 'indent', shift: true, source, selection: range(3, 8, 'backward'), after: source, afterSelection: range(3, 8, 'backward'), noOp: true },
  { id: 'RAW_PREVIEW/mouse-caret', kind: 'preview', source, selection: range(29), activation: 'mouse' },
  { id: 'RAW_PREVIEW/mouse-forward-range', kind: 'preview', source, selection: range(3, 8), activation: 'mouse' },
  { id: 'RAW_PREVIEW/mouse-backward-lines', kind: 'preview', source, selection: range(3, 38, 'backward'), activation: 'mouse' },
  { id: 'RAW_PREVIEW/keyboard-forward-range', kind: 'preview', source, selection: range(28, 33), activation: 'keyboard' },
  { id: 'RAW_PREVIEW/keyboard-backward-lines', kind: 'preview', source, selection: range(3, 38, 'backward'), activation: 'keyboard' },
  { id: 'RAW_PREVIEW/read-only-forward-range', kind: 'preview', source, selection: range(3, 8), readOnlyRoundTrip: true },
  { id: 'RAW_PREVIEW/read-only-backward-lines', kind: 'preview', source, selection: range(3, 38, 'backward'), readOnlyRoundTrip: true },
  { id: 'RAW_PREVIEW/initial-read-only', kind: 'preview', source, selection: range(29), initialReadOnly: true },
  { id: 'RAW_PREVIEW/history-from-preview', kind: 'preview-history', source, selection: range(49) },
]

async function settled() {
  const deadline = Date.now() + 10000
  while ([...document.querySelectorAll('link[rel="stylesheet"]')].some(link => !link.disabled && !link.sheet)) {
    if (Date.now() > deadline) throw new Error('Raw styles did not load')
    await pause()
  }
  await pause()
}

export async function runRawSourceCase(specification, { sourceBase = '../../', legacy = false, native }) {
  const base = new URL(sourceBase, import.meta.url)
  const [{ createEditor }, rawModule, paragraphModule] = await Promise.all([
    import(new URL('core/index.js', base).href), import(new URL('plugins/raw/index.js', base).href),
    import(new URL('plugins/paragraph/index.js', base).href),
  ])
  const raw = legacy ? new rawModule.Raw() : rawModule.createRawPlugin()
  const paragraph = legacy ? new paragraphModule.Paragraph() : paragraphModule.createParagraphPlugin()
  const record = (id, type, data) => ({ id, type,
    ...(!legacy ? { dataVersion: (type === 'raw' ? raw : paragraph).schema.currentVersion } : {}), data })
  const input = { version: legacy ? '1.0.5' : '2.0.0', blocks: [
    record('before', 'paragraph', { text: 'Before <b>raw</b>' }),
    record('raw', 'raw', { html: specification.source }),
    record('after', 'paragraph', { text: 'After <i>raw</i>' }),
  ] }
  const supplied = clone(input), holder = document.createElement('section')
  holder.style.width = '680px'
  document.body.append(holder)
  const observations = [], phases = [], completedPhases = [], trusted = [], transactions = []
  let editor, phase = 'load'
  const same = (left, right) => JSON.stringify(left) === JSON.stringify(right)
  const check = (property, actual, expected) => observations.push({ phase, property, actual, expected, status: same(actual, expected) ? 'PASS' : 'FAIL' })
  const completed = () => completedPhases.push(phase)
  const plannedPhases = specification.kind === 'indent'
    ? ['load', 'selected', 'indent', 'input', 'undo-input', ...(!specification.noOp ? ['undo-indent', 'redo-indent'] : []), 'redo-input', 'dispose']
    : specification.kind === 'preview-history'
      ? ['load', 'selected', 'input', 'preview', 'undo-input', 'redo-input', 'dispose']
      : ['load', ...(!specification.initialReadOnly ? ['selected'] : []), 'preview', ...(specification.readOnlyRoundTrip || specification.initialReadOnly ? ['editable-again'] : []), 'source-return', 'input', 'undo-input', 'redo-input', 'dispose']
  try {
    editor = createEditor({ holder, plugins: [paragraph, raw], inlinePlugins: [], inlineTools: [], defaultBlock: 'paragraph',
      injectStyles: true, readOnly: Boolean(specification.initialReadOnly), data: input })
    if (!legacy) editor.on('transaction:committed', () => transactions.push(phase))
    holder.addEventListener('keydown', event => trusted.push({ phase, type: 'keydown', key: event.key, shift: event.shiftKey, trusted: event.isTrusted }))
    holder.addEventListener('input', event => trusted.push({ phase, type: 'input', inputType: event.inputType, trusted: event.isTrusted }))
    const shell = () => holder.querySelector('.oe-raw')
    const field = () => shell().querySelector('textarea')
    const toggle = () => shell().querySelector('.oe-raw__toggle')
    const preview = () => shell().querySelector('.oe-raw__preview')
    const shown = () => field().style.display === 'none'
    const records = text => [
      { id: 'before', type: 'paragraph', data: { text: 'Before <b>raw</b>' } },
      { id: 'raw', type: 'raw', data: { html: text } },
      { id: 'after', type: 'paragraph', data: { text: 'After <i>raw</i>' } },
    ]
    const selection = expected => {
      check('sourceFocus', document.activeElement === field(), true)
      check('sourceSelection', { start: field().selectionStart, end: field().selectionEnd,
        direction: field().selectionStart === field().selectionEnd ? 'none' : field().selectionDirection }, expected)
    }
    const capture = (name, text, canUndo, canRedo, actions, expectedSelection) => {
      phase = name
      const blocks = editor.save().blocks
      check('canonicalRecords', blocks.map(({ id, type, data }) => ({ id, type, data })), records(text))
      check('literalSource', field().value, text)
      check('sourceMarkupIsInert', [field().childElementCount, shell().querySelectorAll('p,b').length], [0, 0])
      check('history', { canUndo: editor.canUndo, canRedo: editor.canRedo }, { canUndo, canRedo })
      check('callerInput', input, supplied)
      if (!legacy) check('completedTransactions', transactions.length, actions)
      if (expectedSelection) selection(expectedSelection)
      phases.push({ phase, blocks: clone(blocks), preview: shown(), readOnly: field().readOnly,
        selection: { start: field().selectionStart, end: field().selectionEnd, direction: field().selectionDirection, focused: document.activeElement === field() },
        history: { canUndo: editor.canUndo, canRedo: editor.canRedo } })
      completed()
    }
    const checkPreview = text => {
      check('sourceHidden', shown(), true)
      check('previewVisible', preview().style.display, '')
      check('previewFrameCount', preview().querySelectorAll('iframe').length, 1)
      check('previewMarkup', preview().querySelector('iframe')?.srcdoc, text)
      check('previewSandbox', preview().querySelector('iframe')?.getAttribute('sandbox'), '')
      check('togglePressed', toggle().getAttribute('aria-pressed'), 'true')
    }
    const checkSource = () => {
      check('sourceVisible', shown(), false)
      check('previewHidden', preview().style.display, 'none')
      check('togglePressed', toggle().getAttribute('aria-pressed'), 'false')
    }
    const activate = async (activation = 'mouse') => {
      const control = toggle()
      await settled()
      if (activation === 'keyboard') {
        control.focus()
        await native('key', 'Space')
      } else {
        control.scrollIntoView({ block: 'nearest', inline: 'nearest' })
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        const rect = control.getBoundingClientRect(), x = rect.left + rect.width / 2, y = rect.top + rect.height / 2
        if (!rect.width || !rect.height || !control.contains(document.elementFromPoint(x, y))) throw new Error('Raw preview control is not visible and reachable')
        let delivered
        const listener = event => { delivered = { trusted: event.isTrusted, intendedControl: control.contains(event.target) } }
        document.addEventListener('click', listener, { capture: true, once: true })
        try { await native('click', { x, y }) } finally { document.removeEventListener('click', listener, true) }
        check('trustedControlClick', delivered, { trusted: true, intendedControl: true })
      }
      await pause()
    }
    const select = async expected => {
      field().focus()
      await native('key', 'Control+Home')
      const anchor = expected.direction === 'backward' ? expected.end : expected.start
      for (let index = 0; index < anchor; index++) await native('key', 'ArrowRight')
      const extend = expected.direction === 'backward' ? 'Shift+ArrowLeft' : 'Shift+ArrowRight'
      for (let index = expected.start; index < expected.end; index++) await native('key', extend)
      await pause()
    }
    const action = async (kind, value) => { phase = kind; await native(value === undefined ? kind : 'key', value); await pause() }
    await settled()
    capture('load', specification.source, false, false, 0)
    check('initialReadOnly', field().readOnly, Boolean(specification.initialReadOnly))
    if (!specification.initialReadOnly) {
      phase = 'selected'; await select(specification.selection)
      capture('selected', specification.source, false, false, 0, specification.selection)
    }

    if (specification.kind === 'indent') {
      await action('indent', specification.shift ? 'Shift+Tab' : 'Tab')
      const actions = specification.noOp ? 0 : 1
      capture('indent', specification.after, !specification.noOp, false, actions, specification.afterSelection)
      check('trustedIndentation', trusted.filter(event => event.phase === 'indent' && event.key === 'Tab').map(event => ({ trusted: event.trusted, shift: event.shift })), [{ trusted: true, shift: Boolean(specification.shift) }])
      const typed = specification.after.slice(0, specification.afterSelection.start) + 'X' + specification.after.slice(specification.afterSelection.end)
      const typedSelection = range(specification.afterSelection.start + 1)
      phase = 'input'; await native('type', 'X'); await pause()
      capture('input', typed, true, false, actions + 1, typedSelection)
      await action('undo-input', 'Control+z')
      capture('undo-input', specification.after, !specification.noOp, true, actions + 2, specification.afterSelection)
      if (!specification.noOp) {
        await action('undo-indent', 'Control+z')
        capture('undo-indent', specification.source, false, true, 4, specification.selection)
        await action('redo-indent', 'Control+Shift+z')
        capture('redo-indent', specification.after, true, true, 5, specification.afterSelection)
      }
      await action('redo-input', 'Control+Shift+z')
      capture('redo-input', typed, true, false, specification.noOp ? 3 : 6, typedSelection)
    } else {
      if (specification.kind === 'preview-history') {
        phase = 'input'; await native('type', 'X'); await pause()
        capture('input', specification.source + 'X', true, false, 1, range(50))
        phase = 'preview'; await activate()
        capture('preview', specification.source + 'X', true, false, 1)
        checkPreview(specification.source + 'X')
      } else {
        phase = 'preview'
        if (specification.readOnlyRoundTrip) editor.setReadOnly(true)
        else if (!specification.initialReadOnly) await activate(specification.activation)
        await pause()
        capture('preview', specification.source, false, false, 0)
        checkPreview(specification.source)
        if (specification.readOnlyRoundTrip || specification.initialReadOnly) {
          check('readOnlySource', field().readOnly, true)
          check('readOnlyControl', { hidden: toggle().hidden, disabled: toggle().disabled }, { hidden: true, disabled: true })
          phase = 'editable-again'; editor.setReadOnly(false); await pause()
          capture('editable-again', specification.source, false, false, 0)
          check('editableSource', field().readOnly, false)
          check('editableControl', { hidden: toggle().hidden, disabled: toggle().disabled }, { hidden: false, disabled: false })
        }
        phase = 'source-return'
        // Returning to editing may already expose the source in older builds.
        // Use the existing toggle only when a preview is still shown.
        if (shown()) await activate(specification.activation)
        if (specification.initialReadOnly) await select(specification.selection)
        capture('source-return', specification.source, false, false, 0, specification.selection)
        checkSource()
        phase = 'input'; await native('type', 'X'); await pause()
        const typed = specification.source.slice(0, specification.selection.start) + 'X' + specification.source.slice(specification.selection.end)
        capture('input', typed, true, false, 1, range(specification.selection.start + 1))
      }
      const typed = specification.source.slice(0, specification.selection.start) + 'X' + specification.source.slice(specification.selection.end)
      await action('undo-input', 'Control+z')
      capture('undo-input', specification.source, false, true, 2, specification.selection)
      checkSource()
      await action('redo-input', 'Control+Shift+z')
      capture('redo-input', typed, true, false, 3, range(specification.selection.start + 1))
    }
    check('nativeInputObserved', trusted.some(event => event.phase === 'input' && event.type === 'input' && event.inputType === 'insertText' && event.trusted), true)
    check('allRecordedGesturesTrusted', trusted.every(event => event.trusted), true)
    phase = 'dispose'
    editor.destroy()
    check('editorRemoved', holder.querySelector('.oe-editor'), null)
    completed()
    return { id: specification.id, specification, observations, phases, completedPhases, plannedPhases, trusted, error: null }
  } catch (error) {
    return { id: specification.id, specification, observations, phases, completedPhases, plannedPhases, trusted, phase, error: error.stack ?? String(error) }
  } finally {
    editor?.destroy()
    holder.remove()
  }
}
