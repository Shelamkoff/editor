
import { createColorSwatchPlugin } from '../../inline-plugins/color.js'
import { test, make, blockElement, editorRoot, editorHolder, equal, assert, pause, run } from './regressions/harness.js'
import { clickNative, dispatchKey, printable } from './native-input-helpers.js'

test('Escape cancels the color widget preview, releases its popup, and returns keyboard focus', async () => {
  const editor = make([{ id: 'a', type: 'paragraph', dataVersion: 2, data: { text: 'Alpha {{w_color}}' }, inline: { w_color: { type: 'color', dataVersion: 1, data: { value: '#123456' } } } }], { inlinePlugins: [createColorSwatchPlugin()], injectStyles: true })
  const before = editor.save().blocks, root = editorRoot(editor)
  const swatch = blockElement(editor, 'a').querySelector('[data-inline-plugin="color"]')
  await clickNative(swatch)
  const input = root.querySelector('.oe-ip-popup .oe-color-hex')
  assert(input)
  await clickNative(input)
  await dispatchKey('a', 'KeyA', 65, 2)
  for (const character of '#ff0000') await printable(character)
  await dispatchKey('Tab', 'Tab', 9)
  equal(swatch.querySelector('.oe-ip__label').textContent, '#ff0000')
  equal(editor.save().blocks, before); equal(editor.canUndo, false)
  await dispatchKey('Escape', 'Escape', 27)
  assert(!root.querySelector('.oe-ip-popup'), 'Escape retained the owned color popup')
  equal(swatch.querySelector('.oe-ip__label').textContent, '#123456')
  equal(document.activeElement, swatch)
  equal(editor.save().blocks, before); equal(editor.canUndo, false)
  await dispatchKey('Enter', 'Enter', 13)
  assert(root.querySelector('.oe-ip-popup'), 'Escape did not restore keyboard access to the widget')
  editor.setReadOnly(true)
  assert(!root.querySelector('.oe-ip-popup'))
  editor.destroy()
  assert(!document.querySelector('.oe-ip-popup'))
})

for (const action of ['delete-block', 'destroy-editor']) test('Open color popup cleans up after ' + action + ' without accessing a revoked widget', async () => {
  const editor = make([{ id: 'a', type: 'paragraph', dataVersion: 2, data: { text: 'Alpha {{w_color}}' }, inline: { w_color: { type: 'color', dataVersion: 1, data: { value: '#123456' } } } }], { inlinePlugins: [createColorSwatchPlugin()], injectStyles: true })
  const errors = [], originalError = console.error
  console.error = (...args) => { if (args[0] === 'Inline popup cleanup failed') errors.push(args); else originalError(...args) }
  try {
    await clickNative(blockElement(editor, 'a').querySelector('[data-inline-plugin="color"]'))
    assert(editorRoot(editor).querySelector('.oe-ip-popup'))
    if (action === 'delete-block') editor.blocks.remove('a')
    else editor.destroy()
    await pause(50)
    assert(!document.querySelector('.oe-ip-popup'), 'Deleted widget kept its popup')
    equal(errors.length, 0, 'Popup cleanup read from a revoked widget')
  } finally { console.error = originalError; editor.destroy() }
})

test('Color widget popup fits the narrow viewport and its Apply button accepts a native click', async () => {
  await window.__testInput('Viewport.set', { width: 390, height: 520 })
  try {
    const editor = make([{ id: 'a', type: 'paragraph', dataVersion: 2, data: { text: 'Alpha {{w_color}}' }, inline: { w_color: { type: 'color', dataVersion: 1, data: { value: '#123456' } } } }], { inlinePlugins: [createColorSwatchPlugin()], injectStyles: true })
    const before = editor.save().blocks, root = editorRoot(editor)
    blockElement(editor, 'a').querySelector('.oe-paragraph').style.textAlign = 'right'
    const swatch = blockElement(editor, 'a').querySelector('[data-inline-plugin="color"]')
    await clickNative(swatch)
    const popup = root.querySelector('.oe-ip-popup')
    assert(popup)
    const bounds = popup.getBoundingClientRect()
    assert(bounds.left >= 8 && bounds.right <= innerWidth - 8, 'Color popup escaped viewport horizontally: ' + JSON.stringify(bounds.toJSON()))
    assert(bounds.top >= 8 && bounds.bottom <= innerHeight - 8, 'Color popup escaped viewport vertically: ' + JSON.stringify(bounds.toJSON()))
    const apply = popup.querySelector('.oe-color-btn--apply')
    assert(apply)
    await clickNative(apply)
    assert(!root.querySelector('.oe-ip-popup'), 'Visible Apply button did not close its popup')
    equal(editor.save().blocks, before); equal(editor.canUndo, false)
  } finally { await window.__testInput('Viewport.reset') }
})

