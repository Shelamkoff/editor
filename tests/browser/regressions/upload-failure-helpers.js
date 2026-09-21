import { Paragraph } from '../../../plugins/paragraph/index.js'
import { test, make, equal, assert, pause } from './harness.js'

async function until(predicate, label) {
  const deadline = performance.now() + 1500
  while (!predicate() && performance.now() < deadline) await pause(5)
  assert(predicate(), label)
}
export function registerUploadFailureTests(spec) {
    for (const mode of ['local', 'remote']) {
      test(`${spec.type} ${mode} failed upload application is observed and retry remains undoable`, async () => {
        let attempts = 0, reject = true
        class ValidatingPlugin extends spec.Base {
          validate(data) {
            if (spec.count(data)) { attempts++; return !reject }
            return true
          }
        }
        const config = mode === 'remote' ? { uploadFile: async () => ({ url: 'https://example.test/upload' }) } : {}
        const editor = make([{ id: 'upload', type: spec.type, data: {} }], {
          plugins: [new Paragraph(), new ValidatingPlugin(config)], validationMode: 'strict',
        })
        const before = editor.save().blocks
        const drop = () => {
          const dataTransfer = new DataTransfer()
          dataTransfer.items.add(new File(['sample'], spec.name, { type: spec.mime }))
          const zone = editor.rootElement.querySelector(spec.selector)
          assert(zone, 'empty upload control must exist')
          zone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }))
        }
        drop()
        await until(() => attempts > 0, 'result never reached real strict validation')
        equal(editor.save().blocks, before, 'rejected document change must roll back')
        equal(editor.canUndo, false, 'rejected upload cannot create history')
        assert(!editor.rootElement.querySelector('[class*="--loading"]'), 'loading must end on failure')
        await pause(10) // report unhandled rejections, independently of rollback assertions
        reject = false
        drop()
        await until(() => spec.count(editor.save().blocks[0].data) === 1, 'retry did not apply')
        editor.undo()
        equal(editor.save().blocks, before)
        editor.redo()
        equal(spec.count(editor.save().blocks[0].data), 1)
      })
    }
    test(`${spec.type} completed remote upload cannot outlive its removed block`, async () => {
      let resolve
      let signal
      const editor = make([{ id: 'upload', type: spec.type, data: {} }], {
        plugins: [new Paragraph(), new spec.Base({ uploadFile: (_file, context) => {
          signal = context.signal
          return new Promise(done => { resolve = done })
        } })],
      })
      const dataTransfer = new DataTransfer()
      dataTransfer.items.add(new File(['sample'], spec.name, { type: spec.mime }))
      editor.rootElement.querySelector(spec.selector).dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }))
      assert(resolve, 'upload request must have started')
      editor.clear()
      const after = editor.save().blocks
      assert(signal.aborted, 'removal must cancel the request')
      resolve({ url: 'https://example.test/late' })
      await pause(20)
      equal(editor.save().blocks, after, 'late upload must not change the replacement')
    })
}
