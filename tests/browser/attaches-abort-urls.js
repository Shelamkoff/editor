import { createEditor } from '../../core/index.js'
import { createAttachesPlugin } from '../../plugins/index.js'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const sandbox = document.querySelector('#sandbox')
const result = document.querySelector('#result')
const originalCreateObjectURL = URL.createObjectURL
const originalRevokeObjectURL = URL.revokeObjectURL
const originalInputClick = HTMLInputElement.prototype.click
const created = []
const revoked = []
let editor
let holder

try {
  holder = document.createElement('section')
  sandbox.appendChild(holder)
  const definition = createAttachesPlugin({ injectStyles: false })
  editor = createEditor({
    holder,
    plugins: [definition],
    defaultBlock: 'attaches',
    injectStyles: false,
    data: {
      version: '2.0.0',
      blocks: [{ id: 'attaches', type: 'attaches', dataVersion: definition.schema.currentVersion, data: definition.schema.createDefault() }],
    },
  })

  URL.createObjectURL = () => {
    const url = `blob:attaches-audit-${created.length + 1}`
    created.push(url)
    editor.destroy()
    return url
  }
  URL.revokeObjectURL = url => {
    revoked.push(String(url))
  }

  const transfer = new DataTransfer()
  transfer.items.add(new File(['one'], 'one.bin', { type: 'application/octet-stream' }))
  transfer.items.add(new File(['two'], 'two.bin', { type: 'application/octet-stream' }))

  HTMLInputElement.prototype.click = function () {
    if (this.type !== 'file') return originalInputClick.call(this)
    Object.defineProperty(this, 'files', { configurable: true, value: transfer.files })
    this.dispatchEvent(new Event('change', { bubbles: true }))
  }

  const upload = [...holder.querySelectorAll('.oe-attaches__select button')]
    .find(button => button.textContent?.includes('Upload'))
  assert(upload instanceof HTMLButtonElement, 'attaches upload control is missing')
  upload.click()
  await Promise.resolve()

  assert(created.length === 1, 'attaches did not abort the local batch after editor destruction')
  assert(revoked.includes(created[0]), 'aborted attaches batch retained an uncommitted object URL')

  document.body.dataset.status = 'pass'
  result.textContent = JSON.stringify({ created: created.length, revoked: revoked.length })
} catch (error) {
  document.body.dataset.status = 'fail'
  result.textContent = error?.stack || String(error)
} finally {
  URL.createObjectURL = originalCreateObjectURL
  URL.revokeObjectURL = originalRevokeObjectURL
  HTMLInputElement.prototype.click = originalInputClick
  editor?.destroy()
  holder?.remove()
}
