import { CropperDialog } from '@shelamkoff/cropper'
import { createEditor } from '../../core/index.js'
import { Attaches, Carousel, Embed, LinkPreview, Person, Poll } from '../../plugins/index.js'

const sandbox = document.querySelector('#sandbox')
const tick = () => new Promise(resolve => setTimeout(resolve, 0))

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function settle(times = 2) {
  for (let index = 0; index < times; index++) await tick()
}

function assertNoMarkup(root, payload, name) {
  assert(root.textContent?.includes(payload), `${name} label was not preserved as literal text`)
  assert(!root.querySelector('img, script, iframe, object, embed'), `${name} label created an active element`)
  assert(
    ![...root.querySelectorAll('*')].some(element => [...element.attributes].some(attribute => attribute.name.startsWith('on'))),
    `${name} label created an event handler`,
  )
}

async function localeMarkupBoundary() {
  const payload = '<img src="x" onerror="window.__localeAuditProbe++">Localized'
  window.__localeAuditProbe = 0
  const cases = [
    {
      name: 'attaches',
      plugin: new Attaches(),
      type: 'attaches',
      data: { files: [{ url: 'https://example.com/file.pdf', name: 'file.pdf', size: 1, extension: 'pdf' }], variant: 'a' },
      locale: {
        'plugin.attaches.settings': payload,
        'plugin.attaches.addFiles': payload,
      },
    },
    {
      name: 'link-preview',
      plugin: new LinkPreview(),
      type: 'linkPreview',
      data: { url: 'https://example.com', title: 'Example', description: '', image: '', favicon: '', domain: 'example.com', template: 'notion' },
      locale: { 'plugin.linkPreview.settings': payload },
    },
    {
      name: 'poll',
      plugin: new Poll(),
      type: 'poll',
      data: {
        question: 'Question',
        type: 'single',
        options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }],
        resultsMode: 'always',
      },
      locale: {
        'plugin.poll.addOption': payload,
        'plugin.poll.single': payload,
        'plugin.poll.resultsAlways': payload,
        'plugin.poll.sort': payload,
      },
    },
  ]

  for (const fixture of cases) {
    const holder = document.createElement('section')
    sandbox.appendChild(holder)
    const editor = createEditor({
      holder,
      plugins: [fixture.plugin],
      defaultBlock: fixture.type,
      inlineTools: [],
      locale: fixture.locale,
      data: { version: 'audit-regressions', blocks: [{ id: `locale-${fixture.name}`, type: fixture.type, data: fixture.data }] },
    })
    try {
      assertNoMarkup(editor.rootElement, payload, fixture.name)
    } finally {
      editor.destroy()
      holder.remove()
    }
  }

  await new Promise(resolve => setTimeout(resolve, 30))
  assert(window.__localeAuditProbe === 0, 'a locale label payload executed')
}

async function linkPreviewOwnership() {
  const requests = []
  const plugin = new LinkPreview({
    fetchMeta(url, { signal }) {
      return new Promise(resolve => requests.push({ url, signal, resolve }))
    },
  })
  const wrapper = plugin.render({
    url: 'https://example.com', title: '', description: '', image: '', favicon: '', domain: '', template: 'notion',
  }, { readOnly: false, mutate(operation) { return operation() } })
  sandbox.appendChild(wrapper)

  try {
    assert(requests.length === 1, 'initial link-preview metadata request did not start')
    const input = wrapper.querySelector('.oe-lp__url-input')
    assert(input instanceof HTMLInputElement, 'link-preview URL input is missing')
    input.value = 'https://example.com'
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    assert(requests.length === 2, 'same-URL replacement request did not start')
    assert(requests[0].signal.aborted, 'same-URL replacement did not abort the previous request')
    assert(!requests[1].signal.aborted, 'replacement request started aborted')

    requests[0].resolve({ title: 'Stale title' })
    await settle()
    requests[1].resolve({ title: 'Fresh title' })
    await settle(3)

    assert(plugin.save(wrapper).title === 'Fresh title', 'stale same-URL request invalidated its replacement')
    assert(wrapper.querySelector('.oe-lp__title')?.textContent === 'Fresh title', 'fresh replacement metadata was not rendered')
  } finally {
    plugin.destroy(wrapper)
    wrapper.remove()
  }
}

