export const publicReadOnlyCases=['paragraph','toggle-closed','toggle-open','spoiler'].flatMap(reader=>[false,true].flatMap(initial=>['empty','undo','redo'].map(history=>({id:[reader,initial?'initial-reader':'initial-editor',history].join('/'),reader,initial,history}))))
const copy=value=>JSON.parse(JSON.stringify(value))
const sorted=value=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value
const same=(a,b)=>JSON.stringify(sorted(a))===JSON.stringify(sorted(b))
const pause=(ms=35)=>new Promise(resolve=>setTimeout(resolve,ms))
function records(spec,legacy,changed=false,authored=false){
 const paragraph={id:'a',type:'paragraph',...(!legacy?{dataVersion:2}:{}),data:{text:(changed?'Beta':'Alpha')+(authored?'Y':'')}}
 const extra=spec.reader==='paragraph'?[]:[{id:'r',type:spec.reader==='spoiler'?'spoiler':'toggle',...(!legacy?{dataVersion:1}:{}),data:spec.reader==='spoiler'?{label:'Reader label',content:'Hidden content'}:{title:'Reader title',content:'Hidden content',open:spec.reader==='toggle-open'}}]
 return[paragraph,...extra]
}
export async function runPublicReadOnlyCase({sourceBase='../../',legacy=false,spec,nativeInput}){
 const base=new URL(sourceBase,import.meta.url),[core,paragraph,toggle,spoiler]=await Promise.all(['core/index.js','plugins/paragraph/index.js','plugins/toggle/index.js','plugins/spoiler/index.js'].map(path=>import(new URL(path,base))))
 const holder=document.createElement('section');holder.style.cssText='width:700px;margin:80px auto';document.body.append(holder)
 const observations=[],diagnostics=[],events=[],nativeEvents=[],unsupported=[],completedPhases=[],planned=['load','seed','read-only','denied','reader','editable','replay','author','dispose']
 const check=(phase,property,actual,expected)=>{const a=copy(actual),e=copy(expected);observations.push({phase,property,actual:a,expected:e,status:same(a,e)?'PASS':'FAIL'})}
 let editor,phase='load',offs=[]
 const capture=event=>{if(holder.contains(event.target))nativeEvents.push({phase,type:event.type,key:event.key??null,trusted:event.isTrusted})}
 for(const type of ['keydown','click','input'])document.addEventListener(type,capture,true)
 try{
  const version=legacy?'1.0.5':'2.0.0'
  editor=core.createEditor({holder,readOnly:spec.initial,injectStyles:true,inlineTools:[],changeDebounceMs:0,plugins:legacy?[new paragraph.Paragraph(),new toggle.Toggle(),new spoiler.Spoiler()]:[paragraph.createParagraphPlugin(),toggle.createTogglePlugin(),spoiler.createSpoilerPlugin()],onDiagnostic:value=>diagnostics.push(value),data:{version,blocks:records(spec,legacy)}})
  const on=(type,fn)=>legacy?editor.events.on(type,fn):editor.on(type,fn)
  for(const type of ['readOnly:changed','history:changed','document:changed','transaction:committed']){
   if(legacy&&['document:changed','transaction:committed'].includes(type))continue
   offs.push(on(type,event=>events.push({type,payload:copy(event)})))
  }
  if(legacy)unsupported.push({property:'typedDocumentFacts',reason:'Legacy real readOnly/history events and render/undo/redo execute. The current typed transaction/document fact ports are absent and are not fabricated.'})
  await pause(150)
  const root=()=>holder.querySelector('.oe-editor'),field=()=>root().querySelector('.oe-paragraph'),history=()=>[editor.canUndo,editor.canRedo]
  const fields=()=>[...root().querySelectorAll('.oe-paragraph,.oe-toggle__title,.oe-toggle__body,.oe-spoiler__label,.oe-spoiler__content')].map(node=>node.contentEditable)
  check(phase,'canonical',editor.save().blocks,records(spec,legacy));check(phase,'readOnly',editor.readOnly,spec.initial);check(phase,'history',history(),[false,false]);check(phase,'fields',fields(),Array(spec.reader==='paragraph'?1:3).fill(spec.initial?'false':'true'));completedPhases.push(phase)
  phase='seed';editor.setReadOnly(false);editor.setReadOnly(false)
  if(spec.history!=='empty')editor.render({version,blocks:records(spec,legacy,true)})
  if(spec.history==='redo')editor.undo()
  await pause();const changed=spec.history==='undo',available=spec.history==='empty'?[false,false]:changed?[true,false]:[false,true]
  check(phase,'canonical',editor.save().blocks,records(spec,legacy,changed));check(phase,'history',history(),available);check(phase,'readOnly',editor.readOnly,false);completedPhases.push(phase)
  phase='read-only';events.length=0;editor.setReadOnly(true);editor.setReadOnly(true);await pause()
  check(phase,'canonical',editor.save().blocks,records(spec,legacy,changed));check(phase,'readOnly',editor.readOnly,true);check(phase,'history',history(),[false,false]);check(phase,'fields',fields(),Array(spec.reader==='paragraph'?1:3).fill('false'))
  check(phase,'modeFacts',events,[{type:'readOnly:changed',payload:{readOnly:true}},{type:'history:changed',payload:{canUndo:false,canRedo:false}}]);completedPhases.push(phase)
  phase='denied';events.length=0
  const rejected=[]
  for(const method of ['undo','redo']){let error=null,result=null;try{result=editor[method]()}catch(value){error=value?.name??typeof value}rejected.push({method,error,result})}
  check(phase,'publicReplayRejected',rejected,['undo','redo'].map(method=>({method,error:'Error',result:null})))
  const target=field();target.tabIndex=0;target.focus();const selection=window.getSelection();selection.setBaseAndExtent(target.firstChild,1,target.firstChild,3)
  for(const key of [{key:'X',code:'KeyX',windowsVirtualKeyCode:88,text:'X',unmodifiedText:'X'},{key:'Delete',code:'Delete',windowsVirtualKeyCode:46},{key:'z',code:'KeyZ',windowsVirtualKeyCode:90,modifiers:2}]){
   await nativeInput('Input.dispatchKeyEvent',{type:'keyDown',...key});await nativeInput('Input.dispatchKeyEvent',{type:'keyUp',key:key.key,code:key.code,windowsVirtualKeyCode:key.windowsVirtualKeyCode,modifiers:key.modifiers??0})
  }
  await pause();check(phase,'trustedKeys',nativeEvents.filter(e=>e.phase===phase&&e.type==='keydown').map(({key,trusted})=>({key,trusted})),['X','Delete','z'].map(key=>({key,trusted:true})))
  check(phase,'inputEvents',nativeEvents.filter(e=>e.phase===phase&&e.type==='input'),[]);check(phase,'canonical',editor.save().blocks,records(spec,legacy,changed));check(phase,'history',history(),[false,false]);check(phase,'facts',events,[]);check(phase,'fieldText',field().textContent,changed?'Beta':'Alpha');completedPhases.push(phase)
  phase='reader';events.length=0
  const isToggle=spec.reader.startsWith('toggle'),button=spec.reader==='paragraph'?null:root().querySelector(isToggle?'.oe-toggle__chevron':'.oe-spoiler__toggle'),body=spec.reader==='paragraph'?null:root().querySelector(isToggle?'.oe-toggle__body':'.oe-spoiler__content')
  const view=()=>({expanded:button.getAttribute('aria-expanded'),visible:!body.hidden&&getComputedStyle(body).display!=='none'})
  if(button){
   const initial=isToggle&&spec.reader==='toggle-open';check(phase,'initialView',view(),{expanded:String(initial),visible:initial})
   for(let index=0;index<2;index++){
    button.scrollIntoView({block:'center'});const box=button.getBoundingClientRect();await nativeInput('Input.click',{x:box.x+box.width/2,y:box.y+box.height/2});await pause()
    const expected=index===0?!initial:initial;check(phase,'view'+index,view(),{expanded:String(expected),visible:expected});check(phase,'canonical'+index,editor.save().blocks,records(spec,legacy,changed));check(phase,'history'+index,history(),[false,false])
   }
   check(phase,'trustedClicks',nativeEvents.filter(e=>e.phase===phase&&e.type==='click').map(e=>e.trusted),[true,true])
  }
  check(phase,'facts',events,[]);check(phase,'canonical',editor.save().blocks,records(spec,legacy,changed));completedPhases.push(phase)
  phase='editable';events.length=0;editor.setReadOnly(false);editor.setReadOnly(false);await pause()
  check(phase,'canonical',editor.save().blocks,records(spec,legacy,changed));check(phase,'readOnly',editor.readOnly,false);check(phase,'history',history(),available);check(phase,'fields',fields(),Array(spec.reader==='paragraph'?1:3).fill('true'));check(phase,'modeFacts',events,[{type:'readOnly:changed',payload:{readOnly:false}},{type:'history:changed',payload:{canUndo:available[0],canRedo:available[1]}}]);completedPhases.push(phase)
  phase='replay';const first=spec.history==='undo'?'undo':'redo',second=first==='undo'?'redo':'undo'
  for(const[method,state]of [[first,spec.history==='empty'?false:!changed],[second,changed]]){check(phase,method+'Available',editor[method](),spec.history!=='empty');await pause();check(phase,method+'Canonical',editor.save().blocks,records(spec,legacy,state));check(phase,method+'History',history(),spec.history==='empty'?[false,false]:state?[true,false]:[false,true])}
  completedPhases.push(phase)
  phase='author';const authorField=field();authorField.scrollIntoView({block:'center'});authorField.focus();selection.setBaseAndExtent(authorField.firstChild,authorField.textContent.length,authorField.firstChild,authorField.textContent.length);events.length=0
  await nativeInput('Input.insertText',{text:'Y'});await pause(80)
  const authored=editor.save().blocks
  check(phase,'canonical',authored,records(spec,legacy,changed,true));check(phase,'history',history(),[true,false]);check(phase,'trustedInput',nativeEvents.filter(e=>e.phase===phase&&e.type==='input').map(e=>e.trusted),[true]);check(phase,'undoAvailable',editor.undo(),true);await pause();check(phase,'undoCanonical',editor.save().blocks,records(spec,legacy,changed));check(phase,'redoAvailable',editor.redo(),true);await pause();check(phase,'redoCanonical',editor.save().blocks,authored);completedPhases.push(phase)
  if(!legacy)check(phase,'documentActions',events.filter(e=>e.type==='document:changed').map(e=>({origin:e.payload.origin,action:e.payload.action})),[{origin:'native-input',action:'commit'},{origin:'history',action:'undo'},{origin:'history',action:'redo'}])
  phase='dispose';editor.destroy();check(phase,'rootRemoved',!holder.querySelector('.oe-editor'),true);check(phase,'ready',editor.isReady,false);completedPhases.push(phase)
  return{id:spec.id,spec,observations,diagnostics,events,nativeEvents,unsupported,planned,completedPhases,error:null}
 }catch(error){return{id:spec.id,spec,observations,diagnostics,events,nativeEvents,unsupported,planned,completedPhases,phase,error:String(error?.stack??error)}}
 finally{for(const off of offs)off();for(const type of ['keydown','click','input'])document.removeEventListener(type,capture,true);editor?.destroy();holder.remove()}
}
