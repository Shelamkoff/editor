// Public-boundary ROUNDTRIP cases. Expected author data is fixed independently
// of the editor's initial save and translated only for the historical wire API.
const paragraph = {
  type: 'paragraph', version: 2, className: 'Paragraph',
  fieldSelector: '.oe-paragraph',
  defaultData: { text: '' },
  populatedData: { text: '<b>Alpha</b> <i>{{mention}}</i> <s>{{swatch}}</s> tail' },
}
const heading = {
  type: 'heading', version: 2, className: 'Heading',
  fieldSelector: '.oe-heading',
  defaultData: { text: '', level: 2 },
  populatedData: { text: '<b>Alpha</b> <i>{{mention}}</i> <s>{{swatch}}</s> tail', level: 3 },
}
const list = {
  type: 'list', version: 2, className: 'List',
  fieldSelector: '.oe-list__item',
  defaultData: { style: 'unordered', items: [{ id: 'item-0', text: '' }] },
  populatedData: { style: 'ordered', items: [
    { id: 'first', text: '<b>Alpha</b> <i>{{mention}}</i> <s>{{swatch}}</s> tail' },
    { id: 'second', text: '<mark>Second item</mark>' },
  ] },
}
const checklist = {
  type: 'checklist', version: 2, className: 'Checklist',
  fieldSelector: '.oe-checklist__text', fieldTag: 'DIV',
  defaultData: { items: [{ id: 'item-0', text: '', checked: false }] },
  populatedData: { items: [
    { id: 'first', text: '<b>Alpha</b> <i>{{mention}}</i> <s>{{swatch}}</s> tail', checked: true },
    { id: 'second', text: '<mark>Second item</mark>', checked: false },
  ] },
}
const quote = {
  type: 'quote', version: 1, className: 'Quote',
  fieldSelector: '.oe-quote__text',
  defaultData: { text: '', caption: '' },
  populatedData: { text: '<b>Alpha</b> <i>{{mention}}</i> tail', caption: '<mark>Attribution</mark> <s>{{swatch}}</s>' },
  unwrappedData: { text: '<b>Alpha</b> {{mention}} tail', caption: '<mark>Attribution</mark> {{swatch}}' },
}
const warning = {
  type: 'warning', version: 1, className: 'Warning', textKey: 'title',
  fieldSelector: '.oe-warning__title',
  defaultData: { title: '', message: '' },
  populatedData: { title: '<b>Alpha</b> <i>{{mention}}</i> tail', message: '<mark>Message</mark> <s>{{swatch}}</s>' },
  unwrappedData: { title: '<b>Alpha</b> {{mention}} tail', message: '<mark>Message</mark> {{swatch}}' },
}

const toggle = {
  type: 'toggle', version: 1, className: 'Toggle', textKey: 'title',
  fieldSelector: '.oe-toggle__title', fieldTag: 'DIV',
  defaultData: { title: '', content: '', open: false },
  populatedData: { title: '<b>Alpha</b> <i>{{mention}}</i> tail', content: '<mark>Body</mark> <s>{{swatch}}</s>', open: true },
  unwrappedData: { title: '<b>Alpha</b> {{mention}} tail', content: '<mark>Body</mark> {{swatch}}', open: true },
}

const spoiler = {
  type: 'spoiler', version: 1, className: 'Spoiler', textKey: 'label',
  fieldSelector: '.oe-spoiler__label', fieldTag: 'DIV',
  defaultData: { label: '', content: '' },
  populatedData: { label: '<b>Alpha</b> <i>{{mention}}</i> tail', content: '<mark>Secret</mark> <s>{{swatch}}</s>' },
  unwrappedData: { label: '<b>Alpha</b> {{mention}} tail', content: '<mark>Secret</mark> {{swatch}}' },
}

const columns = {
  type: 'columns', version: 2, className: 'Columns',
  fieldSelector: '.oe-columns__col', fieldTag: 'DIV',
  defaultData: { layout: '1-1', columns: [{ id: 'column-0', content: '' }, { id: 'column-1', content: '' }] },
  populatedData: { layout: '1-2', columns: [
    { id: 'first', content: '<b>Alpha</b> <i>{{mention}}</i> tail' },
    { id: 'second', content: '<mark>Second column</mark> <s>{{swatch}}</s>' },
  ] },
  unwrappedData: { layout: '1-2', columns: [
    { id: 'first', content: '<b>Alpha</b> {{mention}} tail' },
    { id: 'second', content: '<mark>Second column</mark> {{swatch}}' },
  ] },
}

const attaches = {
  type: 'attaches', version: 2, className: 'Attaches', fieldMode: 'plain-text', plainContenteditable: true,
  fieldSelector: '.oe-attaches__name', fieldTag: 'DIV',
  defaultData: { files: [], variant: 'f' },
  populatedData: { variant: 'f', files: [
    { id: 'first', url: 'https://example.test/manual.pdf', name: 'Manual <&> {{literal}}.pdf', extension: 'pdf', size: 2048 },
    { id: 'second', url: 'https://example.test/notes.txt', name: 'Appendix & notes.txt', extension: 'txt', size: 4096 },
  ] },
}

const raw = {
  type: 'raw', version: 1, className: 'Raw', textKey: 'html', fieldMode: 'plain-text',
  fieldSelector: '.oe-raw__textarea',
  defaultData: { html: '' },
  populatedData: { html: '<section><b>Alpha</b> &amp; {{literal}}</section>\n<p><em>Tail</em> &lt;safe&gt;</p>' },
}

const code = {
  type: 'code', version: 1, className: 'Code', textKey: 'code', fieldMode: 'plain-text',
  fieldSelector: '.oe-code-textarea',
  defaultData: { code: '', language: 'auto' },
  populatedData: { code: 'const tag = "<b>&copy;</b>";\nconsole.log(tag); // {{literal}}', language: 'javascript' },
}

// Valid one-pixel PNG; no network or provider is involved in media loading.
const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGPwKZz9HwAEvQJYppltbwAAAABJRU5ErkJggg=='
const image = {
  type: 'image', version: 1, className: 'Image', textKey: 'caption', literalCaption: true,
  fieldSelector: '.oe-image__caption', fieldTag: 'DIV',
  defaultData: { file: { url: '' }, caption: '', withBorder: false, expanded: false, withBackground: false, styles: {} },
  populatedData: { file: { url: pixel, width: 1, height: 1 }, caption: '<b>Alpha</b> <i>caption</i> tail',
    withBorder: true, expanded: false, withBackground: true,
    styles: { width: '120px', height: '64px', objectFit: 'contain', objectPosition: 'center',
      borderStyle: 'dashed', borderWidth: '2px', borderColor: '#123456', borderRadius: '6px', backgroundColor: '#ffeecc' },
  },
}

const embed = {
  type: 'embed', version: 1, className: 'Embed', textKey: 'caption',
  fieldSelector: '.oe-embed__caption', fieldTag: 'DIV',
  defaultData: { service: '', videoId: '', caption: '', cover: '', title: '', duration: '' },
  populatedData: { service: 'vimeo', videoId: '12345678',
    caption: '<b>Alpha</b> <i>{{mention}}</i> <s>{{swatch}}</s> tail',
    cover: pixel, title: 'Local preview', duration: '1:23' },
}

const delimiter = {
  type: 'delimiter', version: 1, className: 'Delimiter', noEditableField: true,
  defaultData: {}, populatedData: {}, neighborText: '<b>Before</b> tail',
}

const withEditedText = (block, data, text) => block.noEditableField ? { ...data } : ['list', 'checklist'].includes(block.type)
  ? { ...data, items: data.items.map((item, index) => index ? { ...item } : { ...item, text }) }
  : block.type === 'columns' ? { ...data, columns: data.columns.map((column, index) => index ? { ...column } : { ...column, content: text }) }
  : block.type === 'attaches' ? { ...data, files: data.files.map((file, index) => index ? { ...file } : { ...file, name: text }) }
  : { ...data, [block.textKey ?? 'text']: text }
