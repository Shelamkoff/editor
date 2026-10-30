import { test } from './harness.js'
import { carouselCaptionDocument, assertCarouselCaptions } from './carousel-caption-fixture.js'

test('Carousel auto-height output mounts without ResizeObserver errors', async () => {
  const data = carouselCaptionDocument(['Alpha &amp; caption', 'Bravo'])
  delete data.blocks[0].data.options.aspectRatio
  await assertCarouselCaptions(data, ['Alpha & caption', 'Bravo'])
})
