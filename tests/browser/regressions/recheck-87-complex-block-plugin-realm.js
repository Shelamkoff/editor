import { test, assert, equal, pause } from './harness.js'
import {
  Attaches, Carousel, Code, Columns, Delimiter, Embed, Gallery, Heading,
  Image, LinkPreview, Paragraph, Person, Raw, Spoiler, Toggle, Warning,
} from '../../../plugins/index.js'

function mutationContext(ownerDocument) {
  return {
    ownerDocument,
    readOnly: false,
    mutate(operation) { return operation() },
    splitBlock() {},
    exitEmptyBlock() { return false },
  }
}

const cases = [
  ['attaches', () => new Attaches(), {}],
  ['carousel', () => new Carousel(), {}],
  ['code', () => new Code(), { code: '', language: 'auto' }],
  ['columns', () => new Columns(), {}],
  ['delimiter', () => new Delimiter(), {}],
  ['embed', () => new Embed(), {}],
  ['gallery', () => new Gallery(), {}],
  ['heading', () => new Heading(), { text: '', level: 2 }],
  ['image', () => new Image(), {}],
  ['link-preview', () => new LinkPreview(), {}],
  ['paragraph', () => new Paragraph(), { text: '' }],
  ['person', () => new Person(), {}],
  ['raw', () => new Raw(), { html: '' }],
  ['spoiler', () => new Spoiler(), {}],
  ['toggle', () => new Toggle(), {}],
  ['warning', () => new Warning(), {}],
]

export function register() {
  test('complex built-in block plugins create and schedule DOM in the editor owning document', async () => {
    const iframe = document.createElement('iframe')
    document.body.appendChild(iframe)
    const roots = []
    try {
      const doc = iframe.contentDocument
      assert(doc, 'iframe document unavailable')
      const ambientCreateElement = document.createElement
      document.createElement = () => { throw new Error('ambient document must not be used') }
      try {
        for (const [name, create, data] of cases) {
          const plugin = create()
          const root = plugin.render(data, mutationContext(doc))
          roots.push([plugin, root])
          doc.body.appendChild(root)
          equal(root.ownerDocument, doc, `${name} root escaped the editor document`)
        }
        // Keep the ambient document poisoned across queued animation frames and
        // zero-delay lifecycle work started during render().
        await pause(30)
      } finally {
        document.createElement = ambientCreateElement
      }
    } finally {
      try {
        for (const [plugin, root] of roots.reverse()) {
          plugin.destroy?.(root)
          root.remove()
        }
      } finally {
        iframe.remove()
      }
    }
  })

  test('local image file readers stay in the block owning window', async () => {
    const iframe = document.createElement('iframe')
    document.body.appendChild(iframe)
    const roots = []
    const ambientFileReader = window.FileReader
    try {
      const doc = iframe.contentDocument
      const view = iframe.contentWindow
      assert(doc && view, 'iframe realm unavailable')
      const file = new view.File(['realm'], 'realm.png', { type: 'image/png' })
      window.FileReader = class { constructor() { throw new Error('ambient FileReader must not be used') } }

      const uploads = [
        ['image', new Image(), saved => saved.file?.url],
        ['gallery', new Gallery(), saved => saved.images?.[0]?.url],
        ['carousel', new Carousel(), saved => saved.slides?.[0]?.src],
      ]
      for (const [name, plugin, getUrl] of uploads) {
        const data = plugin.onPaste({ type: 'file', file })
        assert(data, `${name} did not accept a local image file`)
        const root = plugin.render(data, mutationContext(doc))
        roots.push([plugin, root])
        doc.body.appendChild(root)
        await plugin.waitForPaste(root)
        const url = getUrl(plugin.save(root))
        assert(typeof url === 'string' && url.startsWith('data:image/png;base64,'), `${name} did not read through the owning FileReader`)
      }
    } finally {
      window.FileReader = ambientFileReader
      for (const [plugin, root] of roots.reverse()) {
        plugin.destroy?.(root)
        root.remove()
      }
      iframe.remove()
    }
  })


  test('carousel local video URLs use and release the block owning URL realm', async () => {
    const iframe = document.createElement('iframe')
    document.body.appendChild(iframe)
    let root = null
    let plugin = null
    const ambientCreate = window.URL.createObjectURL
    const ambientRevoke = window.URL.revokeObjectURL
    try {
      const doc = iframe.contentDocument
      const view = iframe.contentWindow
      assert(doc && view, 'iframe realm unavailable')
      const video = new view.File(['realm'], 'realm.mp4', { type: 'video/mp4' })
      const created = []
      const revoked = []
      const ownerCreate = view.URL.createObjectURL
      const ownerRevoke = view.URL.revokeObjectURL
      view.URL.createObjectURL = () => {
        const url = `blob:iframe-realm-${created.length}`
        created.push(url)
        return url
      }
      view.URL.revokeObjectURL = url => { revoked.push(url) }
      window.URL.createObjectURL = () => { throw new Error('ambient URL.createObjectURL must not be used') }
      window.URL.revokeObjectURL = () => { throw new Error('ambient URL.revokeObjectURL must not be used') }
      try {
        plugin = new Carousel()
        const data = plugin.onPaste({ type: 'file', file: video })
        assert(data, 'carousel did not accept a local video file')
        root = plugin.render(data, mutationContext(doc))
        doc.body.appendChild(root)
        await plugin.waitForPaste(root)
        equal(plugin.save(root).slides?.[0]?.src, created[0], 'carousel did not retain the owning-realm object URL')
        plugin.destroy(root)
        plugin.dispose()
        equal(revoked[0], created[0], 'carousel did not revoke through the owning URL realm')
        plugin = null
      } finally {
        view.URL.createObjectURL = ownerCreate
        view.URL.revokeObjectURL = ownerRevoke
      }
    } finally {
      window.URL.createObjectURL = ambientCreate
      window.URL.revokeObjectURL = ambientRevoke
      if (plugin) {
        if (root) plugin.destroy(root)
        plugin.dispose()
      }
      root?.remove()
      iframe.remove()
    }
  })

}
