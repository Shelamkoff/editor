import { test, make, para, select, assert, equal, texts, expectError } from './harness.js'
import { Paragraph, Heading } from '../../../plugins/index.js'

export function register() {
  test('partial conversion failure leaves the entire original paragraph intact', () => {
    let attempts = 0
    class Failing extends Heading {
      type = 'bad'
      render() { attempts++; throw new Error('deliberate target render error') }
    }
    const editor = make([para('a', 'abcdef')], { plugins: [new Paragraph(), new Failing()] })
    select(editor.blocks.getBlockByIndex(0).contentElement, 2, 4)
    editor.rootElement.querySelector('.oe-inline-toolbar__type-select').click()
    const item = editor.rootElement.querySelector('[data-plugin-type="bad"].oe-inline-toolbar__type-item')
    assert(item, 'conversion item is available')
    expectError(/deliberate target render error/)
    item.click()
    equal(attempts, 1, 'the target render must actually reach the failing phase')
    equal(texts(editor), ['abcdef'])
    equal(editor.canUndo, false)
  })

  test('multi-block conversion failure rolls back every converted block', () => {
    const attempts = []
    class Failing extends Heading {
      type = 'bad'
      render(data) {
        attempts.push(data.text)
        if (data.text === 'Alpha') throw new Error('deliberate second block failure')
        return super.render(data)
      }
    }
    const editor = make([para('a', 'Alpha'), para('b', 'Bravo')], { plugins: [new Paragraph(), new Failing()] })
    select(editor.blocks.getBlockByIndex(0).contentElement, 1)
    editor.blocks.selectBlocks(['a', 'b'])
    editor.rootElement.querySelector('.oe-inline-toolbar__type-select').click()
    expectError(/deliberate second block failure/)
    editor.rootElement.querySelector('[data-plugin-type="bad"].oe-inline-toolbar__type-item').click()
    equal(attempts, ['Bravo', 'Alpha'], 'a successful first render precedes the failing second render')
    equal(editor.save().blocks.map(block => block.type), ['paragraph', 'paragraph'])
    equal(texts(editor), ['Alpha', 'Bravo'])
    equal(editor.canUndo, false)
  })
}
