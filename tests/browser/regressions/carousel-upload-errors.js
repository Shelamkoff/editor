import { Carousel } from '../../../plugins/carousel/index.js'
import { registerUploadFailureTests } from './upload-failure-helpers.js'

export function register() {
  registerUploadFailureTests({
    type: 'carousel', Base: Carousel, selector: '.oe-carousel-block__select',
    count: data => data.slides.length, mime: 'video/mp4', name: 'clip.mp4',
  })
}
