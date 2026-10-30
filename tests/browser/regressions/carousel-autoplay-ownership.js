import { createCarouselPlugin } from '../../../plugins/carousel/index.js'
import { assert, blockElement, equal, make, pause, test } from './harness.js'

const pixel = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='

function autoplayFixture(readOnly = false) {
  const transactions = []
  const editor = make([{ id: 'carousel', type: 'carousel', dataVersion: 1, data: {
    slides: [
      { id: 'first', type: 'image', src: pixel, alt: 'First image', caption: '<b>First caption</b>' },
      { id: 'second', type: 'image', src: pixel, alt: 'Second image', caption: '<i>Second caption</i>' },
    ],
    options: { loop: true, autoplay: true, autoplayDelay: 250, navigation: true,
      pagination: true, thumbnails: false, aspectRatio: '16 / 9' },
  } }], { plugins: [createCarouselPlugin({ injectStyles: false })], defaultBlock: 'carousel',
    inlineTools: [], readOnly })
  editor.on('transaction:committed', value => transactions.push(value))
  const shell = blockElement(editor, 'carousel'), wrapper = shell.querySelector('.oe-carousel-block')
  equal(wrapper.querySelector('.oe-carousel-block__counter').textContent, '1 / 2')
  return { editor, shell, wrapper, transactions }
}

function unchangedDocument(h, before) {
  equal(h.editor.save().blocks, before)
  equal({ transactions: h.transactions.length, undo: h.editor.canUndo, redo: h.editor.canRedo },
    { transactions: 0, undo: false, redo: false })
}

for (const readOnly of [false, true]) {
  test(`Carousel autoplay ownership: an owned ${readOnly ? 'read-only' : 'editable'} view advances without an author action`, async () => {
    const h = autoplayFixture(readOnly)
    try {
      const before = h.editor.save().blocks
      await pause(400)
      equal(h.wrapper.querySelector('.oe-carousel-block__counter').textContent, '2 / 2')
      equal(h.wrapper.querySelector('.oe-carousel-block__caption').innerHTML, '<i>Second caption</i>')
      equal(h.wrapper.querySelector('img').alt, 'Second image')
      unchangedDocument(h, before)
    } finally { h.editor.destroy() }
  })
}

for (const adopted of ['wrapper', 'shell']) {
  test(`Carousel autoplay ownership: a pending tick leaves an adopted ${adopted} untouched`, async () => {
    const h = autoplayFixture(), foreign = document.createElement('aside')
    document.body.append(foreign)
    try {
      const before = h.editor.save().blocks, target = h[adopted]
      foreign.append(target)
      const html = foreign.innerHTML, children = [...h.wrapper.childNodes]
      const caption = h.wrapper.querySelector('.oe-carousel-block__caption')
      await pause(400)
      unchangedDocument(h, before)
      assert(target.parentNode === foreign)
      equal(foreign.innerHTML, html, 'Autoplay repainted the foreign owner\'s DOM')
      equal([...h.wrapper.childNodes], children, 'Autoplay replaced the foreign owner\'s exact child nodes')
      assert(h.wrapper.contains(caption), 'Autoplay discarded the foreign owner\'s caption')
      await pause(300)
      equal(foreign.innerHTML, html, 'A later autoplay tick repainted the foreign owner')
    } finally { h.editor.destroy(); foreign.remove() }
  })
}
