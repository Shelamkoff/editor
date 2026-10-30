import { createCodePlugin } from '../../../plugins/code/index.js'
import { createParagraphPlugin } from '../../../plugins/paragraph/index.js'
import { escapeHtml } from '../../../shared/sanitize/escapeHtml.js'
import { dispatchKey, printable } from '../native-input-helpers.js'
import { test, make, blockElement, assert, equal } from './harness.js'

const source = 'const tag = "<b>&copy;</b>";'

function mountCode(language, runtime) {
  const definition = createCodePlugin({ hljs: runtime, injectStyles: false })
  return make([{ id: 'code', type: 'code', dataVersion: 1, data: { code: source, language } }], {
    plugins: [createParagraphPlugin(), definition],
  })
}

function fixtureRuntime() {
  const calls = []
  return {
    calls,
    getLanguage(language) { return language === 'javascript' },
    highlight(code, options) {
      calls.push({ kind: 'explicit', code, language: options.language })
      return { value: `<span class="hljs-keyword">${escapeHtml(code)}</span>` }
    },
    highlightAuto(code) {
      calls.push({ kind: 'auto', code })
      return { value: `<span class="hljs-string">${escapeHtml(code)}</span>`, language: 'javascript' }
    },
  }
}

test('Code highlighter keeps an unknown explicit language plain through native input and replay', async () => {
  const runtime = fixtureRuntime()
  const editor = mountCode('custom-unknown-language', runtime)
  const before = editor.save().blocks
  const paint = () => blockElement(editor, 'code').querySelector('.oe-code-pre code')
  const plain = expected => {
    equal(paint().textContent, expected + '\n', 'Code changed literal source text')
    equal(paint().children.length, 0, 'Unknown explicit language acquired guessed highlight markup')
    equal(runtime.calls, [], 'Unknown explicit language ran automatic/explicit highlighting')
    equal(editor.save().blocks[0].data.language, 'custom-unknown-language')
  }
  plain(source)
  equal(editor.canUndo, false)
  assert(editor.blocks.focus('code', { fieldKey: 'code', offset: 'end' }))
  await printable('X')
  plain(source + 'X')
  const after = editor.save().blocks
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
  plain(source)
  equal(editor.canUndo, false)
  await dispatchKey('z', 'KeyZ', 90, 2 | 8)
  equal(editor.save().blocks, after)
  plain(source + 'X')
  equal(editor.canRedo, false)
  editor.setReadOnly(true)
  plain(source + 'X')
  editor.setReadOnly(false)
  plain(source + 'X')
  equal(editor.save().blocks, after, 'Mode transition authored a language/source change')
})

for (const language of ['auto', 'javascript']) {
  test(`Code highlighter retains ${language} highlighting through native input and replay`, async () => {
    const runtime = fixtureRuntime()
    const editor = mountCode(language, runtime)
    const before = editor.save().blocks
    const painted = expected => {
      const paint = blockElement(editor, 'code').querySelector('.oe-code-pre code')
      equal(paint.textContent, expected + '\n')
      assert(paint.querySelector(language === 'auto' ? '.hljs-string' : '.hljs-keyword'), 'Supported highlight disappeared')
      equal(runtime.calls.at(-1), language === 'auto'
        ? { kind: 'auto', code: expected }
        : { kind: 'explicit', code: expected, language })
      equal(editor.save().blocks[0].data.language, language)
    }
    painted(source)
    assert(editor.blocks.focus('code', { fieldKey: 'code', offset: 'end' }))
    await printable('X')
    const after = editor.save().blocks
    painted(source + 'X')
    await dispatchKey('z', 'KeyZ', 90, 2)
    equal(editor.save().blocks, before)
    painted(source)
    equal(editor.canUndo, false)
    await dispatchKey('z', 'KeyZ', 90, 2 | 8)
    equal(editor.save().blocks, after)
    painted(source + 'X')
    equal(editor.canRedo, false)
  })
}

test('Code highlighter cannot publish after its callback destroys the editor', async () => {
  let editor, armed = false, retiredPaint, retiredMarkup, completed = false
  const runtime = {
    getLanguage() { return true },
    highlight(code) {
      if (armed) {
        armed = false
        retiredPaint = blockElement(editor, 'code').querySelector('.oe-code-pre code')
        editor.destroy()
        retiredMarkup = retiredPaint.innerHTML
        completed = true
      }
      return { value: `<span class="hljs-keyword">${escapeHtml(code)}</span>` }
    },
    highlightAuto(code) { return this.highlight(code) },
  }
  editor = mountCode('javascript', runtime)
  assert(editor.blocks.focus('code', { fieldKey: 'code', offset: 'end' }))
  armed = true
  await printable('X')
  assert(completed, 'Highlighter did not exercise successful retirement')
  assert(!retiredPaint.isConnected, 'Destroyed Code remained mounted')
  equal(retiredPaint.innerHTML, retiredMarkup, 'Obsolete highlighter mutated the retired Code view')
})

