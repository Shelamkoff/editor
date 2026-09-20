import { Heading } from '../../../plugins/heading/index.js'
import { Paragraph } from '../../../plugins/paragraph/index.js'
import { PluginControlsSlot } from '../../../core/inline-toolbar/PluginControlsSlot.js'
import { test, make, select, assert, equal } from './harness.js'

function setup() {
  const editor = make([
    { id: 'a', type: 'heading', data: { text: 'FIRST', level: 2 } },
    { id: 'b', type: 'heading', data: { text: 'SECOND', level: 2 } },
  ], { plugins: [new Paragraph(), new Heading()] })
  function controls(id, level = '3') {
    const field = editor.blocks.getBlockById(id).contentElement
    select(field, 0, field.textContent.length)
    document.dispatchEvent(new Event('selectionchange'))
    const item = editor.rootElement.querySelector(`.oe-inline-toolbar__level-dropdown [data-level="${level}"]`)
    assert(item, 'heading controls must be mounted')
    return item
  }
  return { editor, controls }
}

export function register() {
  test('retired heading controls cannot edit an old block while current controls preserve undo/redo', () => {
    const { editor, controls } = setup()
    const old = controls('a')
    const current = controls('b')
    assert(old !== current, 'focus switch must replace the control group')
    const before = editor.save().blocks
    old.click()
    equal(editor.save().blocks, before)
    current.click()
    equal(editor.save().blocks.map(block => block.data.level), [2, 3])
    editor.undo()
    equal(editor.save().blocks, before)
    editor.redo()
    equal(editor.save().blocks.map(block => block.data.level), [2, 3])
  })

  test('heading control callbacks retained across read-only reconstruction are inert', () => {
    const { editor, controls } = setup()
    const old = controls('a', '4')
    editor.setReadOnly(true)
    editor.setReadOnly(false)
    const before = editor.save().blocks
    old.click()
    equal(editor.save().blocks, before)
  })

  test('block controls preserve newer DOM ownership across reentrant group cleanup', () => {
    const zone = document.createElement('div')
    const divider = document.createElement('span')
    document.body.append(zone, divider)
    const block = { id: 'a', type: 'probe', contentElement: document.createElement('p') }
    let slot, calls = 0
    const groups = []
    const contexts = []
    slot = new PluginControlsSlot(zone, divider, {
      blocks: { getCurrentBlock: () => block, getBlockById: () => block },
      getInlineControls: () => (_field, context) => {
        contexts.push(context)
        const index = calls++
        const group = { elements: [document.createElement('button')], disposed: 0,
          destroy() { group.disposed++; if (index === 0) slot.refresh() } }
        groups.push(group)
        return group
      },
      events: {}, typeSelector: { update() {} }, setSuppressSelectionChange() {},
      mutations: { active: false, runForBlock(_block, operation) { return operation() }, commitExternal() {} },
    })
    try {
      slot.refresh(); slot.refresh()
      equal(groups.length, 2)
      equal(groups[0].disposed, 1)
      assert(zone.firstChild === groups[1].elements[0], 'the newer group must keep its mounted DOM')
      equal(contexts[0].mutate(() => 'stale'), undefined)
      equal(contexts[1].mutate(() => 'live'), 'live')
    } finally { slot.destroy(); zone.remove(); divider.remove() }
  })
}
