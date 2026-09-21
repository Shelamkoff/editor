import { Embed } from '../../../plugins/embed/index.js'
import { test, make, equal, assert, expectError, pause } from './harness.js'

function chooseCover(plugin, wrapper, bytes = 'cover') {
  let input
  const click = HTMLInputElement.prototype.click
  HTMLInputElement.prototype.click = function () {
    if (this.type === 'file') input = this
    else click.call(this)
  }
  try { plugin._triggerCoverUpload(wrapper) }
  finally { HTMLInputElement.prototype.click = click }
  assert(input, 'cover chooser was not opened')
  const files = new DataTransfer()
  files.items.add(new File([bytes], 'cover.png', { type: 'image/png' }))
  input.files = files.files
  input.dispatchEvent(new Event('change'))
}

function observeUrls() {
  const create = URL.createObjectURL, revoke = URL.revokeObjectURL
  const created = [], revoked = []
  URL.createObjectURL = function (file) { const url = create.call(this, file); created.push(url); return url }
  URL.revokeObjectURL = function (url) { revoked.push(url); return revoke.call(this, url) }
  return { created, revoked, restore() { URL.createObjectURL = create; URL.revokeObjectURL = revoke } }
}

export function register() {
  test('Embed rejects a local cover without retaining its Blob URL until editor destruction', async () => {
    let reject = true
    class ValidatedEmbed extends Embed {
      validate(data) { return super.validate(data) && (!reject || !String(data.cover).startsWith('blob:')) }
    }
    const plugin = new ValidatedEmbed({ resolvePreview: false })
    const editor = make([{ id: 'embed', type: 'embed', data: { service: 'youtube', videoId: 'abcdefghijk', cover: '' } }], {
      plugins: [plugin], validationMode: 'strict',
    })
    const before = editor.save().blocks
    const urls = observeUrls()
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        expectError(/Invalid block data for "embed"/)
        chooseCover(plugin, editor.blocks.getBlockById('embed').contentElement)
        equal(editor.save().blocks, before)
        equal(editor.canUndo, false)
        assert(urls.revoked.includes(urls.created[attempt]), 'rejected cover still owns a live Blob URL')
      }
      reject = false
      chooseCover(plugin, editor.blocks.getBlockById('embed').contentElement, 'accepted')
      const accepted = editor.save().blocks[0].data.cover
      assert(accepted.startsWith('blob:'))
      assert(!urls.revoked.includes(accepted), 'accepted cover must remain available for history')
      equal(await (await fetch(accepted)).text(), 'accepted')
      editor.undo(); equal(editor.save().blocks, before)
      editor.redo(); equal(editor.save().blocks[0].data.cover, accepted)
      editor.destroy()
      assert(urls.revoked.includes(accepted), 'disposal must release accepted covers too')
      equal(new Set(urls.created).size, 3)
      equal(urls.revoked.length, 3, 'each URL should be revoked once')
    } finally { editor.destroy(); urls.restore() }
    await pause()
  })

  test('Embed failed replacement preserves the last accepted local cover and its history', async () => {
    let reject = false
    class ValidatedEmbed extends Embed { validate(data) { return !reject && super.validate(data) } }
    const plugin = new ValidatedEmbed({ resolvePreview: false })
    const editor = make([{ id: 'embed', type: 'embed', data: { service: 'youtube', videoId: 'abcdefghijk' } }], {
      plugins: [plugin], validationMode: 'strict',
    })
    const urls = observeUrls()
    try {
      chooseCover(plugin, editor.blocks.getBlockById('embed').contentElement, 'old')
      const saved = editor.save().blocks
      reject = true
      expectError(/Invalid block data for "embed"/)
      chooseCover(plugin, editor.blocks.getBlockById('embed').contentElement, 'rejected')
      reject = false
      equal(editor.save().blocks, saved)
      equal(urls.revoked, [urls.created[1]], 'only the rejected replacement URL should be released')
      equal(await (await fetch(saved[0].data.cover)).text(), 'old')
      editor.undo(); equal(editor.save().blocks[0].data.cover, '')
      editor.redo(); equal(editor.save().blocks, saved)
    } finally { editor.destroy(); urls.restore() }
  })
}
