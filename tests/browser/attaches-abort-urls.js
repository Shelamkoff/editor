import { Attaches } from '../../plugins/index.js'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const sandbox = document.querySelector('#sandbox')
const result = document.querySelector('#result')
const originalCreateObjectURL = URL.createObjectURL
const originalRevokeObjectURL = URL.revokeObjectURL
const created = []
const revoked = []
let plugin
let wrapper

try {
  plugin = new Attaches()
  wrapper = plugin.render({ files: [], variant: 'f' }, {
    readOnly: false,
    mutate(operation) { return operation() },
  })
  sandbox.appendChild(wrapper)

  URL.createObjectURL = () => {
    const url = `blob:attaches-audit-${created.length + 1}`
    created.push(url)
    plugin.destroy(wrapper)
    return url
  }
  URL.revokeObjectURL = url => {
    revoked.push(String(url))
  }

  const transfer = new DataTransfer()
  transfer.items.add(new File(['one'], 'one.bin', { type: 'application/octet-stream' }))
  transfer.items.add(new File(['two'], 'two.bin', { type: 'application/octet-stream' }))
  wrapper.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }))
  await Promise.resolve()

  assert(created.length === 1, 'attaches did not abort the local batch after block destruction')
  assert(revoked.includes(created[0]), 'aborted attaches batch retained an uncommitted object URL')

  document.body.dataset.status = 'pass'
  result.textContent = JSON.stringify({ created: created.length, revoked: revoked.length })
} catch (error) {
  document.body.dataset.status = 'fail'
  result.textContent = error?.stack || String(error)
} finally {
  URL.createObjectURL = originalCreateObjectURL
  URL.revokeObjectURL = originalRevokeObjectURL
  plugin?.destroy(wrapper)
  plugin?.dispose?.()
  wrapper?.remove()
}
