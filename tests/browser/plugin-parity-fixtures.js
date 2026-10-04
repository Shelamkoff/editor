import * as plugins from '../../plugins/index.js'

export const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M/wHwAF/gL+Av7lWQAAAABJRU5ErkJggg=='
const field = (key, path, value = 'Alpha') => ({ key, path: path.split('.'), value })
const item = (id, text) => ({ id, text })

// Independent authoring examples, using the current schema. Expectations below
// describe visible v1 editing behavior, not the implementation's exported data.
export const pluginParityFixtures = [
  ['Paragraph', plugins.createParagraphPlugin, { text: 'Alpha' }, [field('text', 'text')], 'Alpha'],
  ['Heading', plugins.createHeadingPlugin, { text: 'Alpha', level: 3 }, [field('text', 'text')], 'Alpha'],
  ['List', plugins.createListPlugin, { style: 'ordered', items: [item('first', 'Alpha'), item('second', 'Bravo')] }, [field('item:first', 'items.0.text'), field('item:second', 'items.1.text', 'Bravo')], 'Alpha<br>Bravo'],
  ['Quote', plugins.createQuotePlugin, { text: 'Alpha', caption: 'Bravo' }, [field('text', 'text'), field('caption', 'caption', 'Bravo')], 'Alpha<br>Bravo'],
  ['Code', plugins.createCodePlugin, { code: 'Alpha', language: 'plaintext' }, [field('code', 'code')], 'Alpha'],
  ['Image', plugins.createImagePlugin, { file: { url: pixel }, caption: 'Alpha' }, [field('caption', 'caption')], 'Alpha'],
  ['Delimiter', plugins.createDelimiterPlugin, {}, [], null],
  ['Table', plugins.createTablePlugin, { withHeadings: true, rows: [{ id: 'row', cells: [item('first', 'Alpha'), item('second', 'Bravo')] }] }, [field('cell:row:first', 'rows.0.cells.0.text'), field('cell:row:second', 'rows.0.cells.1.text', 'Bravo')], 'Alpha — Bravo'],
  ['Checklist', plugins.createChecklistPlugin, { items: [{ ...item('first', 'Alpha'), checked: true }, { ...item('second', 'Bravo'), checked: false }] }, [field('item:first', 'items.0.text'), field('item:second', 'items.1.text', 'Bravo')], 'Alpha<br>Bravo'],
  ['Warning', plugins.createWarningPlugin, { title: 'Alpha', message: 'Bravo' }, [field('title', 'title'), field('message', 'message', 'Bravo')], 'Alpha<br>Bravo'],
  ['Embed', () => plugins.createEmbedPlugin({ resolvePreview: false }), { service: 'youtube', videoId: 'dQw4w9WgXcQ', caption: 'Alpha', cover: pixel }, [field('caption', 'caption')], 'Alpha'],
  ['Raw', plugins.createRawPlugin, { html: 'Alpha' }, [field('html', 'html')], 'Alpha'],
  ['Gallery', plugins.createGalleryPlugin, { images: [{ id: 'first', url: pixel, caption: 'Alpha' }, { id: 'second', url: pixel, caption: 'Bravo' }], layout: '1', options: { captions: true } }, [field('image:first:caption', 'images.0.caption'), field('image:second:caption', 'images.1.caption', 'Bravo')], 'Alpha<br>Bravo'],
  ['Carousel', plugins.createCarouselPlugin, { slides: [{ id: 'first', type: 'image', src: pixel, caption: 'Alpha', alt: '' }], options: { autoplay: false } }, [field('slide:first:caption', 'slides.0.caption')], 'Alpha'],
  ['Attaches', plugins.createAttachesPlugin, { files: [{ id: 'first', url: '/alpha.txt', name: 'Alpha', size: 5, extension: 'txt' }], variant: 'f' }, [field('file:first:name', 'files.0.name')], 'Alpha'],
  ['LinkPreview', plugins.createLinkPreviewPlugin, { url: 'https://example.com/Alpha', title: 'Alpha', template: 'horizontal' }, [field('url', 'url', 'https://example.com/Alpha')], 'Alpha'],
  ['Toggle', plugins.createTogglePlugin, { title: 'Alpha', content: 'Bravo', open: true }, [field('title', 'title'), field('content', 'content', 'Bravo')], 'Alpha<br>Bravo'],
  ['Columns', plugins.createColumnsPlugin, { columns: [{ id: 'left', content: 'Alpha' }, { id: 'right', content: 'Bravo' }], layout: '1-1' }, [field('column:left', 'columns.0.content'), field('column:right', 'columns.1.content', 'Bravo')], 'Alpha<br>Bravo'],
  ['Spoiler', plugins.createSpoilerPlugin, { label: 'Alpha', content: 'Bravo' }, [field('label', 'label'), field('content', 'content', 'Bravo')], 'Alpha<br>Bravo'],
  ['Poll', plugins.createPollPlugin, { question: 'Alpha', options: [item('first', 'Bravo'), item('second', 'Charlie')], type: 'single', resultsMode: 'afterVote' }, [field('question', 'question'), field('option:first', 'options.0.text', 'Bravo'), field('option:second', 'options.1.text', 'Charlie')], 'Alpha<br>Bravo<br>Charlie'],
  ['Person', plugins.createPersonPlugin, { persons: [{ id: 'first', avatar: pixel, name: 'Alpha', role: 'Bravo', bio: 'Charlie', links: [{ id: 'site', type: 'website', url: 'https://example.com/Alpha' }] }] }, [field('person:first:name', 'persons.0.name'), field('person:first:role', 'persons.0.role', 'Bravo'), field('person:first:bio', 'persons.0.bio', 'Charlie'), field('person:first:link:site:url', 'persons.0.links.0.url', 'https://example.com/Alpha')], 'Alpha<br>Bravo<br>Charlie'],
].map(([name, factory, data, fields, exportedText]) => ({ name, factory, data, fields, exportedText }))

export function readPath(data, path) {
  return path.reduce((value, key) => value[key], data)
}

export function writePath(data, path, value) {
  const copy = structuredClone(data)
  const parent = path.slice(0, -1).reduce((current, key) => current[key], copy)
  parent[path.at(-1)] = value
  return copy
}
