import { triggerFileInput } from '../../../plugins/shared/fileInput.js'
import { test, equal, assert, expectError } from './harness.js'

function fixture(onFiles) {
  const controller = new AbortController()
  let input
  const click = HTMLInputElement.prototype.click
  // Only opening the operating system picker is substituted. The input,
  // FileList, AbortSignal and change/cancel dispatch are browser objects.
  HTMLInputElement.prototype.click = function () {
    if (this.type === 'file') input = this
    else click.call(this)
  }
  try { triggerFileInput({ ownerDocument: document, signal: controller.signal, multiple: true, onFiles }) }
  finally { HTMLInputElement.prototype.click = click }
  assert(input?.isConnected)
  const files = new DataTransfer()
  files.items.add(new File(['a'], 'a.png', { type: 'image/png' }))
  files.items.add(new File(['b'], 'b.png', { type: 'image/png' }))
  input.files = files.files
  return { input, controller, change() { input.dispatchEvent(new Event('change')) }, destroy() { controller.abort(); input.remove() } }
}

export function register() {
  test('file picker is removed even when the selected-file callback throws', () => {
    const f = fixture(() => { throw new Error('selected-file application failure') })
    try {
      expectError(/selected-file application failure/)
      f.change()
      assert(!f.input.isConnected, 'failed application must not leave the hidden picker mounted')
    } finally { f.destroy() }
  })

  for (const reason of ['cancel', 'abort']) {
    test(`file picker ignores a queued change after ${reason}`, () => {
      const names = []
      const f = fixture(files => names.push(files.map(file => file.name)))
      try {
        if (reason === 'abort') f.controller.abort()
        else f.input.dispatchEvent(new Event('cancel'))
        assert(!f.input.isConnected)
        f.change()
        equal(names, [])
      } finally { f.destroy() }
    })
  }

  test('file picker delivers one selection only once, including a reentrant change', () => {
    const names = []
    let f
    f = fixture(files => {
      names.push(files.map(file => file.name))
      if (names.length === 1) f.change()
    })
    try {
      f.change()
      f.change()
      equal(names, [['a.png', 'b.png']])
      assert(!f.input.isConnected)
    } finally { f.destroy() }
  })

  test('empty file selection closes without invoking the application', () => {
    let calls = 0
    const f = fixture(() => calls++)
    try {
      f.input.files = new DataTransfer().files
      f.change()
      equal(calls, 0)
      assert(!f.input.isConnected)
    } finally { f.destroy() }
  })

  test('an already cancelled picker never mounts or invokes its callback', () => {
    const controller = new AbortController()
    controller.abort()
    const count = document.querySelectorAll('input[type="file"]').length
    triggerFileInput({ signal: controller.signal, onFiles() { throw new Error('unexpected cancelled picker') } })
    equal(document.querySelectorAll('input[type="file"]').length, count)
  })
}
