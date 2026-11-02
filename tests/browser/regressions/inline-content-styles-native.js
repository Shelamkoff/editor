import { createEditor } from '../../../core/index.js'
import { createParagraphPlugin } from '../../../plugins/paragraph/index.js'
import { createMentionPlugin, createMentionRenderer } from '../../../inline-plugins/mention/index.js'
import { EditorRenderer } from '../../../renderer/index.js'
import { test, assert, equal, pause, run } from './harness.js'
import { clickNative, printable, dispatchKey } from '../native-input-helpers.js'
import { toTrustedHtml } from '../../../shared/sanitize/trustedHtml.js'
import { pollDerivedFixture } from '../poll-derived-fixture.js'
import { createParagraphRenderer } from '../../../renderer/renderers/paragraph/index.js'

for (const editing of [true, false]) test(`${editing ? 'Editor' : 'Renderer'}: explicit author classes retain typography, literal tokens and a reachable host action`, async () => {
  const holder = document.createElement('section'); document.querySelector('#fixtures').append(holder)
  const source = '<span class="article-accent app-screen-cover">j</span> tail <span class="oe-inline-literal">{{mention}}</span> {{mention}} end'
  const data = { version: '2.0.0', blocks: [{ id: 'p', type: 'paragraph', dataVersion: 2, data: { text: source },
    inline: { mention: { type: 'mention', dataVersion: 1, data: { id: 'ada', name: 'Ada' } } } }] }
  const before = structuredClone(data), originalSheets = [...document.styleSheets], originalAdopted = [...document.adoptedStyleSheets]
  const contentStyles = [':scope{font:20px serif}.article-accent{font:italic 201px serif;color:rgb(12,84,156)}button{font-size:200px!important}']
  const action = document.querySelector('#host-action'), originalButtonFont = getComputedStyle(action).fontSize
  let editor, renderer, clicks = 0, trusted = false
  const clicked = event => { clicks++; trusted = event.isTrusted }
  action.addEventListener('click', clicked)
  const view = () => {
    const author = holder.querySelector('span[*|class~="article-accent"]')
    assert(author, 'The author class was removed from displayed content')
    const style = getComputedStyle(author)
    equal(style.position, 'static', 'An author class activated a host interface rule')
    equal(style.fontSize, '201px'); equal(style.fontStyle, 'italic'); equal(style.color, 'rgb(12, 84, 156)')
    equal(holder.querySelectorAll('[data-inline-plugin="mention"]').length, 1)
    equal(holder.querySelector('span[*|class~="oe-inline-literal"]').textContent, '{{mention}}')
    equal(getComputedStyle(action).fontSize, originalButtonFont, 'Content CSS escaped into host UI')
  }
  try {
    if (editing) editor = createEditor({ holder, data, contentStyles, injectStyles: false,
      plugins: [createParagraphPlugin({ injectStyles: false })], inlinePlugins: [createMentionPlugin({ searchFunction: async () => [] })] })
    else { renderer = new EditorRenderer({ blockTypes: ['paragraph'], contentStyles, injectStyles: false, inlineRenderers: [createMentionRenderer()] }); renderer.renderTo(data, holder) }
    await document.fonts.ready; view()
    await clickNative(action); equal(clicks, 1); assert(trusted, 'The real host button was covered')
    if (editor) {
      editor.setReadOnly(true); view(); editor.setReadOnly(false); view()
      editor.blocks.focus('p', { fieldKey: 'text', offset: 'end' })
      await printable('X'); equal(editor.save().blocks, [{ ...data.blocks[0], data: { text: source + 'X' } }]); view()
      await dispatchKey('z', 'KeyZ', 90, 2); equal(editor.save().blocks, data.blocks); view()
      await dispatchKey('z', 'KeyZ', 90, 10); equal(editor.save().blocks, [{ ...data.blocks[0], data: { text: source + 'X' } }]); view()
    } else {
      const changed = { ...data, blocks: [{ ...data.blocks[0], data: { text: source + ' updated' } }] }
      renderer.renderTo(changed, holder); view()
    }
    equal(data, before)
  } finally {
    editor?.destroy(); renderer?.destroy(); holder.remove(); action.removeEventListener('click', clicked)
    await pause()
    assert(document.styleSheets.length === originalSheets.length && [...document.styleSheets].every((sheet, index) => sheet === originalSheets[index]), 'Disposed content retained stylesheet nodes')
    assert(document.adoptedStyleSheets.length === originalAdopted.length && document.adoptedStyleSheets.every((sheet, index) => sheet === originalAdopted[index]), 'Disposed content retained adopted sheets')
  }
})

