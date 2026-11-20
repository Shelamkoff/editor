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

test('Code copy feedback is canceled in its creating window after adoption', async () => {
  const sourceFrame = document.createElement('iframe')
  const destinationFrame = document.createElement('iframe')
  document.body.append(sourceFrame, destinationFrame)
  const source = sourceFrame.contentWindow
  const destination = destinationFrame.contentWindow
  const sourceSetTimeout = source.setTimeout.bind(source)
  const sourceClearTimeout = source.clearTimeout.bind(source)
  const destinationClearTimeout = destination.clearTimeout.bind(destination)
  const canceledInSource = [], canceledInDestination = []
  let copyTimer, destinationTimer
  source.setTimeout = (callback, delay, ...args) => {
    const timer = sourceSetTimeout(callback, delay, ...args)
    if (delay === 2000) copyTimer = timer
    return timer
  }
  source.clearTimeout = timer => {
    canceledInSource.push(timer)
    sourceClearTimeout(timer)
  }
  destination.clearTimeout = timer => {
    canceledInDestination.push(timer)
    destinationClearTimeout(timer)
  }
  Object.defineProperty(source.navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async () => {} },
  })
  const target = source.document.createElement('section')
  source.document.body.append(target)
  const renderer = new EditorRenderer({ blockTypes: ['code'], injectStyles: false })
  try {
    renderer.renderTo({ version: '2.0.0', blocks: [{
      id: 'code', type: 'code', dataVersion: 1, data: { code: 'const value = 1;', language: 'javascript' },
    }] }, target)
    const button = target.querySelector('.editor-code__copy')
    button.click()
    await Promise.resolve()
    assert(button.classList.contains('editor-code__copy--success'), 'copy feedback must be shown before adoption')
    assert(Number.isInteger(copyTimer), 'copy feedback must own a reset timer')
    destinationTimer = destination.setTimeout(() => {}, 2000)
    destination.document.body.append(target)
    equal(target.ownerDocument === destination.document, true, 'target must be adopted into the other window')
    renderer.destroy(target)
    equal(target.childNodes.length, 0)
    equal(canceledInSource, [copyTimer], 'the timer must be cleared in its creating window')
    equal(canceledInDestination, [], 'destroy must leave the destination window timers alone')
  } finally {
    renderer.destroy()
    sourceClearTimeout(copyTimer)
    destinationClearTimeout(destinationTimer)
    sourceFrame.remove()
    destinationFrame.remove()
  }
})

await run()
