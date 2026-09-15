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
}
