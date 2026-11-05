import { EditorRenderer } from '../../renderer/index.js'
import { paragraphDataSchema } from '../../shared/blockSchemas/paragraph.js'
import { setHighlightRuntime } from '../../shared/highlightRuntime.js'
import { test, equal, assert, pause, run } from './regressions/harness.js'

if (document.querySelector('meta[http-equiv="Content-Security-Policy"]')) test('Inline code highlighting retains enforcing Trusted Types', () => {
  let denied = false
  try { document.createElement('div').innerHTML = '<b>untrusted</b>' } catch (error) { denied = error instanceof TypeError }
  assert(denied)
  equal(trustedTypes.defaultPolicy, null)
})

for (const action of ['target', 'all', 'document', 'block', 'replace', 'extract', 'failed-block', 'discard']) {
  test(`Rich inline code deferred ownership: ${action}`, async () => {
    const source = 'const retired = 1;\nlet value = 2;'
    const liveSource = 'const live = 3;\nlet value = 4;'
    const replacementSource = 'const replacement = 5;\nlet value = 6;'
    const data = text => ({ version: '2.0.0', blocks: [{ id: 'text', type: 'paragraph', dataVersion: 2,
      data: { text: `<code lang="javascript">${text}</code>` } }] })
    const input = data(source)
    if (action === 'discard') input.blocks.push({ id: 'broken', type: 'paragraph', dataVersion: 2, data: { text: 'Second block' } })
    const before = JSON.stringify(input)
    const target = document.createElement('section'), liveTarget = document.createElement('section')
    const successor = document.createElement('section')
    document.body.append(target, liveTarget, successor)
    const renderer = new EditorRenderer({ blockTypes: ['paragraph'], injectStyles: false })
    const liveRenderer = new EditorRenderer({ blockTypes: ['paragraph'], injectStyles: false })
    let retiredCode, retiredMarkup, output, retired = false, calls = 0
    const failure = new Error('Controlled block presentation failure')
    const failed = action === 'failed-block' || action === 'discard'
    if (failed) renderer.registerRenderer({ type: 'paragraph', schema: paragraphDataSchema, render(block, parseInline, context) {
      if (block.id === 'broken') throw failure
      const element = context.ownerDocument.createElement('p')
      element.append(parseInline(block.data.text))
      retiredCode = element.querySelector('code')
      if (action === 'failed-block') {
        successor.append(retiredCode)
        throw failure
      }
      return element
    } })
    const runtime = (await import('highlight.js')).default
    // Exercise genuine deferred completion even after the module is cached by
    // the preceding case. The provider and its public hooks remain real.
    setHighlightRuntime(null)
    const hook = { 'before:highlight'(context) {
      if (context.code !== source) return
      calls++
      if (retired || failed) return
      retiredCode = output.querySelector('code') ?? (output.matches('code') ? output : null)
      assert(retiredCode, 'The highlighter must observe a published inline code field')
      retired = true
      if (action === 'target') renderer.destroy(target)
      else if (action === 'all') renderer.destroy()
      else if (action === 'document' || action === 'block') renderer.destroy(output)
      else if (action === 'replace') renderer.renderTo(data(replacementSource), target)
      successor.append(retiredCode)
      retiredMarkup = retiredCode.innerHTML
    } }
    runtime.addPlugin(hook)
    try {
      if (failed) {
        let error
        try { renderer.renderTo(input, target) } catch (cause) { error = cause }
        equal(error, failure)
        assert(retiredCode, 'The failure control must actually allocate the first rich field')
        successor.append(retiredCode)
        retiredMarkup = retiredCode.innerHTML
        retired = true
      } else if (action === 'document') output = renderer.render(input)
      else if (action === 'block') output = renderer.renderBlock(input.blocks[0])
      else { renderer.renderTo(input, target); output = target }
      if (!failed) equal(output.querySelector('code').textContent, source)
      liveRenderer.renderTo(data(liveSource), liveTarget)
      const deadline = Date.now() + 5000
      while ((!retired || !liveTarget.querySelector('code .hljs-keyword')) && Date.now() < deadline) await pause(10)
      assert(retired, 'The real lazy highlighter never exercised output retirement')
      assert(liveTarget.querySelector('code .hljs-keyword'), 'Independent live inline code lost syntax highlighting')
      equal(liveTarget.querySelector('code').textContent, liveSource)
      equal(calls, failed ? 0 : 1, 'Retired staged work must not invoke its old provider')
      equal(retiredCode.innerHTML, retiredMarkup, 'A retired inline highlighter rewrote its successor host')
      equal(retiredCode.parentNode, successor)
      equal(retiredCode.textContent, source)
      if (action === 'replace') {
        equal(target.querySelector('code').textContent, replacementSource)
        assert(target.querySelector('code .hljs-keyword'))
      } else if (action !== 'extract') equal(target.childNodes.length, 0)
      equal(JSON.stringify(input), before)
    } finally {
      runtime.removePlugin(hook)
      renderer.destroy()
      liveRenderer.destroy()
      target.remove(); liveTarget.remove(); successor.remove()
      setHighlightRuntime(null)
    }
  })
}

await run()
