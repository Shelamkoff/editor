import { test, make, assert, equal } from './harness.js'
import { READ_ONLY_INTERACTIVE_ATTRIBUTE } from '../../../core/constants.js'

function nativePlugin(tag, type = 'text', nested = false, interactive = false) {
  return {
    type: 'native', title: 'Native', icon: '', inlineTools: false,
    render(data, context) {
      const field = context.ownerDocument.createElement(tag)
      if (tag === 'input') {
        field.type = type
        field.checked = data.checked === true
      }
      if ('value' in field) field.value = data.value ?? 'KEEP'
      if (interactive) field.setAttribute(READ_ONLY_INTERACTIVE_ATTRIBUTE, '')
      if (tag === 'select') {
        field.add(new Option('KEEP', 'KEEP')); field.add(new Option('OTHER', 'OTHER'))
      }
      field.addEventListener('change', () => context.mutate(() => {}))
      if (!nested) return field
      const root = context.ownerDocument.createElement('div')
      root.appendChild(field)
      return root
    },
    save(root) {
      const field = nested ? root.firstElementChild : root
      return { value: field.value ?? 'KEEP', checked: field.checked === true }
    },
  }
}

export function register() {
  test('read-only locks root native fields and restores editable controls on transition', () => {
    for (const tag of ['input', 'textarea', 'button', 'select']) {
      const editor = make([{ id: 'native', type: 'native', data: { value: 'KEEP' } }], {
        plugins: [nativePlugin(tag)], defaultBlock: 'native', readOnly: true,
      })
      const field = editor.blocks.getBlockById('native').contentElement
      if (tag === 'input' || tag === 'textarea') {
        equal(field.readOnly, true)
        equal(field.disabled, false, 'text stays focusable and copyable')
      } else equal(field.disabled, true)
      editor.setReadOnly(false)
      const live = editor.blocks.getBlockById('native').contentElement
      assert(live !== field, 'mode transition must reconstruct plugin DOM')
      equal(live.disabled, false)
      if ('readOnly' in live) equal(live.readOnly, false)
      equal(editor.save().blocks[0].data.value, 'KEEP')
      editor.destroy()
    }
  })

  test('read-only prevents native checkbox activation in root and nested controls', () => {
    for (const nested of [false, true]) {
      const editor = make([{ id: 'native', type: 'native', data: {} }], {
        plugins: [nativePlugin('input', 'checkbox', nested)], defaultBlock: 'native', readOnly: true,
      })
      const root = editor.blocks.getBlockById('native').contentElement
      const field = nested ? root.firstElementChild : root
      equal(field.disabled, true)
      field.click()
      equal(field.checked, false, 'native activation must not toggle a read-only checkbox')
      editor.setReadOnly(false)
      const liveRoot = editor.blocks.getBlockById('native').contentElement
      const live = nested ? liveRoot.firstElementChild : liveRoot
      live.click()
      equal(live.checked, true)
      equal(editor.save().blocks[0].data.checked, true)
      editor.undo()
      equal(editor.save().blocks[0].data.checked, false)
      editor.redo()
      equal(editor.save().blocks[0].data.checked, true)
      editor.destroy()
    }
  })

  test('explicitly interactive root buttons remain usable in read-only mode', () => {
    const editor = make([{ id: 'native', type: 'native', data: {} }], {
      plugins: [nativePlugin('button', 'text', false, true)], defaultBlock: 'native', readOnly: true,
    })
    const control = editor.blocks.getBlockById('native').contentElement
    let clicks = 0
    control.addEventListener('click', () => clicks++)
    control.click()
    equal(clicks, 1)
    equal(control.disabled, false)
  })
}
