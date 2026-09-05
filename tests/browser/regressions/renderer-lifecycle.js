import { EditorRenderer } from '../../../renderer/index.js'
import { test, equal, assert } from './harness.js'

export function register() {
  if (!customElements.get('rector-stateful-probe')) {
    customElements.define('rector-stateful-probe', class extends HTMLElement {
      connects = 0
      disconnects = 0
      connectedCallback() { this.connects++ }
      disconnectedCallback() { this.disconnects++ }
      connectedMoveCallback() {}
    })
  }
  for (const operation of ['same', 'neighbor', 'reorder']) {
    test(`renderer preserves connected state when updating ${operation}`, () => {
      const renderer = new EditorRenderer({ injectStyles: false, blockTypes: [] })
      renderer.registerRenderer({
        type: 'stateful',
        render(block) {
          const element = document.createElement('rector-stateful-probe')
          element.appendChild(document.createElement('input'))
          element.dataset.value = block.data.value
          return element
        },
      })
      const holder = document.createElement('div')
      document.body.appendChild(holder)
      const a = { id: 'a', type: 'stateful', data: { value: 'A' } }
      const b = { id: 'b', type: 'stateful', data: { value: 'B' } }
      try {
        renderer.renderTo({ blocks: [a, b] }, holder)
        const first = holder.querySelector('[data-block-id="a"]')
        const input = first.querySelector('input')
        input.value = 'unsaved local state'
        input.focus()
        input.setSelectionRange(3, 7)
        const next = operation === 'same' ? [a, b]
          : operation === 'neighbor' ? [a, { ...b, data: { value: 'changed' } }]
          : [b, a]
        renderer.renderTo({ blocks: next }, holder)
        equal([...holder.querySelectorAll('[data-block-id]')].map(el => el.dataset.blockId), next.map(block => block.id))
        assert(holder.querySelector('[data-block-id="a"]') === first, 'unchanged block identity')
        equal(input.value, 'unsaved local state')
        // Native moves preserve state where available. No-op and neighboring
        // updates must preserve it even without the moveBefore API.
        if (operation !== 'reorder' || typeof holder.moveBefore === 'function') {
          assert(document.activeElement === input, 'focus must remain in the unchanged block')
          equal([input.selectionStart, input.selectionEnd], [3, 7])
          equal([first.connects, first.disconnects], [1, 0])
        }
      } finally { renderer.destroy(); holder.remove() }
    })
  }
}