const listItemText = item => typeof item === 'string' ? item : item.text

export const blockRoundtripCases = [paragraph, heading, list, quote, warning, code, checklist, delimiter, image, toggle, spoiler, columns, attaches, raw, embed].flatMap(block => {
  const prefix = 'BLOCK_' + block.type.toUpperCase() + '_ROUNDTRIP/'
  if (block.noEditableField) return [
    { ...block, populated: false, id: prefix + 'default' },
    { ...block, populated: true, id: prefix + 'populated-neighbor-edit' },
  ]
  return [false, true].map(populated => ({
    ...block, populated, id: prefix + (populated ? 'populated' : 'default'),
  })).concat(block.fieldMode === 'plain-text' || block.literalCaption ? [] : [{
    ...block, populated: true, id: prefix + 'populated-unwrapped-control',
    populatedData: block.unwrappedData ?? withEditedText(block, block.populatedData, '<b>Alpha</b> {{mention}} {{swatch}} tail'),
  }]).concat(block.type === 'toggle' ? [{ ...block, populated: true, id: prefix + 'populated-closed',
    populatedData: { ...block.populatedData, open: false },
  }] : []).concat(block.type === 'embed' ? [{ ...block, populated: true, literalCaption: true, id: prefix + 'populated-literal',
    populatedData: { ...block.populatedData, caption: '<b>Alpha</b> <i>caption</i> tail' },
  }] : [])
})

const pause = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms))
const clone = value => JSON.parse(JSON.stringify(value))
const stable = value => {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]))
  return value
}

function markupMeaning(html) {
  const template = document.createElement('template')
  template.innerHTML = html
  const visit = node => node.nodeType === Node.TEXT_NODE ? node.data : {
    tag: node.localName,
    attributes: Object.fromEntries([...node.attributes].map(attribute => [attribute.name,
      attribute.name === 'style' ? node.style.cssText : attribute.value]).sort(([a], [b]) => a.localeCompare(b))),
    children: [...node.childNodes].map(visit),
  }
  return [...template.content.childNodes].map(visit)
}

function authoredMarkup(field) {
  const copy = field.cloneNode(true)
  for (const widget of copy.querySelectorAll('[data-inline-plugin]')) {
    widget.replaceWith(document.createTextNode('{{' + widget.getAttribute('data-id') + '}}'))
  }
  return markupMeaning(copy.innerHTML)
}

function logicalLength(html) {
  const template = document.createElement('template')
  template.innerHTML = html.replace(/\{\{[\w-]+\}\}/g, '\uFFFC')
  return template.content.textContent.length
}

function caretIn(field) {
  if (field.tagName === 'TEXTAREA') return {
    focused: document.activeElement === field,
    anchor: field.selectionDirection === 'backward' ? field.selectionEnd : field.selectionStart,
    focus: field.selectionDirection === 'backward' ? field.selectionStart : field.selectionEnd,
    collapsed: field.selectionStart === field.selectionEnd,
  }
  const selection = getSelection()
  const point = (node, offset) => {
    if (!node || !field.contains(node)) return null
    const range = document.createRange()
    range.selectNodeContents(field)
    range.setEnd(node, offset)
    const fragment = range.cloneContents()
    for (const widget of fragment.querySelectorAll('[data-inline-plugin]')) widget.replaceWith(document.createTextNode('\uFFFC'))
    return fragment.textContent.length
  }
  return { focused: document.activeElement === field, anchor: point(selection.anchorNode, selection.anchorOffset),
    focus: point(selection.focusNode, selection.focusOffset), collapsed: selection.isCollapsed }
}

function nativeSelectionOwner() {
  const selection = getSelection()
  const point = (node, offset) => {
    const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement
    return { block: element?.closest('[data-block-id]')?.dataset.blockId ?? null,
      node: node?.nodeName ?? null, text: node?.textContent ?? null, offset }
  }
  return {
    active: { block: document.activeElement?.closest('[data-block-id]')?.dataset.blockId ?? null,
      node: document.activeElement?.nodeName ?? null, className: document.activeElement?.className ?? null },
    anchor: point(selection.anchorNode, selection.anchorOffset),
    focus: point(selection.focusNode, selection.focusOffset),
  }
}

async function settled() {
  const deadline = Date.now() + 10_000
  while ([...document.querySelectorAll('link[rel="stylesheet"]')].some(link => !link.disabled && !link.sheet)) {
    if (Date.now() > deadline) throw new Error('Roundtrip styles did not load')
    await pause(20)
  }
  await document.fonts?.ready
  // Perpetual decorative animations have no finished state. Preserve waiting
  // for finite transitions and animations before observing the settled DOM.
  const animations = document.getAnimations().filter(animation => animation.effect?.getComputedTiming().endTime !== Infinity)
  await Promise.all(animations.map(animation => animation.finished.catch(() => {})))
  await pause(20)
}

