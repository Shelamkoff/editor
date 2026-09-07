import { test, make, para, select, key, paste, pause, assert, equal } from './harness.js'
import { Paragraph, Heading, Spoiler, Checklist, Image, Gallery } from '../../../plugins/index.js'
import { createSpoilerRenderer } from '../../../renderer/renderers/spoiler/index.js'
import { createPersonRenderer } from '../../../renderer/renderers/person/index.js'
import { sanitizeHtml } from '../../../shared/sanitize/sanitizeHtml.js'
import { parseInline } from '../../../shared/sanitize/parseInline.js'
import { extractBlockElements } from '../../../core/clipboard/pasteUtils.js'
import { buildPlayer } from '../../../shared/embedPlayer.js'

function disclosure(root) {
  const button = root.querySelector('[aria-controls]')
  assert(button, 'disclosure has a real control')
  const body = root.querySelector(`[id="${button.getAttribute('aria-controls')}"]`)
  assert(body, 'aria-controls resolves to the owned body')
  const open = !body.hidden
  equal(button.getAttribute('aria-expanded'), String(open))
  assert(button.getAttribute('aria-label'))
  button.click()
  equal(body.hidden, open)
  equal(button.getAttribute('aria-expanded'), String(!open))
  button.click()
  equal(body.hidden, !open)
  equal(button.getAttribute('aria-expanded'), String(open))
}

