import { Poll } from '../../plugins/poll/index.js'
import { EditorRenderer } from '../../renderer/index.js'

export async function verifyPollLifetime(fixture, sandbox) {
  const assert = (condition, message) => { if (!condition) throw new Error(message) }
  for (const kind of ['editor', 'renderer']) {
    for (const remote of [false, true]) {
      let loads = 0, errors = 0, mutations = 0, unsubscribes = 0
      let dispose
      const config = {
        onError() { errors++ },
        ...(remote ? { dataSource: {
          async load() { loads++; return { total: 0, options: [] } },
          async vote() { throw new Error('destroyed poll cannot submit') },
          subscribe() { return () => { unsubscribes++; if (unsubscribes === 1) dispose() } },
        } } : {}),
      }
      const data = { ...fixture, initialResults: {
        total: 1, currentUserVote: ['yes'], options: [{ id: 'yes', votes: 1 }, { id: 'no', votes: 0 }],
      } }
      let element, marker, submit
      if (kind === 'editor') {
        const plugin = new Poll(config)
        element = plugin.render(data, { ownerDocument: document, readOnly: false, mutate(operation) { mutations++; return operation() } })
        dispose = () => plugin.destroy(element)
        marker = element.querySelector('.oe-poll__option-marker')
        submit = element.querySelector('.oe-poll__submit')
      } else {
        const renderer = new EditorRenderer({ blockTypes: ['poll'], blockConfigs: { poll: config }, injectStyles: false })
        element = renderer.renderBlock({ type: 'poll', data })
        dispose = () => renderer.destroy(element)
        marker = element.querySelector('.editor-poll__marker')
        submit = element.querySelector('.editor-poll__submit')
      }
      sandbox.appendChild(element)
      assert(marker && submit, 'Poll lifetime fixture must expose actual controls')
      dispose()
      element.replaceChildren()
      marker.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      submit.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await new Promise(resolve => setTimeout(resolve, 0))
      assert(loads === 0, `${kind}: deferred load started after destruction`)
      assert(errors === 0, `${kind}: destroyed controls reported an error`)
      assert(mutations === 0, `${kind}: destroyed controls requested a document mutation`)
      assert(element.childNodes.length === 0, `${kind}: destroyed controls rebuilt the DOM`)
      assert(unsubscribes === (remote ? 1 : 0), `${kind}: subscription disposed more than once`)
      element.remove()
    }
  }
}
