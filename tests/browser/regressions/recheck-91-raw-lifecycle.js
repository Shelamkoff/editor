import { Raw } from '../../../plugins/raw/index.js'
import { test, equal, pause } from './harness.js'

export function register() {
  test('Raw deferred resize is inert after destroy', async () => {
    const plugin = new Raw()
    const wrapper = plugin.render(
      { html: '<p>safe</p>' },
      {
        ownerDocument: document,
        readOnly: false,
        mutate(operation) { return operation() },
      },
    )
    document.body.appendChild(wrapper)
    const textarea = wrapper.querySelector('.oe-raw__textarea')
    plugin.destroy(wrapper)
    textarea.style.height = '123px'
    await new Promise(resolve => requestAnimationFrame(() => resolve()))
    equal(textarea.style.height, '123px', 'destroyed Raw block must ignore queued resize callbacks')
    wrapper.remove()
  })

  test('Raw preview load callback is inert after destroy', async () => {
    const plugin = new Raw()
    const wrapper = plugin.render(
      { html: '<p>safe</p>' },
      {
        ownerDocument: document,
        readOnly: true,
        mutate(operation) { return operation() },
      },
    )
    document.body.appendChild(wrapper)
    const frame = wrapper.querySelector('iframe')
    plugin.destroy(wrapper)
    frame.style.height = '123px'
    await pause(30)
    equal(frame.style.height, '123px', 'destroyed Raw preview must ignore late iframe/rAF resize callbacks')
    wrapper.remove()
  })
}
