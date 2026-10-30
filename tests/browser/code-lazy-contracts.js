import { EditorRenderer } from '../../renderer/index.js'
import { test, equal, assert, pause, run } from './regressions/harness.js'

test('Code lazy highlighter cannot publish after its provider disposes the output', async () => {
  const source = 'const retired = "<b>literal</b>";'
  const liveSource = 'const live = 42;'
  const documentFor = code => ({ version: '2.0.0', blocks: [{
    id: 'code', type: 'code', dataVersion: 1, data: { code, language: 'javascript' },
  }] })
  const input = documentFor(source), original = JSON.stringify(input)
  const target = document.createElement('section'), liveTarget = document.createElement('section')
  document.body.append(target, liveTarget)
  const renderer = new EditorRenderer({ blockTypes: ['code'], injectStyles: false })
  const liveRenderer = new EditorRenderer({ blockTypes: ['code'], injectStyles: false })
  let retiredPaint, retiredMarkup, retired = false, runtime
  const hook = {
    'before:highlight'(context) {
      if (context.code !== source || retired) return
      retiredPaint = target.querySelector('code')
      renderer.destroy(target)
      retiredMarkup = retiredPaint.innerHTML
      retired = true
    },
  }
  // Loading this real dependency does not select it into Rector's runtime.
  // Register its public hook before Code starts its own lazy completion.
  runtime = (await import('highlight.js')).default
  runtime.addPlugin(hook)
  try {
    renderer.renderTo(input, target)
    liveRenderer.renderTo(documentFor(liveSource), liveTarget)
    equal(target.querySelector('code').textContent, source)
    equal(liveTarget.querySelector('code').textContent, liveSource)
    const deadline = Date.now() + 5000
    while ((!retired || !liveTarget.querySelector('code span')) && Date.now() < deadline) await pause(10)
    assert(retired, 'Real highlighter did not invoke the retirement control')
    equal(retiredPaint.innerHTML, retiredMarkup, 'Retired output received obsolete lazy highlighting')
    equal(target.childNodes.length, 0)
    assert(!retiredPaint.isConnected)
    equal(liveTarget.querySelector('code').textContent, liveSource)
    assert(liveTarget.querySelector('code .hljs-keyword'), 'Independent live output lost its syntax highlighting')
    equal(JSON.stringify(input), original)
  } finally {
    runtime?.removePlugin(hook)
    renderer.destroy()
    liveRenderer.destroy()
    target.remove()
    liveTarget.remove()
  }
})

await run()
