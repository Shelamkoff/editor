const eventTypes=['editor:ready','currentBlock:changed','selection:changed','transaction:committed','document:changed','history:changed','readOnly:changed','editor:destroyed']
const causes=['undefined','null','false','zero','empty','nan','error']
export const publicEventsCases=eventTypes.flatMap(target=>[{id:[target,'clean'].join('/'),target,profile:'clean',cause:'none'},...['throw','reject'].flatMap(profile=>causes.map(cause=>({id:[target,profile,cause].join('/'),target,profile,cause})))])
for(const profile of ['unsubscribe-before','unsubscribe-after-first'])publicEventsCases.push({id:['document:changed',profile].join('/'),target:'document:changed',profile,cause:'none'})
const copy=value=>value===undefined?{$undefined:true}:JSON.parse(JSON.stringify(value))
const sorted=value=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,sorted(value[k])])):value
const same=(a,b)=>JSON.stringify(sorted(a))===JSON.stringify(sorted(b))
const pause=()=>new Promise(resolve=>setTimeout(resolve,25))
const allFrozen=value=>!value||typeof value!=='object'||Object.isFrozen(value)&&Object.values(value).every(allFrozen)
const causeValue=kind=>({undefined:undefined,null:null,false:false,zero:0,empty:'',nan:NaN,error:new Error('private observer failure')})[kind]
function records(legacy,changed=false){
 const p=(id,text)=>({id,type:'paragraph',...(!legacy?{dataVersion:2}:{}),data:{text}})
 const a=p('a',changed?'Beta':'Alpha')
 if(!legacy)a.tunes=JSON.parse(changed?'{"layout":{"gap":3},"textAlign":"center","__proto__":{"literal":true}}':'{"layout":{"gap":2},"__proto__":{"literal":true}}')
 return[a,p('c','Charlie')]
}
function expectedFacts(){
 const before=records(false)[0],after=records(false,true)[0],change={kind:'block.update',id:'a',before,after},facts=[['editor:ready',undefined],['currentBlock:changed',{currentId:'c'}],['selection:changed',{selectedIds:['a','c']}],['selection:changed',{selectedIds:[]}]]
 for(const[action,sequence]of [['commit',1],['undo',2],['redo',3]]){
  const origin=action==='commit'?'external':'history',history={canUndo:action!=='undo',canRedo:action==='undo'}
  const changes=[action==='undo'?{kind:'block.update',id:'a',before:after,after:before}:change]
  facts.push(['transaction:committed',{sequence,origin,action,name:'block.update',changes,history}],['document:changed',{origin,action,changes}],['history:changed',history])
 }
 facts.push(['readOnly:changed',{readOnly:true}],['history:changed',{canUndo:false,canRedo:false}],['readOnly:changed',{readOnly:false}],['history:changed',{canUndo:true,canRedo:false}],['editor:destroyed',undefined])
 return facts
}
function expectedTrace(spec){
 let hits=0;const trace=[]
 for(const[type,payload]of expectedFacts()){
  const value={type,payload:copy(payload),deepFrozen:payload===undefined?null:true,...(type.startsWith('editor:')?{readyState:type==='editor:ready'}:{})}
  trace.push({role:'first',...value})
  if(type===spec.target&&spec.profile!=='unsubscribe-before'&&(spec.profile!=='unsubscribe-after-first'||hits===0)){trace.push({role:'middle',...value});hits++}
  trace.push({role:'last',...value})
 }
 return trace
}
export async function runPublicEventsCase({sourceBase='../../',legacy=false,spec}){
 const base=new URL(sourceBase,import.meta.url),[core,paragraph]=await Promise.all(['core/index.js','plugins/paragraph/index.js'].map(path=>import(new URL(path,base))))
 const holder=document.createElement('section');document.body.append(holder)
 const observations=[],diagnostics=[],trace=[],unsupported=[],unhandled=[],completedPhases=[],planned=['load','controls','commit','undo','redo','modes','dispose']
 const check=(phase,property,actual,expected)=>{const a=copy(actual),e=copy(expected);observations.push({phase,property,actual:a,expected:e,status:same(a,e)?'PASS':'FAIL'})}
 const rejection=event=>unhandled.push({name:event.reason?.name??typeof event.reason});window.addEventListener('unhandledrejection',rejection)
 let editor,phase='load',readyHookCalls=0,faultHits=0,removedCalls=0,producerCalls=0,offMiddle=()=>{},offs=[]
 try{
  const version=legacy?'1.0.5':'2.0.0'
  editor=core.createEditor({holder,injectStyles:false,inlineTools:[],changeDebounceMs:0,plugins:[legacy?new paragraph.Paragraph():paragraph.createParagraphPlugin({injectStyles:false})],onReady:()=>{readyHookCalls++},onDiagnostic:value=>diagnostics.push(value),data:{version,blocks:records(legacy)}})
  const aliases={'editor:ready':'editor:ready','currentBlock:changed':'block:focused','selection:changed':'block:selected','document:changed':'editor:changed','history:changed':'history:changed','readOnly:changed':'readOnly:changed','editor:destroyed':'editor:destroyed'}
  if(legacy)unsupported.push({property:'currentFactGraphAndTiming',reason:'Legacy real topic names, native payloads, synchronous ready timing, diagnostics and render/replay controls execute. No current transaction graph, immutable payload, deferred ready fact or public producer API is fabricated.'})
  const on=(type,handler)=>legacy?editor.events.on(aliases[type],handler):editor.on(type,handler)
  const record=(role,type,payload)=>trace.push({role,type,payload:copy(payload),deepFrozen:payload===undefined?null:allFrozen(payload),...(type.startsWith('editor:')?{readyState:editor.isReady}:{})})
  for(const type of eventTypes){
   if(legacy&&type==='transaction:committed')continue
   offs.push(on(type,payload=>record('first',type,payload)))
   if(type===spec.target){offMiddle=on(type,payload=>{faultHits++;record('middle',type,payload);if(spec.profile==='throw')throw causeValue(spec.cause);if(spec.profile==='reject')return Promise.reject(causeValue(spec.cause))});offs.push(offMiddle)}
   offs.push(on(type,payload=>record('last',type,payload)))
   const off=on(type,()=>{removedCalls++});off();off();offs.push(off)
  }
  if(spec.profile==='unsubscribe-before'){offMiddle();offMiddle()}
  await pause();check(phase,'canonical',editor.save().blocks,records(legacy));check(phase,'ready',editor.isReady,true);check(phase,'readyHookCalls',readyHookCalls,1);check(phase,'history',[editor.canUndo,editor.canRedo],[false,false]);completedPhases.push(phase)
  phase='controls';if(legacy){editor.blocks.setCurrentIndex(1);editor.blocks.selectBlocks(['c','a']);editor.blocks.clearSelection()}else{editor.blocks.setCurrent('c');editor.blocks.select(['c','a']);editor.blocks.clearSelection()}
  await pause();check(phase,'canonical',editor.save().blocks,records(legacy));check(phase,'history',[editor.canUndo,editor.canRedo],[false,false]);completedPhases.push(phase)
  phase='commit';if(legacy)editor.render({version,blocks:records(true,true)});else editor.blocks.update('a',()=>{producerCalls++;return{data:{text:'Beta'},tunes:records(false,true)[0].tunes}})
  await pause();check(phase,'canonical',editor.save().blocks,records(legacy,true));check(phase,'history',[editor.canUndo,editor.canRedo],[true,false]);check(phase,'producerCalls',producerCalls,legacy?0:1)
  if(spec.profile==='unsubscribe-after-first'){offMiddle();offMiddle()}
  completedPhases.push(phase)
  for(const redo of [false,true]){phase=redo?'redo':'undo';check(phase,'available',redo?editor.redo():editor.undo(),true);await pause();check(phase,'canonical',editor.save().blocks,records(legacy,redo));check(phase,'history',[editor.canUndo,editor.canRedo],redo?[true,false]:[false,true]);completedPhases.push(phase)}
  phase='modes';editor.setReadOnly(true);check(phase,'readOnlyHistory',[editor.readOnly,editor.canUndo,editor.canRedo],[true,false,false]);editor.setReadOnly(false);editor.setReadOnly(false);await pause();check(phase,'editableHistory',[editor.readOnly,editor.canUndo,editor.canRedo],[false,true,false]);check(phase,'canonical',editor.save().blocks,records(legacy,true));completedPhases.push(phase)
  phase='dispose';editor.destroy();await pause();check(phase,'rootRemoved',!holder.querySelector('.oe-editor'),true);check(phase,'ready',editor.isReady,false)
  for(const off of offs){off();off()}
  check(phase,'removedCalls',removedCalls,0);check(phase,'unhandled',unhandled,[])
  if(!legacy){
   const expected=expectedTrace(spec),expectedHits=expected.filter(o=>o.role==='middle').length
   check(phase,'eventTrace',trace,expected);check(phase,'faultHits',faultHits,expectedHits)
   const wanted=['throw','reject'].includes(spec.profile)?Array.from({length:expectedHits},()=>({code:'command.failed',operation:'event:'+spec.target,errorName:spec.cause==='error'?'Error':'UnknownError'})):[]
   check(phase,'diagnostics',diagnostics.map(({code,operation,errorName})=>({code,operation,errorName})),wanted);check(phase,'diagnosticFrozen',diagnostics.map(Object.isFrozen),wanted.map(()=>true))
  }
  completedPhases.push(phase)
  return{id:spec.id,spec,observations,diagnostics,trace,unsupported,unhandled,planned,completedPhases,error:null}
 }catch(error){return{id:spec.id,spec,observations,diagnostics,trace,unsupported,unhandled,planned,completedPhases,phase,error:String(error?.stack??error)}}
 finally{window.removeEventListener('unhandledrejection',rejection);editor?.destroy();holder.remove()}
}