const selectorCases = [
  ['ordinary', '.article-accent', '<span class="article-accent app-screen-cover">j</span>'],
  ['is-not', ':is(.a,.b):not(.bad)', '<span class="a app-screen-cover">j</span>'],
  ['string-dot', '[class~="ui.cover"]', '<span class="ui.cover app-screen-cover">j</span>'],
  ['operator-dash', '[class|=article]', '<span class="article-accent app-screen-cover">j</span>'],
  ['explicit-null', '[|class*=article i]', '<span class="ARTICLE-accent app-screen-cover">j</span>'],
  ['wildcard', '[*|class~=article]', '<span class="article app-screen-cover">j</span>'],
  ['escaped-attribute', '[\\63 lass~="article-accent"]', '<span class="article-accent app-screen-cover">j</span>'],
  ['code-and-lang', 'code.language-javascript[lang="js"]', '<code class="language-javascript app-screen-cover" lang="js">j</code>'],
  ['nth-of', ':nth-child(2n of .a,.b)', '<span class="a">first</span><span class="b app-screen-cover">j</span>'],
  ['escape-terminator', '.foo\\31 .bar', '<span class="foo1 bar app-screen-cover">j</span>'],
  ['escape-descendant', '.foo\\31  .bar', '<span class="foo1"><span class="bar app-screen-cover">j</span></span>'],
  ['escaped-dot', '.foo\\.bar', '<span class="foo.bar app-screen-cover">j</span>'],
  ['escaped-digit', '.\\31 23', '<span class="123 app-screen-cover">j</span>'],
  ['uppercase-attribute', '[CLASS^="article"]', '<span class="article-accent app-screen-cover">j</span>'],
  ['descendant-has', 'span:has(>.child) .child', '<span class="parent"><span class="child app-screen-cover">j</span></span>'],
  ['multiple-specificity', '.a.b,.unused', '<span class="a b app-screen-cover">j</span>'],
]

async function withNativeContent(html, css, inspect) {
  const holder = document.createElement('section'); document.querySelector('#fixtures').append(holder)
  const frame = document.createElement('iframe')
  frame.setAttribute('sandbox', 'allow-same-origin'); frame.style.cssText = 'position:absolute;left:-20000px;width:600px;height:400px'
  document.body.append(frame)
  const renderer = new EditorRenderer({ blockTypes: ['paragraph'], contentStyles: [css], injectStyles: false })
  try {
    const doc = frame.contentDocument
    doc.documentElement.style.fontSize = '16px'; doc.body.style.font = '20px serif'
    const style = doc.createElement('style'); style.textContent = '@scope (#reference-root){' + css + '}'
    doc.head.append(style)
    const reference = doc.createElement('p'); reference.id = 'reference-root'
    const template = doc.createElement('template'); template.innerHTML = toTrustedHtml(html, doc)
    reference.append(template.content); doc.body.append(reference)
    renderer.renderTo({ version: '2.0.0', blocks: [{ id: 'p', type: 'paragraph', dataVersion: 2, data: { text: html } }] }, holder)
    await inspect({ reference, holder, doc, renderer })
  } finally { renderer.destroy(); holder.remove(); frame.remove() }
}

const readStyles = root => [...root.querySelectorAll('span,code')].map(element => {
      const computed = element.ownerDocument.defaultView.getComputedStyle(element)
      return { color: computed.color, font: computed.fontSize, fontStyle: computed.fontStyle, position: computed.position }
})

for (const [name, selector, html] of selectorCases) test(`Renderer: ${name} matches independent native author CSS`, async () => {
  const css = ':scope{font:20px serif}' + selector + '{color:rgb(12,84,156);font:italic 201px serif}'
  await withNativeContent(html, css, ({ reference, holder }) => {
    const expected = readStyles(reference)
    assert(expected.some(style => style.color === 'rgb(12, 84, 156)'), 'The independent positive selector did not match')
    equal(readStyles(holder), expected, 'Production contentStyles differs from native CSS')
  })
})

