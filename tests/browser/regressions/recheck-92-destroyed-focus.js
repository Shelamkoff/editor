import { Embed } from '../../../plugins/embed/index.js'
import { LinkPreview } from '../../../plugins/link-preview/index.js'
import { test, equal } from './harness.js'

function context() {
  return {
    ownerDocument: document,
    readOnly: false,
    mutate(operation) { return operation() },
  }
}

async function assertNoLateFocus(plugin, data, label) {
  const sentinel = document.createElement('button')
  sentinel.type = 'button'
  sentinel.textContent = 'sentinel'
  document.body.appendChild(sentinel)
  sentinel.focus()

  const wrapper = plugin.render(data, context())
  document.body.appendChild(wrapper)
  plugin.destroy(wrapper)

  await new Promise(resolve => requestAnimationFrame(() => resolve()))
  equal(document.activeElement, sentinel, label + ' must not focus a destroyed block')

  wrapper.remove()
  sentinel.remove()
}

export function register() {
  test('Embed queued autofocus is inert after destroy', async () => {
    await assertNoLateFocus(new Embed(), {}, 'Embed')
  })

  test('LinkPreview queued autofocus is inert after destroy', async () => {
    await assertNoLateFocus(new LinkPreview(), {}, 'LinkPreview')
  })
}
