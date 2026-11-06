import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readSecurityLifecycleExamples, checkSecurityLifecycleExamples } from './security-lifecycle-examples.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const documents = ['docs/guide/security-lifecycle.md', 'docs/ru/guide/security-lifecycle.md']

function published(document, kind, symbol) {
  const { examples } = readSecurityLifecycleExamples(root)
  const example = examples.find(example => example.document === document && example.kind === kind)
  assert.ok(example, `Missing ${kind} example in ${document}`)
  // These are the repository's executable published examples, never downloaded text.
  return new Function(`${example.source}\nreturn ${symbol}\n`)()
}

function deferred() {
  let resolve, reject
  const promise = new Promise((accept, refuse) => { resolve = accept; reject = refuse })
  return { promise, resolve, reject }
}

test('security lifecycle examples in EN/RU satisfy current public v2 declarations', () => {
  const result = checkSecurityLifecycleExamples(root)
  assert.deepEqual(result.errors, [])
  assert.equal(result.examples.length, 6)
})

test('LF and CRLF guides extract the same six complete examples and diagnostics', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rector-lifecycle-docs-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const results = []
  for (const ending of ['\n', '\r\n']) {
    for (const document of documents) {
      const destination = path.join(directory, document)
      fs.mkdirSync(path.dirname(destination), { recursive: true })
      fs.writeFileSync(destination, fs.readFileSync(path.join(root, document), 'utf8').replace(/\r?\n/g, ending))
    }
    results.push(readSecurityLifecycleExamples(directory))
  }
  assert.equal(results[0].examples.length, 6)
  assert.deepEqual(results[0].errors, [])
  assert.deepEqual(results[1], results[0])
  assert.deepEqual(checkSecurityLifecycleExamples(root, results[1]).errors, [])
})

test('contract checker rejects removed waitForPaste, runtime.render and destroy(element) APIs', () => {
  const invalid = [
    { kind: 'paste', source: `/** @type {import('@shelamkoff/rector/types').PasteCapability<{text: string}>} */
const textFilePaste = { accepts: () => true, resolve(input, context) { context.waitForPaste(Promise.resolve()); return null } };` },
    { kind: 'cleanup', source: `/** @returns {import('@shelamkoff/rector/types').BlockPluginDefinition<{label: string}>['setup']} */
function createLiveBlockSetup() { return () => ({ render() {}, destroy() {} }) }` },
    { kind: 'cleanup', source: `/** @returns {import('@shelamkoff/rector/types').BlockPluginDefinition<{label: string}>['setup']} */
function createLiveBlockSetup() { return () => ({ create(initial, context) { return {
element: context.ownerDocument.createElement('div'), read: () => ({ ...initial }), setReadOnly() {},
/** @param {HTMLElement} element */ destroy(element) { element.remove() }
} }, destroy() {} }) }` },
  ]
  const examples = invalid.map((example, index) => ({ ...example, document: `invalid-${index}.md`, heading: example.kind, line: 1 }))
  const result = checkSecurityLifecycleExamples(root, { examples, errors: [] })
  for (const [index] of invalid.entries()) assert.ok(result.errors.some(error => error.includes(`invalid-${index}.md`)), result.errors.join('\n'))
  assert.ok(result.errors.some(error => error.includes('waitForPaste')))
  assert.ok(result.errors.some(error => error.includes('create')))
  assert.ok(result.errors.some(error => error.includes('destroy')))
})

function contextFixture(initial) {
  let data = { ...initial }, readOnly = false
  const lifetime = new AbortController(), tasks = [], elements = []
  const ownerDocument = { createElement(tag) {
    const element = { tagName: tag.toUpperCase(), textContent: '', attrs: {}, setAttribute(name, value) { this.attrs[name] = value } }
    elements.push(element); return element
  } }
  const context = {
    ownerDocument, signal: lifetime.signal, getData: () => data, isReadOnly: () => readOnly,
    beginTask() {
      const controller = new AbortController()
      const task = { signal: controller.signal, cancelled: 0, committed: 0,
        commit(producer) {
          if (controller.signal.aborted || lifetime.signal.aborted || readOnly) return false
          data = producer(data); task.committed++; return true
        },
        cancel() { task.cancelled++; controller.abort() },
        revoke() { controller.abort() },
      }
      lifetime.signal.addEventListener('abort', () => controller.abort(), { once: true })
      tasks.push(task); return task
    },
  }
  return { context, tasks, elements, get data() { return data }, setData(next) { data = next },
    setReadOnly(value) { readOnly = value; if (value) for (const task of tasks) task.revoke() },
    retire() { lifetime.abort() } }
}

