import { createEditor } from '../../core/index.js'
import { createPollPlugin } from '../../plugins/poll/index.js'
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
      const data = {
        ...fixture,
        initialResults: {
          total: 1,
          currentUserVote: ['yes'],
          options: [{ id: 'yes', votes: 1 }, { id: 'no', votes: 0 }],
        },
      }

      let element, marker, submit, holder = null
      if (kind === 'editor') {
        holder = document.createElement('section')
        sandbox.appendChild(holder)
        const editor = createEditor({
          holder,
          plugins: [createPollPlugin({ ...config, injectStyles: false })],
          defaultBlock: 'poll',
          injectStyles: false,
          data: { version: '2.0.0', blocks: [{ id: 'poll-lifetime', type: 'poll', data }] },
        })
        editor.on('transaction:committed', () => { mutations++ })
        element = holder.querySelector('.oe-poll')
        marker = element?.querySelector('.oe-poll__option-marker')
        submit = element?.querySelector('.oe-poll__submit')
        dispose = () => editor.destroy()
      } else {
        const renderer = new EditorRenderer({ blockTypes: ['poll'], blockConfigs: { poll: config }, injectStyles: false })
        element = renderer.renderBlock({ type: 'poll', data })
        marker = element.querySelector('.editor-poll__marker')
        submit = element.querySelector('.editor-poll__submit')
        dispose = () => {
          renderer.destroy(element)
          renderer.destroy()
        }
        sandbox.appendChild(element)
      }

      assert(element instanceof HTMLElement && marker && submit, 'Poll lifetime fixture must expose actual controls')
      dispose()
      element.replaceChildren()
      marker.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      submit.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await new Promise(resolve => setTimeout(resolve, 0))
      assert(loads === 0, `${kind}: deferred load started after destruction`)
      assert(errors === 0, `${kind}: destroyed controls reported an error`)
      assert(mutations === 0, `${kind}: destroyed controls requested a canonical mutation`)
      assert(element.childNodes.length === 0, `${kind}: destroyed controls rebuilt the DOM`)
      assert(unsubscribes === (remote ? 1 : 0), `${kind}: subscription disposed more than once`)
      holder?.remove()
      element.remove()
    }
  }
}
