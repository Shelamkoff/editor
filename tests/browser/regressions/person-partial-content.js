import { Person } from '../../../plugins/person/index.js'
import { test, make, equal, assert, input } from './harness.js'

const person = (values = {}) => ({ avatar: '', name: '', role: '', bio: '', links: [], ...values })
const block = values => ({ id: 'person', type: 'person', data: { persons: [person(values)] } })

export function register() {
  for (const mode of ['preserve', 'strict']) {
    for (const [field, value] of [
      ['role', 'Editor'],
      ['bio', '<b>Biography</b>'],
      ['links', [{ type: 'website', url: 'https://example.test/profile' }]],
    ]) {
      test(`Person ${mode} preserves an unnamed profile containing only ${field}`, () => {
        const plugin = new Person()
        const editor = make([block({ [field]: value })], { plugins: [plugin], validationMode: mode })
        const root = editor.blocks.getBlockById('person').contentElement
        const saved = editor.save()
        equal(saved.blocks[0].data.persons, [person({ [field]: value })])
        assert(!plugin.isEmpty(root), 'non-name fields are meaningful author content')
        editor.render(saved)
        equal(editor.save().blocks, saved.blocks)
        editor.setReadOnly(true)
        equal(editor.save().blocks, saved.blocks)
        editor.setReadOnly(false)
        equal(editor.save().blocks, saved.blocks)
      })
    }
  }

  for (const field of ['role', 'bio']) {
    test(`Person first edit in ${field} survives Undo and Redo without entering a name`, () => {
      const editor = make([block({})], { plugins: [new Person()] })
      const root = editor.blocks.getBlockById('person').contentElement
      input(root.querySelector(`.oe-person__${field}`), 'Written before the name')
      equal(editor.save().blocks[0].data.persons, [person({ [field]: 'Written before the name' })])
      editor.undo()
      equal(editor.save().blocks[0].data.persons, [])
      editor.redo()
      equal(editor.save().blocks[0].data.persons, [person({ [field]: 'Written before the name' })])
    })
  }

  test('Person deleting the name retains biography and link data', () => {
    const values = { name: 'Ada', bio: 'Biography', links: [{ type: 'website', url: 'https://example.test/' }] }
    const editor = make([block(values)], { plugins: [new Person()] })
    input(editor.blocks.getBlockById('person').contentElement.querySelector('.oe-person__name'), '')
    equal(editor.save().blocks[0].data.persons, [person({ ...values, name: '' })])
    editor.undo()
    equal(editor.save().blocks[0].data.persons, [person(values)])
  })

  test('Person first social link survives history before any name is entered', () => {
    const editor = make([block({})], { plugins: [new Person()] })
    const field = editor.blocks.getBlockById('person').contentElement.querySelector('.oe-person__link-url')
    field.value = 'https://example.test/profile'
    field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
    equal(editor.save().blocks[0].data.persons, [person({ links: [{ type: 'website', url: 'https://example.test/profile' }] })])
    editor.undo()
    equal(editor.save().blocks[0].data.persons, [])
    editor.redo()
    equal(editor.save().blocks[0].data.persons[0].links, [{ type: 'website', url: 'https://example.test/profile' }])
  })

  test('Person an entirely empty profile remains empty', () => {
    const plugin = new Person()
    const editor = make([block({})], { plugins: [plugin] })
    equal(editor.save().blocks[0].data.persons, [])
    assert(plugin.isEmpty(editor.blocks.getBlockById('person').contentElement))
  })

  test('Person additional empty tabs remain structural document state', () => {
    const editor = make([{ id: 'person', type: 'person', data: { persons: [person(), person()] } }], { plugins: [new Person()] })
    equal(editor.save().blocks[0].data.persons, [person(), person()])
  })
}