export async function runBlockRoundtripCase(specification, { sourceBase, legacy = false, focusField, typeText, shortcut, onPhase }) {
  const noEditableField = specification.noEditableField === true
  const emptyImage = specification.type === 'image' && !specification.populated
  const emptyAttaches = specification.type === 'attaches' && !specification.populated
  const emptyEmbed = specification.type === 'embed' && !specification.populated
  const hasAuthoring = (!noEditableField || specification.populated) && !emptyImage && !emptyAttaches && !emptyEmbed
  const hasSidecars = !noEditableField && specification.fieldMode !== 'plain-text' && !specification.literalCaption
  const plannedPhases = ['load', 'read-only', 'editable-again', ...(hasAuthoring ? ['edit', 'undo', 'redo'] : []), 'dispose']
  const phaseScope = noEditableField ? {
    authoringTarget: specification.populated ? { blockId: 'prefix', type: 'paragraph', relation: 'neighbor' } : null,
    notApplicablePhases: hasAuthoring ? [] : ['edit', 'undo', 'redo'],
    reason: 'Delimiter has no editable field; only the populated case edits a real neighboring Paragraph.',
  } : emptyImage ? { authoringTarget: null, notApplicablePhases: ['edit', 'undo', 'redo'],
    reason: 'Image without a source has no declared editable caption; authoring/history are covered by the populated image case.',
  } : emptyAttaches ? { authoringTarget: null, notApplicablePhases: ['edit', 'undo', 'redo'],
    reason: 'Attaches with no files has no declared editable filename; authoring/history are covered by the populated files case.',
  } : emptyEmbed ? { authoringTarget: null, notApplicablePhases: ['edit', 'undo', 'redo'],
    reason: 'Unconfigured Embed has no declared caption field; URL configuration is a separate action. Populated cases execute caption authoring/history.',
  } : {}
  const base = new URL(sourceBase, import.meta.url)
  const [{ createEditor }, module, paragraphModule, { EditorRenderer }, mentionModule, colorModule] = await Promise.all([
    import(new URL('core/index.js', base).href),
    import(new URL(`plugins/${specification.type}/index.js`, base).href),
    import(new URL('plugins/paragraph/index.js', base).href),
    import(new URL('renderer/index.js', base).href),
    import(new URL('inline-plugins/mention/index.js', base).href),
    import(new URL('inline-plugins/color.js', base).href),
  ])
  const widget = (type, data) => ({ type, ...(!legacy ? { dataVersion: 1 } : {}), data })
  const inline = {
    mention: widget('mention', { id: 'ada', name: 'Ada' }),
    swatch: widget('color', { value: '#123456' }),
  }
  const record = (id, data, sidecars, block = paragraph) => ({ id, type: block.type, ...(!legacy ? { dataVersion: block.version } : {}),
    data: legacy && block.type === 'list' ? { ...data, items: data.items.map(item => item.text) }
      : legacy && block.type === 'checklist' ? { ...data, items: data.items.map(({ text, checked }) => ({ text, checked })) }
        : legacy && block.type === 'columns' ? { ...data, columns: data.columns.map(({ content }) => ({ content })) }
          : legacy && block.type === 'attaches' ? { ...data, files: data.files.map(({ id, ...file }) => file) } : data,
    ...(sidecars ? { inline: sidecars } : {}) })
  const input = specification.populated ? {
    version: legacy ? '1.0.5' : '2.0.0',
    blocks: [record('prefix', { text: specification.neighborText ?? '<b>Before</b>' }), record('probe', clone(specification.populatedData), hasSidecars ? clone(inline) : undefined, specification),
      record('suffix', { text: '<i>After</i>' })],
  } : undefined
  const originalInput = input ? JSON.stringify(input) : null
  const beforeStyles = new Set(document.querySelectorAll('link[data-oe-style]'))
  const holder = document.createElement('section')
  const mounted = document.createElement('section')
  const detachedMount = document.createElement('section')
  const outside = document.createElement('button')
  outside.textContent = 'Independent host control'
  holder.style.width = mounted.style.width = detachedMount.style.width = '640px'
  document.body.append(outside, holder, mounted, detachedMount)
  const observations = [], phases = [], trusted = []
  const check = (phase, property, actual, expected) => observations.push({ phase, property,
    status: JSON.stringify(stable(actual)) === JSON.stringify(stable(expected)) ? 'PASS' : 'FAIL', actual, expected })
  let editor, renderer, destroyed = false, providerCalls = 0, currentPhase = 'create'
  const setPhase = phase => { currentPhase = phase; onPhase?.(phase) }
  const decodeEmbedCover = async cover => {
    let timer
    try {
      await Promise.race([cover.decode(), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Embed local cover did not decode: ' + JSON.stringify({
          phase: currentPhase, complete: cover.complete, connected: cover.isConnected,
          loading: cover.loading, top: Math.round(cover.getBoundingClientRect().top),
        }))), 3000)
      })])
    } finally { clearTimeout(timer) }
  }
  try {
    setPhase('create')
    const pluginConfig = specification.type === 'embed' ? { resolvePreview: false } : undefined
    const definition = legacy ? new module[specification.className](pluginConfig) : module[`create${specification.className}Plugin`](pluginConfig)
    const definitions = specification.type === 'paragraph' ? [definition]
      : [legacy ? new paragraphModule.Paragraph() : paragraphModule.createParagraphPlugin(), definition]
    editor = createEditor({ holder, plugins: definitions, defaultBlock: specification.type,
      inlineTools: [], inlinePlugins: [mentionModule.createMentionPlugin({ searchFunction: async () => { providerCalls++; return [] } }), colorModule.createColorSwatchPlugin()],
      injectStyles: true, ...(input ? { data: input } : {}),
    })
    renderer = new EditorRenderer({ blockTypes: [...new Set(['paragraph', specification.type])], injectStyles: true,
      ...(legacy
        ? { inlinePlugins: [mentionModule.createMentionWidget(), colorModule.createColorSwatchPlugin()] }
        : { inlineRenderers: [mentionModule.createMentionRenderer(), colorModule.createColorSwatchRenderer()] }),
    })
    await settled()
    const first = editor.save().blocks
    const id = specification.populated ? 'probe' : first[0]?.id
    check('create', 'generatedDefaultIdentity', typeof id === 'string' && id.length > 0, true)
    const shell = blockId => holder.querySelector(`[data-block-id="${blockId}"]`)
    const field = () => noEditableField
      ? specification.populated ? shell('prefix').querySelector('.oe-paragraph') : null
      : shell(id).querySelector(specification.fieldSelector)
    let previousDelimiter = noEditableField ? shell(id).querySelector('.oe-delimiter') : null
    const imageParts = () => {
      const wrapper = shell(id).querySelector('.oe-image')
      return specification.populated ? [wrapper, wrapper.querySelector('.oe-image__image'), wrapper.querySelector('.oe-image__caption')] : [wrapper]
    }
    let previousImageParts = specification.type === 'image' ? imageParts() : []
    const embedParts = () => {
      const wrapper = shell(id).querySelector('.oe-embed')
      return specification.populated ? [wrapper, wrapper.querySelector('.oe-embed__caption')] : [wrapper]
    }
    let previousEmbedParts = specification.type === 'embed' ? embedParts() : []
    let previousEmbedText
    const plainContenteditable = specification.plainContenteditable === true
    const plainField = specification.fieldMode === 'plain-text' && !plainContenteditable
    let previousPlainFields = plainField ? [field()] : []
    let previousShells = [...holder.querySelectorAll('.oe-block[data-block-id]')].map(element => [element.dataset.blockId, element])
    let previousWidgets = [...shell(id).querySelectorAll('[data-inline-plugin]')].map(element => [element.dataset.id, element])
    let previousItems = [...shell(id).querySelectorAll('.oe-list__item')]
    const checklistRows = () => [...shell(id).querySelectorAll('.oe-checklist__item')]
    const checklistParts = () => checklistRows().flatMap(row => [row, row.querySelector('.oe-checklist__checkbox'), row.querySelector('.oe-checklist__text')])
    let previousChecklistParts = specification.type === 'checklist' ? checklistParts() : []
    const quoteFields = () => ['.oe-quote__text', '.oe-quote__caption'].map(selector => shell(id).querySelector(selector))
    let previousQuoteFields = specification.type === 'quote' ? quoteFields() : []
    const warningFields = () => ['.oe-warning__title', '.oe-warning__message'].map(selector => shell(id).querySelector(selector))
    let previousWarningFields = specification.type === 'warning' ? warningFields() : []
    const toggleFields = () => ['.oe-toggle__title', '.oe-toggle__body'].map(selector => shell(id).querySelector(selector))
    let previousToggleFields = specification.type === 'toggle' ? toggleFields() : []
    const spoilerFields = () => ['.oe-spoiler__label', '.oe-spoiler__content'].map(selector => shell(id).querySelector(selector))
    let previousSpoilerFields = specification.type === 'spoiler' ? spoilerFields() : []
    const columnFields = () => [...shell(id).querySelector('.oe-columns__grid').children]
    let previousColumnFields = specification.type === 'columns' ? columnFields() : []
    const attachmentFields = () => [...shell(id).querySelectorAll('.oe-attaches__name')]
    let previousAttachmentFields = specification.type === 'attaches' ? attachmentFields() : []
    let previousAttachmentWrapper = specification.type === 'attaches' ? shell(id).querySelector('.oe-attaches') : null
    const originalAttachmentRemove = specification.type === 'attaches' && specification.populated ? shell(id).querySelector('.oe-attaches__remove') : null
    const baseData = clone(specification.populated ? specification.populatedData : specification.defaultData)
    const baseText = noEditableField ? specification.neighborText : specification.type === 'attaches' ? baseData.files[0]?.name ?? '' : specification.type === 'columns' ? baseData.columns[0].content : ['list', 'checklist'].includes(specification.type) ? baseData.items[0].text : baseData[specification.textKey ?? 'text']
    const expectedBlocks = text => {
      if (noEditableField) return specification.populated
        ? [record('prefix', { text }), record('probe', {}, undefined, specification), record('suffix', { text: '<i>After</i>' })]
        : [record(id, {}, undefined, specification)]
      const data = withEditedText(specification, baseData, text)
      return specification.populated
        ? [record('prefix', { text: '<b>Before</b>' }), record('probe', data, hasSidecars ? clone(inline) : undefined, specification), record('suffix', { text: '<i>After</i>' })]
        : [record(id, data, undefined, specification)]
    }
    const expectedTag = block => ['spoiler', 'columns', 'attaches'].includes(block.type) ? 'DIV' : block.type === 'toggle' ? 'DETAILS' : ['image', 'embed'].includes(block.type) ? 'FIGURE' : block.type === 'delimiter' ? 'HR' : block.type === 'checklist' ? 'UL' : block.type === 'list' ? block.data.style === 'ordered' ? 'OL' : 'UL'
      : block.type === 'heading' ? 'H' + block.data.level : block.type === 'quote' ? 'BLOCKQUOTE' : ['warning', 'code', 'raw'].includes(block.type) ? 'DIV' : 'P'
    const canonical = blocks => blocks.map(block => ({ ...block, data: ['code', 'raw', 'delimiter', 'attaches'].includes(block.type) ? { ...block.data } : ['list', 'checklist'].includes(block.type)
      ? { ...block.data, items: block.data.items.map(item => typeof item === 'string'
        ? markupMeaning(item) : { ...item, text: markupMeaning(item.text) }) }
      : ['image', 'embed'].includes(block.type) ? { ...block.data, caption: markupMeaning(block.data.caption) }
      : block.type === 'quote' ? { ...block.data, text: markupMeaning(block.data.text), caption: markupMeaning(block.data.caption) }
      : block.type === 'warning' ? { ...block.data, title: markupMeaning(block.data.title), message: markupMeaning(block.data.message) }
      : block.type === 'toggle' ? { ...block.data, title: markupMeaning(block.data.title), content: markupMeaning(block.data.content) }
      : block.type === 'spoiler' ? { ...block.data, label: markupMeaning(block.data.label), content: markupMeaning(block.data.content) }
      : block.type === 'columns' ? { ...block.data, columns: block.data.columns.map(column => ({ ...column, content: markupMeaning(column.content) })) }
      : { ...block.data, text: markupMeaning(block.data.text) } }))
    const imageStyles = picture => Object.fromEntries(['width', 'height', 'objectFit', 'objectPosition', 'borderStyle', 'borderWidth', 'borderColor', 'borderRadius'].map(key => [key, picture.style[key]]))
    const expectedImageStyles = populated => populated
      ? { width: '120px', height: '64px', objectFit: 'contain', objectPosition: 'center center', borderStyle: 'dashed', borderWidth: '2px', borderColor: 'rgb(18, 52, 86)', borderRadius: '6px' }
      : { width: '', height: '', objectFit: '', objectPosition: '', borderStyle: '', borderWidth: '', borderColor: '', borderRadius: '' }
    const literalText = html => {
      const template = document.createElement('template')
      template.innerHTML = html
      return template.content.textContent.trim()
    }
    const imageRendererMarkup = figure => {
      const picture = figure.querySelector('.editor-image__picture')
      const caption = figure.querySelector('.editor-image__caption')
      return { children: [...figure.children].map(child => child.tagName),
        src: picture.getAttribute('src'), alt: picture.alt, width: picture.getAttribute('width'), height: picture.getAttribute('height'), loading: picture.loading,
        caption: caption ? authoredMarkup(caption) : null, styles: imageStyles(picture), background: figure.style.backgroundColor,
        flags: ['bordered', 'expanded', 'background'].map(flag => figure.classList.contains('editor-image--' + flag)),
      }
    }
    const expectedImageRendererMarkup = block => ({
      children: ['IMG', ...(block.data.caption ? ['FIGCAPTION'] : [])],
      src: block.data.file.url || null, alt: literalText(block.data.caption),
      width: block.data.file.width ? String(block.data.file.width) : null, height: block.data.file.height ? String(block.data.file.height) : null, loading: 'lazy',
      caption: block.data.caption ? markupMeaning(block.data.caption) : null,
      styles: expectedImageStyles(Boolean(block.data.file.url)), background: block.data.withBackground ? 'rgb(255, 238, 204)' : '',
      flags: [block.data.withBorder, block.data.expanded, block.data.withBackground],
    })
    const embedPreviewMeaning = (root, prefix) => ({
      preview: root.querySelector('.' + prefix + '-embed__preview')?.getAttribute('src') ?? null,
      previewAlt: root.querySelector('.' + prefix + '-embed__preview')?.getAttribute('alt') ?? null,
      title: root.querySelector('.' + prefix + '-embed__title')?.textContent ?? null,
      duration: root.querySelector('.' + prefix + '-embed__duration')?.textContent ?? null,
      frames: root.querySelectorAll('iframe').length,
    })
    const expectedEmbedPreview = data => ({ preview: data.cover || null, previewAlt: data.cover ? data.title : null,
      title: data.title || null, duration: data.duration || null, frames: 0 })
    const embedRendererMarkup = figure => ({
      children: [...figure.children].map(child => child.tagName),
      caption: figure.querySelector('.editor-embed__caption') ? authoredMarkup(figure.querySelector('.editor-embed__caption')) : null,
      ...embedPreviewMeaning(figure, 'editor'),
    })
    const expectedEmbedRendererMarkup = block => ({
      children: block.data.videoId ? ['DIV', ...(block.data.caption ? ['FIGCAPTION'] : [])] : [],
      caption: block.data.videoId && block.data.caption ? markupMeaning(block.data.caption) : null,
      ...expectedEmbedPreview(block.data),
    })
    const spoilerRendererMarkup = element => {
      const header = element.querySelector('.editor-spoiler__header')
      const control = element.querySelector('.editor-spoiler__toggle')
      const label = element.querySelector('.editor-spoiler__label')
      const body = element.querySelector('.editor-spoiler__content')
      return { headerTag: header.tagName, controlTag: control.tagName,
        ariaLabel: control.getAttribute('aria-label'), ariaExpanded: control.getAttribute('aria-expanded'),
        controlsBody: body ? body.id.length > 0 && control.getAttribute('aria-controls') === body.id : control.getAttribute('aria-controls'),
        labelTag: label.tagName, label: authoredMarkup(label),
        body: body ? { tag: body.tagName, hidden: body.hidden, markup: authoredMarkup(body) } : null,
        expanded: element.classList.contains('editor-spoiler--open'),
      }
    }
    const attachmentRendererMarkup = element => ({
      children: element.children.length,
      rows: [...element.querySelectorAll('.editor-attaches__notion-row')].map(row => {
        const name = row.querySelector('.editor-attaches__notion-name')
        return { tag: row.tagName, nameTag: name.tagName, name: name.textContent, nameElements: name.childElementCount,
          href: name.getAttribute('href'), download: name.getAttribute('download'),
          extension: row.querySelector('.editor-attaches__notion-tag').textContent,
          size: row.querySelector('.editor-attaches__notion-size').textContent,
        }
      }),
    })
    const rendererMarkup = element => element.dataset.blockType === 'attaches' ? attachmentRendererMarkup(element) : element.dataset.blockType === 'columns'
      ? { display: element.style.display, grid: element.style.gridTemplateColumns, gap: element.style.gap,
        columns: [...element.children].map(column => ({ tag: column.tagName, markup: authoredMarkup(column) })),
      } : element.dataset.blockType === 'spoiler' ? spoilerRendererMarkup(element) : element.dataset.blockType === 'toggle'
      ? { open: element.open, summaryTag: element.querySelector('.editor-toggle__summary').tagName,
        titleTag: element.querySelector('.editor-toggle__title').tagName, title: authoredMarkup(element.querySelector('.editor-toggle__title')),
        body: element.querySelector('.editor-toggle__body') ? { tag: element.querySelector('.editor-toggle__body').tagName, markup: authoredMarkup(element.querySelector('.editor-toggle__body')) } : null,
      } : element.dataset.blockType === 'embed' ? embedRendererMarkup(element)
      : element.dataset.blockType === 'image' ? imageRendererMarkup(element) : element.dataset.blockType === 'delimiter'
      ? { childCount: element.childNodes.length, text: element.textContent }
      : element.dataset.blockType === 'code'
      ? { tag: element.querySelector('.editor-code__content').tagName, source: element.querySelector('.editor-code__content').textContent }
      : element.dataset.blockType === 'checklist'
        ? [...element.children].map(child => ({ tag: child.tagName,
          fieldTag: child.querySelector('.editor-checklist__text').tagName,
          markup: authoredMarkup(child.querySelector('.editor-checklist__text')),
          checked: child.classList.contains('editor-checklist__item--checked'),
          role: child.querySelector('.editor-checklist__checkbox').getAttribute('role'),
          ariaChecked: child.querySelector('.editor-checklist__checkbox').getAttribute('aria-checked'),
        }))
      : element.dataset.blockType === 'list'
      ? [...element.children].map(child => ({ tag: child.tagName, markup: authoredMarkup(child) }))
      : element.dataset.blockType === 'quote'
        ? [...element.querySelector('.editor-quote__body').children].map(child => ({ tag: child.tagName, markup: authoredMarkup(child) }))
      : element.dataset.blockType === 'warning'
        ? [...element.querySelector('.editor-warning__content').children].map(child => ({ tag: child.tagName, markup: authoredMarkup(child) }))
      : authoredMarkup(element)
    const expectedRendererMarkup = block => block.type === 'attaches'
      ? { children: block.data.files.length ? 1 : 0, rows: block.data.files.map(file => ({
        tag: 'DIV', nameTag: 'A', name: file.name, nameElements: 0, href: file.url, download: file.name,
        extension: file.extension.toUpperCase(), size: file.size === 2048 ? '2KB' : '4KB',
      })) } : block.type === 'columns'
      ? { display: 'grid', grid: block.data.layout === '1-2' ? '1fr 2fr' : '1fr 1fr', gap: '1rem',
        columns: block.data.columns.map(column => ({ tag: 'DIV', markup: markupMeaning(column.content) })),
      } : block.type === 'spoiler'
      ? { headerTag: 'DIV', controlTag: 'BUTTON', ariaLabel: 'Toggle spoiler', ariaExpanded: 'false',
        controlsBody: block.data.content ? true : null, labelTag: 'DIV', label: markupMeaning(block.data.label),
        body: block.data.content ? { tag: 'DIV', hidden: true, markup: markupMeaning(block.data.content) } : null,
        expanded: false,
      } : block.type === 'toggle'
      ? { open: block.data.open, summaryTag: 'SUMMARY', titleTag: 'SPAN', title: markupMeaning(block.data.title),
        body: block.data.content ? { tag: 'DIV', markup: markupMeaning(block.data.content) } : null,
      } : block.type === 'embed' ? expectedEmbedRendererMarkup(block)
      : block.type === 'image' ? expectedImageRendererMarkup(block) : block.type === 'delimiter'
      ? { childCount: 0, text: '' }
      : block.type === 'raw' ? markupMeaning(block.data.html)
      : block.type === 'code'
      ? { tag: 'CODE', source: block.data.code }
      : block.type === 'checklist'
        ? block.data.items.map(item => ({ tag: 'LI', fieldTag: 'SPAN', markup: markupMeaning(item.text),
          checked: item.checked, role: 'checkbox', ariaChecked: String(item.checked) }))
      : block.type === 'list'
      ? block.data.items.map(item => ({ tag: 'LI', markup: markupMeaning(listItemText(item)) }))
      : block.type === 'quote'
        ? [{ tag: 'P', markup: markupMeaning(block.data.text) }, ...(block.data.caption ? [{ tag: 'CITE', markup: markupMeaning(block.data.caption) }] : [])]
      : block.type === 'warning'
        ? [...(block.data.title ? [{ tag: 'STRONG', markup: markupMeaning(block.data.title) }] : []), ...(block.data.message ? [{ tag: 'P', markup: markupMeaning(block.data.message) }] : [])]
      : markupMeaning(block.data.text)
    const expectedWidgets = specification.populated && hasSidecars ? [
      { id: 'mention', type: 'mention', text: '@Ada', value: 'ada' },
      { id: 'swatch', type: 'color', text: '#123456', value: '#123456' },
    ] : []
    const widgets = root => [...root.querySelectorAll('[data-inline-plugin]')].map(element => ({
      id: element.dataset.id, type: element.dataset.inlinePlugin, text: element.textContent, value: element.dataset.value,
    }))
    for (const type of ['mousedown', 'beforeinput', 'input', 'keydown']) holder.addEventListener(type, event => trusted.push({
      type, key: event.key ?? null, inputType: event.inputType ?? null, trusted: event.isTrusted,
    }), { capture: true })

    async function rendered(phase, saved, expected) {
      const sourceBefore = JSON.stringify(saved)
      const detached = renderer.render(saved)
      check(phase, 'detachedOutputOwnership', { connected: detached.isConnected, parent: detached.parentNode === null }, { connected: false, parent: true })
      const inspectOutput = (root, name) => {
        const blocks = [...root.querySelectorAll('[data-block-id][data-block-type]')]
        check(phase, name + 'BlockCount', blocks.length, expected.length)
        check(phase, name + 'BlockOrderAndTags', blocks.map(element => ({ id: element.dataset.blockId,
          type: element.dataset.blockType, tag: element.tagName })), expected.map(block => ({ id: block.id, type: block.type, tag: expectedTag(block) })))
        check(phase, name + 'AuthoredMarkup', blocks.map(rendererMarkup), expected.map(expectedRendererMarkup))
        check(phase, name + 'Widgets', widgets(root), expectedWidgets)
        if (specification.type === 'code' && specification.populated) check(phase, name + 'CodeLanguage',
          blocks.find(element => element.dataset.blockId === id).querySelector('.editor-code__content').classList.contains('language-javascript'), true)
      }
      inspectOutput(detached, 'detached')
      detachedMount.append(detached)
      inspectOutput(detached, 'attachedDetached')
      renderer.renderTo(saved, mounted)
      await settled()
      inspectOutput(mounted, 'mounted')
      if (specification.type === 'image' && specification.populated) {
        const picture = mounted.querySelector('.editor-image__picture')
        picture.scrollIntoView({ block: 'nearest' })
        await picture.decode()
        check(phase, 'mountedImageDecoded', { complete: picture.complete, width: picture.naturalWidth, height: picture.naturalHeight }, { complete: true, width: 1, height: 1 })
        const computed = getComputedStyle(picture)
        check(phase, 'mountedImageComputedPosition', { fit: computed.objectFit, position: computed.objectPosition }, { fit: 'contain', position: '50% 50%' })
      }
      if (specification.type === 'embed' && specification.populated) {
        const cover = mounted.querySelector('.editor-embed__preview')
        cover.scrollIntoView({ block: 'nearest' })
        await decodeEmbedCover(cover)
        check(phase, 'mountedEmbedCoverDecoded', { complete: cover.complete, width: cover.naturalWidth, height: cover.naturalHeight }, { complete: true, width: 1, height: 1 })
      }
      check(phase, 'rendererInputUnchanged', JSON.stringify(saved), sourceBefore)
      renderer.destroy(detached)
      check(phase, 'detachedDisposal', detached.childNodes.length, 0)
      detached.remove()
    }

    const snapshots = {}
    async function inspect(phase, text, readOnly, history, selectionOffset) {
      setPhase(phase)
      const saved = editor.save()
      snapshots[phase] = saved.blocks
      const expected = expectedBlocks(text)
      const target = expected.find(block => block.id === id)
      check(phase, 'canonicalRecords', canonical(saved.blocks), canonical(expected))
      if (hasAuthoring) {
        check(phase, 'editorFieldTag', field().tagName, noEditableField ? 'P' : specification.fieldTag ?? (plainField ? 'TEXTAREA' : specification.type === 'list' ? 'LI' : expectedTag(target)))
        if (plainField) {
          check(phase, 'editorAuthoredSource', field().value, text)
          check(phase, 'plainFieldDomIdentity', previousPlainFields.map(element => field() === element), [true])
          if (specification.type === 'code') check(phase, 'editorSourcePreview', shell(id).querySelector('.oe-code-pre code').textContent, text + '\n')
        } else if (plainContenteditable) check(phase, 'editorAuthoredPlainText', { text: field().textContent, elements: field().childElementCount }, { text, elements: 0 })
        else check(phase, noEditableField ? 'neighborAuthoredMarkup' : 'editorAuthoredMarkup', authoredMarkup(field()), markupMeaning(text))
      }
      if (specification.type === 'raw') {
        const preview = shell(id).querySelector('.oe-raw__preview')
        const control = shell(id).querySelector('.oe-raw__toggle')
        const frames = [...preview.querySelectorAll('iframe')]
        check(phase, 'rawControls', { tag: control.tagName, text: control.textContent,
          hidden: control.hidden, disabled: control.disabled,
          controlsPreview: Boolean(preview.id) && control.getAttribute('aria-controls') === preview.id,
        }, { tag: 'BUTTON', text: 'Preview', hidden: readOnly, disabled: readOnly, controlsPreview: true })
        if (readOnly) check(phase, 'rawReadonlyPreview', {
          sourceHidden: getComputedStyle(field()).display === 'none',
          previewVisible: getComputedStyle(preview).display !== 'none',
          pressed: control.getAttribute('aria-pressed'), frames: frames.length,
        }, { sourceHidden: true, previewVisible: true, pressed: 'true', frames: 1 })
        for (const frame of frames) check(phase, 'rawBenignPreview', {
          sandbox: frame.getAttribute('sandbox'), title: frame.title, markup: markupMeaning(frame.srcdoc),
        }, { sandbox: '', title: 'HTML preview', markup: markupMeaning(text) })
      }
      if (noEditableField) {
        const rule = shell(id).querySelector('.oe-delimiter')
        check(phase, 'delimiterView', { tag: rule.tagName, editable: rule.isContentEditable,
          childCount: rule.childNodes.length, authorControls: rule.querySelectorAll('[contenteditable="true"],input,textarea').length,
        }, { tag: 'HR', editable: false, childCount: 0, authorControls: 0 })
        check(phase, 'delimiterDomIdentity', [rule === previousDelimiter], [true])
      }
      if (specification.type === 'image') {
        const parts = imageParts()
        const wrapper = parts[0]
        check(phase, 'imageDomIdentity', previousImageParts.map((element, index) => element === parts[index]), previousImageParts.map(() => true))
        check(phase, 'editorImageFlags', ['with-border', 'expanded', 'with-bg'].map(flag => wrapper.classList.contains('oe-image--' + flag)), [baseData.withBorder, baseData.expanded, baseData.withBackground])
        if (specification.populated) {
          const picture = parts[1]
          await picture.decode()
          check(phase, 'editorImageDecoded', { complete: picture.complete, width: picture.naturalWidth, height: picture.naturalHeight }, { complete: true, width: 1, height: 1 })
          check(phase, 'editorImageMeaning', { src: picture.getAttribute('src'), alt: picture.alt, styles: imageStyles(picture),
            background: wrapper.querySelector('.oe-image__image-container').style.backgroundColor,
          }, { src: pixel, alt: literalText(text), styles: expectedImageStyles(true), background: 'rgb(255, 238, 204)' })
        } else {
          check(phase, 'emptyImageHasNoAuthoring', wrapper.querySelectorAll('[contenteditable="true"]').length, 0)
          check(phase, 'emptyImageHasNoVisibleMedia', [...wrapper.querySelectorAll('img')].filter(picture => picture.getClientRects().length).length, 0)
        }
      }
      if (specification.type === 'embed') {
        const parts = embedParts(), wrapper = parts[0]
        check(phase, 'embedWrapperIdentity', [wrapper === previousEmbedParts[0]], [true])
        if (specification.populated) {
          const previousCaption = previousEmbedParts[1], currentCaption = parts[1]
          if (['undo', 'redo'].includes(phase) && text !== previousEmbedText) {
            // Existing Embed update semantics may replace a genuinely changed
            // caption host. The replacement must retire the old field without
            // changing current content, history, widgets or native selection.
            check(phase, 'embedCaptionLifetime', {
              currentConnected: currentCaption.isConnected,
              predecessorCurrentOrDetached: previousCaption === currentCaption || !previousCaption.isConnected,
            }, { currentConnected: true, predecessorCurrentOrDetached: true })
            if (previousCaption !== currentCaption) {
              const beforeHistory = { canUndo: editor.canUndo, canRedo: editor.canRedo }
              const selection = getSelection()
              const beforeSelection = { active: document.activeElement,
                anchor: selection.anchorNode, anchorOffset: selection.anchorOffset,
                focus: selection.focusNode, focusOffset: selection.focusOffset }
              previousCaption.textContent = 'stale retired caption'
              previousCaption.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: 'stale' }))
              previousCaption.dispatchEvent(new FocusEvent('blur'))
              await settled()
              check(phase, 'embedRetiredCaptionLeavesCanonical', editor.save().blocks, saved.blocks)
              check(phase, 'embedRetiredCaptionLeavesHistory', { canUndo: editor.canUndo, canRedo: editor.canRedo }, beforeHistory)
              check(phase, 'embedRetiredCaptionLeavesField', field() === currentCaption, true)
              check(phase, 'embedRetiredCaptionLeavesSelection', {
                active: document.activeElement === beforeSelection.active,
                anchor: selection.anchorNode === beforeSelection.anchor, anchorOffset: selection.anchorOffset,
                focus: selection.focusNode === beforeSelection.focus, focusOffset: selection.focusOffset,
              }, { active: true, anchor: true, anchorOffset: beforeSelection.anchorOffset,
                focus: true, focusOffset: beforeSelection.focusOffset })
            }
          } else check(phase, 'embedCaptionIdentity', [currentCaption === previousCaption], [true])
        }
        check(phase, 'editorEmbedPreview', embedPreviewMeaning(wrapper, 'oe'), expectedEmbedPreview(baseData))
        check(phase, 'editorEmbedCaptionCount', wrapper.querySelectorAll('.oe-embed__caption').length, specification.populated ? 1 : 0)
        if (specification.populated) {
          const cover = wrapper.querySelector('.oe-embed__preview')
          await decodeEmbedCover(cover)
          check(phase, 'editorEmbedCoverDecoded', { complete: cover.complete, width: cover.naturalWidth, height: cover.naturalHeight }, { complete: true, width: 1, height: 1 })
        } else check(phase, 'emptyEmbedHasNoRichAuthoring', wrapper.querySelectorAll('[contenteditable="true"]').length, 0)
      }
      if (specification.type === 'list') {
        const items = [...shell(id).querySelectorAll('.oe-list__item')]
        check(phase, 'editorListTag', shell(id).querySelector('.oe-list').tagName, expectedTag(target))
        check(phase, 'editorItemMarkup', items.map(authoredMarkup), target.data.items.map(item => markupMeaning(listItemText(item))))
        check(phase, 'itemDomIdentity', previousItems.map((element, index) => items[index] === element), previousItems.map(() => true))
        if (!legacy) check(phase, 'editorItemIds', items.map(element => element.dataset.itemId), baseData.items.map(item => item.id))
      }
      if (specification.type === 'checklist') {
        const rows = checklistRows()
        check(phase, 'editorChecklistItems', rows.map(row => ({ tag: row.tagName,
          fieldTag: row.querySelector('.oe-checklist__text').tagName,
          markup: authoredMarkup(row.querySelector('.oe-checklist__text')),
          editable: row.querySelector('.oe-checklist__text').isContentEditable,
          checked: row.classList.contains('oe-checklist__item--checked'),
          pressed: row.querySelector('.oe-checklist__checkbox').getAttribute('aria-pressed'),
          disabled: row.querySelector('.oe-checklist__checkbox').disabled,
        })), target.data.items.map(item => ({ tag: 'DIV', fieldTag: 'DIV', markup: markupMeaning(item.text),
          editable: !readOnly, checked: item.checked, pressed: String(item.checked), disabled: readOnly })))
        const parts = checklistParts()
        check(phase, 'checklistDomIdentity', previousChecklistParts.map((element, index) => parts[index] === element), previousChecklistParts.map(() => true))
        if (!legacy) check(phase, 'editorItemIds', rows.map(row => row.dataset.itemId), baseData.items.map(item => item.id))
      }
      if (specification.type === 'quote') {
        const fields = quoteFields()
        check(phase, 'editorQuoteFields', fields.map(element => ({ tag: element.tagName, markup: authoredMarkup(element), editable: element.isContentEditable })), [
          { tag: 'BLOCKQUOTE', markup: markupMeaning(text), editable: !readOnly },
          { tag: 'CITE', markup: markupMeaning(baseData.caption), editable: !readOnly },
        ])
        check(phase, 'quoteFieldDomIdentity', previousQuoteFields.map((element, index) => fields[index] === element), [true, true])
      }
      if (specification.type === 'warning') {
        const fields = warningFields()
        check(phase, 'editorWarningFields', fields.map(element => ({ tag: element.tagName, markup: authoredMarkup(element), editable: element.isContentEditable })), [
          { tag: 'DIV', markup: markupMeaning(text), editable: !readOnly },
          { tag: 'DIV', markup: markupMeaning(baseData.message), editable: !readOnly },
        ])
        check(phase, 'warningFieldDomIdentity', previousWarningFields.map((element, index) => fields[index] === element), [true, true])
      }
      if (specification.type === 'toggle') {
        const fields = toggleFields()
        check(phase, 'toggleFields', fields.map(element => ({ tag: element.tagName, markup: authoredMarkup(element), editable: element.isContentEditable })), [
          { tag: 'DIV', markup: markupMeaning(text), editable: !readOnly },
          { tag: 'DIV', markup: markupMeaning(baseData.content), editable: !readOnly },
        ])
        check(phase, 'toggleFieldDomIdentity', previousToggleFields.map((element, index) => element === fields[index]), [true, true])
        const control = shell(id).querySelector('.oe-toggle__chevron')
        check(phase, 'togglePresentation', {
          expanded: shell(id).querySelector('.oe-toggle').classList.contains('oe-toggle--open'),
          ariaExpanded: control.getAttribute('aria-expanded'),
          controlsBody: fields[1].id.length > 0 && control.getAttribute('aria-controls') === fields[1].id,
          bodyDisplayed: getComputedStyle(fields[1]).display !== 'none',
        }, { expanded: baseData.open, ariaExpanded: String(baseData.open), controlsBody: true, bodyDisplayed: baseData.open })
      }
      if (specification.type === 'spoiler') {
        const fields = spoilerFields()
        check(phase, 'spoilerFields', fields.map(element => ({ tag: element.tagName, markup: authoredMarkup(element), editable: element.isContentEditable })), [
          { tag: 'DIV', markup: markupMeaning(text), editable: !readOnly },
          { tag: 'DIV', markup: markupMeaning(baseData.content), editable: !readOnly },
        ])
        check(phase, 'spoilerFieldDomIdentity', previousSpoilerFields.map((element, index) => element === fields[index]), [true, true])
        const control = shell(id).querySelector('.oe-spoiler__toggle')
        check(phase, 'spoilerPresentation', {
          expanded: shell(id).querySelector('.oe-spoiler').classList.contains('oe-spoiler--open'),
          ariaLabel: control.getAttribute('aria-label'), ariaExpanded: control.getAttribute('aria-expanded'),
          controlsBody: fields[1].id.length > 0 && control.getAttribute('aria-controls') === fields[1].id,
          bodyHidden: fields[1].hidden, bodyDisplayed: getComputedStyle(fields[1]).display !== 'none',
        }, { expanded: !readOnly, ariaLabel: 'Toggle spoiler', ariaExpanded: String(!readOnly),
          controlsBody: true, bodyHidden: readOnly, bodyDisplayed: !readOnly })
      }
      if (specification.type === 'columns') {
        const fields = columnFields()
        const expectedColumns = baseData.columns.map((column, index) => ({ ...column, content: index ? column.content : text }))
        check(phase, 'columnFields', fields.map(element => ({ tag: element.tagName, markup: authoredMarkup(element), editable: element.isContentEditable })),
          expectedColumns.map(column => ({ tag: 'DIV', markup: markupMeaning(column.content), editable: !readOnly })))
        check(phase, 'columnDomIdentity', previousColumnFields.map((element, index) => element === fields[index]), [true, true])
        if (!legacy) check(phase, 'columnDomIds', fields.map(element => element.dataset.columnId), expectedColumns.map(column => column.id))
        const grid = shell(id).querySelector('.oe-columns__grid')
        const buttons = [...shell(id).querySelectorAll('.oe-columns__layout-btn')]
        check(phase, 'columnsPresentation', {
          grid: grid.style.gridTemplateColumns, display: getComputedStyle(grid).display,
          buttons: buttons.map(button => ({ label: button.getAttribute('aria-label'), pressed: button.getAttribute('aria-pressed') })),
        }, { grid: baseData.layout === '1-2' ? '1fr 2fr' : '1fr 1fr', display: 'grid',
          buttons: [ ['1-1', '50 / 50'], ['1-2', '33 / 67'], ['2-1', '67 / 33'], ['1-1-1', '33 / 33 / 33'] ]
            .map(([layout, label]) => ({ label: 'Layout ' + label, pressed: String(baseData.layout === layout) })),
        })
      }
      if (specification.type === 'attaches') {
        const wrapper = shell(id).querySelector('.oe-attaches')
        const fields = attachmentFields()
        const expectedFiles = baseData.files.map((file, index) => ({ ...file, name: index ? file.name : text }))
        check(phase, 'attachmentWrapperIdentity', [wrapper === previousAttachmentWrapper], [true])
        check(phase, 'attachmentFields', fields.map(element => ({ tag: element.tagName, text: element.textContent,
          elements: element.childElementCount, editable: element.isContentEditable })),
        expectedFiles.map(file => ({ tag: 'DIV', text: file.name, elements: 0, editable: !readOnly })))
        if (emptyAttaches) check(phase, 'emptyAttachesHasNoAuthoring', wrapper.querySelectorAll('[contenteditable="true"]').length, 0)
        else {
          check(phase, 'attachmentMetadata', [...wrapper.querySelectorAll('.oe-attaches__notion-row')].map(row => ({
            extension: row.querySelector('.oe-attaches__notion-tag').textContent,
            size: row.querySelector('.oe-attaches__notion-size').textContent,
          })), [{ extension: 'PDF', size: '2KB' }, { extension: 'TXT', size: '4KB' }])
          if (['read-only', 'editable-again'].includes(phase)) {
            // This plugin deliberately rebuilds mode-specific controls. Old
            // hosts and their callbacks must lose authority while the block
            // wrapper and its canonical file identities remain accepted.
            check(phase, 'attachmentRetiredHosts', previousAttachmentFields.map(element => !element.isConnected && !fields.includes(element)), [true, true])
            check(phase, 'attachmentRetiredControl', Boolean(originalAttachmentRemove) && !originalAttachmentRemove.isConnected, true)
            for (const old of previousAttachmentFields) {
              old.textContent = 'stale retired filename'
              old.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: 'stale' }))
              old.dispatchEvent(new FocusEvent('blur'))
            }
            originalAttachmentRemove.click()
            await settled()
            check(phase, 'attachmentRetiredActionsLeaveCanonical', editor.save().blocks, saved.blocks)
            check(phase, 'attachmentRetiredActionsLeaveHistory', { canUndo: editor.canUndo, canRedo: editor.canRedo }, history)
          } else check(phase, 'attachmentFieldDomIdentity', previousAttachmentFields.map((element, index) => element === fields[index]), [true, true])
        }
      }
      check(phase, 'editorWidgets', widgets(shell(id)), expectedWidgets)
      check(phase, 'modeState', { readOnly: editor.readOnly, editable: hasAuthoring ? plainField ? !field().readOnly : field().isContentEditable : false }, { readOnly, editable: hasAuthoring && !readOnly })
      check(phase, 'historyState', { canUndo: editor.canUndo, canRedo: editor.canRedo }, history)
      check(phase, 'blockDomIdentity', previousShells.map(([blockId, element]) => shell(blockId) === element), previousShells.map(() => true))
      check(phase, 'widgetDomIdentity', previousWidgets.map(([widgetId, element]) => shell(id).querySelector(`[data-id="${widgetId}"]`) === element), previousWidgets.map(() => true))
      if (selectionOffset !== undefined) check(phase, 'nativeSelection', caretIn(field()), {
        focused: true, anchor: selectionOffset, focus: selectionOffset, collapsed: true,
      })
      if (input) check(phase, 'callerInputUnchanged', JSON.stringify(input), originalInput)
      await rendered(phase, saved, expected)
      phases.push({ phase, blocks: saved.blocks, ...(plainField ? { editorSource: field().value } : { editorHtml: hasAuthoring ? field().innerHTML : null }),
        mountedHtml: mounted.innerHTML, selection: hasAuthoring ? caretIn(field()) : null,
        selectionOwner: nativeSelectionOwner(), readOnly: editor.readOnly })
      previousShells = [...holder.querySelectorAll('.oe-block[data-block-id]')].map(element => [element.dataset.blockId, element])
      previousWidgets = [...shell(id).querySelectorAll('[data-inline-plugin]')].map(element => [element.dataset.id, element])
      previousItems = [...shell(id).querySelectorAll('.oe-list__item')]
      previousChecklistParts = specification.type === 'checklist' ? checklistParts() : []
      previousQuoteFields = specification.type === 'quote' ? quoteFields() : []
      previousWarningFields = specification.type === 'warning' ? warningFields() : []
      previousToggleFields = specification.type === 'toggle' ? toggleFields() : []
      previousSpoilerFields = specification.type === 'spoiler' ? spoilerFields() : []
      previousColumnFields = specification.type === 'columns' ? columnFields() : []
      previousAttachmentFields = specification.type === 'attaches' ? attachmentFields() : []
      previousAttachmentWrapper = specification.type === 'attaches' ? shell(id).querySelector('.oe-attaches') : null
      previousPlainFields = plainField ? [field()] : []
      previousDelimiter = noEditableField ? shell(id).querySelector('.oe-delimiter') : null
      previousImageParts = specification.type === 'image' ? imageParts() : []
      previousEmbedParts = specification.type === 'embed' ? embedParts() : []
      previousEmbedText = specification.type === 'embed' ? text : undefined
    }

    await inspect('load', baseText, false, { canUndo: false, canRedo: false })
    outside.focus()
    setPhase('read-only-transition')
    editor.setReadOnly(true)
    await settled()
    check('read-only', 'foreignFocusPreserved', document.activeElement === outside, true)
    if (specification.type === 'attaches' && specification.populated && !legacy) {
      check('read-only', 'attachmentFocusRejected', editor.blocks.focus(id, { fieldKey: 'file:first:name', offset: 'end' }), false)
      check('read-only', 'attachmentReadonlyFocusOwner', document.activeElement === outside, true)
    }
    await inspect('read-only', baseText, true, { canUndo: false, canRedo: false })
    setPhase('editable-transition')
    editor.setReadOnly(false)
    await settled()
    check('editable-again', 'foreignFocusPreserved', document.activeElement === outside, true)
    await inspect('editable-again', baseText, false, { canUndo: false, canRedo: false })
    if (hasAuthoring) {
      setPhase('edit')
      if (specification.type === 'attaches' && !legacy) {
        for (const [index, file] of baseData.files.entries()) {
          check('edit', 'attachmentAddress:' + file.id, {
            accepted: editor.blocks.focus(id, { fieldKey: 'file:' + file.id + ':name', offset: 'end' }),
            active: document.activeElement === attachmentFields()[index],
          }, { accepted: true, active: true })
        }
      }
      if (specification.type === 'code' && !shell(id).querySelector('.oe-code-wrap').classList.contains('oe-code-wrap--editing')) {
        const editControl = shell(id).querySelector('.oe-code-btn--edit')
        editControl.scrollIntoView({ block: 'nearest' })
        await settled()
        await focusField(editControl)
        await settled()
      }
      if (specification.type === 'raw' && getComputedStyle(field()).display === 'none') {
        const previewControl = shell(id).querySelector('.oe-raw__toggle')
        previewControl.scrollIntoView({ block: 'nearest' })
        await settled()
        await focusField(previewControl)
        await settled()
      }
      const author = field()
      author.scrollIntoView({ block: 'nearest' })
      await settled()
      if (specification.type === 'code') {
        const rect = author.getBoundingClientRect()
        const style = getComputedStyle(author)
        check('edit', 'plainFieldDisclosure', {
          editing: shell(id).querySelector('.oe-code-wrap').classList.contains('oe-code-wrap--editing'),
          hidden: author.hidden,
          visible: rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility === 'visible',
          receivesPointer: document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) === author,
        }, { editing: true, hidden: false, visible: true, receivesPointer: true })
      }
      if (specification.type === 'raw') {
        const rect = author.getBoundingClientRect()
        const style = getComputedStyle(author)
        check('edit', 'rawFieldDisclosure', {
          previewPressed: shell(id).querySelector('.oe-raw__toggle').getAttribute('aria-pressed'),
          frames: shell(id).querySelectorAll('.oe-raw__preview iframe').length,
          hidden: author.hidden,
          visible: rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility === 'visible',
          receivesPointer: document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) === author,
        }, { previewPressed: 'false', frames: 0, hidden: false, visible: true, receivesPointer: true })
      }
      await focusField(author)
      const offset = plainField || plainContenteditable ? baseText.length : logicalLength(baseText)
      if (plainField) author.setSelectionRange(offset, offset)
      else {
        const range = document.createRange()
        range.selectNodeContents(author)
        range.collapse(false)
        getSelection().removeAllRanges()
        getSelection().addRange(range)
      }
      check('edit', 'fixtureCaret', caretIn(author), { focused: true, anchor: offset, focus: offset, collapsed: true })
      check('edit', 'trustedFieldFocus', trusted.some(event => event.type === 'mousedown' && event.trusted), true)
      await typeText('X')
      await settled()
      await inspect('edit', baseText + 'X', false, { canUndo: true, canRedo: false }, offset + 1)
      check('edit', 'trustedInput', trusted.some(event => event.type === 'input' && event.inputType === 'insertText' && event.trusted), true)
      setPhase('undo')
      await shortcut('undo')
      await settled()
      await inspect('undo', baseText, false, { canUndo: false, canRedo: true }, offset)
      check('undo', 'exactOriginalRecords', snapshots.undo, snapshots.load)
      setPhase('redo')
      await shortcut('redo')
      await settled()
      await inspect('redo', baseText + 'X', false, { canUndo: true, canRedo: false }, offset + 1)
      check('redo', 'exactEditedRecords', snapshots.redo, snapshots.edit)
      check('redo', 'trustedHistory', trusted.filter(event => event.type === 'keydown' && event.key.toLowerCase() === 'z').map(event => event.trusted), [true, true])
      check('redo', 'providerNotInvokedByRoundtrip', providerCalls, 0)
    } else check('editable-again', 'providerNotInvokedByRoundtrip', providerCalls, 0)
    setPhase('dispose')
    renderer.destroy(mounted)
    check('dispose', 'mountedOutputRemoved', mounted.childNodes.length, 0)
    renderer.destroy()
    editor.destroy()
    editor.destroy()
    destroyed = true
    await settled()
    check('dispose', 'editorRootRemoved', holder.querySelector('.oe-editor'), null)
    check('dispose', 'ownedStylesReleased', [...document.querySelectorAll('link[data-oe-style]')].filter(link => !beforeStyles.has(link)).map(link => link.href), [])
    return { id: specification.id, ...phaseScope, phases, completedPhases: [...phases.map(phase => phase.phase), 'dispose'], trusted, observations,
      failures: observations.filter(observation => observation.status !== 'PASS') }
  } catch (error) {
    const failure = { phase: currentPhase, property: 'execution', status: 'ERROR', actual: error.message ?? String(error) }
    return { id: specification.id, ...phaseScope, phases, completedPhases: phases.map(phase => phase.phase), trusted, observations, error: error.stack ?? String(error),
      failures: [...observations.filter(observation => observation.status !== 'PASS'), failure],
      incompletePhases: plannedPhases.filter(phase => !phases.some(entry => entry.phase === phase)),
    }
  } finally {
    try { renderer?.destroy() } finally {
      try { if (!destroyed) editor?.destroy() } finally { holder.remove(); mounted.remove(); detachedMount.remove(); outside.remove() }
    }
  }
}
