import { test, make, para, select, assert, equal, expectError } from './harness.js'
import { Paragraph } from '../../../plugins/index.js'

export function register() {
  test('removing the last block is atomic when the fallback plugin fails', () => {
    let fail = false, attempts = 0
    class Fragile extends Paragraph {
      render(data) {
        if (fail && !data?.text) { attempts++; throw new Error('fallback failure') }
        return super.render(data)
      }
    }
    const editor = make([para('a', 'Keep me')], { plugins: [new Fragile()] })
    const before = editor.save().blocks
    select(editor.blocks.getBlockByIndex(0).contentElement, 1)
    const toggle = editor.rootElement.querySelector('.oe-toolbar > button:nth-child(2)')
    toggle.dispatchEvent(new MouseEvent('mousedown', { button: 0, buttons: 1, bubbles: true, cancelable: true }))
    document.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }))
    const remove = editor.rootElement.querySelector('.oe-settings-menu__item--danger')
    assert(remove, 'delete item is available')
    fail = true
    expectError(/fallback failure/)
    remove.click()
    fail = false
    equal(attempts, 1, 'removal must attempt the mandatory replacement')
    equal(editor.save().blocks, before)
    equal(editor.canUndo, false)
  })
}
