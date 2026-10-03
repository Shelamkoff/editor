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
