import { EditorRenderer } from '../../renderer/index.js'
import { createMentionPlugin } from '../../inline-plugins/mention/index.js'
import { createParagraphPlugin } from '../../plugins/paragraph/index.js'
import { createColumnsPlugin } from '../../plugins/columns/index.js'
import { createImagePlugin } from '../../plugins/image/index.js'
import { pixel } from './plugin-parity-fixtures.js'
import { getTextOffset } from '../../plugin-kit/index.js'
import { test, make, blockElement, editorRoot, equal, assert, pause, run } from './regressions/harness.js'
import { clickNative, dispatchKey, printable } from './native-input-helpers.js'

function editableBadgeDefinition(action,edits=[]){
 return {
  type:'editableBadge',icon:'',label:{key:'title',fallback:'Badge'},
  schema:{currentVersion:1,createDefault:()=>({name:''}),encode:data=>({dataVersion:1,data}),decode:input=>input},
  editing:{handle(input,data){
   edits.push(input)
   if(input.position!=='inside')return null
   if(action==='remove'&&input.inputType==='deleteContentBackward')return {kind:'remove'}
   if(action==='update'&&input.inputType==='insertText'&&input.offset>0&&input.offset<input.text.length)return {kind:'update',data:{name:data.name+input.data}}
   if(action==='native-delete'&&input.deletionRange){
    const {start,end}=input.deletionRange
    return {kind:'update',data:{name:data.name.slice(0,start)+data.name.slice(end)}}
   }
   return null
  }},
  setup(runtime){return {create(_id,data){
   const element=runtime.ownerDocument.createElement('span')
   element.dataset.inlinePlugin='editableBadge';element.contentEditable='true';element.textContent=data.name
   return {element,update(next){element.textContent=next.name},setReadOnly(value){element.contentEditable=value?'false':'true'},destroy(){}}
 },destroy(){}}},
 }
}

for(const formatted of [false,true])for(const action of ['remove','update'])test('Editable inline widget '+action+' retains its caret after the '+(formatted?'formatted':'plain')+' authored prefix',async()=>{
 const edits=[],definition=editableBadgeDefinition(action,edits)
 const editor=make([{id:'a',type:'paragraph',dataVersion:2,data:{text:formatted?'<b>Alpha {{badge}}</b> Omega':'Alpha {{badge}} Omega'},inline:{badge:{type:definition.type,dataVersion:1,data:{name:'Badge'}}}}],{plugins:[createParagraphPlugin()],inlinePlugins:[definition],injectStyles:true})
 const before=editor.save().blocks
 const field=blockElement(editor,'a').querySelector('.oe-paragraph'),widget=field.querySelector('[data-inline-plugin="editableBadge"]')
 field.focus();window.getSelection().setBaseAndExtent(widget.firstChild,2,widget.firstChild,2)
 if(action==='remove')await dispatchKey('Backspace','Backspace',8)
 else await printable('!')
 const changed=editor.save().blocks
 const native=window.getSelection()
 equal(getTextOffset(field,native.anchorNode,native.anchorOffset),action==='remove'?6:7,'Editing the widget moved the caret into the prefix')
 await printable('X')
 const typed=editor.save().blocks
 equal(typed[0].data.text.replace(/<[^>]+>/g,''),action==='remove'?'Alpha X Omega':'Alpha {{badge}}X Omega','Follow-up input misplaced: '+JSON.stringify({edits,widget:typed[0].inline}))
 if(formatted)assert(typed[0].data.text.startsWith('<b>Alpha '),'Widget editing discarded authored formatting')
 if(formatted&&action==='update')equal(typed[0].data.text,'<b>Alpha {{badge}}</b>X Omega','Typing outside a formatted widget inherited its formatting')
 if(action==='update')equal(typed[0].inline.badge.data.name,'Badge!')
 await dispatchKey('z','KeyZ',90,2);equal(editor.save().blocks,changed)
 await dispatchKey('z','KeyZ',90,2);equal(editor.save().blocks,before)
 equal(editor.canUndo,false)
 await dispatchKey('z','KeyZ',90,10);equal(editor.save().blocks,changed)
 await dispatchKey('z','KeyZ',90,10);equal(editor.save().blocks,typed)
})

