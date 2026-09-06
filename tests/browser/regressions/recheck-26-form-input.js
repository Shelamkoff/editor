import { Paragraph, Image, Code, Raw, Embed, LinkPreview, Person } from '../../../plugins/index.js'
import { test, make, para, pause, assert, equal, key } from './harness.js'

function typeValue(field, value) {
  field.focus()
  field.value = value
  field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: 'x' }))
}
function configured(block, plugins) {
  const changes = []
  const editor = make([block], { plugins: [new Paragraph(), ...plugins], tuning: { change: { debounceMs: 0 } }, onChange: document => changes.push(document) })
  return { editor, changes }
}
async function imageForm() {
  const result = configured({ id: 'image', type: 'image', data: { file: { url: '' }, caption: '' }, revision: 'v1' }, [new Image()])
  const root = result.editor.blocks.getBlockByIndex(0).contentElement
  const url = [...root.querySelectorAll('button')].find(button => /URL/.test(button.textContent))
  assert(url, 'Image URL action exists')
  url.click()
  await pause(10)
  return { ...result, field: root.querySelector('.oe-source-editor__field') }
}

export function register() {
  test('Image URL draft keeps producer revision, canonical data and history unchanged', async () => {
    const { editor, field, changes } = await imageForm()
    const before = editor.save().blocks
    typeValue(field, 'https://example.test/draft.png')
    await pause(30)
    equal(editor.save().blocks, before)
    equal(changes, [], 'a draft is not an onChange document mutation')
    equal(editor.canUndo, false)
    equal(editor.canRedo, false)
  })

  test('submitting the Image URL draft still creates a real undoable document change', async () => {
    const { editor, field, changes } = await imageForm()
    const before = editor.save().blocks
    typeValue(field, 'https://example.test/applied.png')
    await pause(20)
    equal(changes.length, 0)
    field.closest('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await pause(30)
    equal(editor.save().blocks[0].data.file.url, 'https://example.test/applied.png')
    equal(editor.save().blocks[0].revision, undefined)
    equal(changes.length, 1)
    editor.undo()
    equal(editor.save().blocks, before)
  })

  for (const tag of ['input', 'textarea', 'select']) {
    test(`auxiliary ${tag} input does not invalidate its owning block`, async () => {
      const plugin = { type: 'form', title: 'Form', icon: '', render() {
        const root = document.createElement('div')
        root.innerHTML = `<p contenteditable="true">Authored</p><${tag}><option>Draft</option></${tag}>`
        return root
      }, save(root) { return { text: root.querySelector('p').innerHTML } } }
      const { editor, changes } = configured({ id: 'a', type: 'form', data: { text: 'Authored' }, revision: 'v1' }, [plugin])
      const before = editor.save().blocks
      typeValue(editor.blocks.getBlockByIndex(0).contentElement.querySelector(tag), 'Draft')
      await pause(20)
      equal(editor.save().blocks, before)
      equal(changes.length, 0)
      equal(editor.canUndo, false)
    })
  }

  for (const [Plugin, type, initial, value] of [
    [Code, 'code', { code: 'old', language: 'plain' }, 'new code'],
    [Raw, 'raw', { html: 'old' }, '<b>new code</b>'],
  ]) {
    test(`${type} document textarea still invalidates data and supports editor Undo`, async () => {
      const { editor, changes } = configured({ id: 'a', type, data: initial, revision: 'v1' }, [new Plugin()])
      const root = editor.blocks.getBlockByIndex(0).contentElement
      const before = editor.save().blocks
      typeValue(root.querySelector('textarea'), value)
      await pause(30)
      const data = editor.save().blocks[0]
      equal(data.data[type === 'code' ? 'code' : 'html'], value)
      equal(data.revision, undefined)
      equal(changes.length, 1)
      assert(editor.canUndo)
      editor.undo()
      equal(editor.save().blocks, before)
    })
  }

  for (const [plugin, type] of [[new Embed({ resolvePreview: false }), 'embed'], [new LinkPreview({ fetchMeta: async () => ({}) }), 'linkPreview']]) {
    test(`${type} URL history ownership does not turn draft input into a document change`, async () => {
      const { editor, changes } = configured({ id: 'a', type, data: {}, revision: 'v1' }, [plugin])
      const before = editor.save().blocks
      typeValue(editor.blocks.getBlockByIndex(0).contentElement.querySelector('input'), 'draft')
      await pause(30)
      equal(editor.save().blocks, before)
      equal(changes.length, 0)
      equal(editor.canUndo, false)
    })
  }

  test('Person link inputs remain document-backed without delegating structural keys', async () => {
    const { editor, changes } = configured({ id: 'a', type: 'person', data: { persons: [{ name: 'Name', role: '', bio: '', photo: '', links: [{ type: 'website', url: 'https://example.test/old' }] }] }, revision: 'v1' }, [new Person()])
    const before = editor.save().blocks
    const field = editor.blocks.getBlockByIndex(0).contentElement.querySelector('.oe-person__link-url')
    assert(field, 'Person URL field fixture')
    typeValue(field, 'https://example.test/new')
    await pause(30)
    equal(editor.save().blocks[0].data.persons[0].links[0].url, 'https://example.test/new')
    equal(editor.save().blocks[0].revision, undefined)
    assert(changes.length > 0)
    key(field, 'Backspace')
    equal(editor.save().blocks.length, 1)
    editor.undo()
    equal(editor.save().blocks, before)
  })
}
