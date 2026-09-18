import { test, make, para, equal } from './harness.js'

export function register() {
  test('editor import discards non-finite producer revisions', () => {
    for (const revision of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const editor = make([para('revision-block', 'A', { revision })])
      const saved = editor.save().blocks[0]
      equal(Object.hasOwn(saved, 'revision'), false, 'non-finite revision must not survive editor import')
      editor.destroy()
    }
  })
}
