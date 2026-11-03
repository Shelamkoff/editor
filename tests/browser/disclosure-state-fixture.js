export const disclosureStateCases=['toggle-closed','toggle-open','spoiler'].flatMap(kind=>[false,true].flatMap(readOnly=>['click','Enter','Space'].map(gesture=>({id:[kind,readOnly?'reader':'editor',gesture].join('/'),kind,readOnly,gesture}))))
const copy=value=>JSON.parse(JSON.stringify(value))
const sorted=value=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value
const same=(a,b)=>JSON.stringify(sorted(a))===JSON.stringify(sorted(b))
const pause=(ms=35)=>new Promise(resolve=>setTimeout(resolve,ms))
async function settleStyles(){
 const deadline=Date.now()+8000
 while([...document.querySelectorAll('link[rel="stylesheet"]')].some(link=>!link.disabled&&!link.sheet)){
  if(Date.now()>deadline)throw new Error('Disclosure stylesheets did not load')
  await pause(25)
 }
}
function records(spec,legacy,open=spec.kind==='toggle-open',changed=false){
 return[{id:'a',type:'paragraph',...(!legacy?{dataVersion:2}:{}),data:{text:changed?'Beta':'Alpha'}},{id:'r',type:spec.kind==='spoiler'?'spoiler':'toggle',...(!legacy?{dataVersion:1}:{}),data:spec.kind==='spoiler'?{label:'<b>Title</b>',content:'<i>Body</i>'}:{title:'<b>Title</b>',content:'<i>Body</i>',open}}]
}
export async function runDisclosureStateCase({sourceBase='../../',legacy=false,spec,nativeInput}){
 const base=new URL(sourceBase,import.meta.url),[core,paragraph,toggle,spoiler]=await Promise.all(['core/index.js','plugins/paragraph/index.js','plugins/toggle/index.js','plugins/spoiler/index.js'].map(path=>import(new URL(path,base))))
 const holder=document.createElement('section');holder.style.cssText='width:700px;margin:80px auto';document.body.append(holder)
 const observations=[],diagnostics=[],events=[],nativeEvents=[],unsupported=[],planned=['load','activate','history','remount','dispose'],completedPhases=[]
 const check=(phase,property,actual,expected)=>{const a=copy(actual),e=copy(expected);observations.push({phase,property,actual:a,expected:e,status:same(a,e)?'PASS':'FAIL'})}
 const capture=event=>{if(holder.contains(event.target))nativeEvents.push({phase,type:event.type,key:event.key??null,detail:event.detail??null,trusted:event.isTrusted,onDisclosureControl:!!event.target.closest?.('.oe-toggle__chevron,.oe-spoiler__toggle')})}
 for(const type of ['keydown','click'])document.addEventListener(type,capture,true)
 let editor,phase='load'
 try{
  const version=legacy?'1.0.5':'2.0.0',isToggle=spec.kind!=='spoiler',persisted=spec.kind==='toggle-open',initialView=isToggle?persisted:!spec.readOnly,authoring=isToggle&&!spec.readOnly
  const mount=(blocks,readOnly)=>core.createEditor({holder,readOnly,injectStyles:true,inlineTools:[],changeDebounceMs:0,plugins:legacy?[new paragraph.Paragraph(),new toggle.Toggle(),new spoiler.Spoiler()]:[paragraph.createParagraphPlugin(),toggle.createTogglePlugin(),spoiler.createSpoilerPlugin()],onDiagnostic:value=>diagnostics.push(value),data:{version,blocks}})
  editor=mount(records(spec,legacy),false);await settleStyles();await pause(35)
  editor.render({version,blocks:records(spec,legacy,persisted,true)});editor.undo();editor.setReadOnly(spec.readOnly);await settleStyles();await pause()
  const root=()=>holder.querySelector('.oe-editor'),button=()=>root().querySelector(isToggle?'.oe-toggle__chevron':'.oe-spoiler__toggle'),body=()=>root().querySelector(isToggle?'.oe-toggle__body':'.oe-spoiler__content')
  const view=()=>({expanded:button().getAttribute('aria-expanded'),visible:!body().hidden&&getComputedStyle(body()).display!=='none',controls:!!body().id&&button().getAttribute('aria-controls')===body().id,enabled:button().tagName==='BUTTON'&&!button().disabled})
  const expectedView=opened=>({expanded:String(opened),visible:opened,controls:true,enabled:true}),history=()=>[editor.canUndo,editor.canRedo],available=spec.readOnly?[false,false]:[false,true]
  const subscribe=()=>{if(!legacy)for(const type of ['transaction:committed','document:changed','history:changed'])editor.on(type,event=>events.push({type,payload:copy(event)}))}
  subscribe();if(legacy)unsupported.push({property:'typedDisclosureFacts',reason:'Legacy real disclosure, canonical save/remount and history actions execute. Current typed transaction/document fact ports are not emulated.'})
  check(phase,'canonical',editor.save().blocks,records(spec,legacy));check(phase,'view',view(),expectedView(initialView));check(phase,'history',history(),available);completedPhases.push(phase)
  phase='activate';events.length=0;const control=button();control.scrollIntoView({block:'center'})
  if(spec.gesture==='click'){const box=control.getBoundingClientRect();await nativeInput('Input.click',{x:box.x+box.width/2,y:box.y+box.height/2})}
  else{control.focus();const key=spec.gesture==='Space'?' ':spec.gesture,code=spec.gesture==='Space'?'Space':'Enter',vk=spec.gesture==='Space'?32:13;await nativeInput('Input.dispatchKeyEvent',{type:spec.gesture==='Enter'?'keyDown':'rawKeyDown',key,code,windowsVirtualKeyCode:vk,...(spec.gesture==='Enter'?{text:'\r'}:{})});await nativeInput('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:vk})}
  await pause();const authoredOpen=authoring?!persisted:persisted,after=records(spec,legacy,authoredOpen)
  check(phase,'canonical',editor.save().blocks,after);check(phase,'view',view(),expectedView(!initialView));check(phase,'history',history(),authoring?[true,false]:available)
  check(phase,'trustedActivation',nativeEvents.filter(e=>e.phase===phase&&e.type==='click').map(({trusted,detail,onDisclosureControl})=>({trusted,detail,onDisclosureControl})),[{trusted:true,detail:spec.gesture==='click'?1:0,onDisclosureControl:true}]);check(phase,'trustedKeys',nativeEvents.filter(e=>e.phase===phase&&e.type==='keydown').map(({key,trusted,onDisclosureControl})=>({key,trusted,onDisclosureControl})),spec.gesture==='click'?[]:[{key:spec.gesture==='Space'?' ':'Enter',trusted:true,onDisclosureControl:true}])
  if(!legacy)check(phase,'documentActions',events.filter(e=>e.type==='document:changed').map(e=>({action:e.payload.action,changes:e.payload.changes})),authoring?[{action:'commit',changes:[{kind:'block.update',id:'r',before:records(spec,false)[1],after:after[1]}]}]:[])
  completedPhases.push(phase);phase='history'
  if(authoring){check(phase,'undoAvailable',editor.undo(),true);await pause();check(phase,'undoCanonical',editor.save().blocks,records(spec,legacy));check(phase,'undoView',view(),expectedView(persisted));check(phase,'undoHistory',history(),[false,true]);check(phase,'redoAvailable',editor.redo(),true);await pause();check(phase,'redoCanonical',editor.save().blocks,after);check(phase,'redoView',view(),expectedView(authoredOpen));check(phase,'redoHistory',history(),[true,false])}
  else{
   editor.setReadOnly(false);check(phase,'revealedHistory',history(),[false,true]);check(phase,'redoAvailable',editor.redo(),true);await settleStyles();await pause();check(phase,'redoCanonical',editor.save().blocks,records(spec,legacy,persisted,true));check(phase,'redoView',view(),expectedView(isToggle?persisted:true));check(phase,'undoAvailable',editor.undo(),true);await settleStyles();await pause();check(phase,'undoCanonical',editor.save().blocks,after);check(phase,'undoView',view(),expectedView(isToggle?persisted:true));check(phase,'history',history(),[false,true])
  }
  completedPhases.push(phase);phase='remount';const saved=editor.save();editor.destroy();await pause();check(phase,'retiredRootRemoved',!holder.querySelector('.oe-editor'),true);events.length=0;editor=mount(copy(saved.blocks),spec.readOnly);subscribe();await settleStyles();await pause(35)
  const remountedView=isToggle?authoredOpen:!spec.readOnly
  check(phase,'canonical',editor.save().blocks,after);check(phase,'view',view(),expectedView(remountedView));check(phase,'history',history(),[false,false]);check(phase,'readOnly',editor.readOnly,spec.readOnly);check(phase,'facts',events,[]);check(phase,'dataKeys',Object.keys(editor.save().blocks[1].data).sort(),isToggle?['content','open','title']:['content','label']);completedPhases.push(phase)
  phase='dispose';editor.destroy();check(phase,'rootRemoved',!holder.querySelector('.oe-editor'),true);check(phase,'ready',editor.isReady,false);completedPhases.push(phase)
  return{id:spec.id,spec,observations,diagnostics,nativeEvents,unsupported,planned,completedPhases,error:null}
 }catch(error){return{id:spec.id,spec,observations,diagnostics,nativeEvents,unsupported,planned,completedPhases,phase,error:String(error?.stack??error)}}
 finally{for(const type of ['keydown','click'])document.removeEventListener(type,capture,true);editor?.destroy();holder.remove()}
}
