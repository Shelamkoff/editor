import { createEditorRenderer } from '../../renderer/index.js'
import { createPollRenderer, createRenderer, createDefaultRenderers } from '../../renderer/renderers/index.js'
import { createRendererAsync } from '../../renderer/renderers/async.js'
import { loadBlockPluginDefinition } from '../../plugins/async.js'
import ru from '../../locale/ru.js'
import { createPollPlugin, createParagraphPlugin, createHeadingPlugin } from '../../plugins/index.js'
import { test, make, blockElement, editorRoot, para, equal, assert, pause, run } from './regressions/harness.js'
import { clickNative, dispatchKey, printable, dragAcross } from './native-input-helpers.js'
function mount(definition, data = {}, options = {}) {
 return make([{id:'a',type:'poll',dataVersion:definition.schema.currentVersion,data:{...definition.schema.createDefault(),question:'Choose one',options:[{id:'yes',text:'Yes'},{id:'no',text:'No'}],...data}}],{plugins:[definition],defaultBlock:'poll',injectStyles:true,...options})
}
test('Poll configured with a remote source rejects a vote without pollId and preserves author history', async()=>{
 const errors=[]
 let loads=0,votes=0
 const definition=createPollPlugin({dataSource:{
  async load(){loads++;return {total:0,options:[{id:'yes',votes:0},{id:'no',votes:0}]}},
  async vote(){votes++;return {total:1,options:[{id:'yes',votes:1},{id:'no',votes:0}]}},
 },onError:error=>errors.push(error)})
 const editor=mount(definition)
 await pause(60)
 const before=editor.save().blocks
 await clickNative(blockElement(editor,'a').querySelector('.oe-poll__option-marker[data-option-id="yes"]'))
 await clickNative(blockElement(editor,'a').querySelector('.oe-poll__submit'))
 equal(editor.save().blocks,before,'Remote vote without identity became a local author-data edit')
 equal(editor.canUndo,false)
 equal([loads,votes],[0,0])
 equal(errors.length,1,'Missing remote identity was not reported')
 assert(/poll.?id/i.test(errors[0].message))
})
test('Poll reads a subscribe accessor once and applies live results without canonical edits',async()=>{
 let reads=0,subscriber,stopped=0
 const errors=[]
 const service={
  async load(){return {revision:'1',total:0,options:[{id:'yes',votes:0},{id:'no',votes:0}]}},
  async vote(){return {revision:'2',total:1,options:[{id:'yes',votes:1},{id:'no',votes:0}]}},
  get subscribe(){
   if(++reads>1)throw new Error('subscribe getter reread')
   return context=>{subscriber=context;return()=>{stopped++}}
  },
 }
 const definition=createPollPlugin({dataSource:service,onError:error=>errors.push(error)})
 const editor=mount(definition,{pollId:'remote'})
 await pause(60)
 equal(errors.length,0,'Subscription getter was evaluated again during connection')
 equal(reads,1)
 assert(subscriber,'Live subscription did not connect')
 const before=editor.save().blocks
 subscriber.onUpdate({revision:'2',total:2,options:[{id:'yes',votes:1},{id:'no',votes:1}]})
 equal([...blockElement(editor,'a').querySelectorAll('.oe-poll__pct')].map(node=>node.textContent),['50%','50%'])
 equal(editor.save().blocks,before)
 equal(editor.canUndo,false)
 editor.destroy()
 equal(stopped,1)
 assert(subscriber.signal.aborted)
 equal(reads,1)
})
test('Async Poll captures source methods before import and preserves remote vote history',async()=>{
 let loads=0,votes=0
 const errors=[]
 const source={
  async load(){loads++;return {revision:'1',total:0,options:[{id:'yes',votes:0},{id:'no',votes:0}]}},
  async vote(){votes++;return {revision:'2',total:1,options:[{id:'yes',votes:1},{id:'no',votes:0}],currentUserVote:['yes']}},
 }
 const pending=loadBlockPluginDefinition('poll',{dataSource:source,onError:error=>errors.push(error)})
 source.load=async()=>{throw new Error('Later load invoked')}
 source.vote=async()=>{throw new Error('Later vote invoked')}
 const definition=await pending
 const editor=mount(definition,{pollId:'remote'})
 await pause(60)
 equal(errors.length,0,'Async import observed later service methods')
 equal(loads,1)
 const before=editor.save().blocks
 await clickNative(blockElement(editor,'a').querySelector('.oe-poll__option-marker[data-option-id="yes"]'))
 await clickNative(blockElement(editor,'a').querySelector('.oe-poll__submit'))
 equal(votes,1)
 equal(errors.length,0)
 equal([...blockElement(editor,'a').querySelectorAll('.oe-poll__pct')].map(node=>node.textContent),['100%','0%'])
 equal(editor.save().blocks,before)
 equal(editor.canUndo,false)
})
test('Poll load failure shows the v1 error status without entering history',async()=>{
 const errors=[]
 const definition=createPollPlugin({dataSource:{
  async load(){throw new Error('Unavailable')},
  async vote(){throw new Error('Vote should not start')},
 },onError:error=>errors.push(error)})
 const editor=mount(definition,{pollId:'remote'})
 await pause(60)
 const alert=blockElement(editor,'a').querySelector('.oe-poll__status--error[role="alert"]')
 assert(alert,'Load failure is invisible in the Poll UI')
 equal(alert.textContent,'Could not load poll results')
 equal(errors.length,1)
 equal(editor.canUndo,false)
 assert(!editor.save().blocks[0].data.initialResults)
})
test('Poll live results preserve the question range and the next native edit',async()=>{
 let subscriber
 const definition=createPollPlugin({dataSource:{
  async load(){return {total:0,options:[{id:'yes',votes:0},{id:'no',votes:0}]}},
  async vote(){throw new Error('Vote should not start')},
  subscribe(context){subscriber=context},
 }})
 const editor=mount(definition,{pollId:'remote'})
 await pause(60)
 editor.blocks.focus('a',{fieldKey:'question',offset:2})
 for(let i=0;i<2;i++)await dispatchKey('ArrowRight','ArrowRight',39,8)
 equal(window.getSelection().toString(),'oo')
 const before=editor.save().blocks
 subscriber.onUpdate({total:2,options:[{id:'yes',votes:1},{id:'no',votes:1}]})
 const field=blockElement(editor,'a').querySelector('.oe-poll__question')
 equal(document.activeElement,field,'Live results removed focus from the author field')
 equal(window.getSelection().toString(),'oo','Live results discarded the native range')
 equal(editor.save().blocks,before)
 equal(editor.canUndo,false)
 await printable('X')
 const after=editor.save().blocks
 equal(after[0].data.question,'ChXse one')
 assert(!after[0].data.initialResults)
 await dispatchKey('z','KeyZ',90,2)
 equal(editor.save().blocks,before)
 equal(window.getSelection().toString(),'oo')
 await dispatchKey('z','KeyZ',90,10)
 equal(editor.save().blocks,after)
})

