// Fixed preservation oracles shared by the native candidate fixture and the
// three-source runner. This module adapts public API/wire spelling only.
export const presentationValueCases = [
  ['PRESENTATION_VALUES_FONT_1', '16px', 16],
  ['PRESENTATION_VALUES_FONT_2', '16.5px', 16.5],
  ['PRESENTATION_VALUES_FONT_3', '1.5em', 30],
  ['PRESENTATION_VALUES_FONT_4', '150%', 30],
  ['PRESENTATION_VALUES_FONT_5', '1.5rem', 24],
  ['PRESENTATION_VALUES_FONT_6', 'calc(10px + 1em)', 30],
  ['PRESENTATION_VALUES_FONT_7', '201px', 201],
  ['PRESENTATION_VALUES_FONT_8', '250px', 250],
  ['PRESENTATION_VALUES_FONT_9', 'inherit', 20],
].map(([id, size, pixels]) => ({
  id, size, pixels, selector: 'span[style]',
  html: `<b>Lead</b> <span style="font-size:${size}"><i>Sample</i></span> tail`,
})).concat([
  {
    id: 'PRESENTATION_VALUES_CLASS_SPAN', pixels: 30, selector: 'span.article-accent',
    html: '<b>Lead</b> <span class="article-accent"><i>Sample</i></span> tail',
    color: 'rgb(12, 84, 156)',
  },
  {
    id: 'PRESENTATION_VALUES_CLASS_CODE', pixels: 30, selector: 'code.article-accent',
    html: '<b>Lead</b> <code class="article-accent language-javascript" lang="javascript">const n = 1</code> tail',
    color: 'rgb(12, 84, 156)',
  },
])

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

// Browser parsing normalizes harmless attribute/style serialization. It does
// not call Rector sanitizers or use observed product output as the oracle.
function markupMeaning(html) {
  const template = document.createElement('template')
  template.innerHTML = html
  const visit = node => node.nodeType === Node.TEXT_NODE
    ? node.data
    : {
        tag: node.localName,
        attributes: Object.fromEntries([...node.attributes]
          .map(attribute => [attribute.name, attribute.name === 'style' ? node.style.cssText : attribute.value])
          .sort(([left], [right]) => left.localeCompare(right))),
        children: [...node.childNodes].map(visit),
      }
  return [...template.content.childNodes].map(visit)
}

async function stylesReady() {
  const deadline = Date.now() + 10_000
  while ([...document.querySelectorAll('link[rel="stylesheet"]')].some(link => !link.disabled && !link.sheet)) {
    if (Date.now() > deadline) throw new Error('Presentation fixture styles did not load')
    await delay(20)
  }
  await document.fonts?.ready
}

function caretIn(field) {
  const selection = getSelection()
  const offset = (node, value) => {
    if (!node || !field.contains(node)) return null
    const range = document.createRange()
    range.selectNodeContents(field)
    range.setEnd(node, value)
    return range.toString().length
  }
  return {
    focused: document.activeElement === field,
    anchor: offset(selection.anchorNode, selection.anchorOffset),
    focus: offset(selection.focusNode, selection.focusOffset),
    collapsed: selection.isCollapsed,
  }
}

