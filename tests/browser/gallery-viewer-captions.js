const pixel = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='
const captions = [
  'Literal &lt;b&gt;name&lt;/b&gt; &amp; {{unknown}} &amp;lt;twice&amp;gt;',
  '<b>Alpha</b> <i>{{mention}}</i> <mark>{{swatch}}</mark> tail',
  '',
]
const labels = ['Literal <b>name</b> & {{unknown}} &lt;twice&gt;', 'Alpha @Ada <&> #123456 tail', '']

export async function runGalleryViewerCaptionTests(sandbox, {
  sourceBase = new URL('../../', import.meta.url), legacy = false, realms = ['main', 'iframe'],
} = {}) {
  const base = new URL(sourceBase, location.href)
  const [{ EditorRenderer }, mention, color] = await Promise.all([
    import(new URL('renderer/index.js', base).href),
    import(new URL('inline-plugins/mention/index.js', base).href),
    import(new URL('inline-plugins/color.js', base).href),
  ])
  const results = []
  const check = (name, actual, expected) => {
    const pass = JSON.stringify(actual) === JSON.stringify(expected)
    results.push({ name, status: pass ? 'PASS' : 'FAIL', actual, expected,
      ...(!pass ? { error: JSON.stringify({ actual, expected }) } : {}) })
  }
  const frame = document.createElement('iframe')
  frame.src = 'about:blank'
  const ready = new Promise(resolve => frame.addEventListener('load', resolve, { once: true }))
  sandbox.append(frame)
  try {
    await ready
    for (const [realm, ownerDocument] of [['main', document], ['iframe', frame.contentDocument]]) {
      if (!realms.includes(realm)) continue
      const source = { version: legacy ? '1.0.5' : '2.0.0', blocks: [{ id: 'gallery', type: 'gallery', ...(!legacy ? { dataVersion: 2 } : {}),
        data: {
          // v1's plain-caption field stores the authored literal directly;
          // v2's rich field escapes it. The expected reader text is identical.
          images: captions.map((caption, index) => ({ id: `picture-${index}`, url: pixel,
            caption: legacy && index === 0 ? labels[0] : caption })),
          layout: '1', styles: {}, options: { captions: true, navigation: true, loop: false,
            zoom: false, fullscreen: false, thumbnails: false },
        },
        inline: {
          mention: { type: 'mention', ...(!legacy ? { dataVersion: 1 } : {}), data: { id: 'ada', name: 'Ada <&>' } },
          swatch: { type: 'color', ...(!legacy ? { dataVersion: 1 } : {}), data: { value: '#123456' } },
        },
      }] }
      const before = JSON.stringify(source)
      const renderer = new EditorRenderer({ blockTypes: ['gallery'], injectStyles: false,
        ...(legacy ? { inlinePlugins: [mention.createMentionWidget(), color.createColorSwatchPlugin()] }
          : { inlineRenderers: [mention.createMentionRenderer(), color.createColorSwatchRenderer()] }),
      })
      const host = ownerDocument.createElement('section')
      ownerDocument.body.append(host)
      try {
        renderer.renderTo(source, host)
        const opener = host.querySelector('.editor-gallery__item')
        opener.click()
        const settleAnimation = async () => {
          // Expose settles its CSS transition through a timer, after its
          // native animation has finished. Wait for the live transition to
          // retire before submitting another navigation gesture.
          await new Promise(resolve => requestAnimationFrame(resolve))
          const deadline = performance.now() + 3000
          while ([...ownerDocument.querySelectorAll('.expose, .expose__slide')].some(element => element.style.transition)) {
            if (performance.now() > deadline) throw new Error('Gallery viewer transition did not settle')
            await new Promise(resolve => setTimeout(resolve, 10))
          }
          await Promise.resolve()
        }
        await settleAnimation()
        const viewer = ownerDocument.querySelector(realm === 'main' ? '.expose' : '.editor-gallery__lightbox')
        check(`${realm}: Gallery viewer is owned by its output document`, Boolean(viewer && viewer.ownerDocument === ownerDocument), true)
        if (!viewer) continue
        for (const index of [0, 1, 2]) {
          if (index) {
            viewer.querySelector(realm === 'main' ? '.expose__nav--next' : '.editor-gallery__lightbox-next').click()
            await settleAnimation()
          }
          const caption = viewer.querySelector(realm === 'main' ? '.expose__caption' : '.editor-gallery__lightbox-caption')
          const image = realm === 'main'
            ? [...viewer.querySelectorAll('.expose__slide')].find(slide => slide.style.display !== 'none')?.querySelector('img')
            : viewer.querySelector('.editor-gallery__lightbox-image')
          check(`${realm}: Gallery viewer caption ${index} has resolved author text`,
            caption?.hidden || caption?.style.display === 'none' ? '' : caption?.textContent, labels[index])
          check(`${realm}: Gallery viewer image ${index} has resolved alternative text`, image?.alt, labels[index])
          check(`${realm}: Gallery viewer image ${index} keeps its source`, image?.getAttribute('src'), pixel)
        }
        check(`${realm}: Gallery viewer keeps input captions and sidecars untouched`, JSON.stringify(source), before)
        renderer.destroy(host)
        check(`${realm}: Gallery viewer is removed with its renderer output`, viewer.isConnected, false)
        opener.click()
        check(`${realm}: retained Gallery opener cannot recreate a disposed viewer`,
          ownerDocument.querySelectorAll('.expose, .editor-gallery__lightbox').length, 0)
      } finally {
        renderer.destroy()
        host.remove()
      }
    }
  } finally {
    frame.remove()
  }
  return results
}
