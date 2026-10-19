import test from 'node:test'
import assert from 'node:assert/strict'

import { ProjectionAnimator } from './ProjectionAnimator.js'

class FakeAnimation {
  constructor() {
    this.cancelled = false
    this.onfinish = null
    this.oncancel = null
  }
  cancel() {
    this.cancelled = true
    this.oncancel?.()
  }
  finish() { this.onfinish?.() }
}

class FakeElement {
  constructor(document, top = 0, height = 20) {
    this.ownerDocument = document
    this.top = top
    this.height = height
    this.offsetHeight = height
    this.parentNode = null
    this.children = []
    this.style = {}
    this.className = ''
    this.attributes = {}
    this.animations = []
    this.inert = false
  }
  getBoundingClientRect() { return { top: this.top, height: this.height } }
  animate(frames, options) {
    const animation = new FakeAnimation()
    animation.frames = frames
    animation.options = options
    this.animations.push(animation)
    return animation
  }
  setAttribute(name, value) { this.attributes[name] = String(value) }
  appendChild(child) {
    child.remove()
    this.children.push(child)
    child.parentNode = this
    return child
  }
  insertBefore(child, anchor) {
    child.remove()
    const index = anchor ? this.children.indexOf(anchor) : this.children.length
    this.children.splice(index < 0 ? this.children.length : index, 0, child)
    child.parentNode = this
    return child
  }
  remove() {
    if (!this.parentNode) return
    const index = this.parentNode.children.indexOf(this)
    if (index >= 0) this.parentNode.children.splice(index, 1)
    this.parentNode = null
  }
}

function realm() {
  const document = {
    defaultView: {
      matchMedia: () => ({ matches: false }),
      getComputedStyle: () => ({ marginBottom: '4px' }),
    },
    createElement() { return new FakeElement(document) },
  }
  return document
}

test('initial projection remains animation-free until enable()', () => {
  const document = realm()
  const element = new FakeElement(document)
  const animator = new ProjectionAnimator({ insertMs: 10, moveMs: 10, removeMs: 10 })

  animator.animateInsert(element)
  assert.equal(element.animations.length, 0)

  animator.enable()
  animator.animateInsert(element)
  assert.equal(element.animations.length, 1)
  assert.equal(element.animations[0].options.duration, 10)
})

test('move animation preserves DOM identity and uses captured geometry', () => {
  const document = realm()
  const element = new FakeElement(document, 100)
  const animator = new ProjectionAnimator({ insertMs: 0, moveMs: 25, removeMs: 0 })
  animator.enable()

  const entries = new Map([['a', { element }]])
  const before = animator.capture(entries)
  element.top = 140
  animator.animateMoves(entries, before)

  assert.equal(element.animations.length, 1)
  assert.equal(element.animations[0].frames[0].transform, 'translateY(-40px)')
  assert.equal(element.animations[0].options.duration, 25)
})

test('removal animation uses an inert spacer instead of retaining plugin DOM', () => {
  const document = realm()
  const container = new FakeElement(document)
  const first = new FakeElement(document, 0, 30)
  const second = new FakeElement(document, 34, 30)
  container.appendChild(first)
  container.appendChild(second)

  const animator = new ProjectionAnimator({ insertMs: 0, moveMs: 0, removeMs: 40 })
  animator.enable()
  const snapshot = animator.captureRemoval(first, 0)
  first.remove()
  assert.equal(first.parentNode, null)

  animator.animateRemovals(container, [snapshot])
  const spacer = container.children[0]
  assert.notEqual(spacer, first)
  assert.equal(spacer.inert, true)
  assert.equal(spacer.attributes['aria-hidden'], 'true')
  assert.equal(spacer.animations[0].options.duration, 40)

  spacer.animations[0].finish()
  assert.equal(container.children.includes(spacer), false)
})

test('reduced motion suppresses projection animations', () => {
  const document = realm()
  document.defaultView.matchMedia = () => ({ matches: true })
  const element = new FakeElement(document)
  const animator = new ProjectionAnimator({ insertMs: 10, moveMs: 10, removeMs: 10 })
  animator.enable()

  animator.animateInsert(element)
  assert.equal(element.animations.length, 0)
})

test('animation durations reject invalid values', () => {
  for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY, '10']) {
    assert.throws(() => new ProjectionAnimator({ moveMs: value }), /moveMs/)
  }
})

