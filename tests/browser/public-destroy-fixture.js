export const publicDestroyCases=[]
for(const shape of ['known','opaque'])for(const mode of ['editable','read-only'])for(const timing of ['immediate','microtask'])publicDestroyCases.push({id:[shape,mode,timing].join('/'),shape,mode,timing})
const copy=value=>JSON.parse(JSON.stringify(value))
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b))
const pause=()=>new Promise(resolve=>setTimeout(resolve,25))
function records(spec,legacy,successor=false,changed=false){
 const p=(id,text)=>({id,type:'paragraph',...(!legacy?{dataVersion:2}:{}),data:{text}})
 const a=p('a',(changed?'Live':successor?'Successor':'Alpha')+' {{swatch}}')
 a.inline={swatch:{type:'color',...(!legacy?{dataVersion:1}:{}),data:{value:'#aBcDef'}}}
 const u={id:'u',type:'future-block',...(!legacy?{dataVersion:7}:{}),data:JSON.parse('{"text":"Opaque","rows":[{"value":7}],"__proto__":{"literal":true}}')}
 return[a,...(spec.shape==='opaque'?[u]:[]),p('c','Charlie')]
}
export async function runPublicDestroyCase({sourceBase='../../',legacy=false,spec}){
 const base=new URL(sourceBase,import.meta.url),[core,paragraph,color]=await Promise.all(['core/index.js','plugins/paragraph/index.js','inline-plugins/color.js'].map(path=>import(new URL(path,base))))
 const holder=document.createElement('section'),otherHolder=document.createElement('section');document.body.append(holder,otherHolder)
 const observations=[],diagnostics=[],unsupported=[],completedPhases=[],planned=['load','destroy','retained','live','dispose'],oldOwners=[],newOwners=[],transactions=[]
 const check=(phase,property,actual,expected)=>{const a=copy(actual),e=copy(expected);observations.push({phase,property,actual:a,expected:e,status:same(a,e)?'PASS':'FAIL'})}
 const observe=(definition,owners)=>({...definition,setup(...args){const runtime=definition.setup.apply(definition,args);return{...runtime,create(...values){const instance=runtime.create.apply(runtime,values),owner={element:instance.element,context:values.at(-1),destroyed:0};owners.push(owner);return{...instance,destroy(){owner.destroyed++;return instance.destroy.call(instance)}}}}}})
 let old,live,other,phase='load',destroyedEvents=0,oldDocumentEvents=0
 try{
  const version=legacy?'1.0.5':'2.0.0'
  const make=(target,data,owners)=>core.createEditor({holder:target,injectStyles:false,inlineTools:[],plugins:[legacy?new paragraph.Paragraph():observe(paragraph.createParagraphPlugin({injectStyles:false}),owners)],inlinePlugins:[legacy?color.createColorSwatchPlugin():observe(color.createColorSwatchPlugin(),owners)],onDiagnostic:value=>diagnostics.push(value),data:{version,blocks:copy(data)}})
  old=make(holder,records(spec,legacy),oldOwners);await pause()
  const api=old.blocks,oldRoot=holder.querySelector('.oe-editor'),oldField=holder.querySelector('.oe-paragraph')
  let oldMarkup
  const startIterator=api[Symbol.iterator](),resumeIterator=api[Symbol.iterator](),first=resumeIterator.next()
  const tasks=oldOwners.map(owner=>owner.context.beginTask())
  let oldSubscriptions=null,unsubscribe=()=>{}
  if(!legacy){old.on('editor:destroyed',()=>{destroyedEvents++});unsubscribe=old.on('document:changed',()=>{oldDocumentEvents++})}
  else{oldSubscriptions=old.events;unsupported.push({property:'currentInstanceAndEventObservations',reason:'Real legacy public terminal APIs and same-holder acquisition execute. Current instance task/disposal and event-observation ports are not fabricated.'})}
  if(spec.mode==='read-only')old.setReadOnly(true)
  check(phase,'canonical',old.save().blocks,records(spec,legacy));check(phase,'ready',old.isReady,true);check(phase,'readOnly',old.readOnly,spec.mode==='read-only');check(phase,'iteratorFirst',first.value?.id,'a')
  if(!legacy){check(phase,'ownerCount',oldOwners.length,3);check(phase,'initialTaskAbort',tasks.map(t=>t.signal.aborted),[spec.mode==='read-only',spec.mode==='read-only',spec.mode==='read-only'])}
  completedPhases.push(phase);phase='destroy';old.destroy();old.destroy();oldMarkup=oldField.innerHTML
  check(phase,'ready',old.isReady,false);check(phase,'rootRemoved',!holder.querySelector('.oe-editor')&&!oldRoot.isConnected,true)
  if(!legacy){check(phase,'destroyEvents',destroyedEvents,1);check(phase,'ownersDisposed',oldOwners.map(o=>o.destroyed),[1,1,1]);check(phase,'tasksAborted',tasks.map(t=>t.signal.aborted),[true,true,true])}
  live=make(holder,records(spec,legacy,true),newOwners)
  const otherBlocks=[{id:'a',type:'paragraph',...(!legacy?{dataVersion:2}:{}),data:{text:'Outside'}}]
  other=make(otherHolder,otherBlocks,[]);await pause()
  if(!legacy)live.on('transaction:committed',event=>transactions.push({action:event.action,origin:event.origin,name:event.name}))
  old.destroy()
  check(phase,'holderReacquired',holder.querySelectorAll('.oe-editor').length===1&&live.isReady,true);check(phase,'successorCanonical',live.save().blocks,records(spec,legacy,true));completedPhases.push(phase);phase='retained'
  const target=otherHolder.querySelector('.oe-paragraph');target.tabIndex=0;target.focus();const node=target.firstChild,sel=window.getSelection();sel.setBaseAndExtent(node,1,node,3);await pause()
  let reads=0,producers=0
  const data={get text(){reads++;return'Forbidden'}}
  const input={get type(){reads++;return'paragraph'},data}
  const output={get version(){reads++;return version},get blocks(){reads++;return records(spec,legacy)}}
  const ids={*[Symbol.iterator](){reads++;yield'a'}}
  const focusTarget={get fieldKey(){reads++;return'text'},get offset(){reads++;return 1}}
  const actions=[
   ['handle.blocks',()=>old.blocks],['handle.canUndo',()=>old.canUndo],['handle.canRedo',()=>old.canRedo],['handle.readOnly',()=>old.readOnly],
   ['handle.save',()=>old.save()],['handle.render',()=>old.render(output)],['handle.clear',()=>old.clear()],['handle.undo',()=>old.undo()],['handle.redo',()=>old.redo()],['handle.focus',()=>old.focus()],['handle.setReadOnly',()=>old.setReadOnly(false)],['handle.insertInlinePlugin',()=>old.insertInlinePlugin('color',{value:'#000000'})],
   ['events.subscribe',()=>{const off=legacy?oldSubscriptions.on('document:changed',()=>{producers++}):old.on('document:changed',()=>{producers++});if(typeof off==='function')off()}],
   ['blocks.count',()=>legacy?api.getBlockCount():api.count],['blocks.currentId',()=>legacy?api.getCurrentBlock()?.id:api.currentId],['blocks.get',()=>legacy?api.getBlockById('a'):api.get('a')],['blocks.at',()=>legacy?api.getBlockByIndex(0):api.at(0)],['blocks.list',()=>legacy?[...api]:api.list()],['blocks.indexOf',()=>legacy?api.getBlockIndex('a'):api.indexOf('a')],['blocks.selectedIds',()=>legacy?api.getSelectedBlocks():api.selectedIds()],
   ['blocks.setCurrent',()=>legacy?api.setCurrentIndex(0):api.setCurrent('a')],['blocks.select',()=>legacy?api.selectBlocks(ids):api.select(ids)],['blocks.clearSelection',()=>api.clearSelection()],['blocks.insert',()=>legacy?api.insert('paragraph',data):api.insert(input)],
   ['blocks.update',()=>api.update('a',()=>{producers++;return{data:{text:'Forbidden'}}})],['blocks.remove',()=>legacy?api.remove(0):api.remove('a')],['blocks.move',()=>legacy?api.move(0,1):api.move('a',1)],['blocks.convert',()=>legacy?api.convert(0,'paragraph',data):api.convert('a',{get type(){reads++;return'paragraph'}})],['blocks.focus',()=>api.focus('a',focusTarget)],
   ['iterator.start',()=>startIterator.next()],['iterator.resume',()=>resumeIterator.next()],
  ]
  for(const[name,action]of actions){
   if(legacy&&['blocks.update','blocks.focus'].includes(name)){unsupported.push({property:name,reason:'No equivalent retained legacy public API accepts this action; it is not fabricated.'});continue}
   if(spec.timing==='microtask')await Promise.resolve()
   reads=0;producers=0;let errorName=null
   try{action()}catch(error){errorName=error?.name??typeof error}
   check(phase,name,{errorName,reads,producers},{errorName:'Error',reads:0,producers:0})
  }
  if(!legacy){
   reads=0;producers=0
   const results=tasks.map(t=>t.commit(()=>{producers++;return{}},{get mergeWithPreviousField(){reads++;return'text'}}))
   check(phase,'tasksDenied',{results,reads,producers},{results:[false,false,false],reads:0,producers:0})
   check(phase,'contextReadsDenied',oldOwners.map(o=>{try{o.context.getData();return false}catch{return true}}),[true,true,true])
   check(phase,'ownersStillDisposed',oldOwners.map(o=>o.destroyed),[1,1,1]);check(phase,'destroyEvents',destroyedEvents,1);check(phase,'oldDocumentEvents',oldDocumentEvents,0)
  }
  let offError=null;try{unsubscribe()}catch(error){offError=error?.name??typeof error}check(phase,'unsubscribeSafe',offError,null)
  await pause();check(phase,'oldMarkupUnchanged',oldField.innerHTML,oldMarkup)
  check(phase,'successorCanonical',live.save().blocks,records(spec,legacy,true));check(phase,'successorHistory',[live.canUndo,live.canRedo],[false,false])
  check(phase,'otherCanonical',other.save().blocks,otherBlocks);check(phase,'otherHistory',[other.canUndo,other.canRedo],[false,false])
  check(phase,'foreignFocusAndRange',{active:document.activeElement===target,anchor:sel.anchorNode===node,focus:sel.focusNode===node,anchorOffset:sel.anchorOffset,focusOffset:sel.focusOffset,text:sel.toString()},{active:true,anchor:true,focus:true,anchorOffset:1,focusOffset:3,text:'ut'})
  completedPhases.push(phase);phase='live'
  if(!legacy){let calls=0;const task=newOwners.find(o=>o.element.isConnected).context.beginTask();const accepted=task.commit(current=>{calls++;return current});check(phase,'freshTask',{accepted,calls,events:transactions.length},{accepted:true,calls:1,events:0})}
  else unsupported.push({property:'currentLiveProducerApi',reason:'v1 has no public blocks.update producer. Its actual render and exact replay provide a live successor control without emulating the absent command.'})
  if(legacy)live.render({version,blocks:records(spec,true,true,true)})
  else live.blocks.update('a',()=>({data:{text:'Live {{swatch}}'}}))
  check(phase,'canonical',live.save().blocks,records(spec,legacy,true,true));check(phase,'history',[live.canUndo,live.canRedo],[true,false])
  check(phase,'undoAvailable',live.undo(),true);check(phase,'undoCanonical',live.save().blocks,records(spec,legacy,true));check(phase,'redoAvailable',live.redo(),true);check(phase,'redoCanonical',live.save().blocks,records(spec,legacy,true,true))
  if(!legacy){check(phase,'oldDocumentEvents',oldDocumentEvents,0);check(phase,'destroyEvents',destroyedEvents,1)}
  check(phase,'otherUnchanged',other.save().blocks,otherBlocks);completedPhases.push(phase);phase='dispose';old.destroy();live.destroy();other.destroy();check(phase,'rootsRemoved',!holder.querySelector('.oe-editor')&&!otherHolder.querySelector('.oe-editor'),true);completedPhases.push(phase)
  return{id:spec.id,spec,observations,diagnostics,transactions,unsupported,planned,completedPhases,error:null}
 }catch(error){return{id:spec.id,spec,observations,diagnostics,transactions,unsupported,planned,completedPhases,phase,error:String(error?.stack??error)}}
 finally{old?.destroy();live?.destroy();other?.destroy();holder.remove();otherHolder.remove()}
}
