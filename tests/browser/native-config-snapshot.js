import { createParagraphPlugin, createImagePlugin, createGalleryPlugin, createCarouselPlugin, createAttachesPlugin, createEmbedPlugin, createPersonPlugin } from '../../plugins/index.js'
import { loadBlockPluginDefinition } from '../../plugins/async.js'
import { test, make, blockElement, equal, assert, pause, run } from './regressions/harness.js'
import { clickNative, dispatchKey, printable } from './native-input-helpers.js'
import { pixel } from './plugin-parity-fixtures.js'

const sources = [
  { name: 'Image', factory: createImagePlugin, result: { url: pixel }, key: 'file' },
  { name: 'Gallery', factory: createGalleryPlugin, result: [{ url: pixel }], key: 'images' },
  { name: 'Carousel', factory: createCarouselPlugin, result: [{ type: 'image', src: pixel }], key: 'slides' },
  { name: 'Attaches', factory: createAttachesPlugin, result: [{ url: '/library.txt', name: 'Library file' }], key: 'files' },
  { name: 'Embed', factory: createEmbedPlugin, result: { url: pixel }, key: 'cover' },
]
function mount(definition, data = {}) {
  return make([{ id: 'a', type: definition.type, dataVersion: definition.schema.currentVersion, data: { ...definition.schema.createDefault(), ...data } }], { plugins: [createParagraphPlugin(), definition], injectStyles: true })
}
function button(editor, label) {
  return [...blockElement(editor, 'a').querySelectorAll('button')].find(element => element.textContent.trim() === label)
}
async function history(editor, before, after) {
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
  await dispatchKey('z', 'KeyZ', 90, 10)
  equal(editor.save().blocks, after)
}
for (const source of sources) {
  test(source.name + ' keeps its captured source action label and handler after caller mutation', async () => {
    let calls = 0
    const action = { label: 'Captured library', handler: async ({ signal }) => { calls++; assert(!signal.aborted); return source.result } }
    const definition = source.factory({ resolvePreview: false, actions: [action] })
    action.label = 'Changed library'
    action.handler = async () => { throw new Error('Changed handler executed') }
    assert(!Object.isFrozen(action), 'Factory froze caller-owned action')
    const editor = mount(definition, source.name === 'Embed' ? { service: 'youtube', videoId: 'dQw4w9WgXcQ', cover: '', caption: 'Alpha' } : {})
    await pause(120)
    const before = editor.save().blocks
    if (source.name === 'Embed') await clickNative(button(editor, 'Cover'))
    const control = button(editor, 'Captured library')
    assert(control, 'Late caller mutation replaced the captured source-action label')
    await clickNative(control)
    equal(calls, 1)
    const after = editor.save().blocks
    if (source.name === 'Image') equal(after[0].data.file.url, pixel)
    else if (source.name === 'Embed') equal(after[0].data.cover, pixel)
    else equal(after[0].data[source.key].length, 1)
    await history(editor, before, after)
  })
}
test('Person keeps its captured social rule after caller mutation during URL editing', async () => {
  const icon = '<svg xmlns="http://www.w3.org/2000/svg" data-config-captured="true" width="16" height="16"><circle cx="8" cy="8" r="4"/></svg>'
  const rule = { test: url => url.startsWith('https://library.test/'), type: 'library', icon }
  const definition = createPersonPlugin({ socialResolvers: [rule] })
  rule.test = () => false
  rule.type = 'changed'
  rule.icon = ''
  assert(!Object.isFrozen(rule), 'Factory froze caller-owned resolver')
  const editor = mount(definition, { persons: [{ id: 'first', name: 'Alpha', role: '', bio: '', avatar: '', links: [{ id: 'site', type: 'library', url: 'https://library.test/first' }] }] })
  assert(blockElement(editor, 'a').querySelector('[data-config-captured]'), 'Late caller mutation replaced the captured social icon')
  const before = editor.save().blocks
  const input = blockElement(editor, 'a').querySelector('.oe-person__link-url')
  await clickNative(input)
  await dispatchKey('End', 'End', 35)
  await printable('X')
  const after = editor.save().blocks
  equal(after[0].data.persons[0].links[0].url, 'https://library.test/firstX')
  equal(after[0].data.persons[0].links[0].type, 'library')
  assert(blockElement(editor, 'a').querySelector('[data-config-captured]'))
  await history(editor, before, after)
})


