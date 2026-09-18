import { EditorRenderer } from '../../../renderer/index.js'
import { test, assert, equal, pause } from './harness.js'

export function register() {
  test('renderer executes snapshotted custom renderer methods', () => {
    let renderReads = 0
    let destroyReads = 0
    let renderCalls = 0
    let destroyCalls = 0
    const custom = {
      type: 'stable-contract',
      get render() {
        renderReads++
        if (renderReads > 1) throw new Error('render getter was observed twice')
        return function () {
          renderCalls++
          const element = document.createElement('article')
          element.textContent = 'stable'
          return element
        }
      },
      get destroy() {
        destroyReads++
        if (destroyReads > 1) throw new Error('destroy getter was observed twice')
        return function () { destroyCalls++ }
      },
    }

    const renderer = new EditorRenderer({ blockTypes: [], injectStyles: false })
    renderer.registerRenderer(custom)
    const element = renderer.renderBlock({ type: 'stable-contract', data: {} })
    equal(element.textContent, 'stable')
    renderer.destroy(element)
    equal(renderReads, 1)
    equal(destroyReads, 1)
    equal(renderCalls, 1)
    equal(destroyCalls, 1)
    renderer.destroy()
  })

  test('renderer executes snapshotted inline plugin methods', () => {
    let createReads = 0
    let dataReads = 0
    const plugin = {
      type: 'stable-inline',
      get createWidget() {
        createReads++
        if (createReads > 1) throw new Error('createWidget getter was observed twice')
        return function (_data, id, context = { ownerDocument: document }) {
          const element = context.ownerDocument.createElement('span')
          element.dataset.inlinePlugin = 'stable-inline'
          element.dataset.id = id || 'w'
          element.textContent = 'widget'
          return element
        }
      },
      get getData() {
        dataReads++
        if (dataReads > 1) throw new Error('getData getter was observed twice')
        return function () { return {} }
      },
    }

    const renderer = new EditorRenderer({
      blockTypes: ['paragraph'],
      inlinePlugins: [plugin],
      injectStyles: false,
    })
    const element = renderer.renderBlock({
      type: 'paragraph',
      data: { text: '{{w}}' },
      inline: { w: { type: 'stable-inline', data: {} } },
    })

    assert(element.textContent.includes('widget'), 'snapshotted inline plugin did not render')
    equal(createReads, 1)
    equal(dataReads, 1)
    renderer.destroy(element)
    renderer.destroy()
  })

  test('Poll renderer executes snapshotted runtime adapter methods', async () => {
    const reads = { dataSource: 0, load: 0, vote: 0, subscribe: 0, onError: 0, compare: 0, maxVoters: 0 }
    let loadCalls = 0
    let voteCalls = 0
    let loadThis = null
    let voteThis = null
    let subscribeThis = null
    let compareThis = 'unset'
    let onErrorThis = 'unset'
    const adapter = {
      get load() {
        reads.load++
        if (reads.load > 1) throw new Error('Poll load getter was observed twice')
        return async function () {
          loadThis = this
          loadCalls++
          return {
            revision: '1',
            total: 0,
            options: [{ id: 'yes', votes: 0 }, { id: 'no', votes: 0 }],
          }
        }
      },
      get vote() {
        reads.vote++
        if (reads.vote > 1) throw new Error('Poll vote getter was observed twice')
        return async function ({ optionIds }) {
          voteThis = this
          voteCalls++
          return {
            revision: '2',
            total: 1,
            options: [
              { id: 'yes', votes: optionIds.includes('yes') ? 1 : 0 },
              { id: 'no', votes: optionIds.includes('no') ? 1 : 0 },
            ],
            currentUserVote: optionIds,
          }
        }
      },
      get subscribe() {
        reads.subscribe++
        if (reads.subscribe > 1) throw new Error('Poll subscribe getter was observed twice')
        return function () {
          subscribeThis = this
          return () => { throw new Error('cleanup probe') }
        }
      },
    }
    const pollConfig = {
      get dataSource() {
        reads.dataSource++
        if (reads.dataSource > 1) throw new Error('Poll dataSource getter was observed twice')
        return adapter
      },
      get onError() {
        reads.onError++
        if (reads.onError > 1) throw new Error('Poll onError getter was observed twice')
        return function () {
          onErrorThis = this
        }
      },
      get compareRevisions() {
        reads.compare++
        if (reads.compare > 1) throw new Error('Poll compareRevisions getter was observed twice')
        return function (next, current) {
          compareThis = this
          return Number(next) - Number(current)
        }
      },
      get maxVoters() {
        reads.maxVoters++
        if (reads.maxVoters > 1) throw new Error('Poll maxVoters getter was observed twice')
        return 10
      },
    }

    const renderer = new EditorRenderer({
      blockTypes: ['poll'],
      blockConfigs: { poll: pollConfig },
      injectStyles: false,
    })
    const element = renderer.renderBlock({
      id: 'poll-config-snapshot',
      type: 'poll',
      data: {
        pollId: 'poll-config-snapshot',
        question: 'Choose',
        type: 'single',
        options: [{ id: 'yes', text: 'Yes' }, { id: 'no', text: 'No' }],
        resultsMode: 'always',
      },
    })
    document.body.appendChild(element)
    await pause()
    equal(loadCalls, 1)
    const markers = element.querySelectorAll('.editor-poll__marker')
    markers[1].click()
    element.querySelector('.editor-poll__submit').click()
    await pause()
    equal(voteCalls, 1)
    equal(loadThis, adapter, 'Poll load must preserve dataSource method receiver')
    equal(voteThis, adapter, 'Poll vote must preserve dataSource method receiver')
    equal(subscribeThis, adapter, 'Poll subscribe must preserve dataSource method receiver')
    equal(compareThis, undefined, 'Poll compareRevisions must remain a detached callback')
    equal(reads, {
      dataSource: 1,
      load: 1,
      vote: 1,
      subscribe: 1,
      onError: 1,
      compare: 1,
      maxVoters: 1,
    })
    renderer.destroy(element)
    equal(onErrorThis, undefined, 'Poll onError must remain a detached callback')
    element.remove()
    renderer.destroy()
  })

}
