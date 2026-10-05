import { createEditor } from '../refactor-equivalence-2026-10-05/v1-oracle/core/index.js'
import * as legacyPlugins from '../refactor-equivalence-2026-10-05/v1-oracle/plugins/index.js'
import { test, assert, equal, run, pause } from '../../tests/browser/regressions/harness.js'
import { clickNative, pointAt, waitForStyles, dispatchKey, printable } from '../../tests/browser/native-input-helpers.js'

const observations = []
const policy = Object.fromEntries(Object.entries(legacyPlugins).filter(([name]) => name !== 'CarouselBlock').map(([name, Plugin]) => [name, new Plugin().inlineTools === true]))
const disabled = ['Image', 'Embed', 'Gallery', 'Carousel', 'Poll', 'Person']
for (const name of disabled) equal(policy[name], false, 'Historical formatting policy changed')

for (const tool of ['fontSize', 'link', 'align', 'script']) for (const backwards of [false, true]) {
  test('v1 keyboard panel continuation / ' + tool + ' / ' + (backwards ? 'backward' : 'forward'), async () => {
    const holder = document.createElement('section')
    document.body.append(holder)
    const editor = createEditor({
      holder, plugins: [new legacyPlugins.Paragraph()],
      data: { version: '1.0.0', blocks: [{ id: 'a', type: 'paragraph', data: { text: 'Alpha' } }, { id: 'b', type: 'paragraph', data: { text: 'Bravo' } }] },
    })
    try {
      await waitForStyles(document)
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const field = holder.querySelector('[data-block-id="a"] [contenteditable=true]')
      await clickNative(field)
      const from = pointAt(field, backwards ? 4 : 1), to = pointAt(field, backwards ? 1 : 4)
      await window.__testInput('Input.drag', { from: { x: from.clientX, y: from.clientY }, to: { x: to.clientX, y: to.clientY } })
      await pause(40)
      equal(window.getSelection().toString(), 'lph')
      await clickNative(holder.querySelector('[data-tool="' + tool + '"]'))
      const panelSelector = tool === 'fontSize' ? '.oe-font-size-dropdown'
        : tool === 'link' ? '.oe-inline-toolbar__panel--link' : '.oe-inline-toolbar__' + tool + '-panel'
      const panel = holder.querySelector(panelSelector)
      assert(panel, 'Historical panel did not open')
      const focusInPanelAfterOpen = panel.contains(document.activeElement)
      if (tool === 'fontSize' || tool === 'link') {
        const input = holder.querySelector(tool === 'fontSize' ? '.oe-font-size-input' : '.oe-inline-toolbar__link-input')
        await clickNative(input)
        await dispatchKey('a', 'KeyA', 65, 2)
        await window.__testInput('Input.insertText', { text: tool === 'fontSize' ? '99' : 'https://example.com/canceled' })
      }
      await dispatchKey('Tab', 'Tab', 9)
      const focusAfterTab = document.activeElement?.outerHTML?.slice(0, 200)
      await dispatchKey('Escape', 'Escape', 27)
      const stillMounted = holder.querySelector(panelSelector)
      const panelVisibleAfterEscape = !!stillMounted && getComputedStyle(stillMounted).display !== 'none'
      if (tool === 'fontSize' || tool === 'link') equal(panelVisibleAfterEscape, true, 'Historical button Escape unexpectedly closed the panel')
      else equal(focusInPanelAfterOpen, false, 'Historical action panel unexpectedly received focus')
      await printable('X')
      const texts = editor.save().blocks.map(block => block.data.text)
      observations.push({ tool, backwards, focusInPanelAfterOpen, focusAfterTab, panelVisibleAfterEscape, texts, policy })
    } finally {
      editor.destroy()
      holder.remove()
    }
  })
}
for (const theme of ['light', 'dark']) test('v1 Background swatch contrast / ' + theme, async () => {
  const holder = document.createElement('section')
  document.body.append(holder)
  const editor = createEditor({ holder, theme, plugins: [new legacyPlugins.Paragraph()], data: { version: '1.0.0', blocks: [{ id: 'a', type: 'paragraph', data: { text: 'Alpha' } }] } })
  try {
    await waitForStyles(document)
    const field = holder.querySelector('[contenteditable=true]')
    await clickNative(field)
    const from = pointAt(field, 1), to = pointAt(field, 4)
    await window.__testInput('Input.drag', { from: { x: from.clientX, y: from.clientY }, to: { x: to.clientX, y: to.clientY } })
    await pause(30)
    const dot = holder.querySelector('.oe-inline-tool__color-dot'), toolbar = holder.querySelector('.oe-inline-toolbar')
    const style = getComputedStyle(dot), surface = getComputedStyle(toolbar).backgroundColor
    const distinguished = style.backgroundColor !== surface || style.boxShadow !== 'none' || (style.borderTopStyle !== 'none' && parseFloat(style.borderTopWidth) > 0)
    equal(distinguished, theme === 'dark', 'Historical swatch appearance differs')
    observations.push({ tool: 'swatch', theme, distinguished, fill: style.backgroundColor, surface, shadow: style.boxShadow, policy })
  } finally {
    editor.destroy()
    holder.remove()
  }
})

await run()
document.querySelector('#result').textContent = JSON.stringify(window.__auditResults.map((result, index) => ({ ...result, observation: observations[index] })))
