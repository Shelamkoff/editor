import { test, make, blockElement, editorRoot, editorHolder, assert, equal, run } from './regressions/harness.js'
import { waitForStyles } from './native-input-helpers.js'
import { createParagraphPlugin } from '../../plugins/index.js'
import { pluginParityFixtures, pixel } from './plugin-parity-fixtures.js'
import en from '../../locale/en.js'

// A self-contained asset with realistic dimensions; no remote image availability
// or one-pixel intrinsic size influences the layout checks.
const canvas = document.createElement('canvas')
canvas.width = 480; canvas.height = 270
const brush = canvas.getContext('2d')
brush.fillStyle = '#4357b4'; brush.fillRect(0, 0, 480, 270)
brush.fillStyle = '#ccd3f5'; brush.beginPath(); brush.arc(350, 90, 48, 0, Math.PI * 2); brush.fill()
brush.fillStyle = '#7889d3'; brush.beginPath(); brush.moveTo(0, 270); brush.lineTo(160, 90); brush.lineTo(330, 270); brush.fill()
const asset = canvas.toDataURL('image/png')
function visualData(data) {
  return JSON.parse(JSON.stringify(data).replaceAll(pixel, asset))
}
function mount(fixture, theme, width, state) {
  const definition = fixture.factory()
  const editor = make([{ id: 'a', type: definition.type, dataVersion: definition.schema.currentVersion,
    data: state.startsWith('empty') ? definition.schema.createDefault() : visualData(fixture.data) }], {
    injectStyles: true, theme, locale: en, readOnly: state === 'readOnly' || state === 'emptyReadOnly',
    plugins: definition.type === 'paragraph' ? [definition] : [createParagraphPlugin(), definition],
  })
  const holder = editorHolder(editor)
  holder.style.width = width + 'px'
  holder.style.maxWidth = '100%'
  holder.style.background = theme === 'light' ? '#fff' : '#0d0d0d'
  return editor
}
const selectors = {
  Paragraph: '.oe-paragraph', Heading: '.oe-heading', List: '.oe-list', Quote: '.oe-quote',
  Code: '.oe-code-wrap', Image: '.oe-image', Delimiter: '.oe-delimiter', Table: '.oe-table-wrapper',
  Checklist: '.oe-checklist', Warning: '.oe-warning', Embed: '.oe-embed', Raw: '.oe-raw',
  Gallery: '.oe-gallery', Carousel: '.oe-carousel-block', Attaches: '.oe-attaches', LinkPreview: '.oe-lp',
  Toggle: '.oe-toggle', Columns: '.oe-columns', Spoiler: '.oe-spoiler', Poll: '.oe-poll', Person: '.oe-person',
}
function designContract(editor, fixture, theme, state) {
  const block = blockElement(editor, 'a')
  const host = block.querySelector(selectors[fixture.name])
  assert(host, 'Plugin markup lost its v1 stylesheet selector')
  const rect = block.getBoundingClientRect()
  assert(rect.width > 0 && rect.height > 0, 'Plugin has no visible block layout')
  assert(block.scrollWidth <= Math.ceil(rect.width) + 1, `Plugin overflows its authoring width: ${block.scrollWidth} > ${rect.width}`)
  const style = getComputedStyle(editorRoot(editor))
  equal(style.color, theme === 'light' ? 'rgb(26, 26, 26)' : 'rgb(245, 245, 245)', 'Theme text is disconnected')
  for (const hidden of block.querySelectorAll('[hidden]')) assert(!hidden.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }), 'A hidden plugin state is still painted')
  if (state === 'empty' && ['Image','Gallery','Carousel','Attaches'].includes(fixture.name)) {
    assert(host.querySelector('[class$="__select-icon"] svg'), 'Media dropzone lost its v1 icon')
    assert(host.querySelector('button[class$="__select-link"]'), 'Media dropzone lost its styled upload/URL controls')
  }
  if (state === 'filled' && ['Image','Attaches'].includes(fixture.name)) {
    const actions = host.querySelector(selectors[fixture.name] + '__actions')
    for (const button of actions.querySelectorAll(':scope > button, :scope > [class$="__actions-view"] > button')) {
      assert(button.className.includes('__action-btn'), 'Action button lost its v1 style class')
    }
    if (fixture.name === 'Image') assert(host.querySelector('.oe-image__dropdown > button'), 'Image inline Settings menu is missing')
  }
  for (const element of block.querySelectorAll('input,textarea,[contenteditable="true"]')) {
    if (!element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) || !element.getBoundingClientRect().height) continue
    const field = element.getBoundingClientRect()
    assert(field.left >= rect.left - 1 && field.right <= rect.right + 1, 'Visible authoring field escapes the block')
    if (element.matches('.oe-code-textarea')) {
      const paint = block.querySelector('.oe-code-pre')
      assert(paint.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }), 'Code lost its highlight layer')
      assert(getComputedStyle(paint).color !== 'rgba(0, 0, 0, 0)', 'Code paint is invisible')
      assert(getComputedStyle(element).caretColor !== 'rgba(0, 0, 0, 0)', 'Code lost its caret color')
    } else assert(getComputedStyle(element).color !== 'rgba(0, 0, 0, 0)', 'Authoring text is invisible')
  }
  if (!state.startsWith('empty')) {
    if (fixture.name === 'Raw' && state === 'readOnly') {
      const frame = host.querySelector('iframe')
      equal(frame.getAttribute('sandbox'), '', 'Raw preview lost its opaque sandbox')
      equal(getComputedStyle(frame).backgroundColor, 'rgb(255, 255, 255)', 'Unstyled Raw HTML has no readable preview canvas')
      equal(getComputedStyle(frame).colorScheme, 'light')
    }
    if (fixture.name === 'Heading') { equal(host.tagName, 'H3'); equal(getComputedStyle(host).fontWeight, '700') }
    if (fixture.name === 'List') { equal(host.tagName, 'OL'); assert(host.classList.contains('oe-list--ordered')) }
    if (fixture.name === 'Quote') { equal(getComputedStyle(host).borderLeftWidth, '3px'); equal(getComputedStyle(host.querySelector('.oe-quote__text')).fontStyle, 'italic') }
    if (fixture.name === 'Table') { equal(host.querySelectorAll('th.oe-table__cell').length, 2); equal(getComputedStyle(host.querySelector('th')).fontWeight, '600') }
    if (fixture.name === 'Checklist') assert(getComputedStyle(host.querySelector('.oe-checklist__text')).textDecorationLine.includes('line-through'))
    if (fixture.name === 'Warning') { equal(getComputedStyle(host).borderLeftWidth, '4px'); equal(getComputedStyle(host).display, 'flex') }
    if (fixture.name === 'Columns') { equal(getComputedStyle(host.querySelector('.oe-columns__grid')).display, 'grid'); equal(host.querySelectorAll('.oe-columns__col').length, 2) }
    if (fixture.name === 'Person') { equal(getComputedStyle(host.querySelector('.oe-person__card')).display, 'flex'); equal(getComputedStyle(host.querySelector('.oe-person__avatar-wrap')).borderRadius, '50%') }
    if (fixture.name === 'Delimiter') equal(getComputedStyle(host, '::after').content, '"***"')
  }
}

