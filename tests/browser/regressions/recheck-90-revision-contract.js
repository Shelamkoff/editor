import { test, make, para, assert } from './harness.js'

export function register() {
  test('editor import rejects non-finite producer revisions', () => {
    for (const revision of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      let rejected = false
      try {
        make([para('revision-block', 'A', { revision })])
      } catch (error) {
        rejected = /finite JSON number/i.test(String(error))
      }
      assert(rejected, 'non-finite revision must be rejected at the editor JSON boundary')
    }
  })
}
