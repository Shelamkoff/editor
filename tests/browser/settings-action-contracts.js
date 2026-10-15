import { createEditor } from '../../core/index.js'
import { createParagraphPlugin, createHeadingPlugin } from '../../plugins/index.js'
import headingEn from '../../plugins/heading/locale/en.js'
import headingRu from '../../plugins/heading/locale/ru.js'

const pause = () => new Promise(resolve => setTimeout(resolve, 0))
const label = (key, fallback = key) => ({ key, fallback })
function assert(value, message) { if (!value) throw new Error(message) }
function equal(actual, expected, message) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${message}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`)
}

async function mount(actions, { apply, definition, locale } = {}) {
  const holder = document.createElement('section')
  document.querySelector('#sandbox').append(holder)
  const diagnostics = []
  const calls = []
  const base = createParagraphPlugin({ injectStyles: false })
  const capability = {
    kind: 'actions',
    label: label('choices', 'Action choices'),
    actions,
    apply: apply ?? function (data, id) {
      assert(this === capability, 'Settings apply lost its receiver')
      calls.push(id)
      return { ...data, text: `${data.text}|${id}` }
    },
  }
  const plugin = definition ?? { ...base, capabilities: { ...base.capabilities, inlineControls: capability, settings: capability } }
  let editor
  try {
    editor = createEditor({ holder, plugins: [plugin], injectStyles: false, inlineTools: [], locale,
      data: { version: '2.0.0', blocks: [{ id: 'a', type: plugin.type, dataVersion: plugin.schema.currentVersion,
        data: { ...plugin.schema.createDefault(), text: 'Alpha', ...(plugin.type === 'heading' ? { level: 3 } : {}) } }] },
      onDiagnostic: value => diagnostics.push(value),
    })
    await pause()
  } catch (error) { holder.remove(); throw error }
  const root = holder.querySelector('.oe-editor')
  const field = () => holder.querySelector('[data-block-id="a"] [contenteditable="true"]')
  const select = async () => {
    const editable = field()
    assert(editable?.firstChild, 'Fixture field is unavailable')
    editable.focus()
    const selection = getSelection()
    const range = document.createRange()
    range.setStart(editable.firstChild, 0)
    range.setEnd(editable.firstChild, 3)
    selection.removeAllRanges()
    selection.addRange(range)
    document.dispatchEvent(new Event('selectionchange'))
    await pause()
  }
  const openInline = () => {
    const trigger = root.querySelector('.oe-inline-toolbar__level-select')
    assert(trigger && !trigger.hidden && !trigger.disabled, 'Inline action group is unavailable')
    trigger.click()
    return root.querySelector('.oe-inline-toolbar__level-dropdown')
  }
  const openSettings = () => {
    field().focus()
    const button = root.querySelector('.oe-toolbar__drag')
    assert(button, 'Block settings button is missing')
    button.click()
    return root.querySelector('.oe-settings-menu')
  }
  const action = (menu, id) => [...menu.querySelectorAll('[data-action-id]')].find(node => node.dataset.actionId === id)
  const destroy = () => { editor.destroy(); holder.remove() }
  return { editor, root, select, openInline, openSettings, action, capability, diagnostics, calls, destroy }
}

/** Real-editor regressions run by the registered action-label-security page. */
export async function runSettingsActionContracts() {
  let passed = 0
  const verify = async (actions, test, options) => {
    const fixture = await mount(actions, options)
    try { await test(fixture); passed++ } finally { fixture.destroy() }
  }
  await verify(() => [
    { id: 'layout:wide', label: label('wide', 'Use wide layout'), compactLabel: label('wideShort', 'Wide'), active: true },
    { id: 'h2', label: label('custom', 'Not a Heading'), active: false },
    { id: 'disabled', label: label('disabled', 'Unavailable'), disabled: true },
  ], async f => {
    await f.select()
    equal(f.root.querySelector('.oe-inline-toolbar__level-label').textContent, 'Wide', 'Compact metadata was not used')
    const menu = f.openInline()
    equal(f.action(menu, 'layout:wide').textContent, 'Use wide layout', 'Dropdown must use full label')
    equal(f.action(menu, 'h2').textContent, 'Not a Heading', 'Action ID was interpreted by core')
    assert(!menu.querySelector('[data-level]'), 'Heading-specific DOM identifier returned')
    equal(f.action(menu, 'layout:wide').getAttribute('aria-checked'), 'true', 'Active radio state missing')
    f.action(menu, 'disabled').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    equal(f.calls, [], 'Disabled action ran')
    f.action(menu, 'h2').click()
    equal(f.editor.save().blocks[0].data.text, 'Alpha|h2', 'Action did not receive current data')
    equal(f.calls, ['h2'], 'Wrong action ID dispatched')
    assert(f.editor.undo(), 'Action is not undoable')
    equal(f.editor.save().blocks[0].data.text, 'Alpha', 'Undo lost author data')
    equal(f.editor.canUndo, false, 'One action created multiple history entries')
  })

  await verify(() => [{ id: 'h2', label: label('literal', '<img src=x onerror=alert(1)>Custom'), active: true }], async f => {
    await f.select()
    const trigger = f.root.querySelector('.oe-inline-toolbar__level-label')
    equal(trigger.textContent, '<img src=x onerror=alert(1)>Custom', 'Missing compact label must use full label')
    assert(!trigger.querySelector('img'), 'Trigger interpreted text as markup')
    const menu = f.openInline()
    assert(!menu.querySelector('img'), 'Menu interpreted action text as markup')
    equal(f.action(menu, 'h2').textContent, trigger.textContent, 'Full label changed between views')
  })

  let invalid = false
  await verify(() => [
    { id: 'good', label: label('good', 'Good action') },
    ...(invalid ? [{ id: 'late', label: label('late'), compactLabel: { key: '', fallback: 'Broken' } }] : []),
  ], async f => {
    await f.select()
    const previous = f.action(f.openInline(), 'good')
    invalid = true
    await f.select()
    const trigger = f.root.querySelector('.oe-inline-toolbar__level-select')
    assert(trigger.hidden && trigger.disabled, 'Malformed metadata left the group enabled')
    equal(f.root.querySelectorAll('.oe-inline-toolbar__level-dropdown [data-action-id]').length, 0, 'Partial action group was published')
    previous.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    equal(f.calls, [], 'Retired inline callback was still active')
    const menu = f.openSettings()
    equal(menu.querySelectorAll('[data-action-id]').length, 0, 'Block settings published a partial group')
    const labels = [...menu.querySelectorAll('.oe-settings-menu__label')].map(node => node.textContent)
    assert(labels.includes('Duplicate') && labels.includes('Delete'), 'Invalid extension metadata hid core block actions')
    await pause()
    assert(f.diagnostics.some(value => value.code === 'command.failed'), 'Invalid metadata was not reported')
    equal(f.editor.save().blocks[0].data.text, 'Alpha', 'Metadata failure changed author data')
    equal(f.editor.canUndo, false, 'Metadata failure changed history')
  })

  let owner = null
  let producers = 0
  await verify(() => [{ id: 'reentry', label: label('reentry'), get compactLabel() {
    owner.blocks.update('a', () => { producers++; return { data: { text: 'Incorrect' } } })
    return label('short')
  } }], async f => {
    owner = f.editor
    await f.select()
    assert(f.root.querySelector('.oe-inline-toolbar__level-select').hidden, 'Reentrant metadata remained actionable')
    f.openSettings()
    equal(producers, 0, 'Preparation invoked a nested document producer')
    equal(f.editor.save().blocks[0].data.text, 'Alpha', 'Reentry changed author data')
    equal(f.editor.canUndo, false, 'Reentry created history')
  })

  await verify(() => [{ id: 'wide', label: label('wide', 'Wide full label'), compactLabel: label('short', 'W'), active: true }], async f => {
    await f.select()
    const menu = f.openSettings()
    const item = f.action(menu, 'wide')
    equal(item.textContent, 'Wide full label', 'Block settings incorrectly used compactLabel')
    equal(item.getAttribute('role'), 'menuitemradio', 'Block action lost radio semantics')
    f.editor.blocks.update('a', () => ({ data: { text: 'External author change' } }))
    item.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    equal(f.calls, [], 'Old settings callback adopted an external revision')
    equal(f.editor.save().blocks[0].data.text, 'External author change', 'Stale action replaced current data')
  })

  for (const locale of [headingEn, headingRu]) {
    await verify(() => [], async f => {
      await f.select()
      equal(f.root.querySelector('.oe-inline-toolbar__level-label').textContent, 'H3', 'Heading compact label missing')
      const menu = f.openInline()
      equal(f.action(menu, 'h3').textContent, locale['plugin.heading.h3'], 'Heading menu lost localized full label')
      f.action(menu, 'h4').click()
      equal(f.editor.save().blocks[0].data, { text: 'Alpha', level: 4 }, 'Heading action changed unrelated author data')
      assert(f.editor.undo(), 'Heading inline action is not undoable')
      equal(f.editor.save().blocks[0].data, { text: 'Alpha', level: 3 }, 'Heading Undo did not restore the source')
      equal(f.editor.canUndo, false, 'Heading action split into multiple history entries')
    }, { definition: createHeadingPlugin({ injectStyles: false }), locale })
  }
  return { passed, contract: 'declarative settings actions and inline controls' }
}
