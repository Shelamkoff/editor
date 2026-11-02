import { createEditor } from '../../core/index.js'
import { EditorRenderer } from '../../renderer/index.js'
import { createRawPlugin } from '../../plugins/raw/index.js'
import { createCarouselPlugin } from '../../plugins/carousel/index.js'
import { test, assert, equal, pause } from './regressions/harness.js'
import { waitForEmbeddedDocument } from './embedded-html-helpers.js'

const acquisitions = ['mutation-constructor', 'mutation-observe', 'resize-constructor', 'resize-observe',
  'controller-constructor', 'sheet-constructor', 'sheet-replace', 'media-query',
  'mutation-observe-throw', 'resize-observe-throw', 'mutation-observe-before', 'resize-observe-before',
  'mutation-observe-before-throw', 'resize-observe-before-throw', 'live']

for (const type of ['raw', 'carousel']) for (const editing of [true, false]) for (const fault of acquisitions) {
  test(`${type} ${editing ? 'editor' : 'renderer'}: staged HTML acquisition ${fault}`, async () => {
    const holder = document.createElement('section'); document.body.append(holder)
    const html = '<p id="acquisition-proof">Owned readable content</p>'
    const data = { version: '2.0.0', blocks: [{ id: 'content', type, dataVersion: 1,
      data: type === 'raw' ? { html } : { slides: [{ id: 'html', type: 'html', html, caption: '' }],
        options: { loop: false, autoplay: false, autoplayDelay: 3000, navigation: true, pagination: true, thumbnails: false } } }] }
    const before = structuredClone(data), contentStyles = ['@media(min-width:0px){p{color:rgb(12,84,156)}}']
    const Resize = window.ResizeObserver, Mutation = window.MutationObserver
    const add = window.addEventListener, remove = window.removeEventListener, media = window.matchMedia
    const mediaAdd = MediaQueryList.prototype.addEventListener
    const resizeObservers = new Set(), mutationObservers = new Set(), resizes = new Set(), controllers = [], subscriptions = []
    let frame, container, editor, renderer, retired = false, triggered = false, snapshot
    let lateObserve = 0, lateSheetWrites = 0, localErrors = 0
    const save = () => snapshot ?? (editor ? editor.save().blocks : data.blocks)
    const retire = () => { snapshot ??= save(); retired = true; editor?.destroy(); renderer?.destroy() }
    const trigger = stage => {
      if (triggered || fault !== stage) return
      triggered = true
      if (stage.endsWith('-throw')) throw false
      retire()
    }
    const patchChild = event => {
      if (event.target !== frame) return
      const view = frame.contentWindow, Controller = view.AbortController, Sheet = view.CSSStyleSheet
      view.AbortController = class extends Controller {
        constructor() { super(); controllers.push(this); trigger('controller-constructor') }
      }
      view.CSSStyleSheet = class extends Sheet {
        constructor(...args) { super(...args); trigger('sheet-constructor') }
        replaceSync(source) {
          if (retired) lateSheetWrites++
          const result = super.replaceSync(source); trigger('sheet-replace'); return result
        }
      }
    }
    const mount = () => {
      if (editing) editor = createEditor({ holder, data, contentStyles, readOnly: true, injectStyles: false,
        plugins: [type === 'raw' ? createRawPlugin({ injectStyles: false }) : createCarouselPlugin({ injectStyles: false })] })
      else { renderer = new EditorRenderer({ blockTypes: [type], contentStyles, injectStyles: false }); renderer.renderTo(data, holder) }
      frame = holder.querySelector('iframe'); container = frame.parentNode
      frame.addEventListener('error', () => localErrors++)
    }
    window.ResizeObserver = class extends Resize {
      constructor(callback) { super(callback); if (frame?.contentDocument?.getElementById('acquisition-proof')) trigger('resize-constructor') }
      observe(target, ...options) {
        const child = target.ownerDocument !== document
        if (child) { resizeObservers.add(this); if (retired) lateObserve++ }
        if (child && !triggered && fault.startsWith('resize-observe-before')) {
          triggered = true; retire(); const result = super.observe(target, ...options); resizeObservers.add(this)
          if (fault.endsWith('-throw')) throw false
          return result
        }
        const result = super.observe(target, ...options)
        if (child) trigger(fault === 'resize-observe-throw' ? fault : 'resize-observe')
        return result
      }
      disconnect() { resizeObservers.delete(this); return super.disconnect() }
    }
    window.MutationObserver = class extends Mutation {
      constructor(callback) { super(callback); if (frame?.contentDocument?.URL === 'about:srcdoc') trigger('mutation-constructor') }
      observe(target, ...options) {
        const owned = target === container
        if (owned) { mutationObservers.add(this); if (retired) lateObserve++ }
        if (owned && !triggered && fault.startsWith('mutation-observe-before')) {
          triggered = true; retire(); const result = super.observe(target, ...options); mutationObservers.add(this)
          if (fault.endsWith('-throw')) throw false
          return result
        }
        const result = super.observe(target, ...options)
        if (owned) trigger(fault === 'mutation-observe-throw' ? fault : 'mutation-observe')
        return result
      }
      disconnect() { mutationObservers.delete(this); return super.disconnect() }
    }
    window.addEventListener = function (name, listener, options) {
      if (name === 'resize' && frame && !options?.signal?.aborted) {
        resizes.add(listener); options?.signal?.addEventListener('abort', () => resizes.delete(listener), { once: true })
      }
      return add.call(this, name, listener, options)
    }
    window.removeEventListener = function (name, listener, options) {
      if (name === 'resize') resizes.delete(listener)
      return remove.call(this, name, listener, options)
    }
    window.matchMedia = function (...args) { const query = media.apply(this, args); if (frame) trigger('media-query'); return query }
    MediaQueryList.prototype.addEventListener = function (name, listener, options) {
      if (frame && name === 'change' && options?.signal) subscriptions.push(options.signal)
      return mediaAdd.call(this, name, listener, options)
    }
    document.addEventListener('load', patchChild, true)
    try {
      mount()
      if (fault === 'live') await waitForEmbeddedDocument(frame)
      else {
        const deadline = performance.now() + 3000
        while (!triggered) { assert(performance.now() < deadline, `The real ${fault} boundary was not entered`); await pause(10) }
      }
      await pause(40)
      if (fault === 'live') {
        equal(resizeObservers.size, 1); equal(mutationObservers.size, 1)
        equal(controllers.length, 1); equal(subscriptions.length, 1)
        equal(frame.contentWindow.getComputedStyle(frame.contentDocument.getElementById('acquisition-proof')).color, 'rgb(12, 84, 156)')
      }
      retire()
      window.dispatchEvent(new Event('resize')); await pause(20)
      equal(lateObserve, 0, 'Closed owners must not begin observation')
      equal(lateSheetWrites, 0, 'Closed owners must not prepare styles')
      equal(resizeObservers.size, 0, 'A provisional ResizeObserver survived retirement')
      equal(mutationObservers.size, 0, 'A provisional MutationObserver survived retirement')
      equal(resizes.size, 0, 'A parent resize subscription survived retirement')
      assert(controllers.every(controller => controller.signal.aborted), 'A provisional controller survived retirement')
      assert(subscriptions.every(signal => signal.aborted), 'A content media subscription survived retirement')
      assert(!frame.isConnected)
      equal(localErrors, fault.endsWith('-throw') && !fault.includes('-before') ? 1 : 0, 'Only a real initialization failure reports a local error')
      equal(save(), before.blocks); equal(data, before)
    } finally {
      document.removeEventListener('load', patchChild, true)
      window.ResizeObserver = Resize; window.MutationObserver = Mutation
      window.addEventListener = add; window.removeEventListener = remove; window.matchMedia = media
      MediaQueryList.prototype.addEventListener = mediaAdd
      try { editor?.destroy(); renderer?.destroy() } finally {
        for (const observer of resizeObservers) Resize.prototype.disconnect.call(observer)
        for (const observer of mutationObservers) Mutation.prototype.disconnect.call(observer)
        for (const listener of resizes) remove.call(window, 'resize', listener)
        for (const controller of controllers) controller.abort()
        holder.remove()
      }
    }
    // Actual fresh public output proves a failed or retired acquisition did not
    // poison the reusable renderer/module or suppress a subsequent valid view.
    const successor = document.createElement('section'); document.body.append(successor)
    let nextEditor, nextRenderer
    try {
      if (editing) nextEditor = createEditor({ holder: successor, data, contentStyles, readOnly: true, injectStyles: false,
        plugins: [type === 'raw' ? createRawPlugin({ injectStyles: false }) : createCarouselPlugin({ injectStyles: false })] })
      else { nextRenderer = new EditorRenderer({ blockTypes: [type], contentStyles, injectStyles: false }); nextRenderer.renderTo(data, successor) }
      const nextFrame = successor.querySelector('iframe'), child = await waitForEmbeddedDocument(nextFrame)
      equal(nextFrame.contentWindow.getComputedStyle(child.getElementById('acquisition-proof')).color, 'rgb(12, 84, 156)')
      equal(nextEditor ? nextEditor.save().blocks : data.blocks, before.blocks)
    } finally { nextEditor?.destroy(); nextRenderer?.destroy(); successor.remove() }
  })
}
