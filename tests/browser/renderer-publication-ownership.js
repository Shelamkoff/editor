// A later extension callback can move an earlier provisional result before
// the complete document is published. Observe real DOM ownership here.
export function runRendererPublicationOwnership({ EditorRenderer }) {
  const results = []
  const schema = {
    currentVersion: 1,
    createDefault: () => ({}),
    decode: ({ dataVersion, data }) => ({ dataVersion, data: structuredClone(data) }),
    encode: data => ({ dataVersion: 1, data: structuredClone(data) }),
  }
  const tagName = 'rector-publication-ownership-probe'
  if (!customElements.get(tagName)) {
    customElements.define(tagName, class extends HTMLElement {
      connectedCallback() {
        const callback = this.onConnection
        this.onConnection = null
        callback?.()
      }
    })
  }
  const cases = ['render', 'renderTo'].flatMap(method =>
    ['connected-host', 'detached-host', 'foreign-document'].map(destination =>
      ({ method, destination, callback: 'render' })))
  cases.push(
    { method: 'renderTo', destination: 'connected-host', callback: 'connect-first' },
    { method: 'renderTo', destination: 'connected-host', callback: 'connect-last' },
  )

  for (const { method, destination, callback } of cases) {
    const entry = { id: `publication-ownership/${method}/${destination}/${callback}`, observations: [], errors: [], complete: false }
    const check = (property, actual, expected) => entry.observations.push({
      property, actual, expected,
      status: JSON.stringify(actual) === JSON.stringify(expected) ? 'PASS' : 'FAIL',
    })
    const container = document.createElement('section')
    const outside = document.createElement('aside')
    const foreignDocument = document.implementation.createHTMLDocument('foreign owner')
    document.body.append(container)
    if (destination === 'connected-host') document.body.append(outside)
    const renderer = new EditorRenderer({ blockTypes: [], injectStyles: false })
    const elements = new Map()
    const released = []
    let adopt = true
    let adoptions = 0
    const adoptedId = callback === 'connect-first' ? 'last' : 'first'
    const transferOwnership = () => {
      if (!adopt) return
      adoptions++
      if (destination === 'foreign-document') foreignDocument.adoptNode(elements.get(adoptedId))
      else outside.append(elements.get(adoptedId))
    }
    renderer.registerRenderer({
      type: 'publication-ownership', schema,
      render(block) {
        const connects = callback === `connect-${block.id}`
        const element = document.createElement(connects ? tagName : 'article')
        element.textContent = block.id
        elements.set(block.id, element)
        if (connects) element.onConnection = transferOwnership
        if (block.id === 'last' && callback === 'render') transferOwnership()
        return element
      },
      destroy(element) { released.push(element.textContent) },
    })
    const block = id => ({ id, type: 'publication-ownership', dataVersion: 1, data: {} })
    const data = blocks => ({ version: '2.0.0', blocks })

    try {
      renderer.renderTo(data([block('previous')]), container)
      const previousWrapper = container.firstElementChild
      const previousElement = previousWrapper.firstElementChild
      const next = data([block('first'), block('last')])
      const input = structuredClone(next)
      let error
      try {
        if (method === 'render') renderer.render(next)
        else renderer.renderTo(next, container)
      }
      catch (failure) { error = failure }
      check('callbackClaimedElement', adoptions, 1)
      check('rejectsLostStagingOwnership', error instanceof TypeError, true)
      check('previousWrapperIdentity', container.firstElementChild === previousWrapper, true)
      check('previousOutputIdentity', previousWrapper.firstElementChild === previousElement, true)
      check('previousOutputText', container.textContent, 'previous')
      check('previousOutputCount', previousWrapper.childElementCount, 1)
      const adopted = elements.get(adoptedId)
      check('adoptedParent', adopted.parentNode === (destination === 'foreign-document' ? null : outside), true)
      check('adoptedDocument', adopted.ownerDocument === (destination === 'foreign-document' ? foreignDocument : document), true)
      check('provisionalDisposal', [...released].sort(), ['first', 'last'])
      check('callerData', next, input)

      // Failure must release provisional ownership so the same public renderer
      // can subsequently publish a normal replacement and dispose it exactly once.
      adopt = false
      renderer.renderTo(data([block('replacement')]), container)
      check('retryOutput', container.textContent, 'replacement')
      check('retryPreviousDisposal', released.filter(id => id === 'previous').length, 1)
      renderer.destroy(container)
      renderer.destroy(container)
      check('exactFinalDisposal', [...released].sort(), ['first', 'last', 'previous', 'replacement'])
      check('finalAdoptedParent', adopted.parentNode === (destination === 'foreign-document' ? null : outside), true)
      check('finalAdoptedDocument', adopted.ownerDocument === (destination === 'foreign-document' ? foreignDocument : document), true)
      entry.complete = true
    } catch (error) {
      entry.errors.push(error.stack ?? String(error))
    } finally {
      renderer.destroy()
      container.remove()
      outside.remove()
    }
    results.push(entry)
  }

  for (const destination of ['foreign-host', 'foreign-document']) {
    const entry = { id: `publication-ownership/renderTo/initial-wrapper/${destination}`,
      observations: [], errors: [], complete: false }
    const check = (property, actual, expected) => entry.observations.push({ property, actual, expected,
      status: JSON.stringify(actual) === JSON.stringify(expected) ? 'PASS' : 'FAIL' })
    const container = document.createElement('section')
    const original = document.createElement('p')
    original.textContent = 'Caller content'
    container.append(original)
    const outside = document.createElement('aside')
    const foreignDocument = document.implementation.createHTMLDocument('wrapper owner')
    document.body.append(container, outside)
    const renderer = new EditorRenderer({ blockTypes: [], injectStyles: false })
    const released = [], elements = []
    let claimed
    renderer.registerRenderer({
      type: 'initial-wrapper', schema,
      render(block) {
        const element = document.createElement(block.id === 'first' ? tagName : 'article')
        element.textContent = block.id
        elements.push(element)
        if (block.id === 'first') element.onConnection = () => {
          claimed = element.parentElement
          const parent = destination === 'foreign-document' ? foreignDocument.body : outside
          parent.append(claimed)
        }
        return element
      },
      destroy(element) { released.push(element.textContent) },
    })
    const data = ids => ({ version: '2.0.0', blocks: ids.map(id =>
      ({ id, type: 'initial-wrapper', dataVersion: 1, data: {} })) })
    try {
      let failure
      try { renderer.renderTo(data(['first', 'last']), container) }
      catch (error) { failure = error }
      check('rejectsLostWrapperOwnership', failure instanceof TypeError, true)
      check('callerContentIdentity', container.firstChild === original && container.childNodes.length === 1, true)
      check('callerContentText', container.textContent, 'Caller content')
      const parent = destination === 'foreign-document' ? foreignDocument.body : outside
      check('foreignWrapperParent', claimed?.parentNode === parent, true)
      check('foreignWrapperRealm', claimed?.ownerDocument === parent.ownerDocument, true)
      check('adoptedChildrenIdentity', claimed?.childNodes.length === 2
        && claimed.firstChild === elements[0] && claimed.lastChild === elements[1], true)
      check('provisionalDisposal', [...released].sort(), ['first', 'last'])
      renderer.destroy(container)
      check('destroyKeepsCallerContent', container.firstChild === original, true)
      check('destroyKeepsForeignWrapper', claimed?.parentNode === parent && claimed.childNodes.length === 2, true)
      renderer.renderTo(data(['replacement']), container)
      check('retryOutput', container.textContent, 'replacement')
      renderer.destroy(container)
      renderer.destroy()
      check('exactFinalDisposal', [...released].sort(), ['first', 'last', 'replacement'])
      check('retryKeepsForeignWrapper', claimed?.parentNode === parent && claimed.childNodes.length === 2, true)
      entry.complete = true
    } catch (error) {
      entry.errors.push(error.stack ?? String(error))
    } finally {
      renderer.destroy()
      container.remove()
      outside.remove()
    }
    results.push(entry)
  }
  return results
}
