// Detailed BLOCK_GALLERY_CAPTION_ORDER proof. Expected records come from
// fixed author input, never from the editor's initial save.
export const galleryCaptionOrderCases = Object.freeze(['literal', 'rich', 'widgets'].flatMap(mode =>
  ['swap', 'remove'].map(action => Object.freeze({ id: `BLOCK_GALLERY_CAPTION_ORDER/${mode}-${action}`, mode, action }))))

const pictures = Object.freeze([
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGO4ZmVPEmIY1TCqYfhqAACwH08Q21f11gAAAABJRU5ErkJggg==',
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGNQLrlFEmIY1TCqYfhqAAB1HHEQHZcqXwAAAABJRU5ErkJggg==',
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGNQnh1LEmIY1TCqYfhqAAA6bxsQDW4dzwAAAABJRU5ErkJggg==',
])
const ids = ['alpha', 'bravo', 'charlie']
const plain = ['Alpha & <one> tail', 'Bravo & <two> tail', 'Charlie & <three> tail']
const rich = ['<b>Alpha</b> <i>one</i> tail', '<mark>Bravo</mark> <s>two</s> tail', '<code>Charlie</code> <b>three</b> tail']
const widgets = ['<b>Alpha</b> <i>{{mention}}</i> tail', '<mark>Bravo</mark> <s>{{swatch}}</s> tail', rich[2]]
// Fixed author vectors are also used by the offline historical recognizer.
// No production code or observed editor output defines these expectations.
export const galleryCaptionOrderInput = Object.freeze({ pictures, ids, plain, rich, widgets })
const clone = value => JSON.parse(JSON.stringify(value))
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value
const pause = (ms = 20) => new Promise(resolve => setTimeout(resolve, ms))
const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

function markup(html) {
  const template = document.createElement('template')
  template.innerHTML = html
  const visit = node => node.nodeType === Node.TEXT_NODE ? node.data : {
    tag: node.localName, attributes: Object.fromEntries([...node.attributes].map(attribute => [attribute.name, attribute.value]).sort()),
    children: [...node.childNodes].map(visit),
  }
  return [...template.content.childNodes].map(visit)
}

function authorMarkup(field) {
  const copy = field.cloneNode(true)
  for (const widget of copy.querySelectorAll('[data-inline-plugin]')) widget.replaceWith(document.createTextNode(`{{${widget.dataset.id}}}`))
  return markup(copy.innerHTML)
}

function visibleText(html) {
  const template = document.createElement('template')
  template.innerHTML = html.replaceAll('{{mention}}', '@Ada').replaceAll('{{swatch}}', '#123456')
  return template.content.textContent
}

async function settled() {
  const deadline = Date.now() + 10_000
  while ([...document.querySelectorAll('link[rel="stylesheet"]')].some(link => !link.disabled && !link.sheet)) {
    if (Date.now() > deadline) throw new Error('Gallery styles did not load')
    await pause()
  }
  await document.fonts?.ready
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  await pause()
}

