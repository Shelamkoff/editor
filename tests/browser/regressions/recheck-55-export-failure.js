import { Paragraph, Heading } from '../../../plugins/index.js'
import { test, make, para, select, assert, equal, expectError } from './harness.js'

function chooseHeading(editor) {
  editor.rootElement.querySelector('.oe-inline-toolbar__type-select').click()
  const item = editor.rootElement.querySelector('[data-plugin-type="heading"].oe-inline-toolbar__type-item')
  assert(item, 'the real type menu offers Heading')
  item.click()
}

export function register() {
  for (const via of ['API', 'menu']) {
    test(`failed export through ${via} preserves source data and never renders an empty target`, () => {
      let attempts = 0, renders = 0
      const failure = new Error('deliberate source export failure')
      class Failing extends Paragraph { exportData() { attempts++; throw failure } }
      class Target extends Heading { render(data) { renders++; return super.render(data) } }
      const editor = make([para('a', 'KEEP{{opaque}}', {
        inline: { opaque: { type: 'unknown', data: { id: 42 } } }, tunes: { textAlign: 'right' }, revision: 'producer',
      })], { plugins: [new Failing(), new Target()] })
      const before = editor.save().blocks
      let received
      if (via === 'API') {
        try { editor.blocks.convert(0, 'heading') } catch (error) { received = error }
      } else {
        select(editor.blocks.getBlockById('a').contentElement, 0)
        expectError(/deliberate source export failure/)
        chooseHeading(editor)
      }
      equal(attempts, 1, 'export must actually reach the failing phase')
      equal(renders, 0, 'failure must stop before target allocation')
      equal(editor.save().blocks, before)
      equal(editor.canUndo, false)
      if (via === 'API') assert(received === failure, 'API preserves the original error')
      assert(editor.rootElement.contains(editor.blocks.getBlockById('a').contentElement))
    })
  }

  test('failed export leaves the previous redo branch available', () => {
    let attempts = 0
    class Failing extends Paragraph { exportData() { attempts++; throw new Error('deliberate export failure') } }
    const editor = make([para('a', 'Original')], { plugins: [new Failing(), new Heading()] })
    editor.blocks.insert('paragraph', { text: 'Redo me' }); editor.undo()
    assert(editor.canRedo)
    let thrown = false
    try { editor.blocks.convert(0, 'heading') } catch { thrown = true }
    equal(attempts, 1); assert(thrown)
    equal(editor.save().blocks.map(block => block.data.text), ['Original'])
    assert(editor.canRedo)
    editor.redo(); equal(editor.save().blocks.map(block => block.data.text), ['Original', 'Redo me'])
  })

  test('multi-block conversion rolls back a successful target when a later export fails', () => {
    const exports = [], targets = []
    class Source extends Paragraph {
      exportData(element) {
        exports.push(element.textContent)
        if (element.textContent === 'Alpha') throw new Error('deliberate second export failure')
        return super.exportData(element)
      }
    }
    class Target extends Heading { render(data) { targets.push(data.text); return super.render(data) } }
    const editor = make([para('a', 'Alpha'), para('b', 'Bravo')], { plugins: [new Source(), new Target()] })
    const before = editor.save().blocks
    select(editor.blocks.getBlockById('a').contentElement, 1)
    editor.blocks.selectBlocks(['a', 'b'])
    expectError(/deliberate second export failure/)
    chooseHeading(editor)
    equal(exports, ['Bravo', 'Alpha'])
    equal(targets, ['Bravo'], 'one successful replacement precedes the failing source')
    equal(editor.save().blocks, before)
    equal(editor.canUndo, false)
  })

  for (const exporter of ['present', 'absent']) {
    test(`successful conversion transfers saved content with exportData ${exporter}`, () => {
      let attempts = 0
      class Source extends Paragraph {
        constructor() { super(); if (exporter === 'absent') this.exportData = undefined }
        exportData(element) { attempts++; return super.exportData(element) }
      }
      const editor = make([para('a', 'KEEP CONTENT')], { plugins: [new Source(), new Heading()] })
      editor.blocks.convert(0, 'heading', { level: 4 })
      equal(attempts, exporter === 'present' ? 1 : 0)
      equal(editor.save().blocks[0].data, { text: 'KEEP CONTENT', level: 4 })
      editor.undo(); equal(editor.save().blocks[0].type, 'paragraph')
      editor.redo(); equal(editor.save().blocks[0].data, { text: 'KEEP CONTENT', level: 4 })
    })
  }
}
