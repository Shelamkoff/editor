import { EditorRenderer } from '../../../renderer/index.js'
import { test, equal, assert, pause } from './harness.js'

const oldCss = 'data:text/css,' + encodeURIComponent('.r08-old { color: rgb(12, 34, 56) !important; }')
const newCss = 'data:text/css,' + encodeURIComponent('.r08-new { color: rgb(65, 43, 21) !important; }')
const hasStyle = url => [...document.head.querySelectorAll('link[data-oe-style]')].some(link => link.href === url)
const data = id => ({ id, type: 'custom', data: { text: id } })
function plugin(css, name) {
  return { type: 'custom', styles: [css], render(block) { const p = document.createElement('p'); p.className = name; p.textContent = block.data.text; return p } }
}
function output(renderer, mode, holder, id) {
  if (mode === 'renderTo') {
    const target = document.createElement('div'); holder.appendChild(target)
    renderer.renderTo({ blocks: [data(id)] }, target)
    return { target, element: target.querySelector('p') }
  }
  const target = mode === 'render' ? renderer.render({ blocks: [data(id)] }) : renderer.renderBlock(data(id))
  holder.appendChild(target)
  return { target, element: mode === 'render' ? target.querySelector('p') : target }
}

export function register() {
  for (const mode of ['renderBlock', 'render', 'renderTo']) {
    test(`old ${mode} results retain their actual styles until their last owner is destroyed`, async () => {
      const renderer = new EditorRenderer({ blockTypes: [] })
      const holder = document.createElement('div'); document.body.appendChild(holder)
      try {
        renderer.registerRenderer(plugin(oldCss, 'r08-old'))
        const old = output(renderer, mode, holder, 'old')
        for (let i = 0; i < 30 && getComputedStyle(old.element).color !== 'rgb(12, 34, 56)'; i++) await pause(10)
        equal(getComputedStyle(old.element).color, 'rgb(12, 34, 56)', 'the fixture CSS must load')
        renderer.registerRenderer(plugin(newCss, 'r08-new'))
        const current = output(renderer, mode, holder, 'new')
        await pause(20)
        assert(old.element.isConnected)
        equal(getComputedStyle(old.element).color, 'rgb(12, 34, 56)', 'registry replacement must not restyle an existing result')
        assert(hasStyle(oldCss) && hasStyle(newCss))
        renderer.destroy(old.target)
        equal(hasStyle(oldCss), false, 'retired renderer CSS must be released with its final result')
        equal(hasStyle(newCss), true)
        renderer.destroy(current.target)
        equal(hasStyle(newCss), false)
      } finally { renderer.destroy(); holder.remove() }
    })
  }
  test('several results from one retired renderer share ownership until the last result ends', () => {
    const renderer = new EditorRenderer({ blockTypes: [] })
    try {
      renderer.registerRenderer(plugin(oldCss, 'r08-old'))
      const first = renderer.renderBlock(data('a'))
      const second = renderer.render({ blocks: [data('b')] })
      renderer.registerRenderer(plugin(newCss, 'r08-new'))
      renderer.renderBlock(data('c'))
      assert(hasStyle(oldCss))
      renderer.destroy(first); assert(hasStyle(oldCss), 'another old result is still owned')
      renderer.destroy(second); equal(hasStyle(oldCss), false)
      assert(hasStyle(newCss))
    } finally { renderer.destroy() }
  })
  test('incremental replacement releases old mounted CSS but not CSS needed by a detached result', () => {
    const renderer = new EditorRenderer({ blockTypes: [] })
    const holder = document.createElement('div'); document.body.appendChild(holder)
    try {
      renderer.registerRenderer(plugin(oldCss, 'r08-old'))
      const detached = renderer.renderBlock(data('detached'))
      renderer.renderTo({ blocks: [data('a')] }, holder)
      renderer.registerRenderer(plugin(newCss, 'r08-new'))
      renderer.renderTo({ blocks: [data('a')] }, holder)
      assert(hasStyle(oldCss), 'the detached result still owns the retired CSS')
      renderer.destroy(detached)
      equal(hasStyle(oldCss), false)
      assert(hasStyle(newCss))
    } finally { renderer.destroy(); holder.remove() }
  })
  test('failed replacement rendering cannot strip CSS from the previous live document', () => {
    const renderer = new EditorRenderer({ blockTypes: [] })
    const holder = document.createElement('div'); document.body.appendChild(holder)
    try {
      renderer.registerRenderer(plugin(oldCss, 'r08-old'))
      renderer.renderTo({ blocks: [data('a')] }, holder)
      const old = holder.querySelector('p')
      renderer.registerRenderer({ type: 'custom', styles: [newCss], render() { throw new Error('deliberate new renderer failure') } })
      let failed = false
      try { renderer.renderTo({ blocks: [data('a')] }, holder) } catch { failed = true }
      assert(failed)
      assert(holder.querySelector('p') === old)
      assert(hasStyle(oldCss), 'failure must preserve the old document appearance')
    } finally { renderer.destroy(); holder.remove() }
  })
  test('retired stylesheet references remain independent across renderer instances', () => {
    const first = new EditorRenderer({ blockTypes: [] })
    const second = new EditorRenderer({ blockTypes: [] })
    try {
      first.registerRenderer(plugin(oldCss, 'r08-old'))
      const a = first.renderBlock(data('a'))
      second.registerRenderer(plugin(oldCss, 'r08-old'))
      second.renderBlock(data('b'))
      first.registerRenderer(plugin(newCss, 'r08-new'))
      first.renderBlock(data('c'))
      second.destroy()
      assert(hasStyle(oldCss), 'the first instance still has an old live result')
      first.destroy(a)
      equal(hasStyle(oldCss), false)
      assert(hasStyle(newCss))
    } finally { first.destroy(); second.destroy() }
  })
  test('manual styles stay explicitly owned when automatic injection is disabled', () => {
    const renderer = new EditorRenderer({ blockTypes: [], injectStyles: false })
    let owner
    try {
      renderer.registerRenderer(plugin(oldCss, 'r08-old'))
      renderer.renderBlock(data('a'))
      renderer.registerRenderer(plugin(newCss, 'r08-new'))
      renderer.renderBlock(data('b'))
      equal(hasStyle(oldCss), false)
      equal(hasStyle(newCss), false)
      owner = renderer.injectStyles()
      assert(hasStyle(oldCss) && hasStyle(newCss), 'explicit injection must cover every current result owner')
      renderer.destroy()
      assert(hasStyle(oldCss) && hasStyle(newCss), 'manual owner controls its own lifetime')
    } finally { renderer.destroy(); owner?.destroy() }
    equal(hasStyle(oldCss), false)
    equal(hasStyle(newCss), false)
  })
}
