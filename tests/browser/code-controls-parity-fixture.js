// Independent public-boundary controls for the two detailed Code obligations.
// Expected text, language choices and history states are fixed by the fixture.
const source = 'const value = "<b>&copy;</b>";\n// café'
const pause = () => new Promise(resolve => setTimeout(resolve, 30))
const escape = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export async function runCodeControlsCase({ sourceBase, legacy, name }) {
  const base = new URL(sourceBase, import.meta.url)
  const [{ createEditor }, plugin] = await Promise.all([
    import(new URL('core/index.js', base).href), import(new URL('plugins/code/index.js', base).href),
  ])
  const observations = [], completedPhases = [], trusted = [], calls = []
  let providerArmed = false, retiredPaint, retiredMarkup, retiredCallCount
  const check = (phase, property, actual, expected) => observations.push({ phase, property, actual, expected,
    status: JSON.stringify(actual) === JSON.stringify(expected) ? 'PASS' : 'FAIL' })
  const action = async value => { await window.__codeControlAction(value); await pause() }
  const runtime = {
    getLanguage(language) { return ['javascript', 'python', 'plaintext'].includes(language) },
    highlight(code, options) {
      calls.push({ code, language: options.language })
      if (name === 'provider-throws') throw new Error('Expected highlighting provider failure')
      if (name === 'provider-retired' && providerArmed) {
        providerArmed = false
        retiredPaint = holder.querySelector('.oe-code-pre code')
        editor.destroy()
        destroyed = true
        retiredMarkup = retiredPaint.innerHTML
        retiredCallCount = calls.length
      }
      return { value: `<span class="hljs-keyword">${escape(code)}</span>` }
    },
    highlightAuto(code) {
      calls.push({ code, language: 'auto' })
      if (name === 'provider-throws') throw new Error('Expected highlighting provider failure')
      return { value: `<span class="hljs-string">${escape(code)}</span>`, language: 'javascript' }
    },
  }
  const lazy = name.startsWith('lazy-')
  const config = lazy ? {} : { hljs: runtime }
  const definition = legacy ? new plugin.Code(config) : plugin.createCodePlugin(config)
  const initialLanguage = name.startsWith('language-') ? 'custom-unknown-language' : 'javascript'
  const initialText = name === 'copy-empty' ? '' : source
  const input = { version: legacy ? '1.0.5' : '2.0.0', blocks: [{
    id: 'subject', type: 'code', ...(!legacy ? { dataVersion: 1 } : {}),
    data: { code: initialText, language: initialLanguage },
  }] }
  const inputBefore = JSON.stringify(input)
  const holder = document.createElement('section')
  holder.id = 'code-fixture'
  const destination = document.createElement('textarea')
  destination.id = 'clipboard-target'
  document.body.append(holder, destination)
  for (const type of ['click', 'input', 'keydown']) document.addEventListener(type, event => {
    trusted.push({ type, key: event.key, inputType: event.inputType, trusted: event.isTrusted,
      target: event.target?.className || event.target?.id || event.target?.tagName })
  }, true)
  let editor, phase = 'mount', destroyed = false, resolveCopy, clipboardCalls = []
  const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  const replaceClipboard = value => Object.defineProperty(navigator, 'clipboard', { configurable: true, value })
  if (name === 'copy-unavailable') replaceClipboard(undefined)
  if (name === 'copy-rejected') replaceClipboard({ writeText(text) {
    clipboardCalls.push(text)
    return Promise.reject(new DOMException('Fixture permission denial', 'NotAllowedError'))
  } })
  if (name === 'copy-native-denied') {
    const native = navigator.clipboard.writeText.bind(navigator.clipboard)
    replaceClipboard({ writeText(text) {
      clipboardCalls.push({ text, state: 'pending' })
      return native(text).then(value => {
        clipboardCalls.at(-1).state = 'resolved'
        return value
      }, error => {
        clipboardCalls.at(-1).state = 'rejected'
        clipboardCalls.at(-1).name = error.name
        throw error
      })
    } })
  }
  if (name === 'copy-pending-retired') replaceClipboard({ writeText(text) {
    clipboardCalls.push(text)
    return new Promise(resolve => { resolveCopy = resolve })
  } })
  try {
    editor = createEditor({ holder, plugins: [definition], defaultBlock: 'code', inlinePlugins: [],
      inlineTools: [], injectStyles: true, data: input })
    const field = () => holder.querySelector('.oe-code-textarea')
    const paint = () => holder.querySelector('.oe-code-pre code')
    const label = () => holder.querySelector(legacy ? '.oe-code-lang' : '.oe-code-lang-label')
    const button = () => holder.querySelector('.oe-code-btn--copy')
    const trigger = () => holder.querySelector('.oe-code-dropdown__trigger')
    const options = () => [...holder.querySelectorAll('[role="option"]')]
    const visibleOptions = () => options().filter(option => getComputedStyle(option).display !== 'none')
    const state = (name, text = initialText, language = initialLanguage, history = { canUndo: false, canRedo: false }) => {
      phase = name
      check(name, 'canonicalData', editor.save().blocks[0]?.data, { code: text, language })
      check(name, 'visibleLiteralText', paint().textContent, text + '\n')
      check(name, 'noAuthoredHtml', paint().querySelector('b'), null)
      check(name, 'history', { canUndo: editor.canUndo, canRedo: editor.canRedo }, history)
      check(name, 'callerInputUnchanged', JSON.stringify(input), inputBefore)
      completedPhases.push(name)
    }
    const enter = async () => {
      if (!holder.querySelector('.oe-code-wrap').classList.contains('oe-code-wrap--editing')) {
        await action({ kind: 'click', selector: '.oe-code-btn--edit' })
      }
      field().focus()
      field().setSelectionRange(field().value.length, field().value.length)
    }
    const insert = text => action({ kind: 'insert', text })
    const press = key => action({ kind: 'key', key })
    const focusSourceEnd = () => { field().focus(); field().setSelectionRange(field().value.length, field().value.length) }
    const history = async (text, language = initialLanguage) => {
      focusSourceEnd()
      await press('Control+z')
      state('undo', initialText, language, { canUndo: false, canRedo: true })
      check('undo', 'caret', [document.activeElement === field(), field().selectionStart, field().selectionEnd],
        [true, initialText.length, initialText.length])
      await press('Control+Shift+z')
      state('redo', text, language, { canUndo: true, canRedo: false })
      check('redo', 'caret', [document.activeElement === field(), field().selectionStart, field().selectionEnd],
        [true, text.length, text.length])
    }
    await pause()
    state('mount')

    if (name === 'language-keyboard') {
      check('mount', 'unknownLabel', label().textContent, initialLanguage)
      check('mount', 'unknownIsPlain', paint().childElementCount, 0)
      await enter()
      await insert('X')
      state('input-before-language', source + 'X', initialLanguage, { canUndo: true, canRedo: false })
      await action({ kind: 'click', selector: '.oe-code-dropdown__trigger' })
      const search = holder.querySelector('.oe-code-dropdown__search')
      check('open', 'searchFocused', document.activeElement === search, true)
      check('open', 'triggerExpanded', trigger().getAttribute('aria-expanded'), 'true')
      await insert('Py')
      check('filtered', 'visibleValues', visibleOptions().map(option => option.dataset.value), ['python'])
      await press('ArrowDown')
      check('filtered', 'activeDescendant', document.getElementById(search.getAttribute('aria-activedescendant'))?.dataset.value, 'python')
      await press('Enter')
      state('language-chosen', source + 'X', 'python', { canUndo: true, canRedo: false })
      check('language-chosen', 'label', label().textContent, 'Python')
      check('language-chosen', 'selection', options().filter(option => option.getAttribute('aria-selected') === 'true').map(option => option.dataset.value), ['python'])
      check('language-chosen', 'menuClosed', trigger().getAttribute('aria-expanded'), 'false')
      check('language-chosen', 'triggerFocused', document.activeElement === trigger(), true)
      // Re-enter source ownership explicitly before testing document history.
      focusSourceEnd()
      await press('Control+z')
      state('undo-language', source + 'X', initialLanguage, { canUndo: true, canRedo: true })
      check('undo-language', 'plainRestored', paint().childElementCount, 0)
      await press('Control+z')
      state('undo-input', source, initialLanguage, { canUndo: false, canRedo: true })
      await press('Control+Shift+z')
      state('redo-input', source + 'X', initialLanguage, { canUndo: true, canRedo: true })
      await press('Control+Shift+z')
      state('redo-language', source + 'X', 'python', { canUndo: true, canRedo: false })
      check('redo-language', 'provider', calls.at(-1), { code: source + 'X', language: 'python' })
    } else if (name === 'language-cancel-no-match') {
      await enter()
      await action({ kind: 'click', selector: '.oe-code-dropdown__trigger' })
      await insert('not-a-language')
      check('no-match', 'options', visibleOptions().length, 0)
      await press('ArrowDown')
      await press('Enter')
      state('no-match')
      check('no-match', 'stillExpanded', trigger().getAttribute('aria-expanded'), 'true')
      await press('Escape')
      state('cancel')
      check('cancel', 'collapsed', trigger().getAttribute('aria-expanded'), 'false')
      check('cancel', 'triggerFocused', document.activeElement === trigger(), true)
      await action({ kind: 'click', selector: '.oe-code-dropdown__trigger' })
      check('reopened', 'filterReset', holder.querySelector('.oe-code-dropdown__search').value, '')
      await insert('script')
      check('reopened', 'multipleMatches', visibleOptions().map(option => option.dataset.value), ['javascript', 'typescript'])
      await press('ArrowUp')
      check('wrap', 'lastMatch', document.getElementById(holder.querySelector('.oe-code-dropdown__search').getAttribute('aria-activedescendant'))?.dataset.value, 'typescript')
      await press('ArrowDown')
      check('wrap', 'firstMatch', document.getElementById(holder.querySelector('.oe-code-dropdown__search').getAttribute('aria-activedescendant'))?.dataset.value, 'javascript')
      await press('Escape')
      editor.setReadOnly(true)
      state('read-only')
      check('read-only', 'readonlyInput', field().readOnly, true)
      check('read-only', 'collapsed', trigger().getAttribute('aria-expanded'), 'false')
      editor.setReadOnly(false)
      state('editable-again')
    } else if (lazy) {
      if (name !== 'lazy-default') check('mount', 'plainWhileLoading', paint().childElementCount, 0)
      if (name === 'lazy-retired') {
        const retired = holder.querySelector('.oe-code-wrap'), markup = retired.innerHTML
        editor.destroy(); destroyed = true
        await action({ kind: 'release-lazy' })
        check('retired-load', 'retiredProjectionUnchanged', retired.innerHTML, markup)
        check('retired-load', 'rootRemoved', holder.querySelector('.oe-editor'), null)
        completedPhases.push('retired-load')
      } else {
        await enter()
        await insert('X')
        state('edited-before-resolution', source + 'X', initialLanguage, { canUndo: true, canRedo: false })
        await action({ kind: 'release-lazy' })
        if (name !== 'lazy-failed') await action({ kind: 'wait-highlight' })
        state('resolved', source + 'X', initialLanguage, { canUndo: true, canRedo: false })
        check('resolved', 'highlighted', paint().childElementCount > 0, name !== 'lazy-failed')
        await history(source + 'X')
      }
    } else if (name === 'provider-retired') {
      await enter()
      providerArmed = true
      await insert('X')
      check('retired-provider', 'retirementCompleted', destroyed, true)
      check('retired-provider', 'oldProjectionUnchanged', retiredPaint?.innerHTML, retiredMarkup)
      check('retired-provider', 'oldProjectionDetached', retiredPaint?.isConnected, false)
      check('retired-provider', 'noFurtherProviderCalls', calls.length, retiredCallCount)
      check('retired-provider', 'rootRemoved', holder.querySelector('.oe-editor'), null)
      completedPhases.push('retired-provider')
    } else if (name === 'provider-throws' || name === 'injected-runtime') {
      check('mount', 'highlighted', paint().childElementCount > 0, name === 'injected-runtime')
      await enter()
      await insert('X')
      state('edited', source + 'X', initialLanguage, { canUndo: true, canRedo: false })
      check('edited', 'highlighted', paint().childElementCount > 0, name === 'injected-runtime')
      await history(source + 'X')
    } else if (name.startsWith('copy-')) {
      if (name === 'copy-native' || name === 'copy-read-only') {
        await enter()
        await insert('X')
        state('input', source + 'X', initialLanguage, { canUndo: true, canRedo: false })
        if (name === 'copy-read-only') editor.setReadOnly(true)
        await action({ kind: 'click', selector: '.oe-code-btn--copy' })
        check('copy', 'clipboard', await window.__codeControlAction({ kind: 'read-clipboard' }), source + 'X')
        check('copy', 'feedback', button().classList.contains('oe-code-btn--copied'), true)
        await action({ kind: 'click', selector: '#clipboard-target' })
        await press('Control+v')
        check('copy', 'nativePaste', destination.value, source + 'X')
        state('copy', source + 'X', initialLanguage, { canUndo: name !== 'copy-read-only', canRedo: false })
        if (name === 'copy-read-only') {
          editor.setReadOnly(false)
          state('editable-again', source + 'X', initialLanguage, { canUndo: true, canRedo: false })
        }
        await action({ kind: 'wait-copy-reset' })
        check('reset', 'feedbackCleared', button().classList.contains('oe-code-btn--copied'), false)
        await enter()
        await history(source + 'X')
      } else if (name === 'copy-pending-retired') {
        const retired = holder.querySelector('.oe-code-wrap'), copy = button(), markup = copy.innerHTML
        await action({ kind: 'click', selector: '.oe-code-btn--copy' })
        state('pending')
        check('pending', 'clipboardRequest', clipboardCalls, [source])
        editor.destroy(); destroyed = true
        resolveCopy()
        await pause()
        check('retired-copy', 'feedback', copy.classList.contains('oe-code-btn--copied'), false)
        check('retired-copy', 'buttonUnchanged', copy.innerHTML, markup)
        check('retired-copy', 'rootRemoved', holder.querySelector('.oe-editor'), null)
        completedPhases.push('retired-copy')
        void retired
      } else {
        const markup = button().innerHTML
        if (name === 'copy-native-denied') {
          check('permission', 'actualBrowserPolicyDenied', document.featurePolicy.allowsFeature('clipboard-write'), false)
          check('permission', 'permissionGrantDoesNotBypassPolicy', (await navigator.permissions.query({ name: 'clipboard-write' })).state, 'granted')
        }
        await action({ kind: 'click', selector: '.oe-code-btn--copy' })
        state('copy')
        check('copy', 'feedbackAbsent', button().classList.contains('oe-code-btn--copied'), false)
        check('copy', 'buttonUnchanged', button().innerHTML, markup)
        if (name === 'copy-rejected') check('copy', 'rejectedExactText', clipboardCalls, [source])
        if (name === 'copy-native-denied') check('copy', 'realNativeRejection', clipboardCalls,
          [{ text: source, state: 'rejected', name: 'NotAllowedError' }])
      }
    } else throw new Error(`Unknown Code control case ${name}`)

    check('gestures', 'allObservedGesturesTrusted', trusted.every(event => event.trusted), true)
    check('gestures', 'observedNativeClick', trusted.some(event => event.type === 'click'), name !== 'lazy-retired')
    if (!destroyed) { editor.destroy(); destroyed = true }
    check('dispose', 'rootRemoved', holder.querySelector('.oe-editor'), null)
    completedPhases.push('dispose')
    return { name, observations, completedPhases, trusted, calls, error: null }
  } catch (error) {
    return { name, observations, completedPhases, trusted, calls, phase, error: error.stack ?? String(error) }
  } finally {
    if (!destroyed) editor?.destroy()
    holder.remove(); destination.remove()
    if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
    else delete navigator.clipboard
  }
}
