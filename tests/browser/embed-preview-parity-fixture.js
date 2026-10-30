// The same public-editor scenario runs against current and immutable references.
// Only plugin construction and document-version spelling are adapted for v1.
export async function runEmbedPreviewCase({ base = '', legacy = false, kind = 'timeout' } = {}) {
  const { createEditor } = await import(base + '/core/index.js')
  const module = await import(base + '/plugins/embed/index.js')
  const observations = [], requests = []
  const check = (property, actual, expected) => observations.push({
    property, actual, expected,
    status: JSON.stringify(actual) === JSON.stringify(expected) ? 'PASS' : 'FAIL',
  })
  const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
  const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M/wHwAF/gL+Av7lWQAAAABJRU5ErkJggg=='
  const config = { injectStyles: false, previewTimeoutMs: 25,
    resolvePreview(request) {
      return new Promise(resolve => requests.push({ ...request, resolve }))
    } }
  const data = { service: 'vimeo', videoId: '12345', caption: 'Author caption', cover: '', title: '', duration: '' }
  const supplied = { version: legacy ? '1.0.5' : '2.0.0',
    blocks: [{ id: 'embed', type: 'embed', ...(legacy ? {} : { dataVersion: 1 }), data }] }
  const caller = structuredClone(supplied), holder = document.createElement('section')
  document.body.append(holder)
  let editor
  try {
    editor = createEditor({ holder, injectStyles: false, inlineTools: [],
      defaultBlock: 'embed', data: supplied,
      plugins: [legacy ? new module.Embed(config) : module.createEmbedPlugin(config)],
    })
    const before = editor.save().blocks
    check('load.authorData', before[0].data, data)
    check('load.history', [editor.canUndo, editor.canRedo], [false, false])
    // Initial host mode projection can replace a staged player. Observe the
    // single live request; superseded requests must already be cancelled.
    const liveRequests = requests.filter(request => !request.signal.aborted)
    check('resolver.liveRequests', liveRequests.length, 1)
    if (liveRequests.length !== 1) throw new Error(`Expected one live preview request, got ${liveRequests.length} of ${requests.length}`)
    const request = liveRequests[0]
    check('resolver.arguments', [request.service, request.videoId, request.url], ['vimeo', '12345', 'https://vimeo.com/12345'])
    check('load.signal', request.signal.aborted, false)
    if (kind === 'timely') {
      request.resolve({ thumbnailUrl: pixel, title: 'Current preview' })
      await pause(0)
      check('timely.preview', holder.querySelector('.oe-embed__preview')?.getAttribute('src') ?? null, pixel)
      check('timely.alt', holder.querySelector('.oe-embed__preview')?.getAttribute('alt') ?? null, 'Current preview')
      await pause(60)
      check('timely.noObsoleteTimeout', request.signal.aborted, false)
    } else {
      await pause(60)
      check('timeout.signal', request.signal.aborted, true)
      check('timeout.reason', request.signal.reason?.name ?? null, 'TimeoutError')
      check('timeout.noPreview', !!holder.querySelector('.oe-embed__preview'), false)
      request.resolve({ thumbnailUrl: pixel, title: 'Late preview' })
      await pause(0)
      check('timeout.latePreviewIgnored', !!holder.querySelector('.oe-embed__preview'), false)
    }
    check('settled.authorData', editor.save().blocks, before)
    check('settled.history', [editor.canUndo, editor.canRedo], [false, false])
    check('caller.unchanged', supplied, caller)
    editor.destroy()
    check('destroy.editorRemoved', !!holder.querySelector('.oe-editor'), false)
  } finally {
    editor?.destroy()
    holder.remove()
  }
  return { kind, observations, failures: observations.filter(entry => entry.status !== 'PASS') }
}