const conditionalCases = [
  ['nested layer', '@layer article{.wrapper{& > .article-accent{color:rgb(12,84,156);font-size:73px}}}'],
  ['nested scope and limit', '@scope (.wrapper) to (.stop){.article-accent{color:rgb(12,84,156);font-size:73px}}'],
  ['supports and media', '@supports selector(:has(*)){@media(min-width:1px){.article-accent{color:rgb(12,84,156);font-size:73px}}}'],
  ['inherited custom property', ':scope{--article-size:calc(1em + 1rem)}.article-accent{font-size:var(--article-size);color:rgb(12,84,156)}'],
  ['container query', ':scope{container-type:inline-size;container-name:article}@container article (min-width:200px){.article-accent{color:rgb(12,84,156);font-size:73px}}'],
]
for (const [name, rules] of conditionalCases) test(`Renderer: ${name} preserves native content CSS meaning`, async () => {
  const html = '<span class="wrapper"><span class="article-accent">j</span><span class="stop"><span class="article-accent">k</span></span></span>'
  await withNativeContent(html, ':scope{font:20px serif}' + rules, ({ reference, holder }) => {
    const expected = readStyles(reference)
    assert(expected.some(style => style.color === 'rgb(12, 84, 156)'), 'Native rule positive control did not match')
    equal(readStyles(holder), expected)
  })
})

test('Renderer: scoped keyframes animate author typography like native CSS', async () => {
  const css = ':scope{font:20px serif}@keyframes article-grow{from{font-size:20px}to{font-size:60px}}.article-accent{animation:article-grow 1s linear both}'
  await withNativeContent('<span class="article-accent">j</span>', css, ({ reference, holder }) => {
    const expected = reference.getAnimations({ subtree: true }), actual = holder.getAnimations({ subtree: true })
    equal(expected.length, 1, 'Native scoped keyframes did not start'); equal(actual.length, expected.length)
    for (const animation of [...expected, ...actual]) { animation.pause(); animation.currentTime = 500 }
    equal(readStyles(reference)[0].font, '40px'); equal(readStyles(holder), readStyles(reference))
  })
})

test('Renderer: scoped font-face loads and preserves actual author glyph width', async () => {
  const css = '@font-face{font-family:RectorAuditMono;src:local("Courier New")} .article-accent{font:73px RectorAuditMono}'
  await withNativeContent('<span class="article-accent">jMWii</span>', css, async ({ reference, holder, doc }) => {
    await Promise.all([doc.fonts.ready, document.fonts.ready])
    const faces = owner => [...owner.fonts].filter(face => face.family === 'RectorAuditMono').map(face => face.status)
    equal(faces(doc), ['loaded'], 'Independent native font resource did not load')
    equal(faces(document), ['loaded'], 'Production content font resource did not load')
    const expected = reference.querySelector('span').getBoundingClientRect().width
    const actual = holder.querySelector('span').getBoundingClientRect().width
    assert(expected > 100 && Math.abs(actual - expected) < 0.02, 'Content font glyphs differ from native loaded font')
  })
  assert([...document.fonts].every(face => face.family !== 'RectorAuditMono'), 'Disposed CSS retained its font-face registration')
})

test('Poll: completed result labels retain explicit content typography through runtime changes and modes', async () => {
  const h = await pollDerivedFixture({ contentStyles: ['.answer-emphasis{color:rgb(12,84,156)}'] })
  const color = root => getComputedStyle(root.querySelector('span[*|class~="answer-emphasis"]')).color
  try {
    equal(color(h.field()), 'rgb(12, 84, 156)')
    equal(color(h.result()), 'rgb(12, 84, 156)', 'Completed result label lost explicit content CSS')
    h.root().querySelector('.oe-poll__choice[data-option-id="first"]').click()
    equal(color(h.result()), 'rgb(12, 84, 156)', 'Runtime-only replacement lost content CSS')
    for (const mode of [true, false]) {
      h.editor.setReadOnly(mode)
      equal(color(h.result()), 'rgb(12, 84, 156)', 'Mode replacement lost content CSS')
    }
    assert(!h.editor.canUndo && h.transactions.length === 0)
  } finally { h.dispose() }
})

