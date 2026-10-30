import { test, make, para, editableField, editorHolder, equal, assert } from './harness.js'
import { clickNative, dispatchKey, printable } from '../native-input-helpers.js'
import { EditorRenderer } from '../../../renderer/index.js'

test('Native typing and Undo/Redo preserve CSS variables, comments and important formatting', async () => {
  const html = '<b>Lead</b> <span class="grammar-sample" style="color:var(--expression-color)!important;font-size:var(--expression-size, /* keep ; colon: */ 32px)">Sample</span> tail'
  const input = [para('sample', html), para('neighbor', '<i>Untouched</i>')]
  const original = JSON.stringify(input)
  const editor = make(input)
  const holder = editorHolder(editor)
  holder.style.setProperty('--expression-color', 'rgb(12, 84, 156)')
  const before = editor.save().blocks
  const field = editableField(editor, 'sample')
  const trusted = []
  field.addEventListener('beforeinput', event => trusted.push(event.isTrusted))
  await clickNative(field.querySelector('.grammar-sample'))
  await dispatchKey('End', 'End', 35)
  await printable('X')
  assert(trusted.length > 0 && trusted.every(Boolean))
  const after = editor.save().blocks
  equal(after[0].data.text, before[0].data.text + 'X')
  equal(after[1], before[1])
  const check = () => {
    const sample = editableField(editor, 'sample').querySelector('.grammar-sample')
    equal(getComputedStyle(sample).fontSize, '32px')
    equal(getComputedStyle(sample).color, 'rgb(12, 84, 156)')
    equal(sample.style.getPropertyPriority('color'), 'important')
  }
  check()
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
  check()
  await dispatchKey('z', 'KeyZ', 90, 10)
  equal(editor.save().blocks, after)
  equal(editor.canRedo, false)
  check()
  const renderer = new EditorRenderer({ blockTypes: ['paragraph'], injectStyles: false })
  const output = document.createElement('div')
  output.style.setProperty('--expression-color', 'rgb(12, 84, 156)')
  document.body.append(output)
  try {
    renderer.renderTo(editor.save(), output)
    equal(getComputedStyle(output.querySelector('.grammar-sample')).fontSize, '32px')
    equal(getComputedStyle(output.querySelector('.grammar-sample')).color, 'rgb(12, 84, 156)')
    equal(JSON.stringify(input), original)
  } finally { renderer.destroy(); output.remove() }
})
