// Fixed author input and outcomes; no production indentation/formatting helper
// supplies the oracle. Each source receives the same native gestures.
const source = '<p>Alpha &amp; Beta</p>\n\t<b>Bravo</b>\n<p>Tail</p>'
const indented = '    <p>Alpha &amp; Beta</p>\n    \t<b>Bravo</b>\n<p>Tail</p>'
const mixed = '\t<p>Alpha</p>\n    <p>Bravo</p>\n\t<p>Tail</p>'
const dedented = '<p>Alpha</p>\n<p>Bravo</p>\n\t<p>Tail</p>'
const range = (start, end = start, direction = 'forward') => ({ start, end, direction: start === end ? 'none' : direction })
const pause = () => new Promise(resolve => setTimeout(resolve, 25))
const clone = value => structuredClone(value)
const escape = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const label = language => ({ auto: 'Auto', javascript: 'JavaScript', typescript: 'TypeScript', plaintext: 'Plain text' })[language] ?? language

export const codeSourceLanguageCases = [
  { id: 'CODE_SOURCE/tab-caret', kind: 'indent', source, selection: range(5), after: '<p>Al    pha &amp; Beta</p>\n\t<b>Bravo</b>\n<p>Tail</p>', afterSelection: range(9) },
  { id: 'CODE_SOURCE/tab-single-line-range', kind: 'indent', source, selection: range(3, 8), after: '<p>     &amp; Beta</p>\n\t<b>Bravo</b>\n<p>Tail</p>', afterSelection: range(7) },
  ...['forward', 'backward'].map(direction => ({ id: `CODE_SOURCE/tab-next-line-boundary-${direction}`, kind: 'indent', source, selection: range(0, 38, direction), after: indented, afterSelection: range(0, 46, direction) })),
  ...['forward', 'backward'].map(direction => ({ id: `CODE_SOURCE/tab-partial-lines-${direction}`, kind: 'indent', source, selection: range(3, 32, direction), after: indented, afterSelection: range(0, 40, direction) })),
  { id: 'CODE_SOURCE/tab-empty-lines', kind: 'indent', source: '\n\n<p>Tail</p>', selection: range(0, 2), after: '    \n    \n<p>Tail</p>', afterSelection: range(0, 10) },
  { id: 'CODE_SOURCE/tab-final-newline', kind: 'indent', source: '<p>Alpha</p>\n<p>Bravo</p>\n', selection: range(0, 26, 'backward'), after: '    <p>Alpha</p>\n    <p>Bravo</p>\n', afterSelection: range(0, 34, 'backward') },
  ...['forward', 'backward'].map(direction => ({ id: `CODE_SOURCE/dedent-mixed-prefixes-${direction}`, kind: 'indent', shift: true, source: mixed, selection: range(1, 31, direction), after: dedented, afterSelection: range(0, 26, direction) })),
  { id: 'CODE_SOURCE/dedent-caret-inside-spaces', kind: 'indent', shift: true, source: '    <p>Alpha</p>\n<p>Tail</p>', selection: range(2), after: '<p>Alpha</p>\n<p>Tail</p>', afterSelection: range(0) },
  { id: 'CODE_SOURCE/dedent-unindented-no-op', kind: 'indent', shift: true, source, selection: range(3, 8, 'backward'), after: source, afterSelection: range(3, 8, 'backward'), noOp: true },
  { id: 'CODE_LANGUAGE/filter-down-javascript', kind: 'language', initial: 'auto', query: 'script', keys: ['ArrowDown', 'Enter'], language: 'javascript', visible: ['javascript', 'typescript'] },
  { id: 'CODE_LANGUAGE/filter-up-typescript', kind: 'language', initial: 'auto', query: 'script', keys: ['ArrowUp', 'Enter'], language: 'typescript', visible: ['javascript', 'typescript'] },
  { id: 'CODE_LANGUAGE/enter-auto', kind: 'language', initial: 'javascript', query: 'auto', keys: ['Enter'], language: 'auto', visible: ['auto'] },
  { id: 'CODE_LANGUAGE/click-plain', kind: 'language', initial: 'auto', query: 'plain', click: 'plaintext', language: 'plaintext', visible: ['plaintext'] },
  { id: 'CODE_LANGUAGE/unknown-to-known', kind: 'language', initial: 'custom-unknown-language', query: 'javascript', click: 'javascript', language: 'javascript', visible: ['javascript'] },
  { id: 'CODE_LANGUAGE/same-language-no-op', kind: 'language', initial: 'javascript', query: 'javascript', keys: ['Enter'], language: 'javascript', visible: ['javascript'], noOp: true },
  { id: 'CODE_LANGUAGE/escape-no-op', kind: 'language', initial: 'auto', query: 'rust', keys: ['Escape'], language: 'auto', visible: ['rust'], noOp: true },
  { id: 'CODE_LANGUAGE/no-results-no-op', kind: 'language', initial: 'javascript', query: 'no-language-987', keys: ['Enter', 'Escape'], language: 'javascript', visible: [], noOp: true },
].map(specification => ({ source, ...specification }))