for (const source of sources) {
  test('Async ' + source.name + ' captures source action records before its dynamic import settles', async () => {
    let calls = 0
    const action = { label: 'Captured library', handler: async ({ signal }) => { calls++; assert(!signal.aborted); return source.result } }
    const pending = loadBlockPluginDefinition(source.factory().type, { resolvePreview: false, actions: [action] })
    action.label = 'Changed library'
    action.handler = async () => { throw new Error('Changed async handler executed') }
    const definition = await pending
    const editor = mount(definition, source.name === 'Embed' ? { service: 'youtube', videoId: 'dQw4w9WgXcQ', cover: '', caption: 'Alpha' } : {})
    await pause(120)
    const before = editor.save().blocks
    if (source.name === 'Embed') await clickNative(button(editor, 'Cover'))
    const control = button(editor, 'Captured library')
    assert(control, 'Async import observed a later caller-owned action record')
    await clickNative(control)
    equal(calls, 1)
    const after = editor.save().blocks
    if (source.name === 'Image') equal(after[0].data.file.url, pixel)
    else if (source.name === 'Embed') equal(after[0].data.cover, pixel)
    else equal(after[0].data[source.key].length, 1)
    await history(editor, before, after)
  })
  test(source.name + ' source action stays isolated when a definition is reused across editors', async () => {
    let reads = 0, calls = 0
    const signals = []
    const action = { label: 'Captured library', handler: async ({ signal }) => { calls++; signals.push(signal); assert(!signal.aborted); return source.result } }
    const options = {
      resolvePreview: false,
      get actions() { if (++reads > 1) throw new Error('Reused definition reread actions'); return [action] },
    }
    const definition = source.factory(options)
    equal(reads, 1)
    action.label = 'Changed library'
    action.handler = async () => { throw new Error('Changed reused handler executed') }
    const data = source.name === 'Embed' ? { service: 'youtube', videoId: 'dQw4w9WgXcQ', cover: '', caption: 'Alpha' } : {}
    const first = mount(definition, data), second = mount(definition, data)
    const secondBefore = second.save().blocks
    for (const [index, editor] of [first, second].entries()) {
      await pause(120)
      const before = editor.save().blocks
      if (source.name === 'Embed') await clickNative(button(editor, 'Cover'))
      await clickNative(button(editor, 'Captured library'))
      const after = editor.save().blocks
      equal(calls, index + 1)
      assert(JSON.stringify(after) !== JSON.stringify(before), 'Captured action did not change its own document')
      await history(editor, before, after)
      if (index === 0) {
        equal(second.save().blocks, secondBefore, 'Action changed another editor using the same definition')
        equal(second.canUndo, false, 'Action entered another editor history')
        first.destroy()
      }
    }
    assert(signals[0] !== signals[1], 'Editors shared a source operation signal')
    equal(reads, 1)
  })
}
test('Async Person captures social records before import and still resolves after caller mutation', async () => {
  const icon = '<svg xmlns="http://www.w3.org/2000/svg" data-config-captured="true" width="16" height="16"><circle cx="8" cy="8" r="4"/></svg>'
  const rule = { test: url => url.startsWith('https://library.test/'), type: 'library', icon }
  const pending = loadBlockPluginDefinition('person', { socialResolvers: [rule] })
  rule.test = () => false
  rule.type = 'changed'
  rule.icon = ''
  const definition = await pending
  const editor = mount(definition, { persons: [{ id: 'first', name: 'Alpha', role: '', bio: '', avatar: '', links: [{ id: 'site', type: 'library', url: 'https://library.test/first' }] }] })
  assert(blockElement(editor, 'a').querySelector('[data-config-captured]'), 'Async import observed the changed social record')
  const before = editor.save().blocks
  await clickNative(blockElement(editor, 'a').querySelector('.oe-person__link-url'))
  await dispatchKey('End', 'End', 35)
  await printable('X')
  const after = editor.save().blocks
  equal(after[0].data.persons[0].links[0].type, 'library')
  equal(after[0].data.persons[0].links[0].url, 'https://library.test/firstX')
  await history(editor, before, after)
})
test('Paragraph reuses its captured placeholder and retains a native range after another block update', async () => {
  let reads = 0, value = 'Captured placeholder'
  const config = { get placeholder() { if (++reads > 1) throw new Error('placeholder reread'); return value } }
  const definition = createParagraphPlugin(config)
  value = 'Changed placeholder'
  const editor = make([{ id: 'a', type: 'paragraph', dataVersion: 2, data: { text: '' } }, { id: 'b', type: 'paragraph', dataVersion: 2, data: { text: 'Untouched' } }], { plugins: [definition], injectStyles: true })
  equal(blockElement(editor, 'a').querySelector('.oe-paragraph').dataset.placeholder, 'Captured placeholder')
  editor.blocks.update('a', current => ({ data: { ...current.data, text: 'Bravo' } }))
  editor.blocks.focus('a', { fieldKey: 'text', offset: 1 })
  for (let i = 0; i < 3; i++) await dispatchKey('ArrowRight', 'ArrowRight', 39, 8)
  const field = blockElement(editor, 'a').querySelector('.oe-paragraph')
  editor.blocks.update('b', current => ({ data: { ...current.data, text: 'Updated sibling' } }))
  equal(document.activeElement, field)
  const before = editor.save().blocks
  await printable('X')
  const after = editor.save().blocks
  equal(after.map(block => block.data.text), ['BXo', 'Updated sibling'])
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
  equal(window.getSelection().toString(), 'rav')
  await dispatchKey('z', 'KeyZ', 90, 10)
  equal(editor.save().blocks, after)
  equal(reads, 1)
})
for(const asyncMode of [false,true])for(const source of sources) {
 test((asyncMode?'Async ':'')+source.name+' captures prototype action getters and preserves its method receiver',async()=>{
  const reads={label:0,handler:0}
  let action
  class LibraryAction {
   #label='Captured library'
   #calls=0
   get label(){reads.label++;return this.#label}
   get handler(){reads.handler++;return this.select}
   async select({signal}){assert(this===action,'Source handler receiver changed');this.#calls++;assert(!signal.aborted);return source.result}
   rename(){this.#label='Changed library'}
   get calls(){return this.#calls}
  }
  action=new LibraryAction()
  const config={resolvePreview:false,actions:[action]}
  const pending=asyncMode?loadBlockPluginDefinition(source.factory().type,config):source.factory(config)
  action.rename()
  LibraryAction.prototype.select=async()=>{throw new Error('Later prototype method executed')}
  const definition=await pending
  equal(reads,{label:1,handler:1},'Record fields must be captured once, including prototype accessors')
  assert(!Object.isFrozen(action))
  const editor=mount(definition,source.name==='Embed'?{service:'youtube',videoId:'dQw4w9WgXcQ',cover:'',caption:'Alpha'}:{})
  await pause(120)
  const before=editor.save().blocks
  if(source.name==='Embed')await clickNative(button(editor,'Cover'))
  const control=button(editor,'Captured library')
  assert(control,'Prototype source action disappeared')
  await clickNative(control)
  equal(action.calls,1)
  equal(reads,{label:1,handler:1})
  const after=editor.save().blocks
  if(source.name==='Image')equal(after[0].data.file.url,pixel)
  else if(source.name==='Embed')equal(after[0].data.cover,pixel)
  else equal(after[0].data[source.key].length,1)
  await history(editor,before,after)
 })
}
for(const asyncMode of [false,true]) {
 test((asyncMode?'Async ':'')+'Person captures prototype resolver getters and preserves its method receiver',async()=>{
  const reads={test:0,type:0,icon:0}
  let rule
  class SocialRule {
   #calls=0
   get test(){reads.test++;return this.match}
   get type(){reads.type++;return 'library'}
   get icon(){reads.icon++;return '<svg xmlns="http://www.w3.org/2000/svg" data-config-captured="true" width="16" height="16"><circle cx="8" cy="8" r="4"/></svg>'}
   match(url){assert(this===rule,'Resolver receiver changed');this.#calls++;return url.startsWith('https://library.test/')}
   get calls(){return this.#calls}
  }
  rule=new SocialRule()
  const pending=asyncMode?loadBlockPluginDefinition('person',{socialResolvers:[rule]}):createPersonPlugin({socialResolvers:[rule]})
  SocialRule.prototype.match=()=>false
  const definition=await pending
  equal(reads,{test:1,type:1,icon:1})
  assert(!Object.isFrozen(rule))
  const editor=mount(definition,{persons:[{id:'first',name:'Alpha',role:'',bio:'',avatar:'',links:[{id:'site',type:'library',url:'https://library.test/first'}]}]})
  assert(blockElement(editor,'a').querySelector('[data-config-captured]'),'Prototype social resolver disappeared')
  const before=editor.save().blocks
  await clickNative(blockElement(editor,'a').querySelector('.oe-person__link-url'))
  await dispatchKey('End','End',35);await printable('X')
  const after=editor.save().blocks
  equal(after[0].data.persons[0].links[0].type,'library')
  equal(after[0].data.persons[0].links[0].url,'https://library.test/firstX')
  assert(rule.calls>0)
  equal(reads,{test:1,type:1,icon:1})
  await history(editor,before,after)
 })
}
await run()