async function embedCoverOwnership() {
  const requests = []
  const plugin = new Embed({
    uploadFile(file, { signal }) {
      return new Promise(resolve => requests.push({ file, signal, resolve }))
    },
  })
  const wrapper = plugin.render({
    service: 'youtube', videoId: 'dQw4w9WgXcQ', caption: '', cover: '', title: '', duration: '',
  }, { readOnly: false, mutate(operation) { return operation() } })
  sandbox.appendChild(wrapper)

  try {
    const first = plugin._uploadCover(wrapper, new File(['first'], 'first.png', { type: 'image/png' }))
    const second = plugin._uploadCover(wrapper, new File(['second'], 'second.png', { type: 'image/png' }))
    assert(requests.length === 2, 'embed replacement cover uploads did not both start')
    assert(requests[0].signal.aborted, 'new embed cover upload did not abort the old one')

    requests[0].resolve({ url: 'https://example.test/stale.png' })
    await settle()
    assert(wrapper.classList.contains('oe-embed--loading'), 'stale embed cover completion cleared current loading state')
    assert(plugin.save(wrapper).cover === '', 'stale embed cover upload committed while replacement was pending')

    requests[1].resolve({ url: 'https://example.test/fresh.png' })
    await Promise.all([first, second])
    await settle()
    assert(plugin.save(wrapper).cover === 'https://example.test/fresh.png', 'fresh embed cover upload did not win')

    const third = plugin._uploadCover(wrapper, new File(['third'], 'third.png', { type: 'image/png' }))
    const fourth = plugin._uploadCover(wrapper, new File(['fourth'], 'fourth.png', { type: 'image/png' }))
    requests[3].resolve({ url: 'https://example.test/newest.png' })
    await fourth
    requests[2].resolve({ url: 'https://example.test/late-stale.png' })
    await third
    assert(plugin.save(wrapper).cover === 'https://example.test/newest.png', 'late stale embed cover overwrote the latest source')
  } finally {
    plugin.destroy(wrapper)
    plugin.dispose?.()
    wrapper.remove()
  }
}

async function carouselAbortedBatchUrls() {
  const originalCreateObjectURL = URL.createObjectURL.bind(URL)
  const originalRevokeObjectURL = URL.revokeObjectURL.bind(URL)
  const created = []
  const revoked = []
  URL.createObjectURL = blob => {
    const url = originalCreateObjectURL(blob)
    created.push(url)
    return url
  }
  URL.revokeObjectURL = url => {
    revoked.push(String(url))
    return originalRevokeObjectURL(url)
  }

  const plugin = new Carousel()
  const wrapper = plugin.render({
    slides: [],
    options: { loop: false, autoplay: false, autoplayDelay: 3000, navigation: true, pagination: true, thumbnails: true },
  }, { readOnly: false, mutate(operation) { return operation() } })
  sandbox.appendChild(wrapper)

  try {
    const transfer = new DataTransfer()
    transfer.items.add(new File(['video'], 'transient.webm', { type: 'video/webm' }))
    transfer.items.add(new File(['image'], 'pending.png', { type: 'image/png' }))
    wrapper.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }))
    assert(created.length === 1, 'carousel did not create the transient video URL before the pending image read')
    const transientUrl = created[0]
    plugin.destroy(wrapper)
    await settle()
    assert(plugin.save(wrapper).slides.length === 0, 'destroyed carousel committed an aborted local file batch')
    assert(revoked.includes(transientUrl), 'aborted carousel batch retained an uncommitted object URL')
  } finally {
    plugin.destroy(wrapper)
    plugin.dispose?.()
    wrapper.remove()
    URL.createObjectURL = originalCreateObjectURL
    URL.revokeObjectURL = originalRevokeObjectURL
  }
}