async function settled() {
  const deadline = Date.now() + 10000
  while ([...document.querySelectorAll('link[rel="stylesheet"]')].some(link => !link.disabled && !link.sheet)) {
    if (Date.now() > deadline) throw new Error('Code styles did not load')
    await pause()
  }
  await pause()
}

export async function runCodeSourceLanguageCase(specification, { sourceBase = '../../', legacy = false, native }) {
  const base = new URL(sourceBase, import.meta.url)
  const [{ createEditor }, codeModule, paragraphModule] = await Promise.all([
    import(new URL('core/index.js', base).href), import(new URL('plugins/code/index.js', base).href),
    import(new URL('plugins/paragraph/index.js', base).href),
  ])
  const calls = [], observations = [], phases = [], completedPhases = [], trusted = [], transactions = [], pageErrors = []
  let editor, phase = 'load'
  const runtime = {
    getLanguage(value) { return ['javascript', 'typescript'].includes(value) },
    highlight(code, options) { calls.push({ phase, kind: 'explicit', code, language: options.language }); return { value: `<span class="hljs-keyword">${escape(code)}</span>` } },
    highlightAuto(code) { calls.push({ phase, kind: 'auto', code }); return { value: `<span class="hljs-string">${escape(code)}</span>`, language: 'javascript' } },
  }
  const definition = legacy ? new codeModule.Code({ hljs: runtime }) : codeModule.createCodePlugin({ hljs: runtime })
  const paragraph = legacy ? new paragraphModule.Paragraph() : paragraphModule.createParagraphPlugin()
  const record = (id, type, data) => ({ id, type, ...(!legacy ? { dataVersion: (type === 'code' ? definition : paragraph).schema.currentVersion } : {}), data })
  const initialLanguage = specification.initial ?? 'plaintext'
  const records = (text, language) => [
    { id: 'before', type: 'paragraph', data: { text: 'Before <b>code</b>' } },
    { id: 'code', type: 'code', data: { code: text, language } },
    { id: 'after', type: 'paragraph', data: { text: 'After <i>code</i>' } },
  ]
  const input = { version: legacy ? '1.0.5' : '2.0.0', blocks: records(specification.source, initialLanguage).map(row => record(row.id, row.type, row.data)) }
  const supplied = clone(input), holder = document.createElement('section')
  holder.style.width = '680px'
  document.body.append(holder)
  const same = (left, right) => JSON.stringify(left) === JSON.stringify(right)
  const check = (property, actual, expected) => observations.push({ phase, property, actual: clone(actual), expected: clone(expected), status: same(actual, expected) ? 'PASS' : 'FAIL' })
  const onError = event => pageErrors.push({ phase, message: event.error?.stack ?? event.message })
  window.addEventListener('error', onError)
  const plannedPhases = specification.kind === 'indent'
    ? ['load', 'selected', 'indent', 'input', 'undo-input', ...(!specification.noOp ? ['undo-indent', 'redo-indent'] : []), 'redo-input', 'dispose']
    : ['load', 'input', 'filter', 'control', ...(!specification.noOp ? ['undo-control'] : []), 'undo-input', 'redo-input', ...(!specification.noOp ? ['redo-control'] : []), 'read-only-control', 'dispose']
  try {
    editor = createEditor({ holder, plugins: [paragraph, definition], inlinePlugins: [], inlineTools: [], defaultBlock: 'paragraph', injectStyles: true, data: input })
    if (!legacy) editor.on('transaction:committed', () => transactions.push(phase))
    holder.addEventListener('keydown', event => trusted.push({ phase, type: 'keydown', key: event.key, shift: event.shiftKey, trusted: event.isTrusted }), { capture: true })
    holder.addEventListener('input', event => trusted.push({ phase, type: 'input', inputType: event.inputType, trusted: event.isTrusted, sourceField: event.target.matches('.oe-code-textarea') }))
    const shell = () => holder.querySelector('.oe-code-wrap')
    const field = () => shell().querySelector('textarea')
    const paint = () => shell().querySelector('.oe-code-pre code')
    const trigger = () => shell().querySelector('.oe-code-dropdown__trigger')
    const search = () => shell().querySelector('.oe-code-dropdown__search')
    const option = value => shell().querySelector(`.oe-code-dropdown__item[data-value="${value}"]`)
    const selection = expected => {
      check('sourceFocus', document.activeElement === field(), true)
      check('sourceSelection', { start: field().selectionStart, end: field().selectionEnd,
        direction: field().selectionStart === field().selectionEnd ? 'none' : field().selectionDirection }, expected)
    }
    const capture = (name, text, language, canUndo, canRedo, actions, expectedSelection) => {
      phase = name
      const blocks = editor.save().blocks
      check('canonicalRecords', blocks.map(({ id, type, data }) => ({ id, type, data })), records(text, language))
      check('literalSource', field().value, text)
      check('literalPaint', paint().textContent, text + '\n')
      check('sourceMarkupIsInert', [field().childElementCount, paint().querySelectorAll('p,b').length], [0, 0])
      check('languageLabel', shell().querySelector(legacy ? '.oe-code-lang' : '.oe-code-lang-label').textContent, label(language))
      const highlighted = ['auto', 'javascript', 'typescript'].includes(language)
      check('highlightSpanCount', paint().querySelectorAll('span').length, highlighted ? 1 : 0)
      if (!highlighted) check('plainLanguageProviderSilent', calls.filter(call => call.phase === name).length, 0)
      else {
        const { phase: ignored, ...last } = calls.at(-1) ?? {}
        check('providerSelection', last, language === 'auto' ? { kind: 'auto', code: text } : { kind: 'explicit', code: text, language })
      }
      check('history', { canUndo: editor.canUndo, canRedo: editor.canRedo }, { canUndo, canRedo })
      check('callerInput', input, supplied)
      if (!legacy) check('completedTransactions', transactions.length, actions)
      if (expectedSelection) selection(expectedSelection)
      phases.push({ phase, blocks: clone(blocks), selection: { start: field().selectionStart, end: field().selectionEnd, direction: field().selectionDirection, focused: document.activeElement === field() }, history: { canUndo: editor.canUndo, canRedo: editor.canRedo } })
      completedPhases.push(phase)
    }
    const click = async control => {
      await settled()
      control.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const rect = control.getBoundingClientRect(), x = rect.left + rect.width / 2, y = rect.top + rect.height / 2
      if (!rect.width || !rect.height || !control.contains(document.elementFromPoint(x, y))) throw new Error('Code control is not visible and reachable')
      let delivered
      const listener = event => { delivered = { trusted: event.isTrusted, intendedControl: control.contains(event.target) } }
      document.addEventListener('click', listener, { capture: true, once: true })
      try { await native('click', { x, y }) } finally { document.removeEventListener('click', listener, true) }
      check('trustedControlClick', delivered, { trusted: true, intendedControl: true })
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
    const action = async (name, key) => { phase = name; await native('key', key); await pause() }
    await settled()
    capture('load', specification.source, initialLanguage, false, false, 0)

    if (specification.kind === 'indent') {
      phase = 'selected'; await click(shell().querySelector('.oe-code-pre')); await select(specification.selection)
      capture('selected', specification.source, initialLanguage, false, false, 0, specification.selection)
      await action('indent', specification.shift ? 'Shift+Tab' : 'Tab')
      const count = specification.noOp ? 0 : 1
      capture('indent', specification.after, initialLanguage, !specification.noOp, false, count, specification.afterSelection)
      check('trustedIndentation', trusted.filter(event => event.phase === 'indent' && event.key === 'Tab').map(event => ({ trusted: event.trusted, shift: event.shift })), [{ trusted: true, shift: Boolean(specification.shift) }])
      const typed = specification.after.slice(0, specification.afterSelection.start) + 'X' + specification.after.slice(specification.afterSelection.end)
      const typedSelection = range(specification.afterSelection.start + 1)
      phase = 'input'; await native('type', 'X'); await pause()
      capture('input', typed, initialLanguage, true, false, count + 1, typedSelection)
      await action('undo-input', 'Control+z')
      capture('undo-input', specification.after, initialLanguage, !specification.noOp, true, count + 2, specification.afterSelection)
      if (!specification.noOp) {
        await action('undo-indent', 'Control+z'); capture('undo-indent', specification.source, initialLanguage, false, true, 4, specification.selection)
        await action('redo-indent', 'Control+Shift+z'); capture('redo-indent', specification.after, initialLanguage, true, true, 5, specification.afterSelection)
      }
      await action('redo-input', 'Control+Shift+z'); capture('redo-input', typed, initialLanguage, true, false, specification.noOp ? 3 : 6, typedSelection)
    } else {
      phase = 'input'; await click(shell().querySelector('.oe-code-pre')); await select(range(specification.source.length))
      await native('type', 'X'); await pause()
      const typed = specification.source + 'X', typedSelection = range(typed.length), originalSelection = range(specification.source.length)
      capture('input', typed, initialLanguage, true, false, 1, typedSelection)
      phase = 'filter'; await click(trigger()); check('filterFocus', document.activeElement === search(), true)
      await native('type', specification.query); await pause()
      check('filteredOptions', [...shell().querySelectorAll('.oe-code-dropdown__item')].filter(item => item.style.display !== 'none').map(item => item.dataset.value), specification.visible)
      capture('filter', typed, initialLanguage, true, false, 1)
      phase = 'control'
      if (specification.click) await click(option(specification.click))
      else for (const key of specification.keys) await native('key', key)
      await pause()
      const count = specification.noOp ? 1 : 2
      capture('control', typed, specification.language, true, false, count)
      check('menuClosed', trigger().getAttribute('aria-expanded'), 'false')
      // Language choice returns auxiliary focus to the trigger in current v2.
      // Explicitly re-enter the source field before keyboard history in every source.
      await select(typedSelection)
      if (!specification.noOp) {
        await action('undo-control', 'Control+z'); capture('undo-control', typed, initialLanguage, true, true, 3, typedSelection)
      }
      await action('undo-input', 'Control+z'); capture('undo-input', specification.source, initialLanguage, false, true, specification.noOp ? 2 : 4, originalSelection)
      await action('redo-input', 'Control+Shift+z'); capture('redo-input', typed, initialLanguage, true, !specification.noOp, specification.noOp ? 3 : 5, typedSelection)
      if (!specification.noOp) {
        await action('redo-control', 'Control+Shift+z'); capture('redo-control', typed, specification.language, true, false, 6, typedSelection)
      }
      phase = 'read-only-control'
      const opposite = option('php'), before = clone(editor.save().blocks), beforeActions = transactions.length
      editor.setReadOnly(true); opposite.click(); await pause()
      capture('read-only-control', typed, specification.language, false, false, beforeActions)
      check('readOnlyUnchanged', editor.save().blocks, before)
      check('sourceReadOnly', field().readOnly, true)
    }
    check('nativeSourceInputObserved', trusted.some(event => event.phase === 'input' && event.type === 'input' && event.sourceField && event.inputType === 'insertText' && event.trusted), true)
    check('allRecordedGesturesTrusted', trusted.every(event => event.trusted), true)
    phase = 'dispose'
    editor.setReadOnly(false)
    check('editableHistoryRestored', { canUndo: editor.canUndo, canRedo: editor.canRedo }, { canUndo: true, canRedo: false })
    if (!shell().classList.contains('oe-code-wrap--editing')) await click(shell().querySelector('.oe-code-pre'))
    const retained = shell(), opposite = option('php')
    editor.destroy()
    const beforeMarkup = retained.innerHTML, beforeCalls = calls.length, beforeActions = transactions.length
    opposite.click(); await pause()
    check('retiredMarkupUnchanged', retained.innerHTML, beforeMarkup)
    check('retiredProviderSilent', calls.length, beforeCalls)
    if (!legacy) check('retiredAuthorSilent', transactions.length, beforeActions)
    check('editorRemoved', holder.querySelector('.oe-editor') !== null, false)
    completedPhases.push('dispose')
    return { id: specification.id, specification, observations, phases, completedPhases, plannedPhases, trusted, pageErrors, error: null }
  } catch (error) {
    return { id: specification.id, specification, observations, phases, completedPhases, plannedPhases, trusted, pageErrors, phase, error: error.stack ?? String(error) }
  } finally {
    editor?.destroy(); holder.remove(); window.removeEventListener('error', onError)
  }
}
