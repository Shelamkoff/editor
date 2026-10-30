// Fixed public-boundary oracles shared by the ordinary browser page and the
// immutable v1/specification/candidate comparison. Only wire versions adapt.
export function runRendererLifetimeParity({ EditorRenderer, legacy = false }) {
  const results = []
  const schema = { currentVersion: 1, createDefault: () => ({}),
    decode: ({ dataVersion, data }) => ({ dataVersion, data: structuredClone(data) }),
    encode: data => ({ dataVersion: 1, data: structuredClone(data) }) }
  const block = (id, data = {}, revisioned = false) => ({ id, type: 'lifetime',
    ...(!legacy ? { dataVersion: 1 } : {}), ...(revisioned ? { revision: 'unchanged' } : {}), data })
  const documentData = blocks => ({ version: legacy ? '1.0.5' : '2.0.0', blocks })
  const perform = (id, callback) => {
    const entry = { id, observations: [], errors: [], complete: false }
    const check = (property, actual, expected) => entry.observations.push({ property,
      actual: structuredClone(actual), expected: structuredClone(expected),
      status: JSON.stringify(actual) === JSON.stringify(expected) ? 'PASS' : 'FAIL' })
    const attempt = action => {
      try { return { value: action(), error: null } }
      catch (error) { return { error: String(error) } }
    }
    try { callback(check, attempt); entry.complete = true }
    catch (error) { entry.errors.push(error.stack ?? String(error)) }
    results.push(entry)
  }
  const create = (renderer, method, data) => {
    const holder = document.createElement('section')
    document.body.append(holder)
    let target
    try {
      if (method === 'renderTo') { renderer.renderTo(documentData([data]), holder); target = holder }
      else {
        target = method === 'render' ? renderer.render(documentData([data])) : renderer.renderBlock(data)
        holder.append(target)
      }
    } catch (error) { holder.remove(); throw error }
    return { holder, target, node: () => method === 'renderBlock' ? target
      : method === 'render' ? target.firstElementChild : holder.firstElementChild?.firstElementChild }
  }

  for (const method of ['renderBlock', 'render', 'renderTo']) {
    for (const revisioned of [false, true]) {
      for (const throwOnUnknown of [false, true]) {
        perform(`registration/${method}/${revisioned ? 'revision' : 'data'}/${throwOnUnknown ? 'throw' : 'placeholder'}`, (check, attempt) => {
          const renderer = new EditorRenderer({ blockTypes: [], injectStyles: false, throwOnUnknown })
          const released = [], created = [], holders = []
          const definition = owner => ({ type: 'lifetime', schema,
            render(data) {
              const node = document.createElement('article')
              node.textContent = `${owner}:${data.data.text}`
              const token = `${owner}-${created.filter(item => item.owner === owner).length + 1}`
              created.push({ node, owner, token })
              return node
            },
            destroy(node) {
              const item = created.find(item => item.node === node)
              released.push({ token: item?.token ?? 'foreign', by: owner })
            } })
          const data = block('stable', { text: 'Author <literal>' }, revisioned)
          const original = structuredClone(data)
          const mount = () => { const output = create(renderer, method, data); holders.push(output); return output }
          try {
            check('registerReturnsOwner', renderer.registerRenderer(definition('A')) === renderer, true)
            check('initialRegistry', renderer.getRegisteredTypes(), ['lifetime'])
            const first = mount(), retained = mount()
            const firstNode = first.node(), retainedNode = retained.node()
            check('initialOutput', [firstNode.textContent, retainedNode.textContent], ['A:Author <literal>', 'A:Author <literal>'])
            renderer.registerRenderer(definition('B'))
            check('replacementKeepsOldOutput', retained.node() === retainedNode, true)
            check('replacementDoesNotDispose', released, [])
            const next = mount()
            check('newRegistryOwnsNewOutput', next.node().textContent, 'B:Author <literal>')
            if (method === 'renderTo') {
              renderer.renderTo(documentData([data]), first.target)
              check('sameDataInvalidatesRegistryRevision', first.node() !== firstNode, true)
              check('replacementOwner', first.node().textContent, 'B:Author <literal>')
              check('replacementDisposer', released, [{ token: 'A-1', by: 'A' }])
            }
            check('unregisterReturnsOwner', renderer.unregisterRenderer('lifetime') === renderer, true)
            check('unregisteredTypes', renderer.getRegisteredTypes(), [])
            check('unregisteredHasRenderer', renderer.hasRenderer('lifetime'), false)
            check('retainedOldOutputAfterUnregister', retained.node() === retainedNode, true)
            check('retainedOldContentAfterUnregister', retainedNode.textContent, 'A:Author <literal>')
            const unknown = attempt(mount)
            check('unknownBehavior', unknown.error ? unknown.error.startsWith('UnknownBlockTypeError:') : 'placeholder',
              throwOnUnknown ? true : 'placeholder')
            if (!throwOnUnknown && unknown.value) {
              check('unknownPlaceholder', [unknown.value.node().className, unknown.value.node().dataset.blockType,
                unknown.value.node().textContent], ['editor-unknown', 'lifetime', ''])
            }
            renderer.registerRenderer(definition('C'))
            check('reregisteredTypes', renderer.getRegisteredTypes(), ['lifetime'])
            const newest = mount()
            check('reregisteredOutput', newest.node().textContent, 'C:Author <literal>')
            renderer.destroy(retained.target)
            check('retainedUsesOriginalDisposer', released.filter(item => item.token === 'A-2'), [{ token: 'A-2', by: 'A' }])
            check('retainedDisposalKeepsNewOutput', newest.node().textContent, 'C:Author <literal>')
            check('callerInput', data, original)
            renderer.destroy()
            renderer.destroy()
            const expected = [
              { token: 'A-1', by: 'A' }, { token: 'A-2', by: 'A' },
              { token: 'B-1', by: 'B' }, ...(method === 'renderTo' ? [{ token: 'B-2', by: 'B' }] : []),
              { token: 'C-1', by: 'C' },
            ].sort((a, b) => a.token.localeCompare(b.token))
            check('exactOriginatingDisposers', [...released].sort((a, b) => a.token.localeCompare(b.token)), expected)
            check('createdCount', created.length, method === 'renderTo' ? 5 : 4)
          } finally {
            renderer.destroy()
            for (const output of holders) output.holder.remove()
          }
        })
      }
    }
  }

  for (const failureName of ['Error', 'undefined', 'null', 'false', 'zero', 'empty']) {
    perform(`diagnostic-cleanup/${failureName}`, (check, attempt) => {
      const renderer = new EditorRenderer({ blockTypes: [], injectStyles: false })
      const released = [], holders = [], previousWarn = console.warn
      const failure = { Error: new Error('disposer failed'), undefined, null: null, false: false, zero: 0, empty: '' }[failureName]
      renderer.registerRenderer({ type: 'lifetime', schema,
        render(data) { const element = document.createElement('article'); element.textContent = data.id; return element },
        destroy(element) { released.push(element.textContent); throw failure } })
      try {
        for (const [method, id] of [['renderTo', 'mounted'], ['render', 'document'], ['renderBlock', 'single']]) {
          holders.push(create(renderer, method, block(id)))
        }
        console.warn = () => { throw new Error('logging unavailable') }
        check('destroyError', attempt(() => renderer.destroy()).error, null)
        check('independentDisposal', released, ['mounted', 'document', 'single'])
        check('repeatedDestroyError', attempt(() => renderer.destroy()).error, null)
        check('noDoubleDisposal', released, ['mounted', 'document', 'single'])
        const output = create(renderer, 'renderBlock', block('reused')); holders.push(output)
        check('reuseDestroyError', attempt(() => renderer.destroy(output.target)).error, null)
        check('reusableOwner', released, ['mounted', 'document', 'single', 'reused'])
      } finally {
        console.warn = previousWarn
        renderer.destroy()
        for (const output of holders) output.holder.remove()
      }
    })
  }

  for (const method of ['render', 'renderTo']) {
    perform(`diagnostic-staging/${method}`, (check, attempt) => {
      const renderer = new EditorRenderer({ blockTypes: [], injectStyles: false })
      const released = [], previousWarn = console.warn
      renderer.registerRenderer({ type: 'lifetime', schema,
        render(data) {
          if (data.data.fail) throw new Error('authoritative rendering failure')
          const element = document.createElement('article'); element.textContent = data.id; return element
        },
        destroy(element) { released.push(element.textContent); throw new Error('cleanup failed') } })
      const previous = create(renderer, 'renderTo', block('previous'))
      const previousNode = previous.node()
      try {
        console.warn = () => { throw new Error('logging unavailable') }
        const data = documentData([block('staged'), block('broken', { fail: true })])
        check('originalError', attempt(() => method === 'render' ? renderer.render(data) : renderer.renderTo(data, previous.target)).error,
          'Error: authoritative rendering failure')
        check('stagedCleanup', released, ['staged'])
        check('previousIdentity', previous.node() === previousNode, true)
        check('previousText', previous.node().textContent, 'previous')
        check('destroyError', attempt(() => renderer.destroy()).error, null)
        check('previousCleanup', released, ['staged', 'previous'])
      } finally { console.warn = previousWarn; renderer.destroy(); previous.holder.remove() }
    })
  }
  perform('diagnostic-post-commit', (check, attempt) => {
    const renderer = new EditorRenderer({ blockTypes: [], injectStyles: false })
    const released = [], previousWarn = console.warn
    let rendered = 0
    renderer.registerRenderer({ type: 'lifetime', schema,
      render(data) { rendered++; const element = document.createElement('article'); element.textContent = data.data.text; return element },
      destroy(element) { released.push(element.textContent); throw new Error('cleanup failed') } })
    const output = create(renderer, 'renderTo', block('stable', { text: 'old' }))
    try {
      console.warn = () => { throw new Error('logging unavailable') }
      const next = documentData([block('stable', { text: 'new' })])
      check('replacementError', attempt(() => renderer.renderTo(next, output.target)).error, null)
      check('replacementText', output.node().textContent, 'new')
      check('oldDisposal', released, ['old'])
      const replacement = output.node()
      check('repeatError', attempt(() => renderer.renderTo(next, output.target)).error, null)
      check('replacementReused', output.node() === replacement, true)
      check('renderCount', rendered, 2)
      check('finalDestroyError', attempt(() => renderer.destroy()).error, null)
      check('exactDisposal', released, ['old', 'new'])
    } finally { console.warn = previousWarn; renderer.destroy(); output.holder.remove() }
  })
  return results
}
