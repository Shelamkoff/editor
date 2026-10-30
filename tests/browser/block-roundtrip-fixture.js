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

const table = {
  type: 'table', version: 2, className: 'Table', fieldSelector: '.oe-table__cell',
  defaultData: { withHeadings: false, rows: [
    { id: 'row-0', cells: [{ id: 'cell-0-0', text: '' }, { id: 'cell-0-1', text: '' }, { id: 'cell-0-2', text: '' }] },
    { id: 'row-1', cells: [{ id: 'cell-1-0', text: '' }, { id: 'cell-1-1', text: '' }, { id: 'cell-1-2', text: '' }] },
    { id: 'row-2', cells: [{ id: 'cell-2-0', text: '' }, { id: 'cell-2-1', text: '' }, { id: 'cell-2-2', text: '' }] },
  ] },
  populatedData: { withHeadings: true, rows: [
    { id: 'first', cells: [{ id: 'name', text: '<b>Alpha</b> <i>{{mention}}</i> tail' }, { id: 'value', text: '<mark>Second header</mark>' }] },
    { id: 'second', cells: [{ id: 'name', text: '<i>Body &amp; more</i>' }, { id: 'value', text: '<mark>Value</mark> <s>{{swatch}}</s>' }] },
  ] },
  unwrappedData: { withHeadings: true, rows: [
    { id: 'first', cells: [{ id: 'name', text: '<b>Alpha</b> {{mention}} tail' }, { id: 'value', text: '<mark>Second header</mark>' }] },
    { id: 'second', cells: [{ id: 'name', text: '<i>Body &amp; more</i>' }, { id: 'value', text: '<mark>Value</mark> {{swatch}}' }] },
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

const gallery = {
  type: 'gallery', version: 2, className: 'Gallery', literalCaption: true,
  fieldSelector: '.oe-gallery__slot-caption', fieldTag: 'DIV',
  defaultData: { images: [], layout: 'auto', styles: {},
    options: { loop: true, zoom: true, navigation: true, captions: true, fullscreen: true, thumbnails: false } },
  populatedData: { images: [
    { id: 'first', url: pixel, caption: 'Alpha &amp; &lt;b&gt;literal&lt;/b&gt; {{literal}} tail' },
    { id: 'second', url: pixel, caption: 'Second &amp; &lt;i&gt;literal&lt;/i&gt;' },
  ], layout: '2', styles: { gap: '8px', height: '180px', borderRadius: '6px' },
  options: { loop: false, zoom: true, navigation: true, captions: true, fullscreen: false, thumbnails: true } },
}
// Gallery v1 author captions are plain strings (textContent), not rich HTML.
// These fixed values translate only the historical wire representation.
gallery.legacyPopulatedData = { ...gallery.populatedData, images: [
  { id: 'first', url: pixel, caption: 'Alpha & <b>literal</b> {{literal}} tail' },
  { id: 'second', url: pixel, caption: 'Second & <i>literal</i>' },
] }

const embed = {
  type: 'embed', version: 1, className: 'Embed', textKey: 'caption',
  fieldSelector: '.oe-embed__caption', fieldTag: 'DIV',
  defaultData: { service: '', videoId: '', caption: '', cover: '', title: '', duration: '' },
  populatedData: { service: 'vimeo', videoId: '12345678',
    caption: '<b>Alpha</b> <i>{{mention}}</i> <s>{{swatch}}</s> tail',
    cover: pixel, title: 'Local preview', duration: '1:23' },
}

const carousel = {
  type: 'carousel', version: 1, className: 'Carousel', literalCaption: true,
  fieldSelector: '.oe-carousel-block__caption', fieldTag: 'DIV',
  defaultData: { slides: [], options: { loop: false, autoplay: false, autoplayDelay: 3000,
    navigation: true, pagination: true, thumbnails: false } },
  populatedData: { slides: [
    { id: 'first', type: 'image', src: pixel, alt: 'First <&> image', caption: 'Alpha &amp; &lt;caption&gt; tail' },
    { id: 'second', type: 'video', src: '/tests/browser/carousel-roundtrip-16x16.webm', poster: pixel,
      alt: 'Second & video', caption: 'Second &amp; caption' },
    { id: 'third', type: 'html', html: '<section><h3>Local &amp; HTML</h3><p><a href="https://example.test/more">More</a></p></section>',
      caption: 'HTML &amp; caption' },
  ], options: { loop: false, autoplay: false, autoplayDelay: 3000, navigation: true, pagination: true, thumbnails: true } },
}
// v1 Carousel captions are literal text, not rich HTML. These independent wire
// records preserve the same visible author characters; widget cases below
// explicitly record that persistent rich-caption widgets were unsupported.
carousel.legacyPopulatedData = { ...carousel.populatedData, slides: carousel.populatedData.slides.map((slide, index) => ({
  ...slide, caption: ['Alpha & <caption> tail', 'Second & caption', 'HTML & caption'][index],
})) }

const linkPreview = {
  type: 'linkPreview', moduleDirectory: 'link-preview', scenarioName: 'LINK_PREVIEW', version: 1, className: 'LinkPreview',
  textKey: 'url', fieldMode: 'plain-text', fieldTag: 'INPUT', fieldSelector: '.oe-lp__url-input',
  defaultData: { url: '', title: '', description: '', image: '', favicon: '', domain: '', template: 'notion' },
  populatedData: { url: 'https://example.test/story', title: 'Literal <b>headline</b> & {{literal}}',
    description: 'Description & <script>literal</script>', image: pixel, favicon: pixel, domain: 'display.example', template: 'horizontal' },
}

const poll = {
  type: 'poll', version: 1, className: 'Poll', textKey: 'question',
  fieldSelector: '.oe-poll__question', fieldTag: 'DIV',
  defaultData: { question: '', type: 'single', options: [{ id: 'option-0', text: '' }, { id: 'option-1', text: '' }], resultsMode: 'always' },
  populatedData: { question: '<b>Alpha</b> <i>{{mention}}</i> tail', type: 'multiple',
    options: [{ id: 'first', text: '<mark>First answer</mark> <s>{{swatch}}</s>' }, { id: 'second', text: '<i>Second &amp; answer</i>' }],
    resultsMode: 'always', pollId: 'roundtrip-poll',
    initialResults: { total: 3, options: [{ id: 'first', votes: 2 }, { id: 'second', votes: 1 }], currentUserVote: ['second'] },
  },
  unwrappedData: { question: '<b>Alpha</b> {{mention}} tail', type: 'multiple',
    options: [{ id: 'first', text: '<mark>First answer</mark> {{swatch}}' }, { id: 'second', text: '<i>Second &amp; answer</i>' }],
    resultsMode: 'always', pollId: 'roundtrip-poll',
    initialResults: { total: 3, options: [{ id: 'first', votes: 2 }, { id: 'second', votes: 1 }], currentUserVote: ['second'] },
  },
}

const person = {
  type: 'person', version: 2, className: 'Person', fieldSelector: '.oe-person__name', fieldTag: 'DIV',
  defaultData: { persons: [{ id: 'person-0', avatar: '', name: '', role: '', bio: '', links: [] }] },
  populatedData: { persons: [
    { id: 'ada', avatar: pixel, name: '<b>Alpha</b> <i>{{mention}}</i> tail', role: '<mark>Research &amp; team</mark>',
      bio: '<b>Biography</b> <s>{{swatch}}</s>', links: [{ id: 'site', type: 'website', url: 'https://example.test/ada' }] },
    { id: 'grace', avatar: '', name: '<i>Grace &amp; Co</i>', role: '<b>Architect</b>', bio: '<mark>Second biography</mark>',
      links: [{ id: 'code', type: 'github', url: 'https://github.com/grace' }] },
  ] },
}
person.unwrappedData = { persons: person.populatedData.persons.map((entry, index) => index ? { ...entry } : {
  ...entry, name: '<b>Alpha</b> {{mention}} tail', bio: '<b>Biography</b> {{swatch}}',
}) }
person.literalData = { persons: person.populatedData.persons.map((entry, index) => index ? { ...entry } : {
  ...entry, name: '<b>Alpha</b> <i>author &amp; name</i> tail', bio: '<b>Biography</b> <s>literal &amp; text</s>',
}) }

const delimiter = {
  type: 'delimiter', version: 1, className: 'Delimiter', noEditableField: true,
  defaultData: {}, populatedData: {}, neighborText: '<b>Before</b> tail',
}

const withEditedText = (block, data, text) => block.type === 'linkPreview' ? text === data.url ? { ...data } : { ...linkPreview.defaultData, template: data.template, url: text, domain: text ? 'example.test' : '' } : block.noEditableField ? { ...data } : ['list', 'checklist'].includes(block.type)
  ? { ...data, items: data.items.map((item, index) => index ? { ...item } : { ...item, text }) }
  : block.type === 'columns' ? { ...data, columns: data.columns.map((column, index) => index ? { ...column } : { ...column, content: text }) }
  : block.type === 'table' ? { ...data, rows: data.rows.map((row, rowIndex) => ({ ...row,
    cells: row.cells.map((cell, columnIndex) => rowIndex || columnIndex ? { ...cell } : { ...cell, text }),
  })) }
  : block.type === 'attaches' ? { ...data, files: data.files.map((file, index) => index ? { ...file } : { ...file, name: text }) }
  : block.type === 'gallery' ? { ...data, images: data.images.map((image, index) => index ? { ...image } : { ...image, caption: text }) }
  : block.type === 'person' ? { ...data, persons: data.persons.map((entry, index) => index ? { ...entry } : { ...entry, name: text }) }
  : block.type === 'carousel' ? { ...data, slides: data.slides.map((slide, index) => index ? { ...slide } : { ...slide, caption: text }) }
  : { ...data, [block.textKey ?? 'text']: text }
const listItemText = item => typeof item === 'string' ? item : item.text

export const blockRoundtripCases = [paragraph, heading, list, quote, warning, code, checklist, delimiter, image, toggle, spoiler, columns, attaches, raw, embed, table, poll, linkPreview, gallery, person, carousel].flatMap(block => {
  const prefix = 'BLOCK_' + (block.scenarioName ?? block.type.toUpperCase()) + '_ROUNDTRIP/'
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
  }] : []).concat(block.type === 'poll' ? [{ ...block, populated: true, withoutSidecars: true, id: prefix + 'populated-literal',
    populatedData: { ...block.populatedData, question: '<b>Alpha</b> <i>question</i> tail',
      options: [{ id: 'first', text: '<mark>First answer</mark> <s>choice</s>' }, ...block.populatedData.options.slice(1)] },
  }] : []).concat(block.type === 'person' ? [{ ...block, populated: true, withoutSidecars: true, id: prefix + 'populated-literal', populatedData: block.literalData }] : []).concat(block.type === 'image' ? [
    { ...block, populated: true, literalCaption: false, id: prefix + 'populated-widgets',
      populatedData: { ...block.populatedData, caption: '<b>Alpha</b> <i>{{mention}}</i> <s>{{swatch}}</s> tail' } },
    { ...block, populated: true, literalCaption: false, id: prefix + 'populated-widgets-unwrapped-control',
      populatedData: { ...block.populatedData, caption: '<b>Alpha</b> {{mention}} {{swatch}} tail' } },
  ] : []).concat(block.type === 'gallery' ? [true, false].map(wrapped => ({
    ...block, populated: true, literalCaption: false,
    id: prefix + (wrapped ? 'populated-widgets' : 'populated-widgets-unwrapped-control'),
    populatedData: { ...block.populatedData, images: [
      { id: 'first', url: pixel, caption: '<b>Alpha &amp;</b> ' + (wrapped ? '<i>{{mention}}</i>' : '{{mention}}') + ' tail' },
      { id: 'second', url: pixel, caption: '<mark>Second &amp;</mark> ' + (wrapped ? '<s>{{swatch}}</s>' : '{{swatch}}') },
    ] },
    legacyPopulatedData: { ...block.populatedData, images: [
      { id: 'first', url: pixel, caption: 'Alpha & {{mention}} tail' },
      { id: 'second', url: pixel, caption: 'Second & {{swatch}}' },
    ] },
  })) : []).concat(block.type === 'carousel' ? [
    { ...block, populated: true, literalCaption: false, id: prefix + 'populated-widgets',
      populatedData: withEditedText(block, block.populatedData, '<b>Alpha</b> <i>{{mention}}</i> <s>{{swatch}}</s> tail'),
      legacyPopulatedData: withEditedText(block, block.legacyPopulatedData, 'Alpha {{mention}} {{swatch}} tail') },
    { ...block, populated: true, literalCaption: false, id: prefix + 'populated-widgets-unwrapped-control',
      populatedData: withEditedText(block, block.populatedData, '<b>Alpha</b> {{mention}} {{swatch}} tail'),
      legacyPopulatedData: withEditedText(block, block.legacyPopulatedData, 'Alpha {{mention}} {{swatch}} tail') },
  ] : [])
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
  if (['TEXTAREA', 'INPUT'].includes(field.tagName)) return {
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
  const emptyGallery = specification.type === 'gallery' && !specification.populated
  const emptyCarousel = specification.type === 'carousel' && !specification.populated
  const hasAuthoring = (!noEditableField || specification.populated) && !emptyImage && !emptyAttaches && !emptyEmbed && !emptyGallery && !emptyCarousel
  const hasSidecars = !noEditableField && specification.fieldMode !== 'plain-text' && !specification.literalCaption && !specification.withoutSidecars
  const plannedPhases = ['load', 'read-only', 'editable-again', ...(specification.type === 'person' && specification.populated ? ['view-second', 'view-return'] : []), ...(hasAuthoring ? ['edit', 'undo', 'redo'] : []), 'dispose']
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
  } : emptyGallery ? { authoringTarget: null, notApplicablePhases: ['edit', 'undo', 'redo'],
    reason: 'Gallery with no images has no caption field; populated cases exercise declared caption authoring and history.',
  } : emptyCarousel ? { authoringTarget: null, notApplicablePhases: ['edit', 'undo', 'redo'],
    reason: 'The actual empty Carousel default has no slide or declared caption. Populated mixed-media cases execute caption authoring/history.',
  } : {}
  if (legacy && specification.type === 'carousel' && hasSidecars) phaseScope.referenceCapability = {
    supported: false, capability: 'persistent rich-caption inline widgets',
    reason: 'v1 Carousel disables inline tools, declares no rich-field mapper and saves captions as literal text. Its observed differences remain explicit.',
  }
  const base = new URL(sourceBase, import.meta.url)
  const [{ createEditor }, module, paragraphModule, { EditorRenderer }, mentionModule, colorModule] = await Promise.all([
    import(new URL('core/index.js', base).href),
    import(new URL(`plugins/${specification.moduleDirectory ?? specification.type}/index.js`, base).href),
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
          : legacy && block.type === 'table' ? { withHeadings: data.withHeadings, content: data.rows.map(row => row.cells.map(cell => cell.text)) }
          : legacy && block.type === 'attaches' ? { ...data, files: data.files.map(({ id, ...file }) => file) }
            : legacy && block.type === 'gallery' ? { ...data, images: data.images.map(({ id, ...image }) => image) }
          : legacy && block.type === 'person' ? { persons: data.persons.map(({ id, links, ...entry }) => ({ ...entry, links: links.map(({ id, ...link }) => link) })) } : data,
    ...(sidecars ? { inline: sidecars } : {}) })
  const input = specification.populated ? {
    version: legacy ? '1.0.5' : '2.0.0',
    blocks: [record('prefix', { text: specification.neighborText ?? '<b>Before</b>' }), record('probe', clone(legacy ? specification.legacyPopulatedData ?? specification.populatedData : specification.populatedData), hasSidecars ? clone(inline) : undefined, specification),
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
    const carouselParts = () => [shell(id).querySelector('.oe-carousel-block'), field(),
      shell(id).querySelector('.oe-carousel-block__nav--next')]
    let previousCarouselParts = specification.type === 'carousel' ? carouselParts() : []
    const plainContenteditable = specification.plainContenteditable === true || (legacy && specification.type === 'gallery')
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
    const tableRows = () => [...shell(id).querySelector('.oe-table').rows]
    const tableParts = () => [shell(id).querySelector('.oe-table-wrapper'), shell(id).querySelector('.oe-table'),
      ...tableRows(), ...tableRows().flatMap(row => [...row.cells])]
    let previousTableParts = specification.type === 'table' ? tableParts() : []
    const attachmentFields = () => [...shell(id).querySelectorAll('.oe-attaches__name')]
    let previousAttachmentFields = specification.type === 'attaches' ? attachmentFields() : []
    let previousAttachmentWrapper = specification.type === 'attaches' ? shell(id).querySelector('.oe-attaches') : null
    const originalAttachmentRemove = specification.type === 'attaches' && specification.populated ? shell(id).querySelector('.oe-attaches__remove') : null
    const galleryFields = () => [...shell(id).querySelectorAll('.oe-gallery__slot-caption')]
    let previousGalleryWrapper = specification.type === 'gallery' ? shell(id).querySelector('.oe-gallery') : null
    let previousGalleryFields = specification.type === 'gallery' ? galleryFields() : []
    let previousGalleryRemoveControls = specification.type === 'gallery' ? [...shell(id).querySelectorAll('.oe-gallery__slot-remove')] : []
    const personFields = () => [...shell(id).querySelectorAll('.oe-person__name,.oe-person__role,.oe-person__bio,.oe-person__link-url')]
    let previousPersonFields = specification.type === 'person' ? personFields() : []
    const baseData = clone(specification.populated ? legacy ? specification.legacyPopulatedData ?? specification.populatedData : specification.populatedData : specification.defaultData)
    if (specification.type === 'poll' && !specification.populated && legacy) {
      const ids = first[0]?.data.options?.map(option => option.id)
      check('create', 'pollDefaultOptionIds', { count: ids?.length, unique: new Set(ids).size,
        valid: ids?.every(id => typeof id === 'string' && id.length > 0) }, { count: 2, unique: 2, valid: true })
      baseData.options = baseData.options.map((option, index) => ({ ...option, id: ids[index] }))
    }
    const pollFields = () => [shell(id).querySelector('.oe-poll__question'), ...shell(id).querySelectorAll('.oe-poll__option-text')]
    let previousPollFields = specification.type === 'poll' ? pollFields() : []
    const baseText = noEditableField ? specification.neighborText : specification.type === 'carousel' ? baseData.slides[0]?.caption ?? '' : specification.type === 'person' ? baseData.persons[0].name : specification.type === 'gallery' ? baseData.images[0]?.caption ?? '' : specification.type === 'table' ? baseData.rows[0].cells[0].text : specification.type === 'attaches' ? baseData.files[0]?.name ?? '' : specification.type === 'columns' ? baseData.columns[0].content : ['list', 'checklist'].includes(specification.type) ? baseData.items[0].text : baseData[specification.textKey ?? 'text']
    const expectedBlocks = text => {
      if (noEditableField) return specification.populated
        ? [record('prefix', { text }), record('probe', {}, undefined, specification), record('suffix', { text: '<i>After</i>' })]
        : [record(id, {}, undefined, specification)]
      const data = withEditedText(specification, baseData, text)
      return specification.populated
        ? [record('prefix', { text: '<b>Before</b>' }), record('probe', data, hasSidecars ? clone(inline) : undefined, specification), record('suffix', { text: '<i>After</i>' })]
        : [record(id, data, undefined, specification)]
    }
    const expectedTag = block => block.type === 'linkPreview' ? 'A' : ['spoiler', 'columns', 'attaches', 'table', 'poll', 'gallery', 'person', 'carousel'].includes(block.type) ? 'DIV' : block.type === 'toggle' ? 'DETAILS' : ['image', 'embed'].includes(block.type) ? 'FIGURE' : block.type === 'delimiter' ? 'HR' : block.type === 'checklist' ? 'UL' : block.type === 'list' ? block.data.style === 'ordered' ? 'OL' : 'UL'
      : block.type === 'heading' ? 'H' + block.data.level : block.type === 'quote' ? 'BLOCKQUOTE' : ['warning', 'code', 'raw'].includes(block.type) ? 'DIV' : 'P'
    const carouselCaptionMeaning = caption => legacy ? caption ? [caption] : [] : markupMeaning(caption)
    const canonical = blocks => blocks.map(block => ({ ...block, data: block.type === 'carousel' ? { ...block.data, slides: block.data.slides.map(slide => ({ ...slide, caption: carouselCaptionMeaning(slide.caption) })) } : block.type === 'person'
      ? { persons: block.data.persons.map(entry => ({ ...entry, name: markupMeaning(entry.name), role: markupMeaning(entry.role), bio: markupMeaning(entry.bio) })) } : block.type === 'poll' ? { ...block.data, question: markupMeaning(block.data.question), options: block.data.options.map(option => ({ ...option, text: markupMeaning(option.text) })) } : ['code', 'raw', 'delimiter', 'attaches', 'linkPreview'].includes(block.type) ? { ...block.data } : ['list', 'checklist'].includes(block.type)
      ? { ...block.data, items: block.data.items.map(item => typeof item === 'string'
        ? markupMeaning(item) : { ...item, text: markupMeaning(item.text) }) }
      : ['image', 'embed'].includes(block.type) ? { ...block.data, caption: markupMeaning(block.data.caption) }
      : block.type === 'gallery' ? { ...block.data, images: block.data.images.map(image => ({ ...image, caption: legacy ? image.caption : markupMeaning(image.caption) })) }
      : block.type === 'quote' ? { ...block.data, text: markupMeaning(block.data.text), caption: markupMeaning(block.data.caption) }
      : block.type === 'warning' ? { ...block.data, title: markupMeaning(block.data.title), message: markupMeaning(block.data.message) }
      : block.type === 'toggle' ? { ...block.data, title: markupMeaning(block.data.title), content: markupMeaning(block.data.content) }
      : block.type === 'spoiler' ? { ...block.data, label: markupMeaning(block.data.label), content: markupMeaning(block.data.content) }
      : block.type === 'columns' ? { ...block.data, columns: block.data.columns.map(column => ({ ...column, content: markupMeaning(column.content) })) }
      : block.type === 'table' ? legacy
        ? { ...block.data, content: block.data.content.map(row => row.map(markupMeaning)) }
        : { ...block.data, rows: block.data.rows.map(row => ({ ...row, cells: row.cells.map(cell => ({ ...cell, text: markupMeaning(cell.text) })) })) }
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
    const imageCaptionText = html => literalText(hasSidecars
      ? html.replaceAll('{{mention}}', '@Ada').replaceAll('{{swatch}}', '#123456') : html)
    const galleryCaptionText = caption => legacy
      ? hasSidecars ? caption.replaceAll('{{mention}}', '@Ada').replaceAll('{{swatch}}', '#123456') : caption
      : imageCaptionText(caption)
    const galleryRendererMarkup = root => ({
      layout: [...root.classList].filter(name => name.startsWith('eg--')),
      styles: { gap: root.style.gap, height: root.style.height },
      items: [...root.querySelectorAll('.editor-gallery__item')].map(item => ({
        tag: item.tagName, role: item.getAttribute('role'), tabIndex: item.tabIndex,
        label: item.getAttribute('aria-label'), radius: item.style.borderRadius,
        src: item.querySelector('img').getAttribute('src'), alt: item.querySelector('img').alt,
      })),
    })
    const expectedGalleryRendererMarkup = block => ({
      layout: [block.data.layout === 'auto' ? 'eg--1' : 'eg--' + block.data.layout],
      styles: { gap: block.data.styles.gap ?? '', height: block.data.styles.height ?? '' },
      items: block.data.images.map(image => ({ tag: 'FIGURE', role: 'button', tabIndex: 0,
        label: 'Open image' + (image.caption ? ': ' + galleryCaptionText(image.caption) : ''),
        radius: block.data.styles.borderRadius ?? '', src: image.url, alt: galleryCaptionText(image.caption),
      })),
    })
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
      src: block.data.file.url || null, alt: imageCaptionText(block.data.caption),
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
    const carouselRendererMarkup = root => ({
      label: root.getAttribute('aria-label'), aspectRatio: root.style.aspectRatio,
      fixedRatio: root.classList.contains('editor-carousel-block--fixed-ratio'),
      slides: [...root.querySelectorAll('.editor-carousel-block__slide')].map(figure => {
        const media = figure.firstElementChild, caption = figure.querySelector('figcaption')
        return { tag: figure.tagName, mediaTag: media.tagName,
          ...(media.tagName === 'IMG' ? { src: media.getAttribute('src'), alt: media.alt, loading: media.loading }
            : media.tagName === 'VIDEO' ? { src: media.getAttribute('src'), poster: media.getAttribute('poster'),
              controls: media.controls, preload: media.preload, label: media.getAttribute('aria-label') }
              : { html: authoredMarkup(media) }),
          caption: caption ? authoredMarkup(caption) : null }
      }),
      navigation: [...root.querySelectorAll('.carousel__arrow')].map(button => ({ label: button.getAttribute('aria-label'), tag: button.tagName })),
      pagination: [...root.querySelectorAll('.carousel__dot')].map(button => ({ label: button.getAttribute('aria-label'), current: button.getAttribute('aria-current') })),
      thumbnails: [...root.querySelectorAll('.carousel__thumb')].map(button => ({ label: button.getAttribute('aria-label'), current: button.getAttribute('aria-current'), src: button.querySelector('img')?.getAttribute('src') ?? null })),
    })
    const expectedCarouselRendererMarkup = block => ({
      label: 'Content carousel', aspectRatio: '', fixedRatio: false,
      slides: block.data.slides.map(slide => ({ tag: 'FIGURE', mediaTag: slide.type === 'image' ? 'IMG' : slide.type === 'video' ? 'VIDEO' : 'DIV',
        ...(slide.type === 'image' ? { src: slide.src, alt: slide.alt, loading: 'lazy' }
          : slide.type === 'video' ? { src: slide.src, poster: slide.poster, controls: true, preload: 'metadata', label: slide.alt }
            : { html: markupMeaning(slide.html) }),
        caption: slide.caption ? carouselCaptionMeaning(slide.caption) : null })),
      navigation: block.data.slides.length && block.data.options.navigation
        ? ['Previous slide', 'Next slide'].map(label => ({ label, tag: 'BUTTON' })) : [],
      pagination: block.data.options.pagination ? block.data.slides.map((_, index) => ({ label: 'Go to page ' + (index + 1), current: index ? 'false' : 'page' })) : [],
      thumbnails: block.data.options.thumbnails ? block.data.slides.map((slide, index) => ({ label: 'Go to slide ' + (index + 1),
        current: index ? 'false' : 'page', src: slide.type === 'image' ? slide.src : slide.type === 'video' ? slide.poster : null })) : [],
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
    const pollRendered = root => ({
      question: root.querySelector('.editor-poll__question') ? authoredMarkup(root.querySelector('.editor-poll__question')) : null,
      options: [...root.querySelectorAll('.editor-poll__option')].map(row => ({
        text: authoredMarkup(row.querySelector('.editor-poll__option-text')),
        markerType: row.querySelector('.editor-poll__marker').classList.contains('editor-poll__marker--multiple') ? 'multiple' : 'single',
        selected: row.querySelector('.editor-poll__marker').getAttribute('aria-pressed'),
        percent: row.querySelector('.editor-poll__pct')?.textContent ?? null,
      })),
      submitDisabled: root.querySelector('.editor-poll__submit').disabled,
    })
    const expectedPollRendered = block => ({
      question: block.data.question ? markupMeaning(block.data.question) : null,
      options: block.data.options.map((option, index) => ({ text: markupMeaning(option.text), markerType: block.data.type,
        selected: String(Boolean(block.data.initialResults?.currentUserVote?.includes(option.id))),
        percent: block.data.initialResults ? ['67%', '33%'][index] : '0%',
      })),
      submitDisabled: !block.data.initialResults?.currentUserVote?.length,
    })
    const linkPreviewMeaning = (card, prefix) => {
      if (!card || card.hidden) return null
      const title = card.querySelector('.' + prefix + '__title')
      const description = card.querySelector('.' + prefix + '__desc')
      const imageWrapper = card.querySelector('.' + prefix + '__image')
      const image = imageWrapper && !imageWrapper.hidden ? imageWrapper.querySelector('img') : null
      const favicon = [...card.querySelectorAll('.' + prefix + '__favicon,.' + prefix + '__favicon-large')].find(element => !element.hidden)
      return { href: card.getAttribute('href'), target: card.target, rel: card.rel,
        title: title.textContent, titleElements: title.childElementCount,
        description: description?.textContent ?? '', descriptionElements: description?.childElementCount ?? 0,
        domain: card.querySelector('.' + prefix + '__domain span').textContent,
        image: image?.getAttribute('src') ?? null, favicon: favicon?.getAttribute('src') ?? null,
      }
    }
    const expectedLinkPreviewMeaning = (block, editor = false) => editor && !block.data.url ? null : {
      href: block.data.url || null, target: '_blank', rel: 'noopener noreferrer',
      title: block.data.title || block.data.url, titleElements: 0,
      description: block.data.description, descriptionElements: 0,
      domain: block.data.domain || block.data.url,
      image: ['minimal', 'notion'].includes(block.data.template) ? null : block.data.image || null,
      favicon: block.data.favicon || null,
    }
    const personRendered = element => [...element.querySelectorAll('.editor-person__card')].map(card => {
      const markup = key => { const field = card.querySelector('.editor-person__' + key); return field ? authoredMarkup(field) : null }
      const avatar = card.querySelector('.editor-person__avatar-img')
      return { name: markup('name'), role: markup('role'), bio: markup('bio'),
        avatar: avatar ? { src: avatar.getAttribute('src'), alt: avatar.alt, loading: avatar.loading } : null,
        links: [...card.querySelectorAll('.editor-person__link')].map(link => ({ href: link.getAttribute('href'), target: link.target,
          rel: link.rel, title: link.title, text: link.querySelector('.editor-person__link-url').textContent,
          icon: Boolean(link.querySelector('.editor-person__link-icon svg')) })),
      }
    })
    const expectedPersonRendered = block => block.data.persons.map(entry => ({
      name: entry.name ? markupMeaning(entry.name) : null, role: entry.role ? markupMeaning(entry.role) : null,
      bio: entry.bio ? markupMeaning(entry.bio) : null,
      avatar: entry.avatar ? { src: entry.avatar, alt: imageCaptionText(entry.name), loading: 'lazy' } : null,
      links: entry.links.filter(link => link.url).map(link => ({ href: link.url, target: '_blank', rel: 'noopener noreferrer',
        title: link.type || 'Link', text: link.url.replace(/^https?:\/\//, ''), icon: true })),
    }))
    const rendererMarkup = element => element.dataset.blockType === 'carousel' ? carouselRendererMarkup(element) : element.dataset.blockType === 'gallery' ? galleryRendererMarkup(element) : element.dataset.blockType === 'person' ? personRendered(element) : element.dataset.blockType === 'linkPreview' ? linkPreviewMeaning(element, 'editor-link-preview') : element.dataset.blockType === 'poll' ? pollRendered(element) : element.dataset.blockType === 'table' ? {
      children: [...element.children].map(child => child.tagName),
      sections: [...element.querySelector('table').children].map(section => ({ tag: section.tagName,
        rows: [...section.children].map(row => ({ tag: row.tagName, cells: [...row.cells].map(cell => ({ tag: cell.tagName, markup: authoredMarkup(cell) })) })),
      })),
    } : element.dataset.blockType === 'attaches' ? attachmentRendererMarkup(element) : element.dataset.blockType === 'columns'
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
    const expectedTableRendererMarkup = block => {
      const rows = legacy ? block.data.content : block.data.rows.map(row => row.cells.map(cell => cell.text))
      const renderedRows = (sourceRows, tag) => sourceRows.map(cells => ({ tag: 'TR', cells: cells.map(text => ({ tag, markup: markupMeaning(text) })) }))
      return { children: ['TABLE'], sections: [
        ...(block.data.withHeadings ? [{ tag: 'THEAD', rows: renderedRows(rows.slice(0, 1), 'TH') }] : []),
        ...(rows.length > (block.data.withHeadings ? 1 : 0) ? [{ tag: 'TBODY', rows: renderedRows(rows.slice(block.data.withHeadings ? 1 : 0), 'TD') }] : []),
      ] }
    }
    const expectedRendererMarkup = block => block.type === 'carousel' ? expectedCarouselRendererMarkup(block) : block.type === 'person' ? expectedPersonRendered(block) : block.type === 'gallery' ? expectedGalleryRendererMarkup(block) : block.type === 'linkPreview' ? expectedLinkPreviewMeaning(block) : block.type === 'poll' ? expectedPollRendered(block) : block.type === 'table' ? expectedTableRendererMarkup(block) : block.type === 'attaches'
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
        check(phase, name + 'Widgets', widgets(root), specification.type === 'gallery' ? [] : expectedWidgets)
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
      if (specification.type === 'gallery' && specification.populated) {
        const pictures = [...mounted.querySelectorAll('.editor-gallery__image')]
        for (const picture of pictures) {
          picture.scrollIntoView({ block: 'nearest' })
          await picture.decode()
        }
        check(phase, 'mountedGalleryImagesDecoded', pictures.map(picture => ({ complete: picture.complete, width: picture.naturalWidth, height: picture.naturalHeight })),
          [{ complete: true, width: 1, height: 1 }, { complete: true, width: 1, height: 1 }])
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
        check(phase, 'editorFieldTag', field().tagName, noEditableField ? 'P' : specification.type === 'table' ? baseData.withHeadings ? 'TH' : 'TD' : specification.fieldTag ?? (plainField ? 'TEXTAREA' : specification.type === 'list' ? 'LI' : expectedTag(target)))
        if (plainField) {
          check(phase, 'editorAuthoredSource', field().value, text)
          check(phase, 'plainFieldDomIdentity', previousPlainFields.map(element => field() === element), [true])
          if (specification.type === 'code') check(phase, 'editorSourcePreview', shell(id).querySelector('.oe-code-pre code').textContent, text + '\n')
        } else if (plainContenteditable) check(phase, 'editorAuthoredPlainText', { text: field().textContent, elements: field().childElementCount }, { text, elements: 0 })
        else check(phase, noEditableField ? 'neighborAuthoredMarkup' : 'editorAuthoredMarkup', authoredMarkup(field()),
          specification.type === 'carousel' ? carouselCaptionMeaning(text) : markupMeaning(text))
      }
      if (specification.type === 'person') {
        const fields = personFields()
        const currentPerson = target.data.persons[0]
        check(phase, 'personAuthorFields', fields.slice(0, 3).map(element => ({ tag: element.tagName, markup: authoredMarkup(element), editable: element.isContentEditable })),
          ['name', 'role', 'bio'].map(key => ({ tag: 'DIV', markup: markupMeaning(currentPerson[key]), editable: !readOnly })))
        check(phase, 'personLinks', fields.slice(3).map(input => ({ tag: input.tagName, value: input.value, readOnly: input.readOnly })),
          [...currentPerson.links.map(link => ({ tag: 'INPUT', value: link.url, readOnly })), ...(legacy && !readOnly ? [{ tag: 'INPUT', value: '', readOnly: false }] : [])])
        check(phase, 'personTabs', [...shell(id).querySelectorAll('.oe-person__tab-label')].map(element => element.textContent),
          target.data.persons.map((entry, index) => imageCaptionText(entry.name) || 'Person ' + (index + 1)))
        if (!legacy) {
          check(phase, 'personTabIds', [...shell(id).querySelectorAll('[data-person-id]')].map(element => element.dataset.personId), target.data.persons.map(entry => entry.id))
          check(phase, 'personLinkIds', fields.slice(3).map(input => input.dataset.linkId), currentPerson.links.map(link => link.id))
          check(phase, 'personActiveTab', [...shell(id).querySelectorAll('.oe-person__tab-select')].map(element => element.getAttribute('aria-pressed')), target.data.persons.map((_, index) => String(index === 0)))
        }
        check(phase, 'personAvatar', shell(id).querySelector('.oe-person__card .oe-person__avatar-img')?.getAttribute('src') ?? null, currentPerson.avatar || null)
        check(phase, 'personFieldLifetime', { currentConnected: fields.every(element => element.isConnected),
          predecessors: previousPersonFields.map(element => fields.includes(element) || !element.isConnected) },
          { currentConnected: true, predecessors: previousPersonFields.map(() => true) })
        if (phase === 'edit') check(phase, 'personNativeFieldIdentity', previousPersonFields.map((element, index) => fields[index] === element), previousPersonFields.map(() => true))
        const retired = previousPersonFields.filter(element => !fields.includes(element))
        if (retired.length) {
          const beforeSelection = nativeSelectionOwner()
          for (const old of retired) {
            if (old.tagName === 'INPUT') old.value = 'https://example.test/retired'
            else old.textContent = 'retired person field'
            old.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: 'retired' }))
            old.dispatchEvent(new FocusEvent('blur'))
          }
          await settled()
          check(phase, 'personRetiredFieldsLeaveCanonical', editor.save().blocks, saved.blocks)
          check(phase, 'personRetiredFieldsLeaveHistory', { canUndo: editor.canUndo, canRedo: editor.canRedo }, history)
          check(phase, 'personRetiredFieldsLeaveSelection', nativeSelectionOwner(), beforeSelection)
        }
        previousPersonFields = fields
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
          }, { src: pixel, alt: imageCaptionText(text), styles: expectedImageStyles(true), background: 'rgb(255, 238, 204)' })
        } else {
          check(phase, 'emptyImageHasNoAuthoring', wrapper.querySelectorAll('[contenteditable="true"]').length, 0)
          check(phase, 'emptyImageHasNoVisibleMedia', [...wrapper.querySelectorAll('img')].filter(picture => picture.getClientRects().length).length, 0)
        }
      }
      if (specification.type === 'gallery') {
        const wrapper = shell(id).querySelector('.oe-gallery')
        const fields = galleryFields()
        const images = withEditedText(specification, baseData, text).images
        check(phase, 'galleryWrapperIdentity', [wrapper === previousGalleryWrapper], [true])
        check(phase, 'galleryAuthorFields', fields.map(element => ({
          tag: element.tagName, caption: legacy ? element.textContent : authoredMarkup(element), editable: element.isContentEditable,
          src: element.parentElement.querySelector('img').getAttribute('src'), alt: element.parentElement.querySelector('img').alt,
        })), images.map(image => ({ tag: 'DIV', caption: legacy ? image.caption : markupMeaning(image.caption), editable: !readOnly,
          src: image.url, alt: galleryCaptionText(image.caption),
        })))
        if (!legacy) check(phase, 'galleryImageIds', fields.map(element => element.dataset.imageId), images.map(image => image.id))
        check(phase, 'galleryFieldLifetime', previousGalleryFields.map((element, index) =>
          fields[index]?.isConnected && (fields[index] === element || !element.isConnected)), previousGalleryFields.map(() => true))
        if (phase === 'edit') check(phase, 'galleryNativeFieldIdentity', previousGalleryFields.map((element, index) => fields[index] === element), previousGalleryFields.map(() => true))
        const retiredFields = previousGalleryFields.filter(element => !fields.includes(element))
        if (retiredFields.length) {
          for (const element of retiredFields) {
            element.textContent = 'Retired Gallery caption'
            element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: 'retired' }))
            element.dispatchEvent(new FocusEvent('blur'))
          }
          for (const control of previousGalleryRemoveControls) if (!control.isConnected) control.click()
          await settled()
          check(phase, 'galleryRetiredActionsLeaveCanonical', editor.save().blocks, saved.blocks)
          check(phase, 'galleryRetiredActionsLeaveHistory', { canUndo: editor.canUndo, canRedo: editor.canRedo }, history)
          check(phase, 'galleryRetiredActionsLeaveFields', fields.map(element => legacy ? element.textContent : authoredMarkup(element)),
            images.map(image => legacy ? image.caption : markupMeaning(image.caption)))
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
      if (specification.type === 'carousel') {
        const [wrapper, caption, next] = carouselParts()
        check(phase, 'carouselWrapperIdentity', wrapper === previousCarouselParts[0], true)
        check(phase, 'carouselEditorView', {
          captions: wrapper.querySelectorAll('.oe-carousel-block__caption').length,
          counter: wrapper.querySelector('.oe-carousel-block__counter')?.textContent ?? null,
          aspectRatio: wrapper.querySelector('.oe-carousel-block__stage')?.style.aspectRatio ?? '',
          navigation: [...wrapper.querySelectorAll('.oe-carousel-block__nav')].map(button => ({ label: button.getAttribute('aria-label'), disabled: button.disabled })),
          pagination: [...wrapper.querySelectorAll('.oe-carousel-block__dot')].map(button => ({ label: button.getAttribute('aria-label'), current: button.getAttribute('aria-current') })),
          thumbnails: [...wrapper.querySelectorAll('.oe-carousel-block__thumbnail')].map(button => ({ label: button.getAttribute('aria-label'), current: button.getAttribute('aria-current') })),
        }, {
          captions: specification.populated ? 1 : 0, counter: specification.populated ? '1 / 3' : null, aspectRatio: '',
          navigation: specification.populated ? [{ label: 'Previous slide', disabled: true }, { label: 'Next slide', disabled: false }] : [],
          pagination: specification.populated ? [0, 1, 2].map(index => ({ label: 'Go to slide ' + (index + 1), current: String(index === 0) })) : [],
          thumbnails: specification.populated ? [0, 1, 2].map(index => ({ label: 'Go to slide ' + (index + 1), current: String(index === 0) })) : [],
        })
        if (emptyCarousel) check(phase, 'emptyCarouselHasNoAuthoring', wrapper.querySelectorAll('[contenteditable="true"]').length, 0)
        else {
          const picture = wrapper.querySelector('.oe-carousel-block__media img')
          await picture.decode()
          check(phase, 'carouselEditorMedia', { src: picture.getAttribute('src'), alt: picture.alt, width: picture.naturalWidth, height: picture.naturalHeight },
            { src: pixel, alt: 'First <&> image', width: 1, height: 1 })
          if (!legacy) check(phase, 'carouselCaptionAddress', caption.dataset.slideId, 'first')
          check(phase, 'carouselCaptionLifetime', { connected: caption.isConnected,
            predecessorCurrentOrDetached: previousCarouselParts[1] === caption || !previousCarouselParts[1].isConnected },
          { connected: true, predecessorCurrentOrDetached: true })
          if (caption !== previousCarouselParts[1]) {
            const beforeSelection = nativeSelectionOwner()
            previousCarouselParts[1].textContent = 'stale retired caption'
            previousCarouselParts[1].dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: 'stale' }))
            previousCarouselParts[1].dispatchEvent(new FocusEvent('blur'))
            if (previousCarouselParts[2] && previousCarouselParts[2] !== next) previousCarouselParts[2].click()
            await settled()
            check(phase, 'carouselRetiredActionsLeaveCanonical', editor.save().blocks, saved.blocks)
            check(phase, 'carouselRetiredActionsLeaveHistory', { canUndo: editor.canUndo, canRedo: editor.canRedo }, history)
            check(phase, 'carouselRetiredActionsLeaveField', field() === caption, true)
            check(phase, 'carouselRetiredActionsLeaveSelection', nativeSelectionOwner(), beforeSelection)
          }
        }
      }
      if (specification.type === 'linkPreview') {
        const wrapper = shell(id).querySelector('.oe-lp')
        check(phase, 'linkPreviewCard', linkPreviewMeaning(wrapper.querySelector('.oe-lp__card'), 'oe-lp'), expectedLinkPreviewMeaning(target, true))
        check(phase, 'linkPreviewTemplate', wrapper.querySelector('.oe-lp__card')?.classList.contains('oe-lp__card--' + target.data.template) ?? !target.data.url, true)
        check(phase, 'linkPreviewInputType', field().type, 'text')
        check(phase, 'linkPreviewFieldOnly', wrapper.querySelectorAll('[contenteditable="true"],input,textarea').length, 1)
      }
      if (specification.type === 'poll') {
        const fields = pollFields()
        const options = target.data.options
        check(phase, 'pollAuthorFields', fields.map(element => ({ tag: element.tagName, markup: authoredMarkup(element), editable: element.isContentEditable })),
          [text, ...options.map(option => option.text)].map(html => ({ tag: 'DIV', markup: markupMeaning(html), editable: !readOnly })))
        const replaced = fields.some((element, index) => element !== previousPollFields[index])
        check(phase, 'pollFieldLifetime', previousPollFields.map((element, index) =>
          fields[index].isConnected && (element === fields[index] || !element.isConnected)), [true, true, true])
        if (replaced) {
          const priorHistory = { canUndo: editor.canUndo, canRedo: editor.canRedo }
          for (const old of previousPollFields) if (!fields.includes(old)) {
            old.textContent = 'retired poll text'
            old.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: 'retired' }))
            old.dispatchEvent(new FocusEvent('blur'))
          }
          await settled()
          check(phase, 'pollRetiredFieldsLeaveCanonical', editor.save().blocks, saved.blocks)
          check(phase, 'pollRetiredFieldsLeaveHistory', { canUndo: editor.canUndo, canRedo: editor.canRedo }, priorHistory)
        }
        if (!legacy) check(phase, 'pollOptionDomIds', fields.slice(1).map(element => element.dataset.optionId), options.map(option => option.id))
        check(phase, 'pollResultsText', [...shell(id).querySelectorAll('.oe-poll__result-label')].map(element => element.textContent),
          options.map(option => option.text ? imageCaptionText(option.text) : '—'))
        check(phase, 'pollResultsMarkup', [...shell(id).querySelectorAll('.oe-poll__result-label')].map(element => markupMeaning(element.innerHTML)),
          options.map(option => markupMeaning(option.text ? option.text.replaceAll('{{mention}}', '@Ada').replaceAll('{{swatch}}', '#123456') : '—')))
        check(phase, 'pollResultPercentages', [...shell(id).querySelectorAll('.oe-poll__result-pct')].map(element => element.textContent), specification.populated ? ['67%', '33%'] : ['0%', '0%'])
        previousPollFields = fields
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
      if (specification.type === 'table') {
        const expectedRows = withEditedText(specification, baseData, text).rows
        const rows = tableRows()
        const parts = tableParts()
        check(phase, 'tableFields', rows.map(row => ({ tag: row.tagName,
          cells: [...row.cells].map(cell => ({ tag: cell.tagName, markup: authoredMarkup(cell), editable: cell.isContentEditable })),
        })), expectedRows.map((row, rowIndex) => ({ tag: 'TR', cells: row.cells.map(cell => ({
          tag: baseData.withHeadings && rowIndex === 0 ? 'TH' : 'TD', markup: markupMeaning(cell.text), editable: !readOnly,
        })) })))
        check(phase, 'tableDomIdentity', previousTableParts.map((element, index) => element === parts[index]), previousTableParts.map(() => true))
        check(phase, 'tableHeadings', shell(id).querySelector('.oe-table-wrapper').dataset.headings, String(baseData.withHeadings))
        if (!legacy) check(phase, 'tableDomIds', rows.map(row => ({ id: row.dataset.rowId,
          cells: [...row.cells].map(cell => ({ rowId: cell.dataset.rowId, id: cell.dataset.cellId })),
        })), expectedRows.map(row => ({ id: row.id, cells: row.cells.map(cell => ({ rowId: row.id, id: cell.id })) })))
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
      if (['poll', 'gallery', 'person', 'carousel'].includes(specification.type)) check(phase, specification.type + 'WidgetLifetime', previousWidgets.map(([widgetId, element]) => {
        const current = shell(id).querySelector(`[data-id="${widgetId}"]`)
        return Boolean(current?.isConnected) && (element === current || !element.isConnected)
      }), previousWidgets.map(() => true))
      else check(phase, 'widgetDomIdentity', previousWidgets.map(([widgetId, element]) => shell(id).querySelector(`[data-id="${widgetId}"]`) === element), previousWidgets.map(() => true))
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
      previousTableParts = specification.type === 'table' ? tableParts() : []
      previousAttachmentFields = specification.type === 'attaches' ? attachmentFields() : []
      previousAttachmentWrapper = specification.type === 'attaches' ? shell(id).querySelector('.oe-attaches') : null
      previousPlainFields = plainField ? [field()] : []
      previousDelimiter = noEditableField ? shell(id).querySelector('.oe-delimiter') : null
      previousImageParts = specification.type === 'image' ? imageParts() : []
      previousEmbedParts = specification.type === 'embed' ? embedParts() : []
      previousEmbedText = specification.type === 'embed' ? text : undefined
      previousGalleryWrapper = specification.type === 'gallery' ? shell(id).querySelector('.oe-gallery') : null
      previousGalleryFields = specification.type === 'gallery' ? galleryFields() : []
      previousGalleryRemoveControls = specification.type === 'gallery' ? [...shell(id).querySelectorAll('.oe-gallery__slot-remove')] : []
      previousCarouselParts = specification.type === 'carousel' ? carouselParts() : []
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
    if (specification.type === 'gallery' && specification.populated && !legacy) {
      check('read-only', 'galleryFocusRejected', editor.blocks.focus(id, { fieldKey: 'image:first:caption', offset: 'end' }), false)
      check('read-only', 'galleryReadonlyFocusOwner', document.activeElement === outside, true)
    }
    await inspect('read-only', baseText, true, { canUndo: false, canRedo: false })
    setPhase('editable-transition')
    editor.setReadOnly(false)
    await settled()
    check('editable-again', 'foreignFocusPreserved', document.activeElement === outside, true)
    await inspect('editable-again', baseText, false, { canUndo: false, canRedo: false })
    if (specification.type === 'person' && specification.populated) {
      for (const index of [1, 0]) {
        const phase = index ? 'view-second' : 'view-return'
        setPhase(phase)
        const tabs = [...shell(id).querySelectorAll('.oe-person__tab')].filter(tab => tab.querySelector('.oe-person__tab-label'))
        const control = legacy ? tabs[index] : tabs[index].querySelector('.oe-person__tab-select')
        control.scrollIntoView({ block: 'nearest' })
        await settled()
        await focusField(control)
        await settled()
        const expectedPerson = baseData.persons[index], fields = personFields(), saved = editor.save()
        check(phase, 'personViewAuthorFields', fields.slice(0, 3).map(authoredMarkup), ['name', 'role', 'bio'].map(key => markupMeaning(expectedPerson[key])))
        check(phase, 'personViewLinks', fields.slice(3).map(input => input.value), [...expectedPerson.links.map(link => link.url), ...(legacy ? [''] : [])])
        check(phase, 'personViewTabs', [...shell(id).querySelectorAll('.oe-person__tab-label')].map(element => element.textContent),
          baseData.persons.map(entry => imageCaptionText(entry.name)))
        check(phase, 'personViewWidgets', widgets(shell(id)), index ? [] : expectedWidgets)
        check(phase, 'personViewCanonical', canonical(saved.blocks), canonical(expectedBlocks(baseText)))
        check(phase, 'personViewHistory', { canUndo: editor.canUndo, canRedo: editor.canRedo }, { canUndo: false, canRedo: false })
        check(phase, 'personViewRetiredFields', previousPersonFields.map(element => !element.isConnected), previousPersonFields.map(() => true))
        if (!legacy) check(phase, 'personViewActiveId', shell(id).querySelector('.oe-person__tab--active').dataset.personId, expectedPerson.id)
        phases.push({ phase, blocks: saved.blocks, editorHtml: field().innerHTML, mountedHtml: mounted.innerHTML,
          selection: caretIn(field()), selectionOwner: nativeSelectionOwner(), readOnly: editor.readOnly })
        previousPersonFields = fields
        previousWidgets = [...shell(id).querySelectorAll('[data-inline-plugin]')].map(element => [element.dataset.id, element])
      }
    }
    if (specification.type === 'carousel' && specification.populated) {
      const beforeNavigation = editor.save().blocks
      for (const index of [1, 2, 0]) {
        const control = shell(id).querySelectorAll('.oe-carousel-block__dot')[index]
        control.scrollIntoView({ block: 'nearest' })
        await settled()
        const trustedBefore = trusted.filter(event => event.type === 'mousedown' && event.trusted).length
        await focusField(control)
        await settled()
        const wrapper = shell(id).querySelector('.oe-carousel-block')
        const media = wrapper.querySelector('.oe-carousel-block__media').firstElementChild
        const slide = baseData.slides[index]
        let videoSize = null
        if (slide.type === 'video') {
          let timer
          try {
            if (media.readyState < 1) await Promise.race([
              new Promise((resolve, reject) => {
                media.addEventListener('loadedmetadata', resolve, { once: true })
                media.addEventListener('error', () => reject(new Error('Local Carousel video metadata failed')), { once: true })
              }),
              new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Local Carousel video metadata timed out')), 3000) }),
            ])
            videoSize = { width: media.videoWidth, height: media.videoHeight, controls: media.controls, preload: media.preload }
          } finally { clearTimeout(timer) }
        }
        check('editable-again', 'carouselViewNavigation:' + slide.type, {
          trustedClick: trusted.filter(event => event.type === 'mousedown' && event.trusted).length === trustedBefore + 1,
          counter: wrapper.querySelector('.oe-carousel-block__counter').textContent,
          tag: media.tagName, caption: authoredMarkup(field()),
          videoSize, html: slide.type === 'html' ? authoredMarkup(media) : null,
          dataUnchanged: JSON.stringify(editor.save().blocks) === JSON.stringify(beforeNavigation),
          history: { canUndo: editor.canUndo, canRedo: editor.canRedo },
        }, {
          trustedClick: true, counter: `${index + 1} / 3`, tag: slide.type === 'image' ? 'IMG' : slide.type === 'video' ? 'VIDEO' : 'DIV',
          caption: carouselCaptionMeaning(slide.caption),
          videoSize: slide.type === 'video' ? { width: 16, height: 16, controls: true, preload: 'metadata' } : null,
          html: slide.type === 'html' ? markupMeaning(slide.html) : null,
          dataUnchanged: true, history: { canUndo: false, canRedo: false },
        })
      }
    }
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
      if (specification.type === 'gallery' && !legacy) {
        for (const [index, image] of baseData.images.entries()) {
          check('edit', 'galleryAddress:' + image.id, {
            accepted: editor.blocks.focus(id, { fieldKey: 'image:' + image.id + ':caption', offset: 'end' }),
            active: document.activeElement === galleryFields()[index],
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
      const offset = plainField || plainContenteditable || legacy && specification.type === 'carousel' ? baseText.length : specification.type === 'gallery' && !hasSidecars ? literalText(baseText).length : logicalLength(baseText)
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
      const appended = specification.type === 'linkPreview' && !specification.populated ? 'https://example.test/roundtrip' : 'X'
      await typeText(appended)
      if (specification.type === 'linkPreview') await pause(650)
      await settled()
      await inspect('edit', baseText + appended, false, { canUndo: true, canRedo: false }, offset + appended.length)
      check('edit', 'trustedInput', trusted.some(event => event.type === 'input' && event.inputType === 'insertText' && event.trusted), true)
      setPhase('undo')
      await shortcut('undo')
      await settled()
      await inspect('undo', baseText, false, { canUndo: false, canRedo: true }, offset)
      check('undo', 'exactOriginalRecords', snapshots.undo, snapshots.load)
      setPhase('redo')
      await shortcut('redo')
      await settled()
      await inspect('redo', baseText + appended, false, { canUndo: true, canRedo: false }, offset + appended.length)
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
