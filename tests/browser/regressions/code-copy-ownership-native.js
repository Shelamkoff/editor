import { createCodePlugin } from '../../../plugins/code/index.js'
import { clickNative } from '../native-input-helpers.js'
import { assert, blockElement, equal, make, pause, test } from './harness.js'

const source = 'const answer = 42;'

function copyFixture(readOnly = false) {
  const writes = [], transactions = [], clicks = []
  const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  // A controlled Clipboard API provider proves callback ownership. It does
  // not claim a write to, or a transfer through, the system clipboard.
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText(text) {
      return new Promise(resolve => { writes.push({ text, resolve }) })
    } },
  })
  const definition = createCodePlugin({ injectStyles: false, hljs: {
    getLanguage: () => false,
    highlight: () => ({ value: '' }),
    highlightAuto: () => ({ value: '' }),
  } })
  const editor = make([{ id: 'code', type: 'code', dataVersion: 1, data: { code: source, language: 'plaintext' } }], {
    plugins: [definition], defaultBlock: 'code', inlineTools: [], readOnly,
  })
  editor.on('transaction:committed', event => transactions.push(event))
  const shell = blockElement(editor, 'code'), wrapper = shell.querySelector('.oe-code-wrap')
  const bar = wrapper.querySelector('.oe-code-bar'), button = bar.querySelector('.oe-code-btn--copy')
  button.addEventListener('click', event => clicks.push(event.isTrusted))
  return {
    editor, shell, wrapper, bar, button, writes, transactions, clicks,
    dispose() {
      try { editor.destroy() }
      finally {
        if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor)
        else delete navigator.clipboard
      }
    },
  }
}

async function startCopy(h) {
  await clickNative(h.button)
  equal(h.clicks, [true], 'Copy did not receive exactly one trusted click')
  equal(h.writes.map(request => request.text), [source], 'Clipboard provider received the wrong source')
}

function unchangedDocument(h, before) {
  equal(h.editor.save().blocks, before)
  equal({ events: h.transactions.length, undo: h.editor.canUndo, redo: h.editor.canRedo }, { events: 0, undo: false, redo: false })
}

for (const readOnly of [false, true]) {
  test(`Code copy ownership: a current ${readOnly ? 'read-only' : 'editable'} button completes and resets without a document action`, async () => {
    const h = copyFixture(readOnly)
    try {
      const before = h.editor.save().blocks, initialIcon = h.button.innerHTML
      await startCopy(h)
      h.writes[0].resolve()
      await pause()
      assert(h.button.classList.contains('oe-code-btn--copied'))
      assert(h.button.innerHTML !== initialIcon)
      unchangedDocument(h, before)
      await pause(1900)
      equal(h.button.innerHTML, initialIcon)
      assert(!h.button.classList.contains('oe-code-btn--copied'))
      assert(h.button.parentNode === h.bar && h.bar.parentNode === h.wrapper)
      unchangedDocument(h, before)
    } finally { h.dispose() }
  })
}

for (const adopted of ['button', 'bar', 'wrapper', 'shell']) {
  test(`Code copy ownership: pending success cannot repaint an adopted ${adopted}`, async () => {
    const h = copyFixture(), foreign = document.createElement('aside')
    document.body.append(foreign)
    try {
      const before = h.editor.save().blocks, target = h[adopted]
      await startCopy(h)
      foreign.append(target)
      h.button.innerHTML = '<b>Foreign pending copy</b>'
      h.button.classList.add('foreign-owned')
      await pause()
      const html = foreign.innerHTML, children = [...h.button.childNodes]
      h.writes[0].resolve()
      await pause()
      unchangedDocument(h, before)
      assert(target.parentNode === foreign)
      equal(foreign.innerHTML, html, 'Pending copy repainted a foreign owner\'s DOM')
      equal([...h.button.childNodes], children, 'Pending copy replaced foreign button children')
    } finally { h.dispose(); foreign.remove() }
  })
}

for (const adopted of ['button', 'bar', 'wrapper', 'shell']) {
  test(`Code copy ownership: a scheduled reset cannot repaint an adopted ${adopted}`, async () => {
    const h = copyFixture(), foreign = document.createElement('aside')
    document.body.append(foreign)
    try {
      const before = h.editor.save().blocks, target = h[adopted]
      await startCopy(h)
      h.writes[0].resolve()
      await pause()
      assert(h.button.classList.contains('oe-code-btn--copied'))
      foreign.append(target)
      h.button.innerHTML = '<b>Foreign reset owner</b>'
      h.button.classList.add('foreign-owned')
      await pause()
      const html = foreign.innerHTML, children = [...h.button.childNodes]
      await pause(1900)
      unchangedDocument(h, before)
      assert(target.parentNode === foreign)
      equal(foreign.innerHTML, html, 'Copy reset repainted a foreign owner\'s DOM')
      equal([...h.button.childNodes], children, 'Copy reset replaced foreign button children')
    } finally { h.dispose(); foreign.remove() }
  })
}
