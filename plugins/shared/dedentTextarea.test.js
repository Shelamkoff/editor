import assert from 'node:assert/strict'
import test from 'node:test'
import { dedentTextarea } from './dedentTextarea.js'

function textarea(value, start, end = start, direction = 'none') {
  let text = value
  return {
    get value() { return text },
    set value(next) {
      text = next
      this.selectionStart = this.selectionEnd = next.length
      this.selectionDirection = 'none'
    },
    selectionStart: start,
    selectionEnd: end,
    selectionDirection: direction,
    setSelectionRange(from, to, nextDirection) {
      this.selectionStart = from
      this.selectionEnd = to
      this.selectionDirection = nextDirection
    },
  }
}

const selection = field => [field.selectionStart, field.selectionEnd, field.selectionDirection]

test('dedent removes one leading tab and keeps the caret at the same source text', () => {
  const field = textarea('\tAlpha', 3)

  assert.equal(dedentTextarea(field, 2), true)

  assert.equal(field.value, 'Alpha')
  assert.deepEqual(selection(field), [2, 2, 'none'])
})

for (const position of [0, 1]) {
  test(`dedent clamps a caret ${position === 0 ? 'before' : 'after'} the removed tab to the line start`, () => {
    const field = textarea('\tAlpha', position)

    assert.equal(dedentTextarea(field, 4), true)

    assert.equal(field.value, 'Alpha')
    assert.deepEqual(selection(field), [0, 0, 'none'])
  })
}

for (const { name, value, width, expected } of [
  { name: 'consecutive tabs', value: '\t\tAlpha', width: 4, expected: '\tAlpha' },
  { name: 'tab followed by spaces', value: '\t  Alpha', width: 2, expected: '  Alpha' },
  { name: 'spaces followed by a tab', value: '  \tAlpha', width: 4, expected: '\tAlpha' },
  { name: 'more than one space unit', value: '   \tAlpha', width: 2, expected: ' \tAlpha' },
]) {
  test(`dedent removes only one indentation unit from ${name}`, () => {
    const field = textarea(value, value.length)

    assert.equal(dedentTextarea(field, width), true)

    assert.equal(field.value, expected)
    assert.deepEqual(selection(field), [expected.length, expected.length, 'none'])
  })
}

for (const direction of ['forward', 'backward']) {
  for (const { width, value, end } of [
    { width: 2, value: '\tAlpha\n  Bravo\n\tTail', end: 15 },
    { width: 4, value: '\tAlpha\n    Bravo\n\tTail', end: 17 },
  ]) {
    test(`dedent preserves a ${direction} range across tabs and ${width}-space indentation without touching the next line`, () => {
      const field = textarea(value, 3, end, direction)

      assert.equal(dedentTextarea(field, width), true)

      assert.equal(field.value, 'Alpha\nBravo\n\tTail')
      assert.deepEqual(selection(field), [2, 12, direction])
    })
  }
}

test('dedent without leading whitespace preserves source, interior tabs and its directed range', () => {
  const field = textarea('Alpha\tBravo\n\tTail', 2, 4, 'backward')

  assert.equal(dedentTextarea(field, 2), false)

  assert.equal(field.value, 'Alpha\tBravo\n\tTail')
  assert.deepEqual(selection(field), [2, 4, 'backward'])
})
