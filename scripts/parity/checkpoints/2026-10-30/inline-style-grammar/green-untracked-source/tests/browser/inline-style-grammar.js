import { EditorRenderer } from '../../renderer/index.js'
import { normalizeRichText, setSanitizedHtml } from '../../plugin-kit/index.js'
import { test, make, para, editorHolder, editableField, equal, assert, pause, run } from './regressions/harness.js'

test('A theme variable containing expression in its name retains canonical and visible formatting', () => {
  const html = '<b>Lead</b> <span class="grammar-sample" style="font-size:var(--expression-size);color:var(--expression-color)">Sample</span> tail'
  const input = [para('sample', html), para('neighbor', '<i>Untouched</i>')]
  const original = JSON.stringify(input)
  const editor = make(input)
  const holder = editorHolder(editor)
  const output = document.createElement('section')
  for (const container of [holder, output]) {
    container.style.fontSize = '20px'
    container.style.setProperty('--expression-size', '32px')
    container.style.setProperty('--expression-color', 'rgb(12, 84, 156)')
  }
  document.body.append(output)
  const renderer = new EditorRenderer({ blockTypes: ['paragraph'], injectStyles: false })
  try {
    const sample = editableField(editor, 'sample').querySelector('.grammar-sample')
    equal(sample.style.fontSize, 'var(--expression-size)', 'A valid custom-property reference was stripped')
    equal(getComputedStyle(sample).fontSize, '32px')
    equal(getComputedStyle(sample).color, 'rgb(12, 84, 156)')
    const before = editor.save()
    renderer.renderTo(before, output)
    const rendered = output.querySelector('.grammar-sample')
    equal(rendered.style.fontSize, 'var(--expression-size)')
    equal(getComputedStyle(rendered).fontSize, '32px')
    equal(getComputedStyle(rendered).color, 'rgb(12, 84, 156)')
    equal(JSON.stringify(input), original)
    equal(editor.canUndo, false)
    equal(editor.canRedo, false)
    equal(before.blocks[1], input[1])
  } finally {
    renderer.destroy()
    output.remove()
  }
})

test('CSS comments and escaped names survive canonicalization with declaration precedence intact', () => {
  const html = String.raw`<span class="grammar-sample" style="co\6cor:red!important;color:blue;font-size:var(--missing-size, /* keep ; colon: */ 32px)">Sample</span>`
  const normalized = normalizeRichText(html, document)
  equal(normalizeRichText(normalized, document), normalized, 'Canonical style is not idempotent')
  const host = document.createElement('div')
  document.body.append(host)
  try {
    setSanitizedHtml(host, normalized)
    const sample = host.firstElementChild
    equal(sample.style.getPropertyPriority('color'), 'important')
    equal(getComputedStyle(sample).color, 'rgb(255, 0, 0)')
    equal(getComputedStyle(sample).fontSize, '32px', 'Comment punctuation changed the parsed fallback')
    assert(sample.style.fontSize.includes('var(--missing-size'), 'Valid var fallback disappeared')
  } finally { host.remove() }
})

for (const [style, expected] of [
  ['background:var(--theme-bg);color:red', 'color: red;'],
  ['font:var(--theme-font);color:blue', 'color: blue;'],
  ['background:var(--bg)!important;background-color:blue', ''],
]) test(`Pending shorthand values do not emit invalid empty longhands: ${style}`, () => {
  const host = document.createElement('div')
  setSanitizedHtml(host, `<span class="sample" style="${style}">Sample</span>`)
  equal(host.firstElementChild.getAttribute('style') || '', expected)
  const first = host.innerHTML
  setSanitizedHtml(host, first)
  equal(host.innerHTML, first, 'A second sanitize changed pending shorthand output')
  equal(normalizeRichText(normalizeRichText(first, document), document), normalizeRichText(first, document))
})

test('CSS grammar does not admit additional properties or resource-loading declarations', async () => {
  performance.clearResourceTimings()
  const host = document.createElement('div')
  host.style.cssText = 'font-size:20px;color:rgb(25, 40, 55)'
  document.body.append(host)
  const marker = 'css-grammar-' + crypto.randomUUID()
  const resource = new URL('./inline-style-grammar.html?' + marker, location.href).href
  try {
    setSanitizedHtml(host, String.raw`<span class="sample" style='position:fixed;inset:0;z-index:99999;background-image:url("${resource}");color:u\72l("${resource}");background-color:url("${resource}");font-size:ex\70ression(alert(1))'>Sample</span>`)
    const sample = host.firstElementChild
    equal(sample.getAttribute('style'), null)
    equal(getComputedStyle(sample).position, 'static')
    equal(getComputedStyle(sample).backgroundImage, 'none')
    equal(getComputedStyle(sample).fontSize, '20px')
    setSanitizedHtml(host, `<span class="sample" style='font-size:var(--absent-size,url("${resource}"));color:var(--absent-color,url("${resource}"))'>Sample</span>`)
    equal(getComputedStyle(host.firstElementChild).fontSize, '20px')
    equal(getComputedStyle(host.firstElementChild).color, 'rgb(25, 40, 55)')
    await pause(50)
    equal(performance.getEntriesByType('resource').filter(entry => entry.name === resource).length, 0)
    // Positive control: the same resource is observable if a request is made.
    await (await fetch(resource + '-positive')).text()
    await pause()
    assert(performance.getEntriesByType('resource').some(entry => entry.name === resource + '-positive'))
    equal(performance.getEntriesByType('resource').filter(entry => entry.name === resource).length, 0)
  } finally { host.remove() }
})

test('Only allowed longhands survive shorthand expansion and native cascade precedence', () => {
  const host = document.createElement('div')
  setSanitizedHtml(host, '<span style="font:italic 24px/1.5 serif;background:linear-gradient(red,blue) green;color:red!important;color:blue;color:purple!important">Sample</span>')
  const style = host.firstElementChild.style
  equal(Array.from(style).sort(), ['background-color', 'color', 'font-size'])
  equal(style.fontSize, '24px')
  equal(style.backgroundColor, 'green')
  equal(style.color, 'purple')
  equal(style.getPropertyPriority('color'), 'important')
  const canonical = normalizeRichText(host.innerHTML, document)
  equal(normalizeRichText(canonical, document), canonical)
})

test('A foreign owning document retains its own theme and canonical CSS', () => {
  const frame = document.createElement('iframe')
  document.body.append(frame)
  const foreign = frame.contentDocument
  const host = foreign.createElement('div')
  host.style.cssText = '--expression-size:37px;--expression-color:rgb(18, 52, 86)'
  foreign.body.append(host)
  try {
    const html = '<span class="foreign" style="font-size:var(--expression-size);color:var(--expression-color)">Realm</span>'
    const canonical = normalizeRichText(html, foreign)
    setSanitizedHtml(host, canonical)
    equal(host.firstElementChild.ownerDocument, foreign)
    equal(frame.contentWindow.getComputedStyle(host.firstElementChild).fontSize, '37px')
    equal(frame.contentWindow.getComputedStyle(host.firstElementChild).color, 'rgb(18, 52, 86)')
    equal(normalizeRichText(canonical, foreign), canonical)
  } finally { frame.remove() }
})

await run()
