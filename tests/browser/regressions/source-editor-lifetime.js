import { openSourceEditor, preloadSourceEditor } from '../../../plugins/shared/sourceEditor.js'
import { test, equal, assert, pause } from './harness.js'

function fixture(connected = true) {
  const block = document.createElement('div')
  block.className = 'oe-block'
  const wrapper = document.createElement('div')
  block.appendChild(wrapper)
  if (connected) document.body.appendChild(block)
  const controller = new AbortController()
  const config = {
    wrapper, signal: controller.signal, kind: 'url', title: 'URL', label: 'URL',
    placeholder: '', submitText: 'Insert', cancelText: 'Cancel', invalidText: 'Invalid',
    normalize: value => value.trim(), onSubmit() {},
  }
  return { block, wrapper, controller, config, destroy() { controller.abort(); block.remove() } }
}

export function register() {
  test('source form replacement remains cached instead of duplicating a connected surface', () => {
    const f = fixture()
    try {
      preloadSourceEditor(f.wrapper, f.controller.signal, ['url'])
      f.wrapper.replaceChildren()
      preloadSourceEditor(f.wrapper, f.controller.signal, ['url'])
      const replacement = f.wrapper.firstElementChild
      preloadSourceEditor(f.wrapper, f.controller.signal, ['url'])
      equal(f.wrapper.querySelectorAll('[data-oe-source-editor="url"]').length, 1)
      equal(f.wrapper.firstElementChild, replacement)
    } finally { f.destroy() }
  })

  test('source forms staged off-DOM are reused before the block is mounted', () => {
    const f = fixture(false)
    try {
      preloadSourceEditor(f.wrapper, f.controller.signal, ['url'])
      const original = f.wrapper.firstElementChild
      preloadSourceEditor(f.wrapper, f.controller.signal, ['url'])
      equal(f.wrapper.firstElementChild, original, 'detached ownership is still valid ownership')
      equal(f.wrapper.children.length, 1)
    } finally { f.destroy() }
  })

  test('replacing source forms does not accumulate owning-lifecycle abort listeners', () => {
    const f = fixture()
    const signal = f.controller.signal
    const add = signal.addEventListener.bind(signal)
    const remove = signal.removeEventListener.bind(signal)
    const listeners = new Set()
    // Instrument only registrations on the real owning AbortSignal; all DOM
    // and native event delivery remain real, including cancellation below.
    signal.addEventListener = (type, callback, options) => { if (type === 'abort') listeners.add(callback); add(type, callback, options) }
    signal.removeEventListener = (type, callback, options) => { if (type === 'abort') listeners.delete(callback); remove(type, callback, options) }
    try {
      preloadSourceEditor(f.wrapper, signal, ['url'])
      const initial = listeners.size
      assert(initial > 0, 'the surface must be tied to its owner lifetime')
      for (let i = 0; i < 12; i++) {
        f.wrapper.replaceChildren()
        preloadSourceEditor(f.wrapper, signal, ['url'])
        equal(listeners.size, initial, 'retired surface callbacks must not accumulate')
      }
      f.controller.abort()
      equal(f.wrapper.children.length, 0)
    } finally { f.destroy() }
  })

  test('moving a cached form outside its owner does not reuse the foreign surface', () => {
    const f = fixture()
    let moved
    try {
      preloadSourceEditor(f.wrapper, f.controller.signal, ['url'])
      moved = f.wrapper.firstElementChild
      document.body.appendChild(moved)
      preloadSourceEditor(f.wrapper, f.controller.signal, ['url'])
      equal(f.wrapper.children.length, 1)
      assert(f.wrapper.firstElementChild !== moved)
      assert(!moved.isConnected)
    } finally { moved?.remove(); f.destroy() }
  })

  test('replacement form submits once and stale controls cannot submit after replacement', async () => {
    const f = fixture()
    const values = []
    f.config.onSubmit = value => values.push(value)
    try {
      openSourceEditor(f.config)
      const oldForm = f.wrapper.querySelector('form')
      oldForm.querySelector('input').value = 'https://example.test/old'
      f.wrapper.replaceChildren()
      preloadSourceEditor(f.wrapper, f.controller.signal, ['url'])
      openSourceEditor(f.config)
      oldForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      equal(values, [])
      equal(f.wrapper.querySelectorAll('form').length, 1)
      const form = f.wrapper.querySelector('form')
      form.querySelector('input').value = 'https://example.test/current'
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      equal(values, ['https://example.test/current'])
      assert(!f.block.hasAttribute('data-oe-layer-open'))
      await pause()
    } finally { f.destroy() }
  })

  test('URL and HTML source forms remain independent across replacement and cancellation', async () => {
    const f = fixture()
    try {
      preloadSourceEditor(f.wrapper, f.controller.signal, ['url', 'html'])
      const html = f.wrapper.querySelector('[data-oe-source-editor="html"]')
      f.wrapper.querySelector('[data-oe-source-editor="url"]').remove()
      preloadSourceEditor(f.wrapper, f.controller.signal, ['url'])
      equal(f.wrapper.children.length, 2)
      equal(f.wrapper.querySelector('[data-oe-source-editor="html"]'), html)
      openSourceEditor({ ...f.config, kind: 'html' })
      assert(f.block.hasAttribute('data-oe-layer-open'))
      f.controller.abort()
      equal(f.wrapper.children.length, 0)
      assert(!f.block.hasAttribute('data-oe-layer-open'))
      await pause()
    } finally { f.destroy() }
  })
}
