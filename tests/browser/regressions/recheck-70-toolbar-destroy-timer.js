import { test, make, assert, pause } from './harness.js'

export function register() {
  test('destroy cancels delayed mobile toolbox return', async () => {
    const editor = make(undefined, { tuning: { mobileBreakpoint: 100000 } })
    const root = editor.rootElement
    editor.blocks.setCurrentIndex(0)
    const plus = root.querySelector('.oe-toolbar__btn:not(.oe-toolbar__drag)')
    assert(plus, 'mobile toolbar plus button exists')

    plus.click()
    plus.click()
    editor.destroy()
    await pause(300)

    assert(!root.querySelector('.oe-toolbox'), 'destroyed toolbar must not resurrect after its close timer')
  })
}
