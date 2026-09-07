import { test, assert, equal } from './harness.js'
export function register() {
  for (const [name, actual, expected] of [
    ['NaN and null', NaN, null], ['missing and undefined', { x: undefined }, {}],
    ['different maps', new Map([['a', 1]]), new Map([['b', 2]])],
    ['different sets', new Set([1]), new Set([2])], ['array holes', Array(1), [undefined]],
    ['negative zero', -0, 0], ['typed arrays', new Uint8Array([1]), new Uint8Array([2])],
  ]) {
    test(`deep comparison rejects ${name}`, () => {
      let rejected = false
      try { equal(actual, expected) } catch { rejected = true }
      assert(rejected, 'different values must never pass equality')
    })
  }
  test('deep comparison is independent of object key insertion order', () => equal({ a: 1, b: 2 }, { b: 2, a: 1 }))
  test('deep comparison supports equal collections and cycles', () => {
    equal(new Map([['a', { n: 1 }]]), new Map([['a', { n: 1 }]]))
    equal(new Set([1, 2]), new Set([2, 1]))
    const a = { value: 1 }; a.self = a
    const b = { value: 1 }; b.self = b
    equal(a, b)
    b.value = 2
    let rejected = false
    try { equal(a, b) } catch { rejected = true }
    assert(rejected)
  })
}
