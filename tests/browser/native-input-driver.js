// The physical runner exposes only the CDP input methods used by this fixture.
let sequence = 0
const pending = new Map()
window.__resolveTestInput = (id, ok, result) => {
  const request = pending.get(id)
  if (!request) return
  pending.delete(id)
  if (ok) request.resolve(result)
  else request.reject(new Error(result))
}
window.__testInput = (method, params) => new Promise((resolve, reject) => {
  const id = ++sequence
  pending.set(id, { resolve, reject })
  if (typeof window.__rectorTestInput === 'function') {
    window.__rectorTestInput(JSON.stringify({ id, method, params }))
  } else if (new URL(location.href).searchParams.has('ui-driver')) {
    const output = document.querySelector('#input-request')
    const native = window.getSelection()
    output.textContent = JSON.stringify({ id, method, params, selection: {
      anchor: native.anchorNode?.textContent, anchorOffset: native.anchorOffset,
      focus: native.focusNode?.textContent, focusOffset: native.focusOffset,
    } })
    output.dataset.status = 'pending'
  } else {
    pending.delete(id)
    reject(new Error('Native input requires the physical runner or the UI driver'))
  }
})
if (new URL(location.href).searchParams.has('ui-driver')) {
  const output = document.createElement('pre')
  output.id = 'input-request'
  output.style.height = '2rem'
  output.style.overflow = 'auto'
  const acknowledge = document.createElement('button')
  acknowledge.id = 'input-acknowledge'
  acknowledge.textContent = 'Press F9 after delivering input'
  acknowledge.addEventListener('mousedown', event => event.preventDefault())
  const delivered = () => {
    if (output.dataset.status !== 'pending') return
    const { id } = JSON.parse(output.textContent)
    output.dataset.status = 'idle'
    window.__resolveTestInput(id, true)
  }
  document.addEventListener('keydown', event => {
    if (event.key !== 'F9') return
    event.preventDefault()
    delivered()
  }, true)
  document.body.append(output, acknowledge)
}