export function register() {
  test('Heading menu reports real expanded, checked and keyboard focus states', async () => {
    const editor = make([{ id: 'h', type: 'heading', data: { text: 'Heading', level: 2 } }], { plugins: [new Paragraph(), new Heading()] })
    select(editor.blocks.getBlockById('h').contentElement, 0, 3)
    document.dispatchEvent(new Event('selectionchange')); await pause(30)
    const button = editor.rootElement.querySelector('.oe-inline-toolbar__level-select')
    assert(button); equal(button.getAttribute('aria-haspopup'), 'menu')
    button.click()
    const menu = editor.rootElement.querySelector('.oe-inline-toolbar__level-dropdown')
    assert(menu && menu.style.display !== 'none')
    equal(button.getAttribute('aria-expanded'), 'true')
    key(button, 'ArrowDown')
    equal(document.activeElement, menu.querySelector('[role="menuitemradio"]'))
    key(document.activeElement, 'Escape')
    equal(button.getAttribute('aria-expanded'), 'false')
    equal(document.activeElement, button)
    button.click()
    const option = menu.querySelector('[data-level="3"]')
    option.click()
    equal(editor.save().blocks[0].data.level, 3)
    equal(option.getAttribute('aria-checked'), 'true')
    equal(menu.querySelector('[data-level="2"]').getAttribute('aria-checked'), 'false')
  })
  test('editable and read-only Spoiler disclosures match visible content', () => {
    for (const readOnly of [false, true]) {
      const editor = make([{ id: 's', type: 'spoiler', data: { label: 'Label', content: 'Body' } }], { plugins: [new Paragraph(), new Spoiler()], readOnly })
      disclosure(editor.blocks.getBlockById('s').contentElement)
    }
  })
  test('rendered Spoiler disclosure exposes its actual expanded state', () => {
    const renderer = createSpoilerRenderer('contract', {})
    const root = renderer.render({ type: 'spoiler', data: { label: 'Label', content: 'Body' } }, parseInline)
    disclosure(root)
  })
  test('Checklist pressed state follows saved checked state on real clicks', () => {
    const editor = make([{ id: 'c', type: 'checklist', data: { items: [{ text: 'Task', checked: false }] } }], { plugins: [new Paragraph(), new Checklist()] })
    const button = editor.blocks.getBlockById('c').contentElement.querySelector('[aria-pressed]')
    assert(button?.getAttribute('aria-label'))
    equal(button.getAttribute('aria-pressed'), 'false')
    button.click()
    equal(button.getAttribute('aria-pressed'), 'true')
    equal(editor.save().blocks[0].data.items[0].checked, true)
    button.click()
    equal(button.getAttribute('aria-pressed'), 'false')
    equal(editor.save().blocks[0].data.items[0].checked, false)
  })
  test('Image settings expose open, selection and pressed states of real controls', () => {
    const editor = make([{ id: 'i', type: 'image', data: { file: { url: 'https://example.test/a.png' }, caption: 'Image' } }], { plugins: [new Paragraph(), new Image()] })
    const root = editor.blocks.getBlockById('i').contentElement
    const button = root.querySelector('.oe-image__dropdown > button')
    equal(button.getAttribute('aria-expanded'), 'false'); button.click()
    equal(button.getAttribute('aria-expanded'), 'true')
    const selectButton = root.querySelector('[aria-haspopup="listbox"]')
    key(selectButton, 'ArrowDown')
    equal(selectButton.getAttribute('aria-expanded'), 'true')
    const option = root.querySelector('[role="option"]')
    equal(document.activeElement, option)
    key(option, 'Escape')
    equal(selectButton.getAttribute('aria-expanded'), 'false')
    const toggle = root.querySelector('[aria-label="Background"][aria-pressed]')
    const before = toggle.getAttribute('aria-pressed')
    toggle.click()
    equal(toggle.getAttribute('aria-pressed'), String(before !== 'true'))
    equal(editor.save().blocks[0].data.withBackground, before !== 'true')
  })
  test('Gallery layout control reports the active saved layout after rerender', () => {
    const editor = make([{ id: 'g', type: 'gallery', data: { images: [{ url: 'https://example.test/a.png', caption: 'A' }], layout: 'auto' } }], { plugins: [new Paragraph(), new Gallery()] })
    const root = editor.blocks.getBlockById('g').contentElement
    root.querySelector('.oe-gallery__dropdown > button').click()
    const choices = [...root.querySelectorAll('.oe-gallery__layout-btn')]
    const target = choices.find(button => button.getAttribute('aria-pressed') === 'false')
    assert(target?.getAttribute('aria-label'))
    const label = target.getAttribute('aria-label')
    target.click()
    assert(editor.save().blocks[0].data.layout !== 'auto')
    const next = [...root.querySelectorAll('.oe-gallery__layout-btn')]
    equal(next.filter(button => button.getAttribute('aria-pressed') === 'true').map(button => button.getAttribute('aria-label')), [label])
  })
  test('Person navigation renders localized accessible names and hides decorative icons', async () => {
    const renderer = createPersonRenderer('contract', { 'renderer.person.previous': 'Previous profile', 'renderer.person.next': 'Next profile' })
    const root = renderer.render({ type: 'person', data: { persons: [{ name: 'A' }, { name: 'B' }, { name: 'C' }] } }, parseInline)
    // ResizeObserver is delivered during rendering, not by advancing timer
    // tasks. Keep the real fixture visible and wait for actual frames so the
    // virtual-time runner cannot exhaust a polling delay before the first frame.
    root.style.cssText = 'position:fixed;left:0;top:0;width:320px;min-height:100px'
    document.body.appendChild(root)
    try {
      equal(root.querySelector('.contract-person__carousel').getBoundingClientRect().width, 320)
      for (let frame = 0; frame < 10 && !root.querySelector('.contract-person__nav'); frame++) {
        await new Promise(resolve => requestAnimationFrame(resolve))
      }
      const controls = [...root.querySelectorAll('.contract-person__nav button')]
      equal(controls.map(button => button.getAttribute('aria-label')), ['Previous profile', 'Next profile'])
      for (const button of controls) equal(button.querySelector('svg').getAttribute('aria-hidden'), 'true')
    } finally { renderer.destroy?.(root); root.remove() }
  })
  test('Embed player applies accessible labels to the actual play button and iframe', () => {
    const { player, play } = buildPlayer({ service: 'youtube', videoId: 'test', title: 'Lecture', classPrefix: 'contract', playIcon: '', playLabel: 'Play lecture' })
    const button = player.querySelector('button')
    equal(button.getAttribute('aria-label'), 'Play lecture')
    play()
    equal(player.querySelector('iframe').title, 'Lecture')
  })

  for (const entry of ['sanitizeHtml', 'parseInline', 'extractBlockElements', 'paste']) {
    test(`${entry} never constructs untrusted custom elements before sanitizing`, async () => {
      let constructed = 0
      const name = `contract-inert-${entry.toLowerCase()}`
      customElements.define(name, class extends HTMLElement { constructor() { super(); constructed++ } })
      const html = `<${name}>Authored</${name}>`
      let text
      if (entry === 'sanitizeHtml') text = sanitizeHtml(html)
      if (entry === 'parseInline') text = parseInline(html).textContent
      if (entry === 'extractBlockElements') {
        const template = document.createElement('template'); template.innerHTML = html
        text = extractBlockElements(template.content).map(block => block.element.textContent).join('')
      }
      if (entry === 'paste') {
        const editor = make([para('a', '')])
        const p = editor.blocks.getBlockById('a').contentElement; select(p, 0)
        await paste(p, { 'text/html': html })
        text = editor.save().blocks[0].data.text
      }
      equal(constructed, 0, 'no activation before sanitization')
      assert(text.includes('Authored'), 'authored content survives')
    })
  }
}