for(const asyncMode of [false,true])test((asyncMode?'Async ':'')+'Poll captures prototype service accessors and keeps private method state',async()=>{
 const reads={load:0,vote:0,subscribe:0},events=[]
 let source
 class Service {
  #loads=0; #votes=0; #ballots=1
  get load(){reads.load++;return this.read}
  get vote(){reads.vote++;return this.cast}
  get subscribe(){reads.subscribe++;return this.listen}
  async read(context){assert(this===source);this.#loads++;events.push(context);return {total:0,options:[{id:'yes',votes:0},{id:'no',votes:0}]}}
  async cast(context){assert(this===source);this.#votes++;events.push(context);return {total:this.#ballots,options:[{id:'yes',votes:this.#ballots},{id:'no',votes:0}],currentUserVote:['yes']}}
  listen(context){assert(this===source);events.push(context);return()=>events.push('stop')}
  setBallots(value){this.#ballots=value}
  counts(){return [this.#loads,this.#votes]}
 }
 source=new Service()
 const pending=asyncMode?loadBlockPluginDefinition('poll',{dataSource:source}):createPollPlugin({dataSource:source})
 source.setBallots(2)
 Service.prototype.read=async()=>{throw new Error('Later load dispatched')}
 Service.prototype.cast=async()=>{throw new Error('Later vote dispatched')}
 Service.prototype.listen=()=>{throw new Error('Later subscription dispatched')}
 const definition=await pending
 equal(reads,{load:1,vote:1,subscribe:1})
 assert(!Object.isFrozen(source))
 const editor=mount(definition,{pollId:'remote'})
 await pause(60)
 const before=editor.save().blocks
 await clickNative(blockElement(editor,'a').querySelector('.oe-poll__option-marker[data-option-id="yes"]'))
 await clickNative(blockElement(editor,'a').querySelector('.oe-poll__submit'))
 equal(source.counts(),[1,1])
 equal([...blockElement(editor,'a').querySelectorAll('.oe-poll__pct')].map(node=>node.textContent),['100%','0%'])
 equal(editor.save().blocks,before)
 equal(editor.canUndo,false)
 editor.destroy()
 equal(events.filter(event=>event==='stop').length,1)
 assert(events.filter(event=>event!=='stop').every(event=>event.signal.aborted))
 equal(reads,{load:1,vote:1,subscribe:1})
})
for(const [key,offset,backwards,selected,expected]of [
 ['question',2,true,'oo','ChXse one'],
 ['option:yes',1,false,'es','YX'],
 ['option:yes',1,true,'es','YX'],
]){
 test('Poll live results preserve '+key+' '+(backwards?'backward':'forward')+' selection and Undo',async()=>{
  let subscriber
  const definition=createPollPlugin({dataSource:{
   async load(){return {total:0,options:[{id:'yes',votes:0},{id:'no',votes:0}]}},
   async vote(){throw new Error('Vote should not start')},
   subscribe(context){subscriber=context},
  }})
  const editor=mount(definition,{pollId:'remote'})
  await pause(60)
  editor.blocks.focus('a',{fieldKey:key,offset:backwards?offset+2:offset})
  for(let i=0;i<2;i++)await dispatchKey(backwards?'ArrowLeft':'ArrowRight',backwards?'ArrowLeft':'ArrowRight',backwards?37:39,8)
  equal(window.getSelection().toString(),selected)
  const before=editor.save().blocks
  const anchor=window.getSelection().anchorOffset,focus=window.getSelection().focusOffset
  subscriber.onUpdate({total:2,options:[{id:'yes',votes:1},{id:'no',votes:1}]})
  equal(window.getSelection().toString(),selected)
  equal([window.getSelection().anchorOffset,window.getSelection().focusOffset],[anchor,focus])
  await printable('X')
  const after=editor.save().blocks
  equal(key==='question'?after[0].data.question:after[0].data.options[0].text,expected)
  await dispatchKey('z','KeyZ',90,2)
  equal(editor.save().blocks,before)
  equal(window.getSelection().toString(),selected)
  equal([window.getSelection().anchorOffset,window.getSelection().focusOffset],[anchor,focus])
  await dispatchKey('z','KeyZ',90,10)
  equal(editor.save().blocks,after)
 })
}
for(const backwards of [false,true])test('Poll live results retain a '+(backwards?'backward':'forward')+' cross-block conversion range',async()=>{
 let subscriber
 const definition=createPollPlugin({dataSource:{
  async load(){return {total:0,options:[{id:'yes',votes:0},{id:'no',votes:0}]}},
  async vote(){throw new Error('Vote should not start')},
  subscribe(context){subscriber=context},
 }})
 const editor=make([
  {id:'a',type:'poll',dataVersion:definition.schema.currentVersion,data:{...definition.schema.createDefault(),pollId:'remote',question:'Choose one',options:[{id:'yes',text:'Yes'},{id:'no',text:'No'}]}},
  para('b','Delta'),
 ],{plugins:[definition,createParagraphPlugin(),createHeadingPlugin()],injectStyles:true})
 await pause(60)
 const before=editor.save().blocks
 const first=blockElement(editor,'a').querySelector('.oe-poll__question'),last=blockElement(editor,'b').querySelector('.oe-paragraph')
 await dragAcross(editor,first,2,last,3,backwards)
 const range=window.getSelection(),anchor=range.anchorNode,focus=range.focusNode,anchorOffset=range.anchorOffset,focusOffset=range.focusOffset
 subscriber.onUpdate({total:2,options:[{id:'yes',votes:1},{id:'no',votes:1}]})
 equal(editor.blocks.selectedIds(),['a','b'])
 equal([window.getSelection().anchorNode,window.getSelection().focusNode,window.getSelection().anchorOffset,window.getSelection().focusOffset],[anchor,focus,anchorOffset,focusOffset])
 equal(editor.save().blocks,before)
 await clickNative(editorRoot(editor).querySelector('.oe-inline-toolbar__type-select'))
 await clickNative(editorRoot(editor).querySelector('.oe-inline-toolbar__type-dropdown [data-plugin-type="heading"]'))
 const after=editor.save().blocks
 equal(after.map(block=>block.type),['poll','heading','heading','paragraph'])
 equal(after.map(block=>block.data.question??block.data.text),['Ch','oose one<br>Yes<br>No','Del','ta'])
 await dispatchKey('z','KeyZ',90,2)
 equal(editor.save().blocks,before)
 equal(editor.canUndo,false)
 await dispatchKey('z','KeyZ',90,10)
 equal(editor.save().blocks,after)
})
test('Poll definition reuse and replacement isolate source lifetimes and late updates',async()=>{
 const reads={load:0,vote:0,subscribe:0},connections=[],loads=[]
 let stops=0
 const source={
  get load(){reads.load++;return context=>new Promise(resolve=>loads.push({context,resolve}))},
  get vote(){reads.vote++;return async()=>{throw new Error('Vote should not start')}},
  get subscribe(){reads.subscribe++;return context=>{connections.push(context);return()=>{stops++}}},
 }
 const definition=createPollPlugin({dataSource:source})
 const first=mount(definition,{pollId:'first'}),second=mount(definition,{pollId:'second'})
 let transactions=0
 first.on('transaction:committed',()=>{transactions++})
 await pause(30)
 assert(connections[0].signal!==connections[1].signal)
 first.render({version:'2.0.0',blocks:[{id:'a',type:'poll',dataVersion:definition.schema.currentVersion,data:{...definition.schema.createDefault(),pollId:'replacement',question:'Replacement',options:[{id:'yes',text:'Yes'},{id:'no',text:'No'}]}}]})
 await pause(30)
 equal(stops,1)
 assert(connections[0].signal.aborted)
 assert(!connections[1].signal.aborted&&!connections[2].signal.aborted)
 const result={total:2,options:[{id:'yes',votes:1},{id:'no',votes:1}]}
 connections[2].onUpdate(result)
 connections[1].onUpdate(result)
 const before=first.save().blocks
 connections[0].onUpdate({total:100,options:[{id:'yes',votes:100},{id:'no',votes:0}]})
 loads[0].resolve({total:100,options:[{id:'yes',votes:100},{id:'no',votes:0}]})
 await pause(30)
 equal([...blockElement(first,'a').querySelectorAll('.oe-poll__pct')].map(node=>node.textContent),['50%','50%'])
 equal(first.save().blocks,before)
 equal(first.canUndo,true,'Document replacement must remain undoable')
 equal(transactions,1,'Live results created another author transaction')
 first.destroy()
 equal(stops,2)
 assert(!connections[1].signal.aborted)
 connections[1].onUpdate({total:1,options:[{id:'yes',votes:0},{id:'no',votes:1}]})
 equal([...blockElement(second,'a').querySelectorAll('.oe-poll__pct')].map(node=>node.textContent),['0%','100%'])
 equal(second.canUndo,false)
 second.destroy()
 equal(stops,3)
 equal(reads,{load:1,vote:1,subscribe:1})
})
for(const [language,locale]of [['en',undefined],['ru',ru]])for(const errorKind of ['load','vote','subscribe']){
 test('Poll '+errorKind+' error and live recovery use '+language+' status without author history',async()=>{
  const errors=[];let subscriber
  const source={
   async load(){if(errorKind==='load')throw new Error('Unavailable');return {total:0,options:[{id:'yes',votes:0},{id:'no',votes:0}]}},
   async vote(){throw new Error('Rejected vote')},
   subscribe(context){subscriber=context},
  }
  const definition=createPollPlugin({dataSource:source,onError:error=>errors.push(error)})
  const editor=mount(definition,{pollId:'remote'},{locale})
  await pause(60)
  if(errorKind==='vote'){
   await clickNative(blockElement(editor,'a').querySelector('.oe-poll__option-marker[data-option-id="yes"]'))
   await clickNative(blockElement(editor,'a').querySelector('.oe-poll__submit'))
  }else if(errorKind==='subscribe')subscriber.onError(new Error('Disconnected'))
  const root=blockElement(editor,'a'),alert=root.querySelector('.oe-poll__status--error[role="alert"]')
  assert(alert)
  equal(alert.textContent,language==='ru'?'Не удалось загрузить результаты опроса':'Could not load poll results')
  equal(errors.length,1)
  equal(editor.canUndo,false)
  const before=editor.save().blocks
  subscriber.onUpdate({total:1,options:[{id:'yes',votes:1},{id:'no',votes:0}]})
  assert(!root.querySelector('[role="alert"]'))
  equal([...root.querySelectorAll('.oe-poll__pct')].map(node=>node.textContent),['100%','0%'])
  equal(editor.save().blocks,before)
 })
}
for(const observerKind of ['throw','reject'])test('Poll missing-id error contains an observer '+observerKind+' without author mutation',async()=>{
 let observed=0
 const definition=createPollPlugin({dataSource:{
  async load(){throw new Error('Unexpected load')},
  async vote(){throw new Error('Unexpected vote')},
 },onError(){observed++;if(observerKind==='throw')throw new Error('Observer failed');return Promise.reject(new Error('Observer failed'))}})
 const editor=mount(definition)
 const before=editor.save().blocks
 await clickNative(blockElement(editor,'a').querySelector('.oe-poll__option-marker[data-option-id="yes"]'))
 await clickNative(blockElement(editor,'a').querySelector('.oe-poll__submit'))
 await pause(30)
 equal(observed,1)
 equal(editor.save().blocks,before)
 equal(editor.canUndo,false)
 assert(blockElement(editor,'a').querySelector('[role="alert"]'))
})
test('Poll without a remote source still records one local vote and restores it with native history',async()=>{
 const definition=createPollPlugin()
 const editor=mount(definition)
 const before=editor.save().blocks
 await clickNative(blockElement(editor,'a').querySelector('.oe-poll__option-marker[data-option-id="yes"]'))
 await clickNative(blockElement(editor,'a').querySelector('.oe-poll__submit'))
 const after=editor.save().blocks
 equal(after[0].data.initialResults.total,1)
 equal(after[0].data.initialResults.currentUserVote,['yes'])
 await dispatchKey('z','KeyZ',90,2)
 equal(editor.save().blocks,before)
 equal(editor.canUndo,false)
 await dispatchKey('z','KeyZ',90,10)
 equal(editor.save().blocks,after)
})

for(const mode of ['direct','registry','preset','async'])test('Poll renderer '+mode+' captures the service once and preserves its original receiver',async()=>{
 const reads={load:0,vote:0,subscribe:0},errors=[]
 let subscriber,stops=0,loads=0,votes=0
 class Service {
  #ballots=1
  set ballots(value){this.#ballots=value}
  get load(){reads.load++;return function(){loads++;return Promise.resolve({total:this.#ballots,options:[{id:'yes',votes:this.#ballots},{id:'no',votes:0}]})}}
  get vote(){reads.vote++;return function({optionIds}){votes++;equal(optionIds,['no']);return Promise.resolve({total:2,options:[{id:'yes',votes:1},{id:'no',votes:1}],currentUserVote:['no']})}}
  get subscribe(){if(++reads.subscribe>1)throw new Error('Renderer subscribe getter reread');return function(context){assert(this.#ballots>=1);subscriber=context;return()=>{stops++}}}
 }
 const source=new Service(),config={dataSource:source,onError:error=>errors.push(error)}
 const pending=mode==='direct'?createPollRenderer('article',{},config)
  :mode==='registry'?createRenderer('poll','article',{},config)
   :mode==='preset'?createDefaultRenderers('article',{},['poll'],{poll:config}).get('poll')
    :createRendererAsync('poll','article',{},config)
 for(const method of ['load','vote','subscribe'])Object.defineProperty(Service.prototype,method,{value(){throw new Error('Later '+method+' invoked')},configurable:true})
 source.ballots=2
 const definition=await pending
 const holder=document.createElement('section');document.body.appendChild(holder)
 const renderer=createEditorRenderer({blockTypes:[],injectStyles:false})
 try{
  renderer.registerRenderer(definition)
  const doc={version:'2.0.0',blocks:[{id:'a',type:'poll',dataVersion:1,data:{question:'Choose one',pollId:'remote',type:'single',resultsMode:'always',options:[{id:'yes',text:'Yes'},{id:'no',text:'No'}]}}]}
  const before=structuredClone(doc)
  renderer.renderTo(doc,holder)
  await pause(60)
  equal(errors.length,0,'Renderer evaluated source methods after factory construction')
  equal(loads,1)
  equal([...holder.querySelectorAll('.article-poll__pct')].map(node=>node.textContent),['100%','0%'])
  await clickNative(holder.querySelectorAll('.article-poll__marker')[1])
  await clickNative(holder.querySelector('.article-poll__submit'))
  await pause(30)
  equal(votes,1)
  equal([...holder.querySelectorAll('.article-poll__pct')].map(node=>node.textContent),['50%','50%'])
  equal(doc,before)
  renderer.destroy()
  equal(stops,1)
  assert(subscriber.signal.aborted)
  equal(reads,{load:1,vote:1,subscribe:1})
  equal(errors.length,0)
 }finally{renderer.destroy();holder.remove()}
})

await run()