test('Open color widget popup follows its source while the document scrolls', async () => {
  await window.__testInput('Viewport.set', { width: 390, height: 520 })
  const oldMinHeight = document.body.style.minHeight
  try {
    document.body.style.minHeight = '1400px'
    const editor = make([{ id: 'a', type: 'paragraph', dataVersion: 2, data: { text: 'Alpha {{w_color}}' }, inline: { w_color: { type: 'color', dataVersion: 1, data: { value: '#123456' } } } }], { inlinePlugins: [createColorSwatchPlugin()], injectStyles: true })
    editorHolder(editor).style.marginTop = '210px'
    const swatch = blockElement(editor, 'a').querySelector('[data-inline-plugin="color"]')
    await clickNative(swatch)
    const popup = editorRoot(editor).querySelector('.oe-ip-popup')
    assert(popup)
    const previous = { anchor: swatch.getBoundingClientRect(), popup: popup.getBoundingClientRect() }
    window.scrollBy(0, 60); await pause(80)
    const current = { anchor: swatch.getBoundingClientRect(), popup: popup.getBoundingClientRect() }
    assert(previous.anchor.top - current.anchor.top >= 50, 'Scroll fixture did not move its source')
    assert(Math.abs((current.popup.top - current.anchor.bottom) - (previous.popup.top - previous.anchor.bottom)) < 1, 'Popup stayed at its old position while the source moved')
    await window.__testInput('Viewport.set', { width: 320, height: 390 }); await pause(80)
    const resized = popup.getBoundingClientRect()
    assert(resized.left >= 8 && resized.right <= innerWidth - 8 && resized.top >= 8 && resized.bottom <= innerHeight - 8, 'Resizing retained the old popup bounds')
    await clickNative(popup.querySelector('.oe-color-btn--apply'))
    assert(!editorRoot(editor).querySelector('.oe-ip-popup'))
    equal(editor.canUndo, false)
  } finally {
    document.body.style.minHeight = oldMinHeight
    window.scrollTo(0, 0); await window.__testInput('Viewport.reset')
  }
})

test('Tall inline popup stays scrollable inside a short viewport and commits through its lower button', async () => {
  await window.__testInput('Viewport.set', { width: 390, height: 180 })
  const oldMinHeight = document.body.style.minHeight
  try {
    document.body.style.minHeight = '1400px'
    const definition = {
      type: 'panel', icon: '', label: { key: 'title', fallback: 'Panel' },
      schema: { currentVersion: 1, createDefault: () => ({ name: 'Open' }), encode: data => ({ dataVersion: 1, data }), decode: input => input },
      setup(runtime) {
        return {
          create(_id, data, context) {
            const trigger = document.createElement('button')
            trigger.type = 'button'; trigger.textContent = data.name; trigger.dataset.inlinePlugin = 'panel'
            trigger.addEventListener('click', () => {
              const surface = document.createElement('div'), spacer = document.createElement('p'), apply = document.createElement('button')
              surface.style.width = '280px'
              spacer.textContent = 'Long panel content'; spacer.style.height = '430px'
              apply.type = 'button'; apply.textContent = 'Apply'; apply.dataset.testApply = ''
              apply.addEventListener('click', () => { context.updateData(current => ({ name: current.name + '!' })); runtime.hidePopup() }, { signal: context.signal })
              surface.append(spacer, apply); runtime.showPopup(trigger, surface)
            }, { signal: context.signal })
            return { element: trigger, update(next) { trigger.textContent = next.name }, setReadOnly(value) { trigger.disabled = value }, destroy() {} }
          },
          destroy() {},
        }
      },
    }
    const editor = make([{ id: 'a', type: 'paragraph', dataVersion: 2, data: { text: '{{w_panel}}' }, inline: { w_panel: { type: 'panel', dataVersion: 1, data: { name: 'Open' } } } }], { inlinePlugins: [definition], injectStyles: true })
    editorHolder(editor).style.marginTop = '600px'
    const before = editor.save().blocks, root = editorRoot(editor), events = []
    editor.on('transaction:committed', event => events.push(event))
    await clickNative(blockElement(editor, 'a').querySelector('[data-inline-plugin="panel"]'))
    const popup = root.querySelector('.oe-ip-popup')
    assert(popup)
    const bounds = popup.getBoundingClientRect()
    assert(bounds.top >= 8 && bounds.bottom <= innerHeight - 8, 'Tall popup escaped its short viewport: ' + JSON.stringify(bounds.toJSON()))
    assert(popup.scrollHeight > popup.clientHeight, 'Tall popup clipped its lower controls without a scroll surface')
    window.scrollTo(0, 0); await pause(80)
    assert(blockElement(editor, 'a').getBoundingClientRect().top > innerHeight, 'The scroll fixture kept its source on screen')
    const offscreen = popup.getBoundingClientRect()
    assert(offscreen.top >= 8 && offscreen.bottom <= innerHeight - 8, 'Offscreen source let its popup overflow: ' + JSON.stringify(offscreen.toJSON()))
    await clickNative(popup.querySelector('[data-test-apply]'))
    assert(!root.querySelector('.oe-ip-popup'))
    const after = editor.save().blocks
    equal(after[0].inline.w_panel.data, { name: 'Open!' }); equal(events.length, 1)
    editor.blocks.focus('a')
    await dispatchKey('z', 'KeyZ', 90, 2); equal(editor.save().blocks, before)
    await dispatchKey('z', 'KeyZ', 90, 10); equal(editor.save().blocks, after)
  } finally {
    document.body.style.minHeight = oldMinHeight
    window.scrollTo(0, 0); await window.__testInput('Viewport.reset')
  }
})