test('Image settings input does not edit a widget retained in the document selection',async()=>{
 const image=createImagePlugin(),definition=editableBadgeDefinition('update')
 const editor=make([{id:'a',type:'image',dataVersion:image.schema.currentVersion,data:{...image.schema.createDefault(),file:{url:pixel},caption:'Alpha {{badge}} Omega'},inline:{badge:{type:definition.type,dataVersion:1,data:{name:'Badge'}}}}],{plugins:[image],inlinePlugins:[definition],injectStyles:true})
 const before=editor.save().blocks
 const shell=blockElement(editor,'a'),caption=shell.querySelector('.oe-image__caption'),widget=caption.querySelector('[data-inline-plugin="editableBadge"]')
 caption.focus();window.getSelection().setBaseAndExtent(widget.firstChild,2,widget.firstChild,2)
 await clickNative(shell.querySelector('.oe-image__dropdown > button'))
 const input=shell.querySelector('.oe-image__style-input')
 await clickNative(input)
 await dispatchKey('a','KeyA',65,2)
 await window.__testInput('Input.insertText',{text:'320px'})
 equal(input.value,'320px','An inline widget intercepted auxiliary input')
 equal(editor.save().blocks[0].inline,before[0].inline,'Settings typing changed an unrelated inline widget')
 await dispatchKey('Tab','Tab',9)
 equal(editor.save().blocks[0].data.styles.width,'320px')
})

test('Custom inline editing receives the native Unicode deletion interval as plain offsets',async()=>{
 const edits=[],definition=editableBadgeDefinition('native-delete',edits)
 const editor=make([{id:'a',type:'paragraph',dataVersion:2,data:{text:'Alpha {{badge}} Omega'},inline:{badge:{type:definition.type,dataVersion:1,data:{name:'X👍🏽'}}}}],{inlinePlugins:[definition],injectStyles:true})
 const before=editor.save().blocks,field=blockElement(editor,'a').querySelector('.oe-paragraph'),widget=field.querySelector('[data-inline-plugin="editableBadge"]')
 field.focus();window.getSelection().setBaseAndExtent(widget.firstChild,5,widget.firstChild,5)
 await dispatchKey('Backspace','Backspace',8)
 const changed=editor.save().blocks
 equal(edits[0]?.deletionRange,{start:1,end:5},'The hook received no native deletion interval')
 equal(changed[0].inline.badge.data.name,'X')
 await printable('Y')
 equal(editor.save().blocks[0].data.text,'Alpha {{badge}}Y Omega')
 await dispatchKey('z','KeyZ',90,2);equal(editor.save().blocks,changed)
 await dispatchKey('z','KeyZ',90,2);equal(editor.save().blocks,before)
})

