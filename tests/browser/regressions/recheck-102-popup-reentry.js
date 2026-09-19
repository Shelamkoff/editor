import { PopupManager } from '../../../core/PopupManager.js'
import { test, assert, equal, pause } from './harness.js'

function fixture() {
  const root = document.createElement('section')
  const anchor = document.createElement('button')
  root.appendChild(anchor)
  document.body.appendChild(root)
  let readOnly = false
  const manager = new PopupManager({ on: () => () => {} }, 'changed', {
    getBlockByChildNode() {}, getBlockById() {},
  }, {}, () => readOnly)
  manager.setRoot(root)
  return { root, anchor, manager, readonly() { readOnly = true },
    destroy() { manager.destroy(); root.remove() } }
}

export function register() {
  for (const change of ['destroy', 'readonly', 'detach']) {
    test(`popup cleanup invalidates a pending replacement through ${change}`, async () => {
      const f = fixture()
      let disposed = 0
      try {
        f.manager.showPopup(f.anchor, document.createElement('span'), () => {
          if (change === 'destroy') f.manager.destroy()
          else if (change === 'detach') f.anchor.remove()
          else f.readonly()
        })
        f.manager.showPopup(f.anchor, document.createElement('span'), () => disposed++)
        await pause()
        equal(f.root.querySelectorAll('.oe-ip-popup').length, 0)
        equal(disposed, 1, 'unused popup content must be cleaned once')
      } finally { f.destroy() }
    })
  }

  test('popup opened by cleanup remains the only owned popup and closes normally', async () => {
    const f = fixture()
    let discarded = 0, nestedDisposed = 0
    const nested = document.createElement('span')
    nested.textContent = 'nested'
    try {
      f.manager.showPopup(f.anchor, document.createElement('span'), () => {
        f.manager.showPopup(f.anchor, nested, () => nestedDisposed++)
      })
      f.manager.showPopup(f.anchor, document.createElement('span'), () => discarded++)
      await pause()
      equal(f.root.querySelectorAll('.oe-ip-popup').length, 1)
      assert(nested.isConnected)
      equal(discarded, 1)
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      equal(f.root.querySelectorAll('.oe-ip-popup').length, 0)
      equal(nestedDisposed, 1)
    } finally { f.destroy() }
  })

  test('async popup cleanup rejection is contained without interrupting replacement', async () => {
    const f = fixture()
    const content = document.createElement('span')
    let calls = 0
    try {
      f.manager.showPopup(f.anchor, document.createElement('span'), async () => {
        calls++
        throw new Error('popup cleanup rejection probe')
      })
      f.manager.showPopup(f.anchor, content)
      await pause()
      equal(calls, 1)
      assert(content.isConnected, 'replacement must still own its popup')
      equal(f.root.querySelectorAll('.oe-ip-popup').length, 1)
    } finally { f.destroy() }
  })

}
