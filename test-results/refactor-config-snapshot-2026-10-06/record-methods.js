import { createParagraphPlugin, createImagePlugin, createGalleryPlugin, createCarouselPlugin, createAttachesPlugin, createEmbedPlugin, createPersonPlugin } from '../../plugins/index.js'
import { loadBlockPluginDefinition } from '../../plugins/async.js'
import { test, make, blockElement, equal, assert, pause, run } from '../../tests/browser/regressions/harness.js'
import { clickNative, dispatchKey, printable } from '../../tests/browser/native-input-helpers.js'
import { pixel } from '../../tests/browser/plugin-parity-fixtures.js'
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
function button(editor,label) { return [...blockElement(editor,'a').querySelectorAll('button')].find(element=>element.textContent.trim()===label) }
async function history(editor,before,after) {
 await dispatchKey('z','KeyZ',90,2);equal(editor.save().blocks,before);equal(editor.canUndo,false)
 await dispatchKey('z','KeyZ',90,10);equal(editor.save().blocks,after)
}
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