for(const trigger of ['#','🦊','@'])test('Mention captured '+trigger+' trigger supports native choice and atomic Undo/Redo',async()=>{
 let reads=0,searches=0,selected
 const options={
  get trigger(){if(++reads>1)throw new Error('Trigger reread');return trigger},
  debounceDelay:0,
  async searchFunction(query){searches++;equal(query,'A');return [{id:42,name:'Ada'}]},
  onMentionSelect(data){selected=data},
 }
 const definition=createMentionPlugin(options)
 Object.defineProperty(options,'trigger',{value:'!'})
 const editor=make([{id:'a',type:'paragraph',dataVersion:2,data:{text:''}}],{plugins:[createParagraphPlugin()],inlinePlugins:[definition],injectStyles:true})
 const field=blockElement(editor,'a').querySelector('.oe-paragraph')
 await clickNative(field)
 await printable(trigger);await printable('A');await pause(90)
 assert(editorRoot(editor).querySelector('.oe-mention-item'),'Mention choices are missing')
 const before=editor.save().blocks
 await dispatchKey('Enter','Enter',13)
 const after=editor.save().blocks,widget=Object.values(after[0].inline??{})[0]
 equal(widget?.data,{id:'42',name:'Ada'})
 equal(selected,{id:42,name:'Ada'})
 equal(reads,1)
 assert(searches>=1)
 equal(blockElement(editor,'a').querySelector('[data-inline-plugin="mention"]').textContent,trigger+'Ada')
 await dispatchKey('z','KeyZ',90,2)
 equal(editor.save().blocks,before)
 await dispatchKey('z','KeyZ',90,10)
 equal(editor.save().blocks,after)
})
test('Mention ignores inherited trigger getters and still opens its default native query',async()=>{
 let reads=0
 const options=Object.create({get trigger(){reads++;throw new Error('Inherited trigger accessed')}})
 Object.assign(options,{debounceDelay:0,searchFunction:async()=>[{id:'ada',name:'Ada'}]})
 const editor=make([{id:'a',type:'paragraph',dataVersion:2,data:{text:''}}],{plugins:[createParagraphPlugin()],inlinePlugins:[createMentionPlugin(options)],injectStyles:true})
 await clickNative(blockElement(editor,'a').querySelector('.oe-paragraph'))
 await printable('@');await printable('A');await pause(90)
 assert(editorRoot(editor).querySelector('.oe-mention-item'))
 await dispatchKey('Enter','Enter',13)
 equal(Object.values(editor.save().blocks[0].inline)[0].data,{id:'ada',name:'Ada'})
 equal(reads,0)
})
test('Moving an inline widget between fields retires its previous tasks and preserves native editing under its new owner', async () => {
 const contexts=[]
 const definition={
  type:'badge',icon:'',label:{key:'title',fallback:'Badge'},
  schema:{currentVersion:1,createDefault:()=>({name:''}),encode:data=>({dataVersion:1,data}),decode:input=>input},
  setup(runtime){return {
   create(_id,data,context){
    contexts.push(context)
    const element=runtime.ownerDocument.createElement('span'),button=runtime.ownerDocument.createElement('button')
    element.dataset.inlinePlugin='badge';element.contentEditable='false';button.type='button';button.textContent=data.name;element.appendChild(button)
    button.addEventListener('click',()=>context.updateData(current=>({...current,name:current.name+'!'})),{signal:context.signal})
    return {element,update(next){button.textContent=next.name},setReadOnly(value){button.disabled=value},destroy(){}}
   },destroy(){},
  }},
 }
 const columns=createColumnsPlugin()
 const editor=make([{id:'a',type:'columns',dataVersion:columns.schema.currentVersion,data:{layout:'1-1',columns:[{id:'left',content:'{{w_probe}}'},{id:'right',content:'Destination'}]},inline:{w_probe:{type:'badge',dataVersion:1,data:{name:'Alpha'}}}}],{plugins:[columns],inlinePlugins:[definition],injectStyles:true})
 const original=editor.save().blocks,previous=contexts.at(-1),task=previous.beginTask()
 editor.blocks.update('a',block=>({data:{...block.data,columns:[{id:'left',content:''},{id:'right',content:'{{w_probe}}'}]}}))
 const moved=editor.save().blocks
 assert(previous.signal.aborted,'The previous field retained its inline widget lifetime')
 let producers=0
 previous.updateData(()=>{producers++;return {name:'Stale'}})
 equal(task.commit(()=>{producers++;return {name:'Late'}}),false,'A task from the previous field redirected its result to the new owner')
 equal(producers,0);equal(editor.save().blocks,moved)
 const current=contexts.find(context=>!context.signal.aborted&&context.fieldKey==='column:right')
 assert(current,'The moved widget has no live context for its destination field')
 const field=blockElement(editor,'a').querySelector('[data-column-id="right"]')
 await clickNative(field.querySelector('button'))
 const after=editor.save().blocks
 equal(after[0].inline.w_probe.data,{name:'Alpha!'})
 equal(field.querySelector('button').textContent,'Alpha!')
 editor.blocks.focus('a',{fieldKey:'column:right',offset:1})
 await dispatchKey('z','KeyZ',90,2);equal(editor.save().blocks,moved)
 await dispatchKey('z','KeyZ',90,2);equal(editor.save().blocks,original)
 await dispatchKey('z','KeyZ',90,10);equal(editor.save().blocks,moved)
 await dispatchKey('z','KeyZ',90,10);equal(editor.save().blocks,after)
})

