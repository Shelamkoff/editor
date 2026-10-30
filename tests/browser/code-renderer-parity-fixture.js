const source = 'const value = "<b>&copy;</b>";\n// café'
const replacement = 'const latest = "<i>new</i>";'
const escape = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const pause = () => new Promise(resolve => setTimeout(resolve, 30))

/** Real EditorRenderer construction, publication and disposal in every source. */
export async function runCodeRendererCase({ sourceBase, legacy, name }) {
  const base = new URL(sourceBase, import.meta.url)
  const observations = [], completedPhases = [], calls = [], clipboardCalls = []
  const check = (phase, property, actual, expected) => observations.push({ phase, property, actual, expected,
    status: JSON.stringify(actual) === JSON.stringify(expected) ? 'PASS' : 'FAIL' })
  const action = async value => { await window.__codeControlAction(value); await pause() }
  let renderer, phase = 'mount', resolveCopy, armed = false, retiredPaint, retiredMarkup, providerRetired = false
  const target = document.createElement('section'), destination = document.createElement('textarea')
  target.id = 'code-renderer-target'; destination.id = 'clipboard-target'
  document.body.append(target, destination)
  const lazy = name.includes('-lazy-')
  if (!lazy) globalThis.hljs = {
    getLanguage(language) { return language === 'javascript' },
    highlight(code, options) {
      calls.push({ code, language: options.language })
      if (name === 'renderer-provider-throws') throw new Error('Expected renderer provider failure')
      return { value: `<span class="hljs-keyword">${escape(code)}</span>` }
    },
    highlightAuto(code) { return { value: escape(code), language: 'plaintext' } },
  }
  const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  const replaceClipboard = value => Object.defineProperty(navigator, 'clipboard', { configurable: true, value })
  if (name === 'renderer-copy-unavailable') replaceClipboard(undefined)
  if (name === 'renderer-copy-pending-retired') replaceClipboard({ writeText(text) {
    clipboardCalls.push(text)
    return new Promise(resolve => { resolveCopy = resolve })
  } })
  if (name === 'renderer-copy-native-denied') {
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
  const input = { version: legacy ? '1.0.5' : '2.0.0', blocks: [{ id: 'subject', type: 'code',
    ...(!legacy ? { dataVersion: 1 } : {}), data: { code: source, language: 'javascript' } }] }
  const beforeInput = JSON.stringify(input)
  const paint = () => target.querySelector('.parity-code__content')
  const copy = () => target.querySelector('.parity-code__copy')
  const state = (name, text = source) => {
    phase = name
    check(name, 'visibleLiteralText', paint()?.textContent, text)
    check(name, 'sourceHtmlIsInert', paint()?.querySelector('b, i') ?? null, null)
    check(name, 'languageLabel', target.querySelector('.parity-code__lang')?.textContent, 'javascript')
    check(name, 'inputUnchanged', JSON.stringify(input), beforeInput)
    completedPhases.push(name)
  }
  try {
    // Start the exact runtime module first so its public plugin is registered
    // before the renderer's lazy completion invokes that same real runtime.
    let primed
    if (name === 'renderer-lazy-provider-retired') {
      primed = import(legacy ? new URL('shared/runtime/highlightBundle.js', base).href : 'highlight.js')
        .then(({ default: runtime }) => runtime.addPlugin({
          'before:highlight'() {
            if (!armed) return
            armed = false
            retiredPaint = paint()
            renderer.destroy(target)
            retiredMarkup = retiredPaint.innerHTML
            providerRetired = true
          },
        }))
    }
    const { EditorRenderer } = await import(new URL('renderer/index.js', base).href)
    renderer = new EditorRenderer({ classPrefix: 'parity', injectStyles: true, blockTypes: ['code'] })
    renderer.renderTo(input, target)
    await pause()
    state('mount')
    const originalRoot = target.querySelector('.parity-code'), originalPaint = paint(), originalMarkup = originalPaint.innerHTML
    if (lazy) {
      if (name !== 'renderer-lazy-default') check('mount', 'plainWhileLoading', paint().childElementCount, 0)
      if (name === 'renderer-lazy-retired') {
        renderer.destroy(target)
        await action({ kind: 'release-lazy' })
        check('retired', 'oldProjectionUnchanged', originalPaint.innerHTML, originalMarkup)
        check('retired', 'oldRootDetached', originalRoot.isConnected, false)
        check('retired', 'targetEmpty', target.childNodes.length, 0)
        completedPhases.push('retired')
      } else if (name === 'renderer-lazy-provider-retired') {
        armed = true
        await action({ kind: 'release-lazy' })
        await primed
        await pause()
        check('provider-retired', 'retirementCompleted', providerRetired, true)
        check('provider-retired', 'oldProjectionUnchanged', retiredPaint?.innerHTML, retiredMarkup)
        check('provider-retired', 'targetEmpty', target.childNodes.length, 0)
        completedPhases.push('provider-retired')
      } else {
        let text = source
        if (name === 'renderer-lazy-replaced') {
          renderer.renderTo({ ...input, blocks: [{ ...input.blocks[0], data: { code: replacement, language: 'javascript' } }] }, target)
          text = replacement
          check('replacement', 'rootReplaced', target.querySelector('.parity-code') !== originalRoot, true)
        }
        await action({ kind: 'release-lazy' })
        if (name !== 'renderer-lazy-failed') await action({ kind: 'wait-highlight', selector: '.parity-code__content span' })
        state('resolved', text)
        check('resolved', 'highlighted', paint().childElementCount > 0, name !== 'renderer-lazy-failed')
        if (name === 'renderer-lazy-replaced') check('resolved', 'oldProjectionUnchanged', originalPaint.innerHTML, originalMarkup)
      }
    } else if (name === 'renderer-injected' || name === 'renderer-provider-throws') {
      check('provider', 'highlighted', paint().childElementCount > 0, name === 'renderer-injected')
      check('provider', 'exactInput', calls.at(-1), { code: source, language: 'javascript' })
      renderer.renderTo({ ...input, blocks: [{ ...input.blocks[0], data: { code: replacement, language: 'javascript' } }] }, target)
      state('replacement', replacement)
      check('replacement', 'oldRootDetached', originalRoot.isConnected, false)
    } else if (name.startsWith('renderer-copy-')) {
      const originalButton = copy(), buttonMarkup = originalButton.innerHTML
      if (name === 'renderer-copy-native-denied') {
        check('permission', 'actualBrowserPolicyDenied', document.featurePolicy.allowsFeature('clipboard-write'), false)
        check('permission', 'permissionGrantDoesNotBypassPolicy', (await navigator.permissions.query({ name: 'clipboard-write' })).state, 'granted')
      }
      await action({ kind: 'click', selector: '.parity-code__copy' })
      state('copy')
      if (name === 'renderer-copy-native') {
        check('copy', 'actualClipboard', await window.__codeControlAction({ kind: 'read-clipboard' }), source)
        check('copy', 'feedback', copy().classList.contains('parity-code__copy--success'), true)
        await action({ kind: 'click', selector: '#clipboard-target' })
        await action({ kind: 'key', key: 'Control+v' })
        check('copy', 'nativePaste', destination.value, source)
        await action({ kind: 'wait-copy-reset', selector: '.parity-code__copy', successClass: 'parity-code__copy--success' })
        check('reset', 'buttonRestored', copy().innerHTML, buttonMarkup)
      } else if (name === 'renderer-copy-pending-retired') {
        check('pending', 'exactRequest', clipboardCalls, [source])
        renderer.destroy(target)
        resolveCopy()
        await pause()
        check('retired', 'noSuccessFeedback', originalButton.classList.contains('parity-code__copy--success'), false)
        check('retired', 'buttonUnchanged', originalButton.innerHTML, buttonMarkup)
        originalButton.click()
        await pause()
        check('retired', 'noNewClipboardWrite', clipboardCalls, [source])
      } else {
        check('copy', 'noSuccessFeedback', copy().classList.contains('parity-code__copy--success'), false)
        check('copy', 'buttonUnchanged', copy().innerHTML, buttonMarkup)
        if (name === 'renderer-copy-native-denied') check('copy', 'realNativeRejection', clipboardCalls,
          [{ text: source, state: 'rejected', name: 'NotAllowedError' }])
      }
    } else throw new Error(`Unknown renderer case ${name}`)
    renderer.destroy(target)
    check('dispose', 'targetEmpty', target.childNodes.length, 0)
    check('dispose', 'inputUnchanged', JSON.stringify(input), beforeInput)
    completedPhases.push('dispose')
    return { name, observations, completedPhases, calls, error: null }
  } catch (error) {
    return { name, observations, completedPhases, calls, phase, error: error.stack ?? String(error) }
  } finally {
    renderer?.destroy()
    target.remove(); destination.remove()
    delete globalThis.hljs
    if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
    else delete navigator.clipboard
  }
}
