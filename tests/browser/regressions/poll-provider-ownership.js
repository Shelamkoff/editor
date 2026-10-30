import { createPollPlugin } from '../../../plugins/poll/index.js'
import { assert, equal, make, blockElement, pause, test } from './harness.js'

export const results = (revision, first = 5, second = 5) => ({
  revision, total: first + second,
  options: [{ id: 'first', votes: first }, { id: 'second', votes: second }],
})

export async function pollProviderFixture() {
  const subscriptions = [], errors = [], transactions = [], contexts = [], loads = []
  const definition = createPollPlugin({
    injectStyles: false,
    compareRevisions: (next, current) => Number(next) - Number(current),
    onError: error => errors.push(error),
    dataSource: {
      async load(request) { loads.push(request); return results('1') },
      async vote() { throw new Error('This fixture does not submit a vote') },
      subscribe(request) {
        const subscription = { ...request, releases: 0 }
        subscriptions.push(subscription)
        return () => { subscription.releases++ }
      },
    },
  })
  const capture = { ...definition, setup(runtimeContext) {
    const runtime = definition.setup(runtimeContext)
    return { ...runtime, create(data, context) {
      contexts.push(context)
      return runtime.create(data, context)
    } }
  } }
  const editor = make([{ id: 'poll', type: 'poll', dataVersion: 1, data: {
    pollId: 'poll-owner-proof', question: 'Question', type: 'single', resultsMode: 'always',
    options: [{ id: 'first', text: '<b>Alpha</b>' }, { id: 'second', text: '<i>Beta</i>' }],
  } }], { defaultBlock: 'poll', plugins: [capture], inlineTools: [] })
  editor.on('transaction:committed', event => transactions.push(event))
  await pause(30)
  const shell = blockElement(editor, 'poll'), wrapper = shell.querySelector('.oe-poll')
  const field = wrapper.querySelector('.oe-poll__option-text[data-option-id="first"]')
  assert(subscriptions.length === 1 && loads.length === 1, 'Real provider did not connect exactly once')
  equal([...wrapper.querySelectorAll('.oe-poll__result-pct')].map(node => node.textContent), ['50%', '50%'])
  return { editor, shell, wrapper, field, subscriptions, errors, transactions, contexts, loads }
}

test('Poll provider ownership: a current subscription refresh preserves author fields and history', async () => {
  const h = await pollProviderFixture()
  try {
    const before = h.editor.save().blocks, result = h.wrapper.querySelector('.oe-poll__result-label')
    h.subscriptions[0].onUpdate(results('2', 8, 2))
    await pause()
    equal([...h.wrapper.querySelectorAll('.oe-poll__result-pct')].map(node => node.textContent), ['80%', '20%'])
    equal(h.wrapper.querySelector('.oe-poll__result-label').innerHTML, '<b>Alpha</b>')
    assert(h.wrapper.querySelector('.oe-poll__option-text[data-option-id="first"]') === h.field)
    assert(h.wrapper.querySelector('.oe-poll__result-label') !== result && !result.isConnected)
    equal(h.editor.save().blocks, before)
    equal({ events: h.transactions.length, undo: h.editor.canUndo, redo: h.editor.canRedo }, { events: 0, undo: false, redo: false })
    equal(h.errors, [])
  } finally { h.editor.destroy() }
})

for (const adopted of ['wrapper', 'shell']) {
  test(`Poll provider ownership: a subscription cannot repaint an adopted whole ${adopted}`, async () => {
    const h = await pollProviderFixture(), foreign = document.createElement('aside')
    document.body.append(foreign)
    try {
      const before = h.editor.save().blocks, target = adopted === 'wrapper' ? h.wrapper : h.shell
      foreign.append(target)
      const label = h.wrapper.querySelector('.oe-poll__result-label')
      label.textContent = 'foreign result sentinel'
      const beforeHtml = h.wrapper.innerHTML, children = [...h.wrapper.childNodes]
      h.subscriptions[0].onUpdate(results('2', 8, 2))
      await pause()
      equal(h.wrapper.innerHTML, beforeHtml, 'Provider callback changed a foreign owner\'s DOM')
      equal([...h.wrapper.childNodes], children, 'Provider callback replaced foreign child identities')
      assert(target.parentNode === foreign && label.parentNode?.parentNode?.parentNode === h.wrapper)
      equal(h.editor.save().blocks, before)
      equal({ events: h.transactions.length, undo: h.editor.canUndo, redo: h.editor.canRedo }, { events: 0, undo: false, redo: false })
    } finally { h.editor.destroy(); foreign.remove() }
  })
}
