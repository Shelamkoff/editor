import { prepareHtmlImport } from '../../core/HtmlImportRouter.js'
import { sanitizeHtml } from '../../shared/sanitize/sanitizeHtml.js'
import { createHeadingPlugin, createParagraphPlugin, createQuotePlugin, createTablePlugin } from '../../plugins/index.js'
import { test, make, para, editableField, select, paste, equal, texts } from './regressions/harness.js'

// Register in native-clipboard's existing runner. These cases use the actual
// editor, sanitizers, logical range planner and history, not a parser mock.
for (const [name, html, expected] of [
  ['sibling div roots', '<div>A</div><div>B</div>', ['abcAghi', 'B']],
  ['formatted div roots', '<div><b>A</b></div><div><i>B</i></div>', ['abc<b>A</b>ghi', '<i>B</i>']],
  ['text around a div root', 'prefix<div>A</div>suffix', ['abcprefixghi', 'A', 'suffix']],
  ['empty div roots between text', '<div>A</div><div></div><div>B</div>', ['abcAghi', 'B']],
  ['unregistered heading roots', '<h2>A</h2><h3>B</h3>', ['abcDEFghi', 'A', 'B']],
  ['single div remains local', '<div>A <b>B</b></div>', ['abcA <b>B</b>ghi']],
]) {
  test(`external HTML root parity: ${name}`, async () => {
    const editor = make([para('a', 'abcDEFghi')])
    const target = editableField(editor, 'a')
    select(target, 3, 6)
    await paste(target, { 'text/html': html, 'text/plain': 'must not use plain fallback' })
    equal(texts(editor), expected)
    equal(editor.save().blocks.map(block => block.type), expected.map(() => 'paragraph'))
    equal(editor.undo(), true)
    equal(texts(editor), ['abcDEFghi'])
    equal(editor.canUndo, false, 'one HTML Paste must produce one history entry')
    equal(editor.redo(), true)
    equal(texts(editor), expected)
  })
}

test('external HTML root parity: fallback blocks use the default type, not the current heading', async () => {
  const editor = make([{
    id: 'a', type: 'heading', dataVersion: 2, data: { text: 'abcDEFghi', level: 3 },
  }], {
    plugins: [createParagraphPlugin(), createHeadingPlugin()],
    defaultBlock: 'paragraph',
  })
  const target = editableField(editor, 'a')
  select(target, 3, 6)
  await paste(target, { 'text/html': '<div>A</div><div>B</div>', 'text/plain': 'A\nB' })
  equal(texts(editor), ['abcAghi', 'B'])
  equal(editor.save().blocks.map(block => block.type), ['heading', 'paragraph'])
  equal(editor.save().blocks[0].data.level, 3)
  equal(editor.undo(), true)
  equal(texts(editor), ['abcDEFghi'])
  equal(editor.save().blocks[0].type, 'heading')
  equal(editor.canUndo, false)
  equal(editor.redo(), true)
  equal(texts(editor), ['abcAghi', 'B'])
  equal(editor.save().blocks.map(block => block.type), ['heading', 'paragraph'])
})

test('external HTML root parity: a registered div importer retains structural ownership', async () => {
  const paragraph = createParagraphPlugin({ injectStyles: false })
  const custom = Object.freeze({
    ...paragraph,
    type: 'custom-div',
    capabilities: Object.freeze({
      ...paragraph.capabilities,
      htmlImport: Object.freeze({
        matchesRoot: element => element.tagName === 'DIV',
        importRoot: (element, context) => ({ text: context.serializeRichText(element) }),
      }),
    }),
  })
  const editor = make([para('a', 'abcDEFghi')], { plugins: [paragraph, custom] })
  const target = editableField(editor, 'a')
  select(target, 3, 6)
  await paste(target, { 'text/html': '<div>A</div><div>B</div>', 'text/plain': 'A\nB' })
  equal(texts(editor), ['abcDEFghi', 'A', 'B'])
  equal(editor.save().blocks.map(block => block.type), ['paragraph', 'custom-div', 'custom-div'])
  equal(editor.undo(), true)
  equal(texts(editor), ['abcDEFghi'])
  equal(editor.canUndo, false)
  equal(editor.redo(), true)
  equal(texts(editor), ['abcDEFghi', 'A', 'B'])
})

