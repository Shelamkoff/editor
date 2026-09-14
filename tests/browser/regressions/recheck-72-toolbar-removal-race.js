import { test, make, para, assert, pause } from './harness.js'

export function register() {
  test('toolbar waits for every concurrent block removal before repositioning', async () => {
    const editor = make([
      para('a', 'A'),
      para('b', 'B'),
      para('c', 'C'),
    ], {
      tuning: {
        animations: { blockInsertMs: 0, blockMoveMs: 0, blockRemoveMs: 500 },
      },
    })
    const root = editor.rootElement
    editor.blocks.setCurrentIndex(0)
    const toolbar = root.querySelector('.oe-toolbar')
    assert(toolbar, 'toolbar exists')

    const finish = []
    for (const index of [2, 1]) {
      const element = editor.blocks.getBlockByIndex(index).element
      Object.defineProperty(element, 'offsetHeight', { value: 40, configurable: true })
      element.animate = () => {
        let resolve
        const finished = new Promise(done => { resolve = done })
        finish.push(resolve)
        return { finished }
      }
    }

    editor.blocks.remove(2)
    editor.blocks.remove(1)
    assert(finish.length === 2, 'two removal animations are pending')

    toolbar.style.top = '777px'
    finish[0]()
    await pause()
    await pause()
    assert(toolbar.style.top === '777px', 'first completion must not reposition while another removal is pending')

    finish[1]()
    await pause()
    await pause()
    assert(toolbar.style.top !== '777px', 'last completion repositions toolbar once the removal batch settles')
  })
}
