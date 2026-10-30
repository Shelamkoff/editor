import { createCodePlugin } from '../../../plugins/code/index.js'
import { getHighlightRuntime, loadHighlightRuntime, setHighlightRuntime } from '../../../shared/highlightRuntime.js'
import { assert, blockElement, equal, make, test } from './harness.js'

const source = 'const answer = 42;'

function lazyCodeFixture(readOnly = false) {
  const previousRuntime = getHighlightRuntime(), hadAmbientRuntime = Object.hasOwn(window, 'hljs')
  const previousAmbientRuntime = window.hljs
  window.hljs = undefined
  setHighlightRuntime(null)
  const definition = createCodePlugin({ injectStyles: false })
  const editor = make(['code', 'healthy'].map(id => ({ id, type: 'code', dataVersion: 1,
    data: { code: source, language: 'javascript' },
  })), { plugins: [definition], defaultBlock: 'code', inlineTools: [], readOnly })
  const transactions = []
  editor.on('transaction:committed', event => transactions.push(event))
  const shell = blockElement(editor, 'code'), wrapper = shell.querySelector('.oe-code-wrap')
  const surface = wrapper.querySelector('.oe-code-editor'), pre = surface.querySelector('pre'), code = pre.querySelector('code')
  const textarea = surface.querySelector('textarea')
  const healthy = blockElement(editor, 'healthy').querySelector('pre code')
  return {
    editor, transactions, shell, wrapper, surface, pre, code, textarea, healthy,
    async loaded() {
      // Use the real dependency's existing lazy-loading path. Even an already
      // imported module completes asynchronously after the adoption below.
      await loadHighlightRuntime()
      for (let index = 0; index < 3; index++) await Promise.resolve()
    },
    dispose() {
      try { editor.destroy() }
      finally {
        setHighlightRuntime(previousRuntime)
        if (hadAmbientRuntime) window.hljs = previousAmbientRuntime
        else delete window.hljs
      }
    },
  }
}

function highlighted(code) {
  equal(code.textContent, source + '\n')
  equal(code.querySelector('.hljs-keyword')?.textContent, 'const', 'Actual lazy highlighter did not produce the keyword mark')
  equal(code.querySelector('.hljs-number')?.textContent, '42', 'Actual lazy highlighter did not produce the number mark')
}

function unchangedDocument(h, before) {
  equal(h.editor.save().blocks, before)
  equal({ events: h.transactions.length, undo: h.editor.canUndo, redo: h.editor.canRedo }, { events: 0, undo: false, redo: false })
}

for (const readOnly of [false, true]) {
  test(`Code lazy highlight ownership: current ${readOnly ? 'read-only' : 'editable'} views receive the actual loaded highlighter`, async () => {
    const h = lazyCodeFixture(readOnly)
    try {
      const before = h.editor.save().blocks
      equal(h.code.textContent, source + '\n')
      equal(h.code.children.length, 0, 'The fixture did not enter the pending lazy-load path')
      await h.loaded()
      highlighted(h.code); highlighted(h.healthy)
      equal(h.textarea.value, source)
      unchangedDocument(h, before)
    } finally { h.dispose() }
  })
}

for (const adopted of ['code', 'pre', 'surface', 'wrapper', 'shell']) {
  test(`Code lazy highlight ownership: completion cannot repaint an adopted ${adopted}`, async () => {
    const h = lazyCodeFixture(), foreign = document.createElement('aside')
    document.body.append(foreign)
    try {
      const before = h.editor.save().blocks, target = h[adopted]
      equal(h.code.children.length, 0, 'The fixture did not enter the pending lazy-load path')
      // No await before adoption: the original runtime is still pending.
      foreign.append(target)
      h.code.innerHTML = '<b>Foreign syntax owner</b>'
      h.code.classList.add('foreign-owned')
      const html = foreign.innerHTML, children = [...h.code.childNodes]
      await h.loaded()
      highlighted(h.healthy)
      unchangedDocument(h, before)
      assert(target.parentNode === foreign)
      equal(foreign.innerHTML, html, 'Lazy highlighting repainted a foreign owner\'s DOM')
      equal([...h.code.childNodes], children, 'Lazy highlighting replaced foreign code children')
    } finally { h.dispose(); foreign.remove() }
  })
}
