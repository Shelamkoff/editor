import { EditorRenderer } from '../../../renderer/index.js'
import { createMentionRenderer } from '../../../inline-plugins/mention/index.js'
import { createColorSwatchRenderer } from '../../../inline-plugins/color.js'
import { test, equal, assert, pause } from './harness.js'
import { clickNative, waitForStyles } from '../native-input-helpers.js'

for (const width of [640, 320]) test(`Person detached profiles retain cards and widgets through ${width === 640 ? 'fitted list' : 'native carousel'} mounting`, async () => {
  const data = { version: '2.0.0', blocks: [{ id: 'profiles', type: 'person', dataVersion: 2, data: { persons: [
    { id: 'ada', name: '<b>First</b> <i>{{mention}}</i>', role: 'Research', bio: '<s>{{swatch}}</s>', avatar: '', links: [] },
    { id: 'grace', name: 'Second', role: 'Architecture', bio: '<mark>Independent biography</mark>', avatar: '', links: [] },
  ] }, inline: {
    mention: { type: 'mention', dataVersion: 1, data: { id: 'ada', name: 'Ada' } },
    swatch: { type: 'color', dataVersion: 1, data: { value: '#123456' } },
  } }] }
  const original = JSON.stringify(data), holder = document.createElement('section')
  holder.style.width = width + 'px'; document.body.append(holder)
  const renderer = new EditorRenderer({ blockTypes: ['person'], injectStyles: true,
    inlineRenderers: [createMentionRenderer(), createColorSwatchRenderer()] })
  const styles = renderer.injectStyles()
  let output
  try {
    await waitForStyles(document)
    output = renderer.render(data)
    assert(!output.isConnected)
    const cards = [...output.querySelectorAll('.editor-person__card')]
    const widgets = [...output.querySelectorAll('[data-inline-plugin]')]
    equal(cards.map(card => card.querySelector('.editor-person__name').textContent), ['First @Ada', 'Second'])
    equal(widgets.map(widget => widget.textContent), ['@Ada', '#123456'])
    holder.append(output)
    await pause(80)
    equal([...output.querySelectorAll('.editor-person__card')].map((card, index) => card === cards[index]), [true, true],
      'Measuring a mounted Person output must retain its already parsed cards')
    equal([...output.querySelectorAll('[data-inline-plugin]')].map((widget, index) => widget === widgets[index]), [true, true])
    const controls = [...output.querySelectorAll('.editor-person__nav-btn')]
    equal(controls.map(control => control.getAttribute('aria-label')), width === 640 ? [] : ['Previous person', 'Next person'])
    if (width === 320) {
      const trusted = []
      controls.forEach(control => control.addEventListener('click', event => trusted.push(event.isTrusted)))
      const positions = () => [...output.querySelectorAll('.carousel__slide')].map(slide => slide.style.transform)
      const before = positions()
      await clickNative(controls[1]); await pause(450)
      assert(JSON.stringify(positions()) !== JSON.stringify(before), 'Native Next must move the carousel')
      await clickNative(controls[0]); await pause(450)
      equal(positions(), before, 'Native Previous returns to the original profile')
      equal(trusted, [true, true])
      equal([...output.querySelectorAll('.editor-person__card')].map((card, index) => card === cards[index]), [true, true])
    }
    equal(JSON.stringify(data), original)
    renderer.destroy(output)
    equal(output.childNodes.length, 0)
    controls.forEach(control => control.click())
    await pause(30)
    equal(output.childNodes.length, 0, 'Retired navigation must not recreate output')
  } finally {
    if (output) renderer.destroy(output)
    renderer.destroy(); styles.destroy(); holder.remove()
  }
})
