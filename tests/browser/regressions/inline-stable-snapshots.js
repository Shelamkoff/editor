import { createColorSwatchPlugin } from '../../../inline-plugins/color.js'
import { Paragraph } from '../../../plugins/paragraph/index.js'
import { test, make, para, equal, assert } from './harness.js'

const color = { type: 'color', data: { value: '#ff0000' } }
const changed = field => field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))

export function register() {
  test('a colliding widget keeps its saved ID across edits without render or undo', () => {
    const editor = make([para('a', '{{w}}', { inline: { w: color } })], { inlinePlugins: [createColorSwatchPlugin()] })
    const field = editor.blocks.getBlockById('a').contentElement
    const literal = document.createTextNode('literal {{w}} / ')
    field.prepend(literal)
    changed(field)
    const saved = editor.save()
    const id = Object.keys(saved.blocks[0].inline)[0]
    assert(id !== 'w')
    literal.data += 'edited '
    changed(field)
    equal(Object.keys(editor.save().blocks[0].inline), [id], 'editing text must not recreate widget identity')
    literal.remove()
    changed(field)
    equal(Object.keys(editor.save().blocks[0].inline), [id], 'removing the literal must not recreate widget identity')
  })

  test('a no-op plugin mutation after a collision does not consume an Undo step', () => {
    let mutate
    class EditableParagraph extends Paragraph {
      render(data, context) { mutate = context.mutate; return super.render(data, context) }
    }
    const editor = make([para('a', '{{w}}', { inline: { w: color } })], {
      plugins: [new EditableParagraph()], inlinePlugins: [createColorSwatchPlugin()],
    })
    const field = editor.blocks.getBlockById('a').contentElement
    field.prepend(document.createTextNode('literal {{w}} / '))
    changed(field)
    const saved = editor.save()
    mutate(() => {})
    equal(editor.save().blocks, saved.blocks, 'a no-op must have no serialized changes')
    editor.undo()
    assert(!editor.blocks.getBlockById('a').contentElement.textContent.includes('literal'), 'Undo must remove the actual edit, not just a random ID change')
  })
}