function mountRenderer(renderer,operation,documentData){
 const holder=document.createElement('section');document.body.appendChild(holder)
 try{
  if(operation==='renderBlock')holder.appendChild(renderer.renderBlock(documentData.blocks[0]))
  else if(operation==='render')holder.appendChild(renderer.render(documentData))
  else renderer.renderTo(documentData,holder)
  return holder
 }catch(error){holder.remove();throw error}
}
const doc=(text='Alpha',dataVersion=1)=>({version:'2.0.0',blocks:[{id:'a',type:'article',dataVersion,data:{text}}]})
const invoke=(renderer,operation,data,holder)=>operation==='renderBlock'?renderer.renderBlock(data.blocks[0])
 :operation==='render'?renderer.render(data):renderer.renderTo(data,holder)
function simpleSchema(decode){return {currentVersion:1,createDefault:()=>({}),encode:data=>({dataVersion:1,data}),decode}}

for(const operation of ['renderBlock','render','renderTo'])test('Renderer '+operation+' uses captured schema methods with their original private receiver',async()=>{
 const reads={currentVersion:0,createDefault:0,decode:0,encode:0}
 class Schema {
  #calls=0
  get currentVersion(){if(++reads.currentVersion>1)throw new Error('Schema version reread');return 1}
  get createDefault(){reads.createDefault++;return function(){return {text:''}}}
  get encode(){reads.encode++;return function(data){return {dataVersion:1,data}}}
  get decode(){reads.decode++;return function({data}){this.#calls++;return {dataVersion:1,data:{...data,text:data.text+' '+this.#calls}}}}
 }
 const schema=new Schema(),renderer=new EditorRenderer({blockTypes:[],injectStyles:false})
 let clicks=0,disposed=0
 renderer.registerRenderer({type:'article',schema,render(block,_parseInline,{ownerDocument}){
  const button=ownerDocument.createElement('button');button.textContent=block.data.text
  button.addEventListener('click',()=>{clicks++;button.dataset.clicked='yes'})
  return button
 },destroy(){disposed++}})
 for(const key of Object.keys(reads))Object.defineProperty(schema,key,{value:key==='currentVersion'?99:()=>{throw new Error('Later '+key+' used')},configurable:true})
 const data=doc(),before=structuredClone(data)
 let holder
 try{
  holder=mountRenderer(renderer,operation,data)
  const button=holder.querySelector('button')
  equal(button.textContent,'Alpha 1')
  await clickNative(button)
  equal([clicks,button.dataset.clicked],[1,'yes'])
  equal(data,before)
  equal(reads,{currentVersion:1,createDefault:1,decode:1,encode:1})
  assert(!Object.isFrozen(schema))
 }finally{renderer.destroy();holder?.remove()}
 equal(disposed,1)
})
for(const operation of ['renderBlock','render','renderTo'])test('Inline renderer '+operation+' captures schema and styles before later caller mutations',async()=>{
 const reads={version:0,default:0,encode:0,decode:0,styles:0}
 class Schema {
  #version=1
  get currentVersion(){if(++reads.version>1)throw new Error('Inline version reread');return this.#version}
  get createDefault(){reads.default++;return function(){return {name:'Ada'}}}
  get encode(){reads.encode++;return function(data){return {dataVersion:this.#version,data}}}
  get decode(){reads.decode++;return function({data}){return {dataVersion:this.#version,data}}}
 }
 const schema=new Schema(),styles=[new URL('../../inline-plugins/mention/styles.css',import.meta.url).href]
 let clicks=0
 const definition={type:'badge',schema,render(id,data,{ownerDocument}){
  const root=ownerDocument.createElement('span'),button=ownerDocument.createElement('button')
  button.textContent=data.name;button.addEventListener('click',()=>{clicks++})
  root.appendChild(button);return root
 },get styles(){if(++reads.styles>1)throw new Error('Inline styles reread');return styles}}
 Object.defineProperty(definition.render,'bind',{get(){throw new Error('Inline callback bind must not be read')}})
 const renderer=new EditorRenderer({blockTypes:['paragraph'],injectStyles:false,inlineRenderers:[definition]})
 for(const key of ['currentVersion','createDefault','decode','encode'])Object.defineProperty(schema,key,{value:key==='currentVersion'?99:()=>{throw new Error('Later inline method used')},configurable:true})
 styles[0]='https://example.test/later.css'
 const data={version:'2.0.0',blocks:[{id:'a',type:'paragraph',dataVersion:2,data:{text:'Before {{w_probe}} After'},inline:{w_probe:{type:'badge',dataVersion:1,data:{name:'Ada'}}}}]},before=structuredClone(data)
 let holder
 try{
  holder=mountRenderer(renderer,operation,data)
  const widget=holder.querySelector('[data-inline-plugin="badge"]')
  assert(widget);equal(widget.getAttribute('contenteditable'),'false')
  await clickNative(widget.querySelector('button'))
  equal(clicks,1)
  equal(data,before)
  equal(reads,{version:1,default:1,encode:1,decode:1,styles:1})
  assert(!renderer.getStyleUrls().includes('https://example.test/later.css'))
  assert(!Object.isFrozen(schema)&&!Object.isFrozen(styles))
 }finally{renderer.destroy();holder?.remove()}
})
for(const operation of ['renderBlock','render','renderTo'])for(const kind of ['input-version','output-version'])test('Renderer '+operation+' rejects '+kind+' drift and keeps its live prior result',async()=>{
 let outputVersion=1,created=0,clicks=0,disposed=0
 const renderer=new EditorRenderer({blockTypes:[],injectStyles:false})
 renderer.registerRenderer({type:'article',schema:simpleSchema(({data})=>({dataVersion:outputVersion,data})),render(block,_parseInline,{ownerDocument}){
  created++;const button=ownerDocument.createElement('button');button.textContent=block.data.text
  button.addEventListener('click',()=>{clicks++});return button
 },destroy(){disposed++}})
 let holder
 try{
  holder=mountRenderer(renderer,operation,doc())
  const original=holder.querySelector('button')
  if(kind==='output-version')outputVersion=2
  const candidate=doc('Beta',kind==='input-version'?2:1),before=structuredClone(candidate)
  let error;try{invoke(renderer,operation,candidate,holder)}catch(caught){error=caught}
  assert(error&&/current schema/.test(error.message),'Mismatched custom schema version was projected')
  equal(created,1);equal(disposed,0)
  equal(holder.querySelector('button'),original)
  equal(original.textContent,'Alpha')
  await clickNative(original);equal(clicks,1)
  equal(candidate,before)
 }finally{renderer.destroy();holder?.remove()}
 equal(disposed,1)
})
for(const kind of ['block','inline'])for(const backwards of [false,true])test('Failed '+kind+' schema update preserves native '+(backwards?'backward':'forward')+' focus and selection',async()=>{
 let bad=false,disposed=0
 const inlineSchema=simpleSchema(({data})=>({dataVersion:bad&&kind==='inline'?2:1,data}))
 inlineSchema.createDefault=()=>({name:'Ada'})
 const inline={type:'badge',schema:inlineSchema,render(_id,data,{ownerDocument}){const el=ownerDocument.createElement('span');el.textContent=data.name;return el}}
 const renderer=new EditorRenderer({blockTypes:[],injectStyles:false,inlineRenderers:[inline]})
 renderer.registerRenderer({type:'article',schema:simpleSchema(({data})=>({dataVersion:bad&&kind==='block'?2:1,data})),render(block,parseInline,{ownerDocument}){
  const root=ownerDocument.createElement('div'),input=ownerDocument.createElement('input')
  input.value=block.data.text
  const content=parseInline('{{w_probe}}')
  root.append(input,content);return root
 },destroy(){disposed++}})
 const data=doc();data.blocks[0].inline={w_probe:{type:'badge',dataVersion:1,data:{name:'Ada'}}}
 let holder
 try{
  holder=mountRenderer(renderer,'renderTo',data)
  const input=holder.querySelector('input')
  await clickNative(input);await dispatchKey('Home','Home',36)
  for(let i=0;i<(backwards?4:2);i++)await dispatchKey('ArrowRight','ArrowRight',39)
  for(let i=0;i<2;i++)await dispatchKey(backwards?'ArrowLeft':'ArrowRight',backwards?'ArrowLeft':'ArrowRight',backwards?37:39,8)
  equal([input.selectionStart,input.selectionEnd,input.selectionDirection],[2,4,backwards?'backward':'forward'])
  bad=true
  const candidate=structuredClone(data);candidate.blocks[0].data.text='Beta'
  let error;try{renderer.renderTo(candidate,holder)}catch(caught){error=caught}
  assert(error&&/currentVersion|current schema/.test(error.message),'Failed schema update was accepted')
  equal(holder.querySelector('input'),input)
  equal(document.activeElement,input)
  equal([input.selectionStart,input.selectionEnd,input.selectionDirection],[2,4,backwards?'backward':'forward'])
  equal(disposed,0)
  await printable('X');equal(input.value,'AlXa')
 }finally{renderer.destroy();holder?.remove()}
 equal(disposed,1)
})
test('Failed aggregate rendering disposes a staged valid result while preserving the prior focused result',async()=>{
 let disposed=0,created=0
 const renderer=new EditorRenderer({blockTypes:[],injectStyles:false})
 renderer.registerRenderer({type:'article',schema:simpleSchema(({data})=>({dataVersion:data.text==='Bad'?2:1,data})),render(block,_parseInline,{ownerDocument}){
  created++;const input=ownerDocument.createElement('input');input.value=block.data.text;return input
 },destroy(){disposed++}})
 let holder
 try{
  holder=mountRenderer(renderer,'renderTo',doc())
  const original=holder.querySelector('input')
  await clickNative(original);await dispatchKey('Home','Home',36);await dispatchKey('ArrowRight','ArrowRight',39)
  const candidate={version:'2.0.0',blocks:[{id:'b',type:'article',dataVersion:1,data:{text:'Good'}},{id:'c',type:'article',dataVersion:1,data:{text:'Bad'}}]}
  let error;try{renderer.renderTo(candidate,holder)}catch(caught){error=caught}
  assert(error&&/current schema/.test(error.message))
  equal([created,disposed],[2,1])
  equal(holder.querySelector('input'),original);equal(document.activeElement,original)
  equal(original.selectionStart,1)
  await printable('X');equal(original.value,'AXlpha')
 }finally{renderer.destroy();holder?.remove()}
 equal(disposed,2)
})
for (const observerKind of ['throw', 'reject']) test('Mention contains a ' + observerKind + ' selection observer and preserves native Enter history', async () => {
  let observed = 0, observedPayload
  const definition = createMentionPlugin({
    debounceDelay: 0,
    searchFunction: async () => [{ id: 42, name: 'Ada' }],
    onMentionSelect(data) {
      observed++; observedPayload = data
      if (observerKind === 'throw') throw new Error('Consumer mention observer failed')
      return Promise.reject(new Error('Consumer mention observer failed'))
    },
  })
  const editor = make([{ id: 'a', type: 'paragraph', dataVersion: 2, data: { text: '' } }], { inlinePlugins: [definition], injectStyles: true })
  await clickNative(blockElement(editor, 'a').querySelector('.oe-paragraph'))
  await printable('@'); await printable('A'); await pause(90)
  assert(editorRoot(editor).querySelector('.oe-mention-item'), 'Mention choices did not open')
  const before = editor.save().blocks
  await dispatchKey('Enter', 'Enter', 13); await pause()
  const after = editor.save().blocks
  equal(observed, 1)
  equal(observedPayload, { id: 42, name: 'Ada' })
  equal(after.length, 1)
  equal(Object.values(after[0].inline ?? {})[0]?.data, { id: '42', name: 'Ada' })
  assert(!editorRoot(editor).querySelector('.oe-ip-popup'), 'Committed mention kept its popup')
  await dispatchKey('z', 'KeyZ', 90, 2); equal(editor.save().blocks, before)
  await dispatchKey('z', 'KeyZ', 90, 10); equal(editor.save().blocks, after)
})

await run()
