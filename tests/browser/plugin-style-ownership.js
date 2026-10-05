import * as plugins from '../../plugins/index.js'
import { test, make, blockElement, editorRoot, equal, run } from './regressions/harness.js'
import { waitForStyles } from './native-input-helpers.js'
const custom = new URL('./plugin-style-ownership.css', import.meta.url).href
const links = url => [...document.querySelectorAll('link[data-oe-style]')].filter(link => link.href === url)
function mount(definition) {
  return make([{ id: 'a', type: definition.type, dataVersion: definition.schema.currentVersion, data: definition.schema.createDefault() }], {
    plugins: definition.type === 'paragraph' ? [definition] : [plugins.createParagraphPlugin({ injectStyles: false }), definition],
    injectStyles: true,
  })
}
for (const [name, factory] of Object.entries(plugins)) {
  test(name + ' does not acquire built-in CSS in host-managed mode', async () => {
    const ordinary = factory()
    const editor = mount(factory({ injectStyles: false }))
    await waitForStyles(document)
    for (const url of ordinary.styles) equal(links(url).length, 0, 'Disabled plugin CSS was acquired')
    equal(editor.canUndo, false)
  })
  for (const mode of ['replace', 'append']) test(name + ' ' + mode + ' CSS is visible, shared, and released by its last editor', async () => {
    const ordinary = factory()
    const definition = factory({ injectStyles: mode === 'append', css: custom })
    const first = mount(definition), second = mount(definition)
    const before = second.save().blocks
    await waitForStyles(document)
    equal(links(custom).length, 1, 'Custom stylesheet was omitted or acquired twice')
    for (const url of ordinary.styles) equal(links(url).length, mode === 'append' ? 1 : 0, 'Built-in CSS ownership differs')
    for (const editor of [first, second]) {
      equal(getComputedStyle(editorRoot(editor)).getPropertyValue('--rector-style-owner').trim(), 'verified', 'The host CSS did not reach a mounted editor')
      equal(blockElement(editor, 'a').dataset.blockType, definition.type)
    }
    first.destroy()
    equal(links(custom).length, 1, 'Destroying one editor removed another editor\'s custom style')
    equal(second.save().blocks, before)
    equal(second.canUndo, false)
    equal(getComputedStyle(editorRoot(second)).getPropertyValue('--rector-style-owner').trim(), 'verified')
    second.destroy()
    equal(links(custom).length, 0, 'Last owner leaked custom CSS')
    for (const url of ordinary.styles) equal(links(url).length, 0, 'Last owner leaked built-in CSS')
  })
}
await run()
