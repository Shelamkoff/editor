import { runEmbedPreviewCase } from '../embed-preview-parity-fixture.js'
import { createEmbedPlugin } from '../../../plugins/embed/index.js'
import { assert, blockElement, equal, make, pause, test } from './harness.js'

for (const kind of ['timeout', 'timely']) {
  test(`Embed preview ${kind}: public resolver deadline preserves author data and history`, async () => {
    const result = await runEmbedPreviewCase({ kind })
    equal(result.failures, [])
  })
}

for (const adopted of ['placeholder', 'player', 'view', 'wrapper', 'shell']) {
  test(`Embed preview settlement preserves an adopted ${adopted}`, async () => {
    const requests = [], transactions = [], foreign = document.createElement('aside')
    document.body.append(foreign)
    const data = { service: 'vimeo', videoId: '12345', caption: 'Author caption', cover: '', title: '', duration: '' }
    const editor = make([{ id: 'embed', type: 'embed', dataVersion: 1, data }], {
      defaultBlock: 'embed', inlineTools: [],
      plugins: [createEmbedPlugin({ injectStyles: false,
        resolvePreview(request) { return new Promise(resolve => requests.push({ ...request, resolve })) },
      })],
    })
    editor.on('transaction:committed', event => transactions.push(event))
    try {
      const before = editor.save().blocks, shell = blockElement(editor, 'embed')
      const wrapper = shell.querySelector('.oe-embed'), view = wrapper.querySelector('.oe-embed__view')
      const player = view.querySelector('.oe-embed__player'), placeholder = player.querySelector('.oe-embed__placeholder')
      const request = requests.find(request => !request.signal.aborted)
      assert(request, 'The public editor did not acquire a live preview request')
      const target = { placeholder, player, view, wrapper, shell }[adopted]
      foreign.append(target)
      placeholder.textContent = 'Foreign preview sentinel'
      const html = foreign.innerHTML, children = [...foreign.childNodes], targetChildren = [...target.childNodes]
      request.resolve({ thumbnailUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGPwKZz9HwAEvQJYppltbwAAAABJRU5ErkJggg==', title: 'Current preview' })
      await pause()
      equal(foreign.innerHTML, html, 'Preview completion wrote into an adopted subtree')
      equal([...foreign.childNodes], children, 'Preview completion removed a foreign child')
      equal([...target.childNodes], targetChildren, 'Preview completion replaced foreign descendants')
      assert(target.parentNode === foreign && placeholder.textContent === 'Foreign preview sentinel')
      equal(editor.save().blocks, before)
      equal({ transactions: transactions.length, undo: editor.canUndo, redo: editor.canRedo }, { transactions: 0, undo: false, redo: false })
    } finally { editor.destroy(); foreign.remove() }
  })
}