/** Run one complete FONT/class template through public editor/renderer APIs. */
export async function runPresentationValueCase(specification, { sourceBase, legacy = false, typeText, shortcut }) {
  const base = new URL(sourceBase, import.meta.url)
  const [{ createEditor }, paragraphModule, { EditorRenderer }] = await Promise.all([
    import(new URL('core/index.js', base).href),
    import(new URL('plugins/paragraph/index.js', base).href),
    import(new URL('renderer/index.js', base).href),
  ])
  const record = (id, text) => ({ id, type: 'paragraph', ...(!legacy ? { dataVersion: 2 } : {}), data: { text } })
  const documentData = {
    version: legacy ? '1.0.5' : '2.0.0',
    blocks: [record('sample', specification.html), record('sentinel', '<s>Untouched</s>')],
  }
  const originalInput = JSON.stringify(documentData)
  const rootFont = document.documentElement.style.fontSize
  const style = document.createElement('style')
  // Built-in styles are enabled. Deliberate host rules establish the exact
  // template bases and give the benign class sufficient cascade specificity.
  style.textContent = `
    .presentation-values-host { width:600px; max-width:100%; font-size:20px; }
    .presentation-values-host .oe-paragraph,
    .presentation-values-host .editor-paragraph { font-size:20px; }
    .presentation-values-host span.article-accent,
    .presentation-values-host code.article-accent { color:rgb(12,84,156); font-size:1.5em; }
  `
  document.head.append(style)
  document.documentElement.style.fontSize = '16px'
  const holder = document.createElement('section')
  const renderedHolder = document.createElement('section')
  holder.className = renderedHolder.className = 'presentation-values-host'
  document.body.append(holder, renderedHolder)
  let editor, renderer
  const observations = [], phases = [], trusted = []
  const check = (phase, property, actual, expected) => observations.push({
    phase, property, status: JSON.stringify(actual) === JSON.stringify(expected) ? 'PASS' : 'FAIL', actual, expected,
  })
  try {
    const paragraph = legacy ? new paragraphModule.Paragraph() : paragraphModule.createParagraphPlugin()
    editor = createEditor({ holder, plugins: [paragraph], inlineTools: [], inlinePlugins: [], injectStyles: true, data: documentData })
    renderer = new EditorRenderer({ blockTypes: ['paragraph'], injectStyles: true })
    const block = id => holder.querySelector(`[data-block-id="${id}"]`)
    const field = () => block('sample').querySelector('[contenteditable="true"]')
    const sentinel = block('sentinel')
    for (const type of ['beforeinput', 'input', 'keydown']) holder.addEventListener(type, event => {
      trusted.push({ type, key: event.key ?? null, inputType: event.inputType ?? null, trusted: event.isTrusted })
    }, { capture: true })
    await stylesReady()
    const originalField = field()
    const expectedContent = document.createElement('template')
    expectedContent.innerHTML = specification.html
    const initialOffset = expectedContent.content.textContent.length
    originalField.focus()
    const range = document.createRange()
    range.selectNodeContents(originalField)
    range.collapse(false)
    getSelection().removeAllRanges()
    getSelection().addRange(range)
    const snapshots = {}
    async function inspect(phase, html, offset, history) {
      const saved = editor.save()
      snapshots[phase] = saved.blocks
      const expected = [record('sample', html), record('sentinel', '<s>Untouched</s>')]
      // Compare all canonical record metadata as well as the independently
      // specified text/marks/classes/lang. Only harmless HTML spelling varies.
      const canonical = blocks => blocks.map(block => ({ ...block, data: { ...block.data, text: markupMeaning(block.data.text) } }))
      check(phase, 'canonicalRecords', canonical(saved.blocks), canonical(expected))
      check(phase, 'inputDocumentUnchanged', JSON.stringify(documentData), originalInput)
      check(phase, 'editorMarkup', markupMeaning(field().innerHTML), markupMeaning(html))
      check(phase, 'historyState', { canUndo: editor.canUndo, canRedo: editor.canRedo }, history)
      check(phase, 'nativeSelection', caretIn(field()), { focused: true, anchor: offset, focus: offset, collapsed: true })
      check(phase, 'neighborDomIdentity', block('sentinel') === sentinel, true)
      renderer.renderTo(saved, renderedHolder)
      await stylesReady()
      const rendered = [...renderedHolder.querySelectorAll('.editor-paragraph')]
      check(phase, 'rendererBlockCount', rendered.length, 2)
      check(phase, 'rendererMarkup', rendered[0] ? markupMeaning(rendered[0].innerHTML) : null, markupMeaning(html))
      check(phase, 'rendererNeighborMarkup', rendered[1] ? markupMeaning(rendered[1].innerHTML) : null, markupMeaning('<s>Untouched</s>'))
      const css = element => {
        if (!element) return null
        const sample = element.querySelector(specification.selector)
        return {
          base: parseFloat(getComputedStyle(element).fontSize),
          root: parseFloat(getComputedStyle(document.documentElement).fontSize),
          sample: sample ? parseFloat(getComputedStyle(sample).fontSize) : null,
          ...(specification.color ? { color: sample ? getComputedStyle(sample).color : null } : {}),
        }
      }
      const expectedCss = { base: 20, root: 16, sample: specification.pixels, ...(specification.color ? { color: specification.color } : {}) }
      const editorCss = css(field()), rendererCss = css(rendered[0])
      check(phase, 'editorCssMeaning', editorCss, expectedCss)
      check(phase, 'rendererCssMeaning', rendererCss, expectedCss)
      phases.push({ phase, saved: saved.blocks, editorHtml: field().innerHTML, rendererHtml: rendered[0]?.innerHTML, editorCss, rendererCss, selection: caretIn(field()) })
    }
    await inspect('load-save-render', specification.html, initialOffset, { canUndo: false, canRedo: false })
    await typeText('X')
    await delay(30)
    await inspect('neighbor-edit', specification.html + 'X', initialOffset + 1, { canUndo: true, canRedo: false })
    check('neighbor-edit', 'trustedAuthoredInput', trusted.some(event => event.type === 'input' && event.inputType === 'insertText' && event.trusted), true)
    await shortcut('undo')
    await delay(30)
    await inspect('undo', specification.html, initialOffset, { canUndo: false, canRedo: true })
    check('undo', 'exactOriginalRecords', snapshots.undo, snapshots['load-save-render'])
    await shortcut('redo')
    await delay(30)
    await inspect('redo', specification.html + 'X', initialOffset + 1, { canUndo: true, canRedo: false })
    check('redo', 'exactEditedRecords', snapshots.redo, snapshots['neighbor-edit'])
    check('redo', 'trustedHistoryShortcuts', trusted.filter(event => event.type === 'keydown' && event.key.toLowerCase() === 'z').map(event => event.trusted), [true, true])
    return { id: specification.id, phases, trusted, observations, failures: observations.filter(observation => observation.status !== 'PASS') }
  } finally {
    renderer?.destroy()
    editor?.destroy()
    holder.remove()
    renderedHolder.remove()
    style.remove()
    document.documentElement.style.fontSize = rootFont
  }
}
