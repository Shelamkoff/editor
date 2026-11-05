import { createImagePlugin } from '../../plugins/image/index.js'
import { EditorRenderer } from '../../renderer/index.js'
import { test, assert, equal, make, editorHolder, pause, run } from './regressions/harness.js'
import { clickNative, dispatchKey, waitForStyles } from './native-input-helpers.js'

const native = location.pathname.includes('/native-')
const pixel = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
const click = async element => {
  assert(element, 'Expected a live Image settings control')
  if (native) await clickNative(element)
  else { element.click(); await pause() }
}

if (document.querySelector('meta[http-equiv="Content-Security-Policy"]')) {
  test('Image expanded layout enforces Trusted Types', () => {
    let denied = false
    try { document.createElement('div').innerHTML = '<b>untrusted</b>' }
    catch (error) { denied = error instanceof TypeError }
    assert(denied)
  })
}

for (const width of [320, 600]) for (const withBackground of [false, true]) {
  test(`Image expanded fills ${width}px owner, background=${withBackground}`, async () => {
    const definition = createImagePlugin(), transactions = []
    const initial = { id: 'image', type: 'image', dataVersion: 1, data: {
      ...definition.schema.createDefault(), file: { url: pixel }, caption: '<b>Caption</b>',
      withBackground, styles: { width: '180px', minWidth: '120px', maxWidth: '240px',
        height: '80px', minHeight: '40px', maxHeight: '100px', objectFit: 'cover' },
    } }
    const untouched = structuredClone(initial)
    const editor = make([initial], { injectStyles: true, plugins: [definition], defaultBlock: 'image', inlineTools: [] })
    const holder = editorHolder(editor)
    holder.style.width = `${width}px`
    const output = document.createElement('section')
    output.style.width = `${width}px`
    document.body.append(output)
    const renderer = new EditorRenderer({ blockTypes: ['image'] })
    const wrapper = () => holder.querySelector('.oe-image')
    const image = () => wrapper().querySelector('.oe-image__image')
    const control = label => [...wrapper().querySelectorAll('.oe-image__style-label')]
      .find(element => element.querySelector('span')?.textContent === label)?.querySelector('input')
    const settings = () => [...wrapper().querySelectorAll('button')]
      .find(element => element.textContent.trim() === 'Settings')
    const replay = async direction => {
      wrapper().focus()
      if (native) await dispatchKey('z', 'KeyZ', 90, direction === 'undo' ? 2 : 10)
      else editor[direction]()
      await pause()
    }
    const verify = async expanded => {
      const expected = structuredClone(untouched)
      expected.data.expanded = expanded
      equal(editor.save().blocks, [expected], 'Only expanded state may change in the authored document')
      equal(initial, untouched, 'Caller data must remain unchanged')
      for (const label of ['Width', 'Min width', 'Max width']) {
        assert(control(label), 'Image dimension control is missing: ' + label)
        equal(control(label).disabled, expanded, label + ' must follow expanded mode')
      }
      equal(control('Width').value, '180px')
      equal(control('Min width').value, '120px')
      equal(control('Max width').value, '240px')
      equal(control('Height').disabled, false, 'Height remains editable while expanded')
      const img = image()
      equal(getComputedStyle(wrapper().querySelector('.oe-image__image-container')).overflow, 'hidden',
        'Geometry must be tested with the actual Image stylesheet loaded')
      for (const [key, value] of Object.entries(untouched.data.styles)) {
        equal(img.style[key], expanded && ['width', 'minWidth', 'maxWidth'].includes(key) ? '' : value,
          'Image must preserve the applicable style: ' + key)
      }
      renderer.renderTo(editor.save(), output)
      await waitForStyles(document)
      const rendered = output.querySelector('img')
      for (const key of ['width', 'minWidth', 'maxWidth']) {
        equal(rendered.style[key], expanded ? '' : untouched.data.styles[key], 'Readonly sizing must follow expanded mode')
      }
      equal(rendered.style.height, '80px')
      equal(rendered.alt, 'Caption')
      if (expanded) {
        const container = wrapper().querySelector('.oe-image__image-container').getBoundingClientRect()
        const owner = wrapper().getBoundingClientRect()
        assert(Math.abs(container.width - owner.width) < 1,
          `Expanded container must fill its owner: ${container.width}px versus ${owner.width}px`)
        assert(image().getBoundingClientRect().width > 180,
          'Expanded image must grow beyond its preserved custom width, including background mode')
      } else equal(getComputedStyle(img).width, '180px', 'Custom width must return when expanded is off')
    }
    try {
      await image().decode()
      await waitForStyles(document)
      editor.on('transaction:committed', event => transactions.push(event))
      await verify(false)
      await click(settings())
      await click(control('Expanded'))
      await verify(true)
      equal(transactions.length, 1)
      await replay('undo')
      await verify(false)
      assert(!editor.canUndo && editor.canRedo)
      await replay('redo')
      await verify(true)
      assert(editor.canUndo && !editor.canRedo)
      equal(transactions.length, 3)
      if (settings().getAttribute('aria-expanded') !== 'true') await click(settings())
      await click(control('Expanded'))
      await verify(false)
      equal(transactions.length, 4, 'Switching back must create one distinct action')
      editor.setReadOnly(true)
      await verify(false)
      equal(transactions.length, 4, 'Mode projection must preserve dimensions without history')
    } finally { renderer.destroy(); output.remove() }
  })
}

await run()
