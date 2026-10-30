import { test, equal } from './harness.js'
import { carouselCaptionDocument, assertCarouselCaptions } from './carousel-caption-fixture.js'

test('Carousel captions render authored marks while decoding literal entities exactly once', async () => {
  const data = carouselCaptionDocument([
    '<b>Rich</b> Literal &lt;b&gt;name&lt;/b&gt; &amp; &amp;lt;twice&amp;gt; {{literal}}',
    'Independent &lt;script&gt;literal&lt;/script&gt;',
  ])
  await assertCarouselCaptions(data, ['Rich Literal <b>name</b> & &lt;twice&gt; {{literal}}', 'Independent <script>literal</script>'], captions => {
    equal([...captions[0].querySelectorAll('b')].map(element => element.textContent), ['Rich'])
    equal(captions[0].querySelectorAll('[data-inline-plugin]').length, 0)
    equal(captions[1].querySelectorAll('script').length, 0)
  })
})

test('Carousel captions render actual Mention and Color sidecars inside author formatting', async () => {
  const data = carouselCaptionDocument(['<b>Alpha</b> <i>{{mention}}</i> <s>{{swatch}}</s> tail', 'Untouched sibling'], {
    mention: { type: 'mention', dataVersion: 1, data: { id: 'ada', name: 'Ada <&>' } },
    swatch: { type: 'color', dataVersion: 1, data: { value: '#123456' } },
  })
  await assertCarouselCaptions(data, ['Alpha @Ada <&> #123456 tail', 'Untouched sibling'], captions => {
    equal(captions[0].querySelector('i [data-inline-plugin="mention"]')?.textContent, '@Ada <&>')
    equal(captions[0].querySelector('s [data-inline-plugin="color"]')?.textContent, '#123456')
    equal(captions[1].querySelectorAll('[data-inline-plugin]').length, 0)
  })
})