test('external HTML Table preserves headers after an empty leading tr', async () => {
  const editor = make([para('a', '')], {
    plugins: [createParagraphPlugin(), createTablePlugin()],
  })
  const target = editableField(editor, 'a')
  select(target, 0)
  await paste(target, {
    'text/html': '<table><tr></tr><tr><th>Name</th><th>Value</th></tr><tr><td>A</td><td>1</td></tr></table>',
    'text/plain': 'Name Value A 1',
  })
  const blocks = editor.save().blocks
  equal(blocks.length, 1)
  equal(blocks[0].type, 'table')
  equal(blocks[0].data.withHeadings, true)
  equal(blocks[0].data.rows.map(row => row.cells.map(cell => cell.text)), [
    ['Name', 'Value'], ['A', '1'],
  ])
  equal(editor.undo(), true)
  equal(editor.save().blocks[0].type, 'paragraph')
  equal(editor.save().blocks[0].data.text, '')
  equal(editor.canUndo, false)
  equal(editor.redo(), true)
  equal(editor.save().blocks[0].data.withHeadings, true)
})

for (const tag of ['cite', 'footer', 'figcaption']) {
  test(`external HTML Quote preserves its nested ${tag} attribution as a separate rich field`, async () => {
    const editor = make([para('a', '')], {
      plugins: [createParagraphPlugin(), createQuotePlugin()],
    })
    const target = editableField(editor, 'a')
    const before = editor.save().blocks
    select(target, 0)
    await paste(target, {
      'text/html': `<blockquote><b>Quoted &amp; marked</b><${tag}><i>Author &amp; source</i></${tag}></blockquote>`,
      'text/plain': 'must not use plain fallback',
    })
    const after = editor.save().blocks
    equal(after.length, 1)
    equal(after[0].type, 'quote')
    equal(after[0].data, {
      text: '<b>Quoted &amp; marked</b>',
      caption: '<i>Author &amp; source</i>',
    }, 'Quote attribution must not become part of the quotation text')
    equal(editableField(editor, 0, '.oe-quote__text').innerHTML, after[0].data.text)
    equal(editableField(editor, 0, '.oe-quote__caption').innerHTML, after[0].data.caption)
    equal(editor.undo(), true)
    equal(editor.save().blocks, before)
    equal(editor.canUndo, false, 'Quote Paste must be exactly one history action')
    equal(editor.redo(), true)
    equal(editor.save().blocks, after)
  })
}

test('external HTML Quote import preserves source DOM and existing Figure attribution', () => {
  const importer = createQuotePlugin().capabilities.htmlImport
  const examples = [
    ['<blockquote><b>Quoted</b><cite><i>Author</i></cite></blockquote>',
      { text: '<b>Quoted</b>', caption: '<i>Author</i>' }],
    ['<blockquote><b>Quoted</b></blockquote>',
      { text: '<b>Quoted</b>', caption: '' }],
    ['<figure><blockquote><b>Quoted</b></blockquote><figcaption><i>Author</i></figcaption></figure>',
      { text: '<b>Quoted</b>', caption: '<i>Author</i>' }],
    ['<figure><blockquote><b>Quoted</b></blockquote><cite><i>Author</i></cite></figure>',
      { text: '<b>Quoted</b>', caption: '<i>Author</i>' }],
    ['<figure><blockquote><b>Quoted</b><footer><i>Author</i></footer></blockquote></figure>',
      { text: '<b>Quoted</b>', caption: '<i>Author</i>' }],
    ['<figure><blockquote>Text <cite>in context</cite></blockquote><figcaption>Outer author</figcaption></figure>',
      { text: 'Text in context', caption: 'Outer author' }],
  ]
  for (const [html, expected] of examples) {
    const template = document.createElement('template')
    template.innerHTML = html
    const root = template.content.firstElementChild
    const before = root.outerHTML
    equal(importer.matchesRoot(root), true)
    equal(importer.importRoot(root, {
      serializeRichText: element => sanitizeHtml(element.innerHTML, element.ownerDocument),
    }), expected)
    equal(root.outerHTML, before, 'Quote importer modified the caller-owned source DOM')
  }
})


test('external HTML fallback importers cannot mutate the content seen by later importers', () => {
  const rejected = {
    capabilities: {
      conversion: {
        canImport(payload) {
          payload.data.text = '<b>POISONED</b>'
          return false
        },
        import() { throw new Error('Rejected importer must never execute') },
      },
    },
  }
  const accepted = {
    capabilities: {
      conversion: {
        canImport(payload) {
          equal(payload.data.text.includes('POISONED'), false)
          return payload.kind === 'rich-text'
        },
        import(payload, context) {
          equal(context.ownerDocument, document)
          return { text: payload.data.text }
        },
      },
    },
  }
  const registry = {
    defaultBlockType: 'reject',
    blockTypes: ['reject', 'accept'],
    getBlockDefinition: type => type === 'reject' ? rejected
      : type === 'accept' ? accepted : null,
  }
  const plan = prepareHtmlImport('<div>First</div><div>Second</div>', {
    ownerDocument: document,
    registry,
    createId: prefix => prefix + '-1',
  })
  equal(plan.kind, 'blocks')
  equal(plan.blocks, [
    { type: 'accept', data: { text: 'First' } },
    { type: 'accept', data: { text: 'Second' } },
  ])
})