for (const document of documents) {
  test(`${document}: runtime cleanup owns each occurrence and keeps current data/read-only state`, () => {
    const createSetup = published(document, 'cleanup', 'createLiveBlockSetup')
    const watched = [], stopped = []
    const setup = createSetup((element, signal) => { watched.push({ element, signal }); return () => stopped.push(element) })
    const runtime = setup({})
    const a = contextFixture({ label: 'A' }), b = contextFixture({ label: 'B' })
    const first = runtime.create(a.data, a.context), second = runtime.create(b.data, b.context)
    assert.notEqual(first.element, second.element)
    assert.equal(first.element.textContent, 'A'); assert.equal(second.element.textContent, 'B')
    first.update({ label: 'Latest A' }, a.data)
    assert.deepEqual(first.read(), { label: 'Latest A' }); assert.equal(first.element.textContent, 'Latest A')
    const detached = first.read(); detached.label = 'caller mutation'; assert.equal(first.read().label, 'Latest A')
    first.setReadOnly(true); assert.equal(first.element.attrs['aria-readonly'], 'true')
    first.setReadOnly(false); assert.equal(first.element.attrs['aria-readonly'], 'false')
    first.destroy(); first.destroy()
    assert.equal(stopped.length, 1); assert.ok(stopped[0] === first.element)
    assert.ok(watched[0].signal === a.context.signal); assert.ok(watched[1].signal === b.context.signal)
    b.retire(); second.destroy(); runtime.destroy()
    assert.equal(stopped.length, 2); assert.ok(stopped[1] === second.element)
  })

  test(`${document}: text-file paste validates and declines unsupported inputs`, async () => {
    const paste = published(document, 'paste', 'textFilePaste')
    const controller = new AbortController()
    const input = { kind: 'file', file: { type: 'text/plain', size: 5, text: async () => 'Hello' } }
    assert.equal(paste.accepts(input), true)
    assert.deepEqual(await paste.resolve(input, { signal: controller.signal }), { kind: 'rich-text', replacement: { kind: 'text', text: 'Hello' } })
    input.file.text = async () => '<img src=x onerror="alert(1)">'
    assert.deepEqual(await paste.resolve(input, { signal: controller.signal }), {
      kind: 'rich-text', replacement: { kind: 'text', text: '<img src=x onerror="alert(1)">' },
    })
    for (const unsupported of [{ kind: 'text', text: 'Hello' }, { kind: 'file', file: { type: 'image/png', size: 5 } },
      { kind: 'file', file: { type: 'text/plain', size: 2 * 1024 * 1024 } }]) {
      assert.equal(paste.accepts(unsupported), false)
      assert.equal(await paste.resolve(unsupported, { signal: controller.signal }), null)
    }
  })

  test(`${document}: text-file paste cannot return a result after cancellation`, async () => {
    const paste = published(document, 'paste', 'textFilePaste'), controller = new AbortController(), load = deferred()
    const pending = paste.resolve({ kind: 'file', file: { type: 'text/plain', size: 4, text: () => load.promise } }, { signal: controller.signal })
    controller.abort(); load.resolve('Late')
    assert.equal(await pending, null)
    assert.equal(await paste.resolve({ kind: 'file', file: { type: 'text/plain', size: 4,
      text() { throw Error('An already cancelled paste must not start reading') },
    } }, { signal: controller.signal }), null)
  })

  test(`${document}: async update commits against fresh data and releases its task`, async () => {
    const refresh = published(document, 'task', 'refreshLabel'), h = contextFixture({ label: 'Old', note: 'Old note' }), load = deferred()
    const pending = refresh(h.context, signal => { assert.ok(signal === h.tasks[0].signal); return load.promise })
    h.setData({ label: 'Old', note: 'Concurrent note' }); load.resolve('Loaded')
    assert.equal(await pending, true)
    assert.deepEqual(h.data, { label: 'Loaded', note: 'Concurrent note' })
    assert.equal(h.tasks[0].committed, 1); assert.equal(h.tasks[0].cancelled, 1)
  })

  test(`${document}: a revoked task cannot commit late data`, async () => {
    const refresh = published(document, 'task', 'refreshLabel')
    for (const reason of ['lifetime', 'read-only-roundtrip']) {
      const h = contextFixture({ label: 'Old', note: 'Keep' }), load = deferred()
      const pending = refresh(h.context, () => load.promise)
      if (reason === 'lifetime') h.retire()
      else { h.setReadOnly(true); h.setReadOnly(false) }
      load.resolve('Late')
      assert.equal(await pending, false); assert.deepEqual(h.data, { label: 'Old', note: 'Keep' })
      assert.equal(h.tasks[0].committed, 0); assert.equal(h.tasks[0].cancelled, 1)
    }
    const readOnly = contextFixture({ label: 'Old', note: 'Keep' }); readOnly.setReadOnly(true)
    assert.equal(await refresh(readOnly.context, () => { throw Error('Read-only cannot start a loader') }), false)
    assert.equal(readOnly.tasks.length, 0)
  })

  test(`${document}: rejected loaders release their task without changing data`, async () => {
    const refresh = published(document, 'task', 'refreshLabel'), h = contextFixture({ label: 'Old', note: 'Keep' })
    await assert.rejects(refresh(h.context, async () => { throw new Error('load failed') }), /load failed/)
    assert.deepEqual(h.data, { label: 'Old', note: 'Keep' })
    assert.equal(h.tasks[0].committed, 0); assert.equal(h.tasks[0].cancelled, 1)
  })
}
