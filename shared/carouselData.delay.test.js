import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeCarouselData, validateCarouselData } from './carouselData.js'

for (const [value, expected] of [
  [Number.MIN_VALUE, 1], [0.5, 1], [0.999, 1], [1, 1], [1.9, 1],
  [3000.9, 3000], [0, 3000], [-1, 3000], [NaN, 3000], [Infinity, 3000], ['5', 3000],
]) {
  test(`carousel delay ${String(value)} normalizes to a positive, stable millisecond value`, () => {
    const input = { slides: [{ id: 's', type: 'image', src: '/image.png' }], options: { autoplayDelay: value } }
    const normalized = normalizeCarouselData(input, () => 'unused')
    assert.equal(normalized.options.autoplayDelay, expected)
    assert.equal(validateCarouselData(normalized), true, 'normalization must not manufacture an invalid delay')
    assert.deepEqual(normalizeCarouselData(normalized, () => 'unused'), normalized, 'normalization must be idempotent')
    assert.ok(Object.is(input.options.autoplayDelay, value), 'consumer data must remain untouched')
  })
}