// Native operations are supplied by Playwright or the project's CDP bridge.
// Input construction only adapts documented historical envelopes and the v1
// literal-caption wire format. Rich HTML/sidecars are never flattened for v1.
export async function runGalleryCaptionOrderCase(specification, { sourceBase, legacy = false, input, onPhase = () => {} }) {
  const base = new URL(sourceBase, import.meta.url)
  const [{ createEditor }, gallery, paragraph, mention, color] = await Promise.all([
    import(new URL('core/index.js', base).href), import(new URL('plugins/gallery/index.js', base).href),
    import(new URL('plugins/paragraph/index.js', base).href), import(new URL('inline-plugins/mention/index.js', base).href),
    import(new URL('inline-plugins/color.js', base).href),
  ])
  const captions = specification.mode === 'literal' ? plain.map(value => legacy ? value : escape(value))
    : specification.mode === 'rich' ? rich : widgets
  const sidecar = (type, data) => ({ type, ...(!legacy ? { dataVersion: 1 } : {}), data })
  const inline = { mention: sidecar('mention', { id: 'ada', name: 'Ada' }), swatch: sidecar('color', { value: '#123456' }) }
  const record = (id, type, data, extra = {}) => ({ id, type, ...(!legacy ? { dataVersion: 2 } : {}), data, ...extra })
  const expected = (order = [0, 1, 2], edited = false) => [
    record('prefix', 'paragraph', { text: '<b>Before</b>' }),
    record('probe', 'gallery', {
      images: order.map(index => ({ ...(!legacy ? { id: ids[index] } : {}), url: pictures[index], caption: captions[index] + (edited && index === 1 ? 'X' : '') })),
      layout: '3c', styles: { gap: '8px', height: '240px', borderRadius: '6px' },
      options: { loop: false, zoom: true, navigation: true, captions: true, fullscreen: false, thumbnails: true },
    }, specification.mode === 'widgets' ? { inline: Object.fromEntries(Object.entries(inline).filter(([key]) => order.includes(key === 'mention' ? 0 : 1))) } : {}),
    record('suffix', 'paragraph', { text: '<i>After</i>' }),
  ]
  const original = { version: legacy ? '1.0.5' : '2.0.0', blocks: clone(expected()) }
  const originalJson = JSON.stringify(original)
  const holder = document.createElement('section')
  holder.style.width = '920px'
  document.body.append(holder)
  const observations = [], phases = [], events = []
  let editor, phase = 'create', providerCalls = 0
  const setPhase = value => { phase = value; onPhase(value) }
  const check = (property, actual, wanted) => observations.push({ phase, property,
    status: JSON.stringify(stable(actual)) === JSON.stringify(stable(wanted)) ? 'PASS' : 'FAIL', actual, expected: wanted })
  const eventsFor = type => events.filter(event => event.phase === phase && event.type === type)
  const slotFor = index => [...holder.querySelectorAll('.oe-gallery__slot--filled')]
    .find(slot => slot.querySelector('img')?.getAttribute('src') === pictures[index])
  const fieldFor = index => slotFor(index)?.querySelector('.oe-gallery__slot-caption')
  const canonical = blocks => blocks.map(block => block.type === 'gallery' ? { ...block, data: {
    ...block.data, images: block.data.images.map(image => ({ ...image,
      caption: legacy && specification.mode === 'literal' ? image.caption : markup(image.caption),
    })),
  } } : block)
  const capture = event => {
    const slot = event.target.closest?.('.oe-gallery__slot--filled')
    events.push({ phase, type: event.type, trusted: event.isTrusted, key: event.key ?? null,
      inputType: event.inputType ?? null, image: pictures.indexOf(slot?.querySelector('img')?.getAttribute('src')),
      target: event.target.nodeName, className: event.target.className ?? null })
  }
  for (const type of ['mousedown', 'click', 'input', 'dragstart', 'drop', 'keydown']) holder.addEventListener(type, capture, true)

  async function click(element) {
    if (!(element instanceof HTMLElement)) throw new Error('Gallery native action target is missing')
    element.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    await settled()
    const rect = element.getBoundingClientRect()
    if (!rect.width || !rect.height) throw new Error('Gallery native action target is not visible')
    await input('click', { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
    await settled()
  }
  async function inspect(name, order, edited, canUndo, canRedo) {
    setPhase(name)
    await settled()
    const blocks = editor.save().blocks, wanted = expected(order, edited)
    const images = wanted[1].data.images
    const fields = [...holder.querySelectorAll('.oe-gallery__slot-caption')]
    check('canonicalRecords', canonical(blocks), canonical(wanted))
    check('authorCaptionOrder', fields.map(field => ({ url: field.parentElement.querySelector('img').getAttribute('src'), markup: authorMarkup(field) })),
      images.map(image => ({ url: image.url, markup: legacy && specification.mode === 'literal' ? [image.caption] : markup(image.caption) })))
    check('alternativeTextOrder', fields.map(field => field.parentElement.querySelector('img').alt),
      images.map(image => legacy && specification.mode === 'literal' ? image.caption : visibleText(image.caption)))
    if (!legacy) check('imageIdOrder', fields.map(field => ({ slot: field.parentElement.dataset.imageId, caption: field.dataset.imageId })),
      images.map(image => ({ slot: image.id, caption: image.id })))
    check('inlineWidgetsByImage', fields.map(field => ({ url: field.parentElement.querySelector('img').getAttribute('src'),
      widgets: [...field.querySelectorAll('[data-inline-plugin]')].map(widget => ({ id: widget.dataset.id, type: widget.dataset.inlinePlugin, text: widget.textContent })) })),
    images.map(image => ({ url: image.url, widgets: specification.mode !== 'widgets' ? [] : image.url === pictures[0]
      ? [{ id: 'mention', type: 'mention', text: '@Ada' }] : image.url === pictures[1]
        ? [{ id: 'swatch', type: 'color', text: '#123456' }] : [] })))
    check('historyState', { canUndo: editor.canUndo, canRedo: editor.canRedo }, { canUndo, canRedo })
    check('callerInputUnchanged', JSON.stringify(original), originalJson)
    check('providerCalls', providerCalls, 0)
    phases.push({ phase, blocks, fields: fields.map(field => field.innerHTML), active: {
      blockId: document.activeElement?.closest('[data-block-id]')?.dataset.blockId ?? null,
      className: document.activeElement?.className ?? null,
    }, canUndo: editor.canUndo, canRedo: editor.canRedo })
  }
  const changedOrder = specification.action === 'swap' ? [2, 1, 0] : [0, 2]
  const planned = ['load', 'edit', specification.action, 'undo-action', 'undo-edit', 'redo-edit', 'redo-action', 'dispose']
  try {
    editor = createEditor({ holder, injectStyles: true, defaultBlock: 'paragraph', data: original, inlineTools: [],
      plugins: legacy ? [new paragraph.Paragraph(), new gallery.Gallery()] : [paragraph.createParagraphPlugin(), gallery.createGalleryPlugin()],
      inlinePlugins: [mention.createMentionPlugin({ searchFunction: async () => { providerCalls++; return [] } }), color.createColorSwatchPlugin()],
    })
    await inspect('load', [0, 1, 2], false, false, false)
    setPhase('edit')
    await click(fieldFor(1))
    const field = fieldFor(1), range = document.createRange()
    range.selectNodeContents(field); range.collapse(false)
    getSelection().removeAllRanges(); getSelection().addRange(range)
    await input('type', 'X')
    await inspect('edit', [0, 1, 2], true, true, false)
    check('trustedCaptionInput', eventsFor('input').map(event => ({ trusted: event.trusted, image: event.image, inputType: event.inputType })),
      [{ trusted: true, image: 1, inputType: 'insertText' }])
    setPhase(specification.action)
    if (specification.action === 'swap') {
      await click(slotFor(0).querySelector('img'))
      const rect = element => { const box = element.getBoundingClientRect(); return { x: box.left + box.width / 2, y: box.top + box.height / 2 } }
      await input('drag', { from: rect(slotFor(0).querySelector('img')), to: rect(slotFor(2).querySelector('img')) })
    } else await click(slotFor(1).querySelector('.oe-gallery__slot-remove'))
    await inspect(specification.action, changedOrder, true, true, false)
    if (specification.action === 'swap') {
      check('trustedSwapGesture', { starts: eventsFor('dragstart').map(event => ({ trusted: event.trusted, image: event.image })),
        drops: eventsFor('drop').map(event => ({ trusted: event.trusted, image: event.image })) },
      { starts: [{ trusted: true, image: 0 }], drops: [{ trusted: true, image: 2 }] })
    } else check('trustedRemoveClick', eventsFor('click').filter(event => event.className === 'oe-gallery__slot-remove')
      .map(event => ({ trusted: event.trusted, image: event.image })), [{ trusted: true, image: 1 }])
    for (const [name, action, order, edited, canUndo, canRedo] of [
      ['undo-action', 'undo', [0, 1, 2], true, true, true], ['undo-edit', 'undo', [0, 1, 2], false, false, true],
      ['redo-edit', 'redo', [0, 1, 2], true, true, true], ['redo-action', 'redo', changedOrder, true, true, false],
    ]) {
      setPhase(name)
      await input(action)
      await inspect(name, order, edited, canUndo, canRedo)
      check('trustedHistoryShortcut', eventsFor('keydown').filter(event => event.key?.toLowerCase() === 'z').map(event => event.trusted), [true])
    }
    setPhase('dispose')
    editor.destroy()
    check('editorReleased', holder.childElementCount, 0)
    phases.push({ phase })
  } catch (error) {
    observations.push({ phase, property: 'execution', status: 'ERROR', actual: error.message ?? String(error) })
  } finally {
    editor?.destroy()
    holder.remove()
  }
  return { ...specification, legacy, phases, completedPhases: phases.map(value => value.phase),
    incompletePhases: planned.filter(name => !phases.some(value => value.phase === name)), events, observations,
    failures: observations.filter(value => value.status !== 'PASS'),
    ...(legacy ? { referenceCapabilities: { persistentImageIds: false, richCaptions: false, captionInlineWidgets: false } } : {}),
  }
}