test('Renderer: independent content style owners and manual leases release only their own sheets', async () => {
  const holders = [document.createElement('section'), document.createElement('section')]
  document.querySelector('#fixtures').append(...holders)
  const before = [...document.adoptedStyleSheets]
  const renderers = ['rgb(12,84,156)', 'rgb(156,84,12)'].map(color => new EditorRenderer({
    blockTypes: ['paragraph'], injectStyles: false, contentStyles: [`.article-accent{color:${color}}`],
  }))
  const manual = renderers[0].injectStyles(document)
  const data = { version: '2.0.0', blocks: [{ id: 'p', type: 'paragraph', dataVersion: 2, data: { text: '<span class="article-accent">j</span>' } }] }
  const color = holder => getComputedStyle(holder.querySelector('span')).color
  try {
    renderers.forEach((renderer, index) => renderer.renderTo(data, holders[index]))
    equal(document.adoptedStyleSheets.length, before.length + 2, 'Automatic/manual leases duplicated sheets')
    equal(holders.map(color), ['rgb(12, 84, 156)', 'rgb(156, 84, 12)'])
    manual.destroy(); manual.destroy()
    equal(document.adoptedStyleSheets.length, before.length + 2, 'Manual release retired a live automatic owner')
    renderers[0].destroy()
    equal(document.adoptedStyleSheets.length, before.length + 1)
    equal(color(holders[1]), 'rgb(156, 84, 12)', 'Old owner retired its sibling CSS')
  } finally {
    manual.destroy(); renderers.forEach(renderer => renderer.destroy()); holders.forEach(holder => holder.remove())
    equal([...document.adoptedStyleSheets], before)
  }
})

test('Renderer: foreign-document output uses its actual realm and releases only that document lease', () => {
  const frame = document.createElement('iframe'); frame.setAttribute('sandbox', 'allow-same-origin'); document.body.append(frame)
  const doc = frame.contentDocument, foreign = doc.createElement('section'), local = document.createElement('section')
  doc.body.append(foreign); document.querySelector('#fixtures').append(local)
  const hostStyle = doc.createElement('style'); hostStyle.textContent = '.app-screen-cover{position:fixed;inset:0}'
  doc.head.append(hostStyle)
  const originalLocal = [...document.adoptedStyleSheets], originalForeign = [...doc.adoptedStyleSheets]
  const renderer = new EditorRenderer({ blockTypes: ['paragraph'], injectStyles: false,
    contentStyles: ['.article-accent{font-size:73px;color:rgb(12,84,156)}'] })
  const data = { version: '2.0.0', blocks: [{ id: 'p', type: 'paragraph', dataVersion: 2, data: { text: '<span class="article-accent app-screen-cover">j</span>' } }] }
  const check = root => {
    const author = root.querySelector('span'), view = author.ownerDocument.defaultView, css = view.getComputedStyle(author)
    equal(css.fontSize, '73px'); equal(css.color, 'rgb(12, 84, 156)'); equal(css.position, 'static')
  }
  try {
    renderer.renderTo(data, local); renderer.renderTo(data, foreign); check(local); check(foreign)
    const foreignSheets = [...doc.adoptedStyleSheets]
    equal(foreignSheets.length, originalForeign.length + 1)
    assert(foreignSheets.at(-1) instanceof frame.contentWindow.CSSStyleSheet, 'CSS was borrowed from another realm')
    renderer.destroy(local)
    equal([...document.adoptedStyleSheets], originalLocal); equal([...doc.adoptedStyleSheets], foreignSheets); check(foreign)
    renderer.destroy(foreign); equal([...doc.adoptedStyleSheets], originalForeign)
  } finally { renderer.destroy(); local.remove(); frame.remove() }
})

test('Renderer: failed content-field admission cannot keep styling a retired output', () => {
  const holder = document.createElement('section'), foreign = document.createElement('aside')
  document.querySelector('#fixtures').append(holder, foreign)
  const renderer = new EditorRenderer({ blockTypes: ['paragraph'], injectStyles: false,
    contentStyles: ['.article-accent{color:rgb(12,84,156)}'] })
  const failure = new Error('content field admission failed'), original = createParagraphRenderer('editor', {})
  let retired, destroys = 0
  renderer.registerRenderer({ ...original, render(...args) {
    retired = original.render(...args)
    const set = retired.setAttribute.bind(retired)
    retired.setAttribute = (name, value) => {
      set(name, value)
      if (name === 'data-oe-content-field') throw failure
    }
    return retired
  }, destroy() { destroys++ } })
  const manual = renderer.injectStyles(document)
  try {
    let observed
    try { renderer.renderTo({ version: '2.0.0', blocks: [{ id: 'p', type: 'paragraph', dataVersion: 2,
      data: { text: '<span class="article-accent">Retired author content</span>' } }] }, holder) } catch (error) { observed = error }
    equal(observed, failure); equal(destroys, 1); equal(holder.childNodes.length, 0)
    foreign.append(retired)
    assert(getComputedStyle(retired.querySelector('span')).color !== 'rgb(12, 84, 156)', 'Failed output retained a live content-style scope')
  } finally { renderer.destroy(); manual.destroy(); holder.remove(); foreign.remove() }
})

await run()
