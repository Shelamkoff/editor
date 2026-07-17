import attaches from '../renderers/attaches/locale/en.js'
import code from '../renderers/code/locale/en.js'
import person from '../renderers/person/locale/en.js'
import spoiler from '../renderers/spoiler/locale/en.js'

export default {
  'renderer.carousel.label': 'Content carousel',
  'renderer.carousel.video': 'Video slide',
  'renderer.carousel.previous': 'Previous slide',
  'renderer.carousel.next': 'Next slide',
  'renderer.carousel.page': 'Go to page',
  'renderer.carousel.slide': 'Go to slide',
  'renderer.gallery.open': 'Open image',
  'renderer.poll.selectOption': 'Select option',
  'renderer.poll.vote': 'Vote',
  'renderer.poll.loading': 'Loading results…',
  'renderer.poll.submitting': 'Submitting…',
  'renderer.poll.loadError': 'Could not load poll results',
  'renderer.poll.emptyResults': 'No votes yet',
  'renderer.poll.voters': 'Voters',
  'renderer.poll.anonymousVoter': 'Anonymous voter',
  'renderer.embed.play': 'Play video',
  'renderer.embed.video': 'Video',
  __lang: 'en',
  ...attaches,
  ...code,
  ...person,
  ...spoiler,
}
