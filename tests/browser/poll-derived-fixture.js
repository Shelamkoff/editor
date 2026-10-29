import { createPollPlugin } from '../../plugins/poll/index.js'
import { createMentionPlugin } from '../../inline-plugins/mention/index.js'
import { createColorSwatchPlugin } from '../../inline-plugins/color.js'
import { make, blockElement, assert, equal, pause } from './regressions/harness.js'

export const optionHtml = '<span class="answer-emphasis" style="font-size:1.5em"><b>Answer</b></span> <i>{{mention}}</i> <s>{{swatch}}</s> tail'
export const optionText = 'Answer @Ada #123456 tail'

export async function pollDerivedFixture() {
  const inline = [], transactions = []
  const capture = definition => ({ ...definition, setup(runtimeContext) {
    const runtime = definition.setup(runtimeContext)
    return { ...runtime, create(...args) {
      const instance = Reflect.apply(runtime.create, runtime, args)
      inline.push({ id: args[0], instance, context: args.at(-1) })
      return instance
    } }
  } })
  const editor = make([{ id: 'poll', type: 'poll', dataVersion: 1, data: {
    question: 'Question', type: 'multiple', resultsMode: 'always',
    options: [{ id: 'first', text: optionHtml }, { id: 'second', text: '<mark>Second</mark>' }],
  }, inline: {
    mention: { type: 'mention', dataVersion: 1, data: { id: 'ada', name: 'Ada' } },
    swatch: { type: 'color', dataVersion: 1, data: { value: '#123456' } },
  } }], { defaultBlock: 'poll', inlineTools: [], plugins: [createPollPlugin({ injectStyles: false })],
    inlinePlugins: [capture(createMentionPlugin({ searchFunction: async () => [] })), capture(createColorSwatchPlugin())],
  })
  editor.on('transaction:committed', event => transactions.push(event))
  await pause(20)
  const root = () => blockElement(editor, 'poll')
  return {
    editor, transactions, root,
    field: () => root().querySelector('.oe-poll__option-text[data-option-id="first"]'),
    result: () => root().querySelector('.oe-poll__result-label'),
    widget: id => inline.findLast(item => item.id === id && item.instance.element.isConnected && !item.context.signal.aborted),
    dispose: () => editor.destroy(),
  }
}

export function checkPollDerivedLabel(h, expected = optionText) {
  const result = h.result()
  equal(result.textContent, expected, 'Result label must contain completed option text')
  equal({ bold: result.querySelector('b')?.textContent, className: result.querySelector('.answer-emphasis')?.className,
    fontSize: result.querySelector('.answer-emphasis')?.style.fontSize,
    mention: result.querySelector('i')?.textContent, color: result.querySelector('s')?.textContent,
    widgets: result.querySelectorAll('[data-inline-plugin]').length,
  }, { bold: 'Answer', className: 'answer-emphasis', fontSize: '1.5em',
    mention: expected.includes('@Grace') ? '@Grace' : '@Ada',
    color: expected.includes('#654321') ? '#654321' : '#123456', widgets: 0 })
  assert(result.isConnected)
}