async function personAvatarOwnership() {
  const originalInputClick = HTMLInputElement.prototype.click
  const originalCropperOpen = CropperDialog.prototype.open
  let inputSequence = 0
  HTMLInputElement.prototype.click = function () {
    if (this.type === 'file' && this.accept === 'image/*') {
      const file = new File([`avatar-${++inputSequence}`], `avatar-${inputSequence}.png`, { type: 'image/png' })
      Object.defineProperty(this, 'files', { configurable: true, value: [file] })
      this.dispatchEvent(new Event('change'))
      return
    }
    return originalInputClick.call(this)
  }
  CropperDialog.prototype.open = function () {
    this.result = Promise.resolve(new Blob(['cropped-avatar'], { type: 'image/webp' }))
  }

  const requests = []
  const plugin = new Person({
    uploadFile(file, { signal }) {
      return new Promise(resolve => requests.push({ file, signal, resolve }))
    },
  })
  const wrapper = plugin.render({
    persons: [{ avatar: '', name: 'Ada', role: '', bio: '', links: [] }],
  }, { readOnly: false, mutate(operation) { return operation() } })
  sandbox.appendChild(wrapper)

  const clickUpload = async () => {
    const button = wrapper.querySelector('.oe-person__avatar-upload')
    assert(button instanceof HTMLButtonElement, 'person avatar upload button is missing')
    button.click()
    for (let index = 0; index < 10 && requests.length <= 0; index++) await tick()
    await settle()
  }

  try {
    await clickUpload()
    assert(requests.length === 1, 'first person avatar upload did not start')
    await clickUpload()
    assert(requests.length === 2, 'replacement person avatar upload did not start')
    assert(requests[0].signal.aborted, 'replacement avatar upload did not abort the previous upload')

    requests[0].resolve({ url: 'https://example.test/stale-avatar.png' })
    await settle()
    assert(wrapper.classList.contains('oe-person--loading'), 'stale avatar completion cleared the current loading state')
    assert(plugin.save(wrapper).persons[0].avatar === '', 'stale avatar committed while replacement was pending')

    requests[1].resolve({ url: 'https://example.test/fresh-avatar.png' })
    await settle(3)
    assert(plugin.save(wrapper).persons[0].avatar === 'https://example.test/fresh-avatar.png', 'fresh avatar upload did not win')
    assert(!wrapper.classList.contains('oe-person--loading'), 'person loading state survived the current upload')

    await clickUpload()
    await clickUpload()
    assert(requests.length === 4, 'second avatar race did not start both requests')
    assert(requests[2].signal.aborted, 'second avatar replacement did not abort its predecessor')
    requests[3].resolve({ url: 'https://example.test/newest-avatar.png' })
    await settle(3)
    requests[2].resolve({ url: 'https://example.test/late-stale-avatar.png' })
    await settle(3)
    assert(plugin.save(wrapper).persons[0].avatar === 'https://example.test/newest-avatar.png', 'late stale avatar overwrote the latest upload')
  } finally {
    plugin.destroy(wrapper)
    plugin.dispose?.()
    wrapper.remove()
    HTMLInputElement.prototype.click = originalInputClick
    CropperDialog.prototype.open = originalCropperOpen
  }
}

async function run() {
  const cases = [
    ['locale-markup-boundary', localeMarkupBoundary],
    ['link-preview-request-ownership', linkPreviewOwnership],
    ['embed-cover-ownership', embedCoverOwnership],
    ['carousel-aborted-batch-object-urls', carouselAbortedBatchUrls],
    ['person-avatar-ownership', personAvatarOwnership],
  ]
  const results = []
  for (const [name, callback] of cases) {
    sandbox.replaceChildren()
    await callback()
    results.push(name)
  }
  sandbox.replaceChildren()
  return results
}

const result = document.querySelector('#result')
try {
  const summary = await run()
  document.body.dataset.status = 'pass'
  result.textContent = JSON.stringify(summary)
} catch (error) {
  document.body.dataset.status = 'fail'
  result.textContent = error?.stack || String(error)
}
