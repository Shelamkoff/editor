import assert from 'node:assert/strict'
import test from 'node:test'
import * as rendererModule from './index.js'
import * as implementationModule from './EditorRenderer.js'

test('renderer construction has one public spelling without a forwarding factory', () => {
  assert.equal(typeof rendererModule.EditorRenderer, 'function')
  assert.equal(Object.hasOwn(rendererModule, 'createEditorRenderer'), false)
  assert.equal(Object.hasOwn(implementationModule, 'createEditorRenderer'), false)
})

test('the public renderer class retains construction, overrides and reusable disposal', () => {
  class ArticleRenderer extends rendererModule.EditorRenderer {
    constructor() {
      super({ blockTypes: [], injectStyles: false, classPrefix: 'article' })
    }

    getClassPrefix() {
      return `${super.getClassPrefix()}-custom`
    }
  }

  const renderer = new ArticleRenderer()
  assert.ok(renderer instanceof rendererModule.EditorRenderer)
  assert.equal(renderer.getClassPrefix(), 'article-custom')
  assert.deepEqual(renderer.getRegisteredTypes(), [])
  renderer.destroy()
  assert.equal(renderer.getClassPrefix(), 'article-custom')
  assert.deepEqual(renderer.getRegisteredTypes(), [])
})
