import test from 'node:test'
import assert from 'node:assert/strict'
import * as plugins from './index.js'

for (const [name, factory] of Object.entries(plugins)) {
  test(name + ' permits the host to replace built-in styles', () => {
    const ordinary = factory()
    assert.ok(ordinary.styles.length > 0)
    assert.deepEqual(factory({ injectStyles: false }).styles, [])
    const css = 'https://example.test/host.css'
    assert.deepEqual(factory({ injectStyles: false, css }).styles, [css])
  })
  test(name + ' appends custom CSS and snapshots style ownership', () => {
    const ordinary = factory()
    const config = { css: 'https://example.test/host.css' }
    const definition = factory(config)
    assert.deepEqual(definition.styles, [...ordinary.styles, config.css])
    assert.ok(Object.isFrozen(definition.styles))
    config.css = 'https://example.test/later.css'
    config.injectStyles = false
    assert.deepEqual(definition.styles, [...ordinary.styles, 'https://example.test/host.css'])
    assert.ok(!Object.isFrozen(config), 'Factory froze caller-owned configuration')
  })
}
