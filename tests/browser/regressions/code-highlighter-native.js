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