if (new URL(location.href).searchParams.has('visual')) {
  document.querySelector('#result').remove()
  const controls = document.createElement('form')
  controls.id = 'visual-controls'
  const choices = { Plugin: ['All', ...pluginParityFixtures.map(f => f.name)], Theme: ['light','dark'], Width: ['640','288'], State: ['filled','empty','readOnly','emptyReadOnly'] }
  const fields = {}
  for (const [name, values] of Object.entries(choices)) {
    const label = document.createElement('label')
    label.textContent = name
    const select = document.createElement('select')
    select.name = name
    for (const value of values) select.add(new Option(value, value))
    label.append(select); controls.append(label); fields[name] = select
  }
  document.body.prepend(controls)
  let current = []
  const render = () => {
    for (const editor of current) { const holder = editorHolder(editor); editor.destroy(); holder.remove() }
    current = []
    document.querySelector('#visual-grid')?.remove()
    const grid = document.createElement('main')
    grid.id = 'visual-grid'
    grid.style.display = 'grid'
    grid.style.gridTemplateColumns = `repeat(auto-fit, minmax(min(100%, ${fields.Width.value}px), ${fields.Width.value}px))`
    grid.style.gap = '24px'
    document.body.append(grid)
    for (const fixture of pluginParityFixtures.filter(f => fields.Plugin.value === 'All' || f.name === fields.Plugin.value)) {
      const card = document.createElement('article')
      const label = document.createElement('h2')
      label.textContent = fixture.name
      label.style.fontSize = '16px'; label.style.margin = '0 0 8px'
      card.append(label); grid.append(card)
      const editor = mount(fixture, fields.Theme.value, Number(fields.Width.value), fields.State.value)
      card.append(editorHolder(editor)); current.push(editor)
    }
  }
  controls.addEventListener('change', render)
  render()
} else {
  for (const width of [640,288]) for (const theme of ['light','dark']) for (const fixture of pluginParityFixtures) {
    test(`${fixture.name}: ${theme} theme at ${width}px keeps v1 design in filled, empty and read-only states`, async () => {
      await window.__testInput('Viewport.set', { width: width + 40, height: 1000 })
      try {
        for (const state of ['filled','empty','readOnly','emptyReadOnly']) {
          const editor = mount(fixture, theme, width, state)
          const before = editor.save().blocks
          await waitForStyles(document)
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
          designContract(editor, fixture, theme, state)
          equal(editor.save().blocks, before, 'Rendering a theme/state changed authoring data')
          equal(editor.canUndo, false)
        }
      } finally { await window.__testInput('Viewport.reset') }
    })
  }
  await run()
}
