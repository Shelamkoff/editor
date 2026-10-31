// A disposer can publish an independent successor after retiring a sibling.
// The outer destroy() owns the captured output, not every later use of its key.
export function runRendererSuccessorDisposal({ EditorRenderer }) {
  const results = []
  const schema = {
    currentVersion: 1,
    createDefault: () => ({}),
    decode: ({ dataVersion, data }) => ({ dataVersion, data: structuredClone(data) }),
    encode: data => ({ dataVersion: 1, data: structuredClone(data) }),
  }
  for (const mode of ['container-remount', 'container-replace', 'container-replace-throw', 'block-reuse', 'independent-container']) {
    const entry = { id: `successor-disposal/${mode}`, observations: [], errors: [], complete: false }
    const check = (property, actual, expected) => {
      // Later disposal mutates the recorded arrays. Keep the values from this
      // observation so the raw record always agrees with its computed status.
      entry.observations.push({
        property, actual: structuredClone(actual), expected: structuredClone(expected),
        status: JSON.stringify(actual) === JSON.stringify(expected) ? 'PASS' : 'FAIL',
      })
    }
    const standalone = mode === 'block-reuse'
    const oldStyle = `data:text/css,/*rector-disposal-old-${mode}*/`
    const newStyle = `data:text/css,/*rector-disposal-new-${mode}*/`
    const styleCount = url => [...document.head.querySelectorAll('link[data-oe-style]')]
      .filter(link => link.href === url).length
    const holders = Array.from({ length: 4 }, () => {
      const element = document.createElement('section')
      document.body.append(element)
      return element
    })
    const renderer = new EditorRenderer({ blockTypes: [] })
    const oldDisposed = []
    const newDisposed = []
    const warnings = []
    const expectedDisposerFailure = new Error('retiring renderer failed after publishing its successor')
    const warn = console.warn
    const block = id => ({ id, type: 'successor-owner', dataVersion: 1, data: { label: id } })
    const data = id => ({ version: '2.0.0', blocks: [block(id)] })
    const inputs = ['first', 'second', 'third'].map(data)
    const originalInputs = structuredClone(inputs)
    let second
    let replacementTarget
    let replacementElement
    let replacementWrapper
    let callbacks = 0
    const nextDefinition = {
      type: 'successor-owner', schema, styles: [newStyle],
      render(value) {
        const element = standalone && value.id === 'replacement' ? second : document.createElement('article')
        element.textContent = value.data.label
        return element
      },
      destroy(element) { newDisposed.push(element.dataset.blockId) },
    }
    renderer.registerRenderer({
      type: 'successor-owner', schema, styles: [oldStyle],
      render(value) {
        const element = document.createElement('article')
        element.textContent = value.data.label
        return element
      },
      destroy(element) {
        oldDisposed.push(element.dataset.blockId)
        if (element.dataset.blockId !== 'first') return
        callbacks++
        if (standalone || mode === 'container-remount' || mode === 'independent-container') renderer.destroy(second)
        renderer.registerRenderer(nextDefinition)
        if (standalone) {
          replacementTarget = renderer.renderBlock(block('replacement'))
          replacementElement = replacementTarget
        } else {
          replacementTarget = mode === 'independent-container' ? holders[3] : second
          renderer.renderTo(data('replacement'), replacementTarget)
          replacementWrapper = replacementTarget.firstElementChild
          replacementElement = replacementWrapper.firstElementChild
        }
        if (mode === 'container-replace-throw') throw expectedDisposerFailure
      },
    })
    try {
      console.warn = (message, failure) => warnings.push({ expected: failure === expectedDisposerFailure, message })
      let first
      let third
      let oldSecondWrapper
      if (standalone) {
        first = renderer.renderBlock(inputs[0].blocks[0])
        second = renderer.renderBlock(inputs[1].blocks[0])
        third = renderer.renderBlock(inputs[2].blocks[0])
      } else {
        ;[first, second, third] = holders
        renderer.renderTo(inputs[0], first)
        renderer.renderTo(inputs[1], second)
        renderer.renderTo(inputs[2], third)
        oldSecondWrapper = second.firstElementChild
      }
      check('initialOldStyles', styleCount(oldStyle), 1)
      renderer.destroy()
      check('successorPublicationCount', callbacks, 1)
      check('capturedOwnerDisposalOrder', oldDisposed, ['first', 'second', 'third'])
      check('successorNotDisposed', newDisposed, [])
      check('firstCapturedOutputEmpty', first.childNodes.length, 0)
      check('thirdCapturedOutputEmpty', third.childNodes.length, 0)
      check('successorText', replacementElement?.textContent, 'replacement')
      if (standalone) {
        check('releasedHTMLElementReused', replacementElement === second, true)
      } else {
        check('successorWrapperStillMounted', replacementTarget.firstElementChild === replacementWrapper, true)
        check('successorElementStillMounted', replacementWrapper.firstElementChild === replacementElement, true)
        if (mode.startsWith('container-replace')) check('existingWrapperReused', replacementWrapper === oldSecondWrapper, true)
        if (mode === 'container-remount') check('newWrapperAfterRelease', replacementWrapper !== oldSecondWrapper, true)
        renderer.renderTo(data('replacement'), replacementTarget)
        check('successorRevisionReuse', replacementTarget.firstElementChild?.firstElementChild === replacementElement, true)
      }
      check('retiredStylesReleased', styleCount(oldStyle), 0)
      check('successorStylesRetained', styleCount(newStyle), 1)
      check('callerInputUnchanged', inputs, originalInputs)
      check('containedDisposerFailure', warnings.map(item => item.expected), mode === 'container-replace-throw' ? [true] : [])
      renderer.destroy(replacementTarget)
      check('successorDisposedByOwnDefinition', newDisposed, ['replacement'])
      check('targetCleanup', replacementTarget.childNodes.length, 0)
      renderer.destroy()
      check('repeatedCleanupIsInert', newDisposed, ['replacement'])
      check('allAutomaticStylesReleased', [styleCount(oldStyle), styleCount(newStyle)], [0, 0])
      const reused = renderer.renderBlock(block('reused'))
      check('reusableRendererOutput', reused.textContent, 'reused')
      renderer.destroy(reused)
      check('reusableRendererCleanup', newDisposed, ['replacement', 'reused'])
      check('reuseReleasesStyles', [styleCount(oldStyle), styleCount(newStyle)], [0, 0])
      entry.complete = true
    } catch (error) {
      entry.errors.push(error.stack ?? String(error))
    } finally {
      renderer.destroy()
      console.warn = warn
      for (const holder of holders) holder.remove()
    }
    results.push(entry)
  }
  return results
}