test('Code highlighter cannot overwrite a newer public data update from its callback', async () => {
  let editor, armed = false, completed = false
  const latest = 'const latest = 42;'
  const runtime = {
    getLanguage() { return true },
    highlight(code) {
      if (armed) {
        armed = false
        editor.blocks.update('code', current => ({ data: { ...current.data, code: latest } }))
        completed = true
      }
      return { value: `<span class="hljs-keyword">${escapeHtml(code)}</span>` }
    },
    highlightAuto(code) { return this.highlight(code) },
  }
  editor = mountCode('javascript', runtime)
  assert(editor.blocks.focus('code', { fieldKey: 'code', offset: 'end' }))
  armed = true
  await printable('X')
  assert(completed, 'Highlighter did not exercise the accepted public update')
  equal(editor.save().blocks[0].data, { code: latest, language: 'javascript' })
  equal(blockElement(editor, 'code').querySelector('textarea').value, latest)
  equal(blockElement(editor, 'code').querySelector('.oe-code-pre code').textContent, latest + '\n',
    'Obsolete highlighter replaced the newer Code presentation')
  assert(editor.blocks.focus('code', { fieldKey: 'code', offset: 'end' }))
  await printable('Y')
  equal(editor.save().blocks[0].data.code, latest + 'Y')
  equal(blockElement(editor, 'code').querySelector('.oe-code-pre code').textContent, latest + 'Y\n')
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks[0].data.code, latest)
  equal(blockElement(editor, 'code').querySelector('.oe-code-pre code').textContent, latest + '\n')
  await dispatchKey('z', 'KeyZ', 90, 2 | 8)
  equal(editor.save().blocks[0].data.code, latest + 'Y')
  equal(blockElement(editor, 'code').querySelector('.oe-code-pre code').textContent, latest + 'Y\n')
})

for (const part of ['highlight', 'source', 'wrapper', 'shell']) {
  test(`Code highlighter cannot repaint after its provider adopts the ${part} element`, async () => {
    let editor, armed = false, paint, previousMarkup, completed = false
    const foreign = document.createElement('div')
    document.body.append(foreign)
    const runtime = {
      getLanguage() { return true },
      highlight(code) {
        if (armed) {
          armed = false
          const block = blockElement(editor, 'code')
          paint = block.querySelector('.oe-code-pre code')
          const adopted = part === 'highlight' ? paint
            : part === 'source' ? block.querySelector('textarea')
              : part === 'wrapper' ? block.querySelector('.oe-code-wrap') : block
          foreign.append(adopted)
          previousMarkup = paint.innerHTML
          completed = true
        }
        return { value: `<span class="hljs-keyword">${escapeHtml(code)}</span>` }
      },
      highlightAuto(code) { return this.highlight(code) },
    }
    try {
      editor = mountCode('javascript', runtime)
      assert(editor.blocks.focus('code', { fieldKey: 'code', offset: 'end' }))
      armed = true
      await printable('X')
      assert(completed, 'Highlighter did not exercise synchronous DOM adoption')
      equal(paint.innerHTML, previousMarkup, 'Highlighter repainted after losing its source or output')
      assert(foreign.isConnected && foreign.children.length === 1, 'Adopted node was reclaimed')
    } finally {
      editor?.destroy()
      foreign.remove()
    }
  })
}

for (const part of ['wrapper', 'shell']) {
  test(`Code projection mode cannot repaint a ${part} adopted by its provider`, () => {
    let editor, armed = false, completed = false, previousMarkup
    const foreign = document.createElement('aside')
    document.body.append(foreign)
    const runtime = {
      getLanguage() { return true },
      highlight(code) {
        if (armed) {
          armed = false
          const shell = blockElement(editor, 'code')
          const wrapper = shell.querySelector('.oe-code-wrap')
          const textarea = wrapper.querySelector('textarea')
          const pre = wrapper.querySelector('pre')
          const edit = wrapper.querySelector('.oe-code-btn--edit')
          foreign.append(part === 'wrapper' ? wrapper : shell)
          wrapper.classList.add('oe-code-wrap--editing')
          textarea.hidden = false
          textarea.tabIndex = 7
          textarea.setAttribute('aria-hidden', 'foreign')
          pre.hidden = true
          pre.style.pointerEvents = 'auto'
          edit.hidden = true
          edit.disabled = true
          edit.title = 'Foreign control'
          edit.setAttribute('aria-label', 'Foreign control')
          previousMarkup = foreign.innerHTML
          completed = true
        }
        return { value: `<span class="hljs-keyword">${escapeHtml(code)}</span>` }
      },
      highlightAuto(code) { return this.highlight(code) },
    }
    try {
      editor = mountCode('javascript', runtime)
      const before = editor.save().blocks
      armed = true
      let failure
      try { editor.blocks.update('code', current => ({ data: { ...current.data, code: source + 'X' } })) }
      catch (error) { failure = error }
      assert(completed, 'Public projection did not invoke the adopting provider')
      assert(failure instanceof Error, 'Projection unexpectedly accepted its lost block owner')
      equal(editor.save().blocks, before, 'Rejected projection changed the accepted document')
      equal({ undo: editor.canUndo, redo: editor.canRedo }, { undo: false, redo: false })
      equal(foreign.innerHTML, previousMarkup, 'Projection changed a foreign mode after highlighter return')
    } finally {
      editor?.destroy()
      foreign.remove()
    }
  })
}