test('failed spacer insertion rolls back a partially mutated container', () => {
  const document = realm()
  const container = new FakeElement(document)
  const first = new FakeElement(document, 0, 30)
  const survivor = new FakeElement(document, 35, 30)
  container.appendChild(first)
  container.appendChild(survivor)
  const animator = new ProjectionAnimator({ insertMs: 0, moveMs: 0, removeMs: 40 })
  animator.enable()
  const snapshot = animator.captureRemoval(first, 0)
  first.remove()
  const originalInsert = container.insertBefore
  container.insertBefore = function(node, anchor) {
    originalInsert.call(this, node, anchor)
    throw new Error('DOM insertion failed after mutation')
  }

  animator.animateRemovals(container, [snapshot])
  assert.deepEqual(container.children, [survivor],
    'partially inserted animation spacer leaked into committed document')
  assert.equal(survivor.parentNode, container)
  animator.destroy()
  assert.deepEqual(container.children, [survivor])
})

test('animation completion does not delete a spacer adopted by another container', () => {
  const document = realm()
  const container = new FakeElement(document)
  const outside = new FakeElement(document)
  const first = new FakeElement(document, 0, 30)
  container.appendChild(first)
  const animator = new ProjectionAnimator({ removeMs: 40 })
  animator.enable()
  const snapshot = animator.captureRemoval(first, 0)
  first.remove()
  animator.animateRemovals(container, [snapshot])
  const spacer = container.children[0]
  const animation = spacer.animations[0]
  outside.appendChild(spacer)
  animation.finish()

  assert.equal(spacer.parentNode, outside,
    'stale animation callback removed a node that another owner adopted')
  assert.deepEqual(outside.children, [spacer])
  animator.destroy()
  assert.deepEqual(outside.children, [spacer])
})

test('animator destruction does not remove a spacer moved to another owner', () => {
  const document = realm()
  const container = new FakeElement(document)
  const outside = new FakeElement(document)
  const first = new FakeElement(document, 0, 30)
  container.appendChild(first)
  const animator = new ProjectionAnimator({ removeMs: 40 })
  animator.enable()
  const snapshot = animator.captureRemoval(first, 0)
  first.remove()
  animator.animateRemovals(container, [snapshot])
  const spacer = container.children[0]
  outside.appendChild(spacer)

  animator.destroy()
  assert.equal(spacer.parentNode, outside,
    'destroy() removed a DOM node now owned by another container')
  assert.deepEqual(outside.children, [spacer])
})
test('a failed removal spacer allocation does not abort later visual-only animations', () => {
  const document = realm()
  const container = new FakeElement(document)
  const first = new FakeElement(document, 0, 30)
  const second = new FakeElement(document, 40, 30)
  container.appendChild(first)
  container.appendChild(second)
  const animator = new ProjectionAnimator({ removeMs: 40 })
  animator.enable()
  const snapshots = [
    animator.captureRemoval(first, 0),
    animator.captureRemoval(second, 1),
  ]
  first.remove()
  second.remove()
  const createElement = document.createElement
  let allocations = 0
  document.createElement = function (...args) {
    if (++allocations === 1) throw new Error('optional animation DOM unavailable')
    return createElement.apply(this, args)
  }

  assert.doesNotThrow(() => animator.animateRemovals(container, snapshots),
    'optional animation allocation failure escaped after document commit')
  assert.equal(allocations, 2,
    'failed animation staging prevented an independent later animation')
  assert.equal(container.children.length, 1)
  const survivor = container.children[0]
  assert.equal(survivor.className, 'oe-block-removal-spacer')
  animator.destroy()
  assert.deepEqual(container.children, [], 'visual-only spacer was not released')
})

test('a failing spacer removal does not strand independent animator resources', () => {
  const document = realm()
  const container = new FakeElement(document)
  const first = new FakeElement(document, 0, 30)
  const second = new FakeElement(document, 40, 30)
  container.appendChild(first)
  container.appendChild(second)
  const animator = new ProjectionAnimator({ removeMs: 40 })
  animator.enable()
  const snapshots = [
    animator.captureRemoval(first, 0),
    animator.captureRemoval(second, 1),
  ]
  first.remove()
  second.remove()
  animator.animateRemovals(container, snapshots)
  const [failing, independent] = container.children
  failing.remove = () => { throw new Error('broken DOM removal adapter') }

  assert.doesNotThrow(() => animator.destroy(),
    'one failing visual-only spacer interrupted editor teardown')
  assert.equal(independent.parentNode, null,
    'unrelated removal spacer remained mounted after a sibling cleanup failure')
  assert.deepEqual(container.children, [failing])
})