test('Color Apply restores source keyboard focus and one native Undo/Redo action', async () => {
  const editor = make([{ id: 'a', type: 'paragraph', dataVersion: 2, data: { text: 'Alpha {{w_color}}' }, inline: { w_color: { type: 'color', dataVersion: 1, data: { value: '#123456' } } } }], { inlinePlugins: [createColorSwatchPlugin()], injectStyles: true })
  const before = editor.save().blocks, root = editorRoot(editor)
  const swatch = blockElement(editor, 'a').querySelector('[data-inline-plugin="color"]')
  await clickNative(swatch)
  const input = root.querySelector('.oe-ip-popup .oe-color-hex')
  await clickNative(input); await dispatchKey('a', 'KeyA', 65, 2)
  for (const character of '#ff0000') await printable(character)
  await dispatchKey('Tab', 'Tab', 9)
  equal(editor.save().blocks, before); equal(editor.canUndo, false)
  await clickNative(root.querySelector('.oe-ip-popup .oe-color-btn--apply'))
  const after = editor.save().blocks
  equal(after[0].inline.w_color.data, { value: '#ff0000' })
  assert(!root.querySelector('.oe-ip-popup'))
  equal(document.activeElement, swatch, 'Apply lost keyboard ownership of its source widget')
  await dispatchKey('z', 'KeyZ', 90, 2); equal(editor.save().blocks, before); equal(editor.canUndo, false)
  await dispatchKey('z', 'KeyZ', 90, 10); equal(editor.save().blocks, after)
})

test('Applying the unchanged widget color preserves Redo and publishes no author transaction', async () => {
  const editor = make([{ id: 'a', type: 'paragraph', dataVersion: 2, data: { text: 'Alpha {{w_color}}' }, inline: { w_color: { type: 'color', dataVersion: 1, data: { value: '#123456' } } } }], { inlinePlugins: [createColorSwatchPlugin()], injectStyles: true })
  const before = editor.save().blocks, events = []
  editor.blocks.focus('a', { offset: 2 }); await printable('X')
  const changed = editor.save().blocks
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before); equal(editor.canUndo, false); equal(editor.canRedo, true)
  editor.on('transaction:committed', event => events.push(event))
  await clickNative(blockElement(editor, 'a').querySelector('[data-inline-plugin="color"]'))
  await clickNative(editorRoot(editor).querySelector('.oe-ip-popup .oe-color-btn--apply'))
  equal(editor.save().blocks, before); equal(editor.canUndo, false); equal(editor.canRedo, true); equal(events.length, 0)
  await dispatchKey('z', 'KeyZ', 90, 10); equal(editor.save().blocks, changed)
  await dispatchKey('z', 'KeyZ', 90, 2); equal(editor.save().blocks, before)
})

await run()
