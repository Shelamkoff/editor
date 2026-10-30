import { EditorRenderer } from '../../../renderer/index.js'
import { createMentionRenderer } from '../../../inline-plugins/mention/index.js'
import { createColorSwatchRenderer } from '../../../inline-plugins/color.js'
import { assert, equal } from './harness.js'
import { waitForStyles } from '../native-input-helpers.js'

export const captionPixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGPwKZz9HwAEvQJYppltbwAAAABJRU5ErkJggg=='
export function carouselCaptionDocument(captions, inline) {
  return { version: '2.0.0', blocks: [{ id: 'carousel', type: 'carousel', dataVersion: 1, data: {
    slides: captions.map((caption, index) => ({ id: `slide-${index}`, type: 'image', src: captionPixel, alt: `Image ${index + 1}`, caption })),
    options: { loop: false, autoplay: false, autoplayDelay: 3000, navigation: true, pagination: true,
      thumbnails: false, aspectRatio: '16 / 9' },
  }, ...(inline ? { inline: structuredClone(inline) } : {}) }] }
}

export async function assertCarouselCaptions(data, expected, inspect = () => {}) {
  const before = JSON.stringify(data), holder = document.createElement('section'), target = document.createElement('section')
  holder.style.width = target.style.width = '640px'
  document.body.append(holder, target)
  const renderer = new EditorRenderer({ blockTypes: ['carousel'], injectStyles: true,
    inlineRenderers: [createMentionRenderer(), createColorSwatchRenderer()] })
  const styles = renderer.injectStyles()
  let detached
  const check = (root, surface) => {
    const captions = [...root.querySelectorAll('.editor-carousel-block__slide figcaption')]
    equal(captions.map(caption => caption.textContent), expected, `${surface} caption meaning`)
    assert(captions.every(caption => caption.ownerDocument === document))
    equal([...root.querySelectorAll('.editor-carousel-block__slide img')].map(image => image.alt),
      data.blocks[0].data.slides.map(slide => slide.alt), `${surface} media alternatives remain independent plain text`)
    inspect(captions, surface)
  }
  try {
    await waitForStyles(document)
    detached = renderer.render(data)
    assert(!detached.isConnected); check(detached, 'detached')
    holder.append(detached)
    await waitForStyles(document)
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    check(detached, 'attached render result')
    renderer.renderTo(data, target)
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    check(target, 'renderTo')
    equal(JSON.stringify(data), before, 'Caption rendering must not change canonical input or sidecars')
  } finally {
    try {
      if (detached) renderer.destroy(detached)
      renderer.destroy(target); renderer.destroy(); styles.destroy()
      equal(target.childNodes.length, 0)
    } finally { holder.remove(); target.remove() }
  }
}
