export const extensionTaskCases=['block','inline'].flatMap(kind=>['in-place','remount'].flatMap(projection=>['other-edit','own-edit','mode','render','remove-undo','destroy-successor'].map(lifetime=>({id:[kind,projection,lifetime].join('/'),kind,projection,lifetime}))))
const copy=value=>JSON.parse(JSON.stringify(value))
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value
const same=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b))
const pause=()=>new Promise(resolve=>setTimeout(resolve,20))
function records(label='A',count=0,kind='block',other=false){return[{id:'a',type:'lease-probe',dataVersion:1,data:{label,count:kind==='block'?count:0,text:'{{ref}}'},inline:{ref:{type:'lease-inline',dataVersion:1,data:{label,count:kind==='inline'?count:0}}}},{id:'b',type:'paragraph',dataVersion:2,data:{text:other?'Other changed':'Bravo'}}]}
function definitions(spec){
 const owners={block:[],inline:[]},runtimes={block:[],inline:[]}
 const inlineSchema={currentVersion:1,createDefault:()=>({label:'Default',count:0}),decode:input=>({dataVersion:1,data:{label:input.data.label,count:input.data.count}}),encode:data=>({dataVersion:1,data:{label:data.label,count:data.count}})}
 const blockSchema={currentVersion:1,createDefault:()=>({label:'Default',count:0,text:''}),decode:input=>({dataVersion:1,data:{label:input.data.label,count:input.data.count,text:input.data.text}}),encode:data=>({dataVersion:1,data:{label:data.label,count:data.count,text:data.text}}),mapRichText:(data,visit)=>({...data,text:visit(data.text,'text')})}
 const block=Object.freeze({type:'lease-probe',icon:'',label:{key:'lease',fallback:'Lease'},schema:blockSchema,setup(){
  const runtime={serial:runtimes.block.length+1,destroyed:0};runtimes.block.push(runtime)
  return{create(initial,context){
   let data=initial;const document=context.ownerDocument,element=document.createElement('article'),field=document.createElement('p'),output=document.createElement('output');field.textContent=initial.text;output.textContent=initial.label+':'+initial.count;element.append(field,output)
   const owner={context,element,output,label:initial.label,runtime,destroyed:0};owners.block.push(owner)
   return{element,read:()=>data,...(spec.projection==='in-place'?{update(next){if(next.text!==data.text)field.textContent=next.text;data=next;output.textContent=next.label+':'+next.count}}:{}),editableFields:()=>[{key:'text',element:field,mode:'rich-text'}],setReadOnly(value){field.contentEditable=String(!value)},destroy(){owner.destroyed++}}
  },destroy(){runtime.destroyed++}}
 }})
 const inline=Object.freeze({type:'lease-inline',icon:'',label:{key:'leaseInline',fallback:'Lease inline'},schema:inlineSchema,setup(runtimeContext){
  const runtime={serial:runtimes.inline.length+1,destroyed:0};runtimes.inline.push(runtime)
  return{create(id,initial,context){
   const element=runtimeContext.ownerDocument.createElement('span');element.contentEditable='false';element.textContent=initial.label+':'+initial.count
   const owner={context,element,label:initial.label,runtime,destroyed:0};owners.inline.push(owner)
   return{element,...(spec.projection==='in-place'?{update(next){element.textContent=next.label+':'+next.count}}:{}),setReadOnly(){},destroy(){owner.destroyed++}}
  },destroy(){runtime.destroyed++}}
 }})
 return{block,inline,owners,runtimes}
}
export async function runExtensionTaskCase({sourceBase='../../',spec}){
 const base=new URL(sourceBase,import.meta.url),[core,paragraph]=await Promise.all(['core/index.js','plugins/paragraph/index.js'].map(path=>import(new URL(path,base))))
 const holders=[document.createElement('section'),document.createElement('section')];document.body.append(...holders)
 const observations=[],diagnostics=[],events=[],unsupported=[],planned=['load','transition','completion','live','other-editor','dispose'],completedPhases=[]
 const check=(phase,property,actual,expected)=>{const a=copy(actual),e=copy(expected);observations.push({phase,property,actual:a,expected:e,status:same(a,e)?'PASS':'FAIL'})}
 let phase='load',editor,other,original
 try{
  const h=definitions(spec),make=(holder,label,count)=>core.createEditor({holder,injectStyles:false,inlineTools:[],defaultBlock:'lease-probe',plugins:[h.block,paragraph.createParagraphPlugin({injectStyles:false})],inlinePlugins:[h.inline],onDiagnostic:value=>diagnostics.push(value),data:{version:'2.0.0',blocks:records(label,count,spec.kind)}})
  const observe=(value,label)=>value.on('transaction:committed',event=>events.push({editor:label,phase,sequence:event.sequence,action:event.action,origin:event.origin,name:event.name}))
  editor=make(holders[0],'A',0);observe(editor,'A');original=editor;other=make(holders[1],'B',100);observe(other,'B');await pause()
  const live=(holder,kind=spec.kind)=>h.owners[kind].findLast(owner=>owner.element.isConnected&&holder.contains(owner.element)),context=()=>live(holders[0]).context
  const old=live(holders[0]),oldTask=old.context.beginTask(),otherOwner=live(holders[1]),otherTask=otherOwner.context.beginTask();let optionReads=0,producerCalls=0,inputCounts=[],release
  const deferred=new Promise(resolve=>{release=resolve}).then(()=>oldTask.commit(current=>{producerCalls++;inputCounts.push(current.count);return{...current,count:current.count+10}},{get mergeWithPreviousField(){optionReads++;return undefined}}))
  check(phase,'canonical',editor.save().blocks,records());check(phase,'otherCanonical',other.save().blocks,records('B',100,spec.kind));check(phase,'history',[editor.canUndo,editor.canRedo,other.canUndo,other.canRedo],[false,false,false,false]);check(phase,'separateScopes',[old.context.signal!==otherOwner.context.signal,old.runtime!==otherOwner.runtime,oldTask.signal!==otherTask.signal],[true,true,true]);completedPhases.push(phase)
  phase='transition';let label='A',count=0,otherChanged=false
  if(spec.lifetime==='other-edit'){editor.blocks.update('b',()=>({data:{text:'Other changed'}}));otherChanged=true}
  else if(spec.lifetime==='own-edit'){old.context.updateData(current=>({...current,count:1}));count=1}
  else if(spec.lifetime==='mode'){editor.setReadOnly(true);editor.setReadOnly(false)}
  else if(spec.lifetime==='render')editor.render(editor.save())
  else if(spec.lifetime==='remove-undo'){editor.blocks.remove('a');editor.undo()}
  else{editor.destroy();editor=make(holders[0],'C',5);observe(editor,'C');label='C';count=5;original.destroy()}
  await pause();const accepted=spec.lifetime==='other-edit'||spec.lifetime==='own-edit'&&spec.projection==='in-place',prior=records(label,count,spec.kind,otherChanged)
  const beforeHistory=['other-edit','own-edit','render'].includes(spec.lifetime)?[true,false]:spec.lifetime==='remove-undo'?[false,true]:[false,false]
  check(phase,'canonical',editor.save().blocks,prior);check(phase,'history',[editor.canUndo,editor.canRedo],beforeHistory);check(phase,'taskAborted',oldTask.signal.aborted,!accepted);check(phase,'callbacksBeforeCompletion',[optionReads,producerCalls],[0,0]);check(phase,'otherTaskAlive',!otherTask.signal.aborted,true);check(phase,'otherCanonical',other.save().blocks,records('B',100,spec.kind));completedPhases.push(phase)
  phase='completion';release();const result=await deferred
  check(phase,'accepted',result,accepted);check(phase,'callbackCounts',[optionReads,producerCalls,inputCounts],accepted?[1,1,[count]]:[0,0,[]]);if(accepted)count+=10
  const completed=records(label,count,spec.kind,otherChanged)
  check(phase,'canonical',editor.save().blocks,completed);check(phase,'taskAborted',oldTask.signal.aborted,!accepted||spec.projection==='remount');check(phase,'otherTaskAlive',!otherTask.signal.aborted,true)
  check(phase,'repeatAccepted',oldTask.commit(()=>{producerCalls++;return{}},{get mergeWithPreviousField(){optionReads++;return undefined}}),false);check(phase,'repeatCallbackCounts',[optionReads,producerCalls],accepted?[1,1]:[0,0]);check(phase,'history',[editor.canUndo,editor.canRedo],accepted?[true,false]:beforeHistory)
  if(accepted){check(phase,'undoAvailable',editor.undo(),true);check(phase,'undoCanonical',editor.save().blocks,prior);check(phase,'undoHistory',[editor.canUndo,editor.canRedo],[true,true]);check(phase,'redoAvailable',editor.redo(),true);check(phase,'redoCanonical',editor.save().blocks,completed);check(phase,'redoHistory',[editor.canUndo,editor.canRedo],[true,false])}
  completedPhases.push(phase);phase='live'
  const fresh=context().beginTask();check(phase,'accepted',fresh.commit(current=>({...current,count:current.count+20})),true);count+=20
  const liveData=records(label,count,spec.kind,otherChanged)
  check(phase,'canonical',editor.save().blocks,liveData);const owner=live(holders[0]);check(phase,'visible',spec.kind==='block'?owner.output.textContent:owner.element.textContent,label+':'+count)
  check(phase,'undoAvailable',editor.undo(),true);check(phase,'undoCanonical',editor.save().blocks,completed);check(phase,'undoHistory',[editor.canUndo,editor.canRedo],[accepted||['own-edit','render'].includes(spec.lifetime),true]);check(phase,'redoAvailable',editor.redo(),true);check(phase,'redoCanonical',editor.save().blocks,liveData);check(phase,'redoHistory',[editor.canUndo,editor.canRedo],[true,false]);check(phase,'otherCanonical',other.save().blocks,records('B',100,spec.kind));completedPhases.push(phase)
  phase='other-editor';check(phase,'pendingAccepted',otherTask.commit(current=>({...current,count:current.count+1})),true);check(phase,'canonical',other.save().blocks,records('B',101,spec.kind));check(phase,'firstCanonical',editor.save().blocks,liveData)
  check(phase,'undoAvailable',other.undo(),true);check(phase,'undoCanonical',other.save().blocks,records('B',100,spec.kind));check(phase,'undoHistory',[other.canUndo,other.canRedo],[false,true]);check(phase,'redoAvailable',other.redo(),true);check(phase,'redoCanonical',other.save().blocks,records('B',101,spec.kind));check(phase,'redoHistory',[other.canUndo,other.canRedo],[true,false]);completedPhases.push(phase)
  phase='dispose';editor.destroy();original.destroy();check(phase,'firstRootRemoved',!holders[0].querySelector('.oe-editor'),true);check(phase,'otherRuntimeAlive',h.runtimes[spec.kind].filter(runtime=>runtime===otherOwner.runtime).map(runtime=>runtime.destroyed),[0])
  const afterRelease=live(holders[1]).context.beginTask();check(phase,'otherStillAccepted',afterRelease.commit(current=>({...current,count:current.count+1})),true);check(phase,'otherCanonical',other.save().blocks,records('B',102,spec.kind));other.destroy()
  check(phase,'rootsRemoved',holders.map(holder=>!holder.querySelector('.oe-editor')),[true,true]);check(phase,'runtimeCounts',[h.runtimes.block.length,h.runtimes.inline.length],spec.lifetime==='destroy-successor'?[3,3]:[2,2]);check(phase,'runtimesDestroyedOnce',Object.values(h.runtimes).flat().every(runtime=>runtime.destroyed===1),true);check(phase,'instancesDestroyedOnce',Object.values(h.owners).flat().every(owner=>owner.destroyed===1&&owner.context.signal.aborted&&!owner.element.isConnected),true);completedPhases.push(phase)
  return{id:spec.id,spec,observations,diagnostics,events,unsupported,planned,completedPhases,error:null}
 }catch(error){return{id:spec.id,spec,observations,diagnostics,events,unsupported,planned,completedPhases,phase,error:String(error?.stack??error)}}
 finally{editor?.destroy();other?.destroy();if(original!==editor)original?.destroy();for(const holder of holders)holder.remove()}
}
export async function runExtensionLegacyControl({sourceBase}){
 const base=new URL(sourceBase,import.meta.url),[core,paragraph]=await Promise.all(['core/index.js','plugins/paragraph/index.js'].map(path=>import(new URL(path,base))))
 const holder=document.createElement('section');document.body.append(holder);const observations=[],diagnostics=[],shapes=[],planned=['load','async-host-control','replay','dispose'],completedPhases=[]
 const unsupported=[{property:'instanceDataTaskContract',reason:'The public instance-scoped DataTask port is absent. Real deferred host render/replay remains supported; plugin-private helpers are not emulated.'}]
 const check=(phase,property,actual,expected)=>observations.push({phase,property,actual:copy(actual),expected:copy(expected),status:same(actual,expected)?'PASS':'FAIL'})
 let editor,phase='load'
 try{
  class Consumer extends paragraph.Paragraph{render(data,context){shapes.push({beginTask:typeof context.beginTask,mutate:typeof context.mutate});return super.render(data,context)}}
  const data=text=>({version:'1.0.5',blocks:[{id:'a',type:'paragraph',data:{text}}]})
  editor=core.createEditor({holder,injectStyles:false,inlineTools:[],plugins:[new Consumer()],data:data('Alpha')});await pause();check(phase,'text',editor.save().blocks[0].data.text,'Alpha');completedPhases.push(phase)
  phase='async-host-control';let release;const deferred=new Promise(resolve=>{release=resolve}).then(()=>editor.render(data('Deferred host')));release();await deferred;check(phase,'text',editor.save().blocks[0].data.text,'Deferred host');check(phase,'history',[editor.canUndo,editor.canRedo],[true,false]);completedPhases.push(phase)
  phase='replay';check(phase,'undoAvailable',editor.undo(),true);check(phase,'undoText',editor.save().blocks[0].data.text,'Alpha');check(phase,'redoAvailable',editor.redo(),true);check(phase,'redoText',editor.save().blocks[0].data.text,'Deferred host');check(phase,'declaredPortShapes',[...new Map(shapes.map(value=>[JSON.stringify(value),value])).values()],[{beginTask:'undefined',mutate:'function'}]);completedPhases.push(phase)
  phase='dispose';editor.destroy();check(phase,'rootRemoved',!holder.querySelector('.oe-editor'),true);completedPhases.push(phase)
  return{id:'legacy-public-control',observations,diagnostics,unsupported,planned,completedPhases,error:null}
 }catch(error){return{id:'legacy-public-control',observations,diagnostics,unsupported,planned,completedPhases,phase,error:String(error?.stack??error)}}finally{editor?.destroy();holder.remove()}
}
