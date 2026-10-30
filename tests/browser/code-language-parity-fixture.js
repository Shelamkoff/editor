const source = 'const tag = "<b>&copy;</b>";'
const escape = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const pause = () => new Promise(resolve => setTimeout(resolve, 20))

/** Same semantic source, provider and native gesture for each immutable source. */
export async function runCodeLanguageCase({ sourceBase, legacy, language }) {
  const base = new URL(sourceBase, import.meta.url)
  const [{ createEditor }, module] = await Promise.all([
    import(new URL('core/index.js', base).href), import(new URL('plugins/code/index.js', base).href),
  ])
  const calls = [], observations = [], completedPhases = [], trusted = []
  const runtime = {
    getLanguage(value) { return value === 'javascript' },
    highlight(code, options) {
      calls.push({ kind: 'explicit', code, language: options.language })
      return { value: `<span class="hljs-keyword">${escape(code)}</span>` }
    },
    highlightAuto(code) {
      calls.push({ kind: 'auto', code })
      return { value: `<span class="hljs-string">${escape(code)}</span>`, language: 'javascript' }
    },
  }
  const definition = legacy ? new module.Code({ hljs: runtime }) : module.createCodePlugin({ hljs: runtime })
  const input = { version: legacy ? '1.0.5' : '2.0.0', blocks: [{
    id: 'code', type: 'code', ...(!legacy ? { dataVersion: 1 } : {}), data: { code: source, language },
  }] }
  const originalInput = JSON.stringify(input)
  const holder = document.createElement('section')
  document.body.append(holder)
  for (const type of ['input', 'keydown']) holder.addEventListener(type, event => {
    trusted.push({ type, trusted: event.isTrusted, key: event.key, inputType: event.inputType })
  })
  const check = (phase, property, actual, expected) => observations.push({ phase, property, actual, expected,
    status: JSON.stringify(actual) === JSON.stringify(expected) ? 'PASS' : 'FAIL' })
  let editor, phase = 'load'
  const planned = ['load', 'read-only', 'editable-again', 'edit', 'undo', 'redo', 'dispose']
  try {
    editor = createEditor({ holder, plugins: [definition], defaultBlock: 'code', inlineTools: [], inlinePlugins: [], injectStyles: true, data: input })
    const field = () => holder.querySelector('.oe-code-textarea')
    const paint = () => holder.querySelector('.oe-code-pre code')
    const snapshot = (name, text, readOnly, history, caret) => {
      phase = name
      const expectedData = { code: text, language }
      check(name, 'canonicalData', editor.save().blocks[0]?.data, expectedData)
      check(name, 'literalVisibleText', paint().textContent, text + '\n')
      check(name, 'sourceHtmlIsInert', paint().querySelector('b'), null)
      check(name, 'highlightSpanCount', paint().querySelectorAll('span').length, language === 'custom-unknown-language' ? 0 : 1)
      check(name, 'providerSelection', language === 'custom-unknown-language' ? calls.length : calls.at(-1),
        language === 'custom-unknown-language' ? 0 : language === 'auto'
          ? { kind: 'auto', code: text } : { kind: 'explicit', code: text, language })
      check(name, 'languageStoredAndShown', holder.querySelector(legacy ? '.oe-code-lang' : '.oe-code-lang-label')?.textContent,
        language === 'auto' ? 'Auto' : language === 'javascript' ? 'JavaScript' : language)
      check(name, 'history', { canUndo: editor.canUndo, canRedo: editor.canRedo }, history)
      check(name, 'readOnly', field().readOnly, readOnly)
      check(name, 'inputOwnership', JSON.stringify(input), originalInput)
      if (caret !== undefined) check(name, 'nativeCaret', {
        focused: document.activeElement === field(), start: field().selectionStart, end: field().selectionEnd,
      }, { focused: true, start: caret, end: caret })
      completedPhases.push(name)
    }
    await pause()
    snapshot('load', source, false, { canUndo: false, canRedo: false })
    editor.setReadOnly(true)
    await pause()
    snapshot('read-only', source, true, { canUndo: false, canRedo: false })
    editor.setReadOnly(false)
    await pause()
    snapshot('editable-again', source, false, { canUndo: false, canRedo: false })
    holder.querySelector('.oe-code-pre').click()
    field().focus()
    field().setSelectionRange(source.length, source.length)
    await window.__codeNativeInput({ kind: 'insert', text: 'X' })
    await pause()
    snapshot('edit', source + 'X', false, { canUndo: true, canRedo: false }, source.length + 1)
    check('edit', 'trustedInput', trusted.some(event => event.type === 'input' && event.inputType === 'insertText' && event.trusted), true)
    await window.__codeNativeInput({ kind: 'undo' })
    await pause()
    snapshot('undo', source, false, { canUndo: false, canRedo: true }, source.length)
    await window.__codeNativeInput({ kind: 'redo' })
    await pause()
    snapshot('redo', source + 'X', false, { canUndo: true, canRedo: false }, source.length + 1)
    check('redo', 'trustedHistory', trusted.filter(event => event.type === 'keydown' && event.key.toLowerCase() === 'z').map(event => event.trusted), [true, true])
    phase = 'dispose'
    const retired = holder.querySelector('.oe-code-wrap'), previous = retired.innerHTML
    const beforeCalls = calls.length
    editor.destroy()
    retired.querySelector('textarea').dispatchEvent(new InputEvent('input', { bubbles: true }))
    check('dispose', 'retiredProviderSilent', calls.length, beforeCalls)
    check('dispose', 'retiredProjectionUnchanged', retired.innerHTML, previous)
    check('dispose', 'rootRemoved', holder.querySelector('.oe-editor'), null)
    completedPhases.push('dispose')
    return { language, observations, completedPhases, trusted, incompletePhases: [], error: null }
  } catch (error) {
    return { language, observations, completedPhases, trusted, phase, error: error.stack ?? String(error),
      incompletePhases: planned.filter(value => !completedPhases.includes(value)) }
  } finally {
    editor?.destroy()
    holder.remove()
  }
}
