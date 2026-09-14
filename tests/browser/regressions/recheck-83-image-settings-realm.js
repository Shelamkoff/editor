import { test, equal, assert } from './harness.js'
import { buildSettingsPanel } from '../../../plugins/image/settings.js'

export function register() {
  test('image settings DOM, observers and outside-click listeners stay in the wrapper owning realm', () => {
    const iframe = document.createElement('iframe')
    document.body.appendChild(iframe)
    let state = null
    try {
      const doc = iframe.contentDocument
      const view = iframe.contentWindow
      assert(doc && view, 'iframe realm unavailable')

      const wrapper = doc.createElement('div')
      doc.body.appendChild(wrapper)
      state = {
        data: { styles: {}, expanded: false, withBackground: false },
        abortController: new view.AbortController(),
        borderObserver: null,
      }
      const panel = buildSettingsPanel(wrapper, state, {
        t: (_key, fallback) => fallback,
        mutate: operation => operation(),
      })
      wrapper.appendChild(panel)

      equal(panel.ownerDocument, doc, 'settings panel escaped the wrapper document')
      assert(state.borderObserver instanceof view.MutationObserver, 'border observer escaped the wrapper realm')

      const trigger = panel.querySelector('[aria-haspopup="listbox"]')
      assert(trigger, 'settings select trigger exists')
      trigger.dispatchEvent(new view.MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      equal(trigger.getAttribute('aria-expanded'), 'true', 'settings select did not open')

      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      equal(trigger.getAttribute('aria-expanded'), 'true', 'ambient document closed image settings')

      doc.body.dispatchEvent(new view.MouseEvent('mousedown', { bubbles: true }))
      equal(trigger.getAttribute('aria-expanded'), 'false', 'owning document did not close image settings')
    } finally {
      state?.abortController?.abort()
      state?.borderObserver?.disconnect()
      iframe.remove()
    }
  })
}
