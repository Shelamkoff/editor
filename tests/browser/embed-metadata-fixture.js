const PIXEL='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jH1sAAAAASUVORK5CYII='
const RECOVERY='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M/wHwAF/gL+Av7lWQAAAABJRU5ErkJggg=='
const pause=()=>new Promise(resolve=>setTimeout(resolve,0)),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b)
export const embedMetadataCases=[
 ...['throw','reject'].map(outcome=>({id:'action/'+outcome,kind:'action-error',outcome})),
 ...['caption','title','duration'].map(field=>({id:'field/'+field,kind:'field',field})),
 ...['url','invalid-url','back','remove'].map(action=>({id:'cover/'+action,kind:'cover',action})),
 ...['action','upload'].flatMap(source=>['live','caption','mode','replace','remove-undo','render','destroy-successor'].flatMap(variant=>['resolve','reject'].map(outcome=>({id:source+'/'+variant+'/'+outcome,kind:'task',source,variant,outcome})))),
 ...['timely','timeout'].map(outcome=>({id:'preview/'+outcome,kind:'preview',outcome})),
 {id:'upload/local',kind:'local'},
]
export async function runEmbedMetadataCase({sourceBase,legacy,spec,nativeInput}){
 if(spec.kind!=='action-error')return runMetadataWorkflow({sourceBase,legacy,spec,nativeInput})
 const [{createEditor},plugin]=await Promise.all([import(sourceBase+'core/index.js'),import(sourceBase+'plugins/embed/index.js')]),holder=document.createElement('section');document.body.append(holder)
 const observations=[],nativeEvents=[],pointTrace=[],faults=[],calls=[],planned=['load','failure','recovery','replay','dispose'],completedPhases=[],check=(phase,property,actual,expected)=>observations.push({phase,property,actual:structuredClone(actual),expected:structuredClone(expected),status:same(actual,expected)?'PASS':'FAIL'}),version=legacy?'1.0.5':'2.0.0',initial={service:'vimeo',videoId:'12345',caption:'Author caption',cover:PIXEL,title:'Author title',duration:'1:23'},record=data=>[{id:'embed',type:'embed',...(!legacy?{dataVersion:1}:{}),data}]
 const onError=e=>faults.push({kind:'error',message:e.message}),onRejection=e=>faults.push({kind:'rejection',reason:String(e.reason)});window.addEventListener('error',onError);window.addEventListener('unhandledrejection',onRejection)
 const stable=async()=>{await Promise.all(Array.from(holder.querySelectorAll('img'),img=>img.decode().catch(()=>{})));await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame)},button=label=>Array.from(holder.querySelectorAll('button')).find(el=>el.textContent.trim()===label)
 const click=async(label,role)=>{await stable();const target=button(label);if(!target)throw Error('Missing public button '+label);target.scrollIntoView({block:'center'});const r=target.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;pointTrace.push({role,connected:target.isConnected,hit:target.contains(document.elementFromPoint(x,y)),x,y,width:r.width,height:r.height});target.addEventListener('click',e=>nativeEvents.push({role,type:'click',trusted:e.isTrusted}),{once:true});await nativeInput('Input.click',{x,y});await pause()}
 const handler=({signal})=>{calls.push({abortedAtCall:signal.aborted,signal});if(calls.length===1){if(spec.outcome==='throw')throw Error('Cover source failed synchronously');return Promise.reject(false)}return Promise.resolve({url:RECOVERY})}
 let editor,phase='load',error=null
 try{
  const config={injectStyles:false,resolvePreview:false,actions:[{label:'Library',handler}]};editor=createEditor({holder,plugins:[legacy?new plugin.Embed(config):plugin.createEmbedPlugin(config)],injectStyles:false,inlineTools:[],blockRemoveAnimationMs:0,data:{version,blocks:record(initial)}})
  check(phase,'canonical',editor.save().blocks,record(initial));check(phase,'history',[editor.canUndo,editor.canRedo],[false,false]);completedPhases.push(phase)
  phase='failure';await click('Cover','failed-cover');await click('Library','failed-source');await pause();await pause();check(phase,'calls',calls.length,1);check(phase,'signalAtCall',calls[0].abortedAtCall,false);check(phase,'faults',faults,[]);check(phase,'canonical',editor.save().blocks,record(initial));check(phase,'history',[editor.canUndo,editor.canRedo],[false,false]);completedPhases.push(phase)
  phase='recovery';await click('Cover','recovery-cover');await click('Library','recovery-source');await pause();await pause();const after={...initial,cover:RECOVERY};check(phase,'calls',calls.length,2);check(phase,'canonical',editor.save().blocks,record(after));check(phase,'history',[editor.canUndo,editor.canRedo],[true,false]);check(phase,'faults',faults,[]);completedPhases.push(phase)
  phase='replay';editor.undo();check(phase,'undo',editor.save().blocks,record(initial));editor.redo();check(phase,'redo',editor.save().blocks,record(after));check(phase,'history',[editor.canUndo,editor.canRedo],[true,false]);completedPhases.push(phase)
  phase='dispose';editor.destroy();check(phase,'rootRemoved',!holder.querySelector('.oe-editor'),true);completedPhases.push(phase)
 }catch(e){error=String(e.stack??e)}finally{editor?.destroy();holder.remove();window.removeEventListener('error',onError);window.removeEventListener('unhandledrejection',onRejection)}
 return{id:spec.id,spec,observations,nativeEvents,pointTrace,planned,completedPhases,error,unsupported:[]}
}

const FRESH='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGPwKZz9HwAEvQJYppltbwAAAABJRU5ErkJggg=='
async function runMetadataWorkflow({sourceBase,legacy,spec,nativeInput}){
 const [{createEditor},plugin]=await Promise.all([import(sourceBase+'core/index.js'),import(sourceBase+'plugins/embed/index.js')])
 const holder=document.createElement('section');document.body.append(holder)
 const observations=[],nativeEvents=[],pointTrace=[],calls=[],requests=[],faults=[],completedPhases=[]
 const planned=spec.kind==='task'?['load','pending','retire','late','fresh','replay','dispose']:spec.kind==='preview'?['load','settle','dispose']:['load','action','replay','dispose']
 const check=(phase,property,actual,expected)=>observations.push({phase,property,actual:structuredClone(actual),expected:structuredClone(expected),status:same(actual,expected)?'PASS':'FAIL'})
 const version=legacy?'1.0.5':'2.0.0',initial={service:'vimeo',videoId:'12345',caption:'Author caption',cover:spec.kind==='preview'?'':PIXEL,title:'Author title',duration:'1:23'}
 const record=data=>[{id:'embed',type:'embed',...(!legacy?{dataVersion:1}:{}),data}]
 const onError=e=>faults.push({kind:'error',message:e.message}),onReject=e=>faults.push({kind:'rejection',reason:String(e.reason)})
 window.addEventListener('error',onError);window.addEventListener('unhandledrejection',onReject)
 const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}}
 const task=(signal,file)=>{const pending=deferred();calls.push({signal,file,pending,phase});return pending.promise}
 const config={injectStyles:false,resolvePreview:false,uploadFile:(file,{signal})=>task(signal,file),actions:[{label:'Library',handler:({signal})=>task(signal)}]}
 if(spec.kind==='preview')Object.assign(config,{previewTimeoutMs:spec.outcome==='timeout'?25:60000,resolvePreview:request=>{const pending=deferred();requests.push({...request,pending});return pending.promise}})
 if(spec.kind==='local')delete config.uploadFile
 const make=data=>createEditor({holder,plugins:[legacy?new plugin.Embed(config):plugin.createEmbedPlugin(config)],injectStyles:false,inlineTools:[],blockRemoveAnimationMs:0,blockInsertAnimationMs:0,blockMoveAnimationMs:0,data:{version,blocks:record(data)}})
 const stable=async()=>{await Promise.all(Array.from(holder.querySelectorAll('img'),img=>img.decode().catch(()=>{})));await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame)}
 const button=label=>Array.from(holder.querySelectorAll('button')).find(el=>el.textContent.trim()===label)
 const click=async(label,role,method='Input.click',extra={})=>{
  await stable();const target=typeof label==='string'?button(label):label;if(!target)throw Error('Missing public control '+label)
  target.scrollIntoView({block:'center'});const r=target.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2
  pointTrace.push({role,connected:target.isConnected,hit:target.contains(document.elementFromPoint(x,y)),x,y,width:r.width,height:r.height})
  target.addEventListener('click',e=>nativeEvents.push({role,type:'click',trusted:e.isTrusted}),{once:true})
  const result=await nativeInput(method,{x,y,...extra});await pause();return result
 }
 const type=async(field,text,role,append=false)=>{
  field.focus()
  if(field instanceof HTMLInputElement)field.select()
  else{const range=document.createRange();range.selectNodeContents(field);range.collapse(!append);getSelection().removeAllRanges();getSelection().addRange(range)}
  field.addEventListener('input',e=>nativeEvents.push({role,type:'input',trusted:e.isTrusted,inputType:e.inputType}),{once:true})
  await nativeInput('Input.insertText',{text});await pause()
 }
 const enter=async(field,role)=>{field.addEventListener('keydown',e=>nativeEvents.push({role,type:'keydown',trusted:e.isTrusted,key:e.key}),{once:true});const key={key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13};await nativeInput('Input.dispatchKeyEvent',{type:'keyDown',...key,text:'\r'});await nativeInput('Input.dispatchKeyEvent',{type:'keyUp',...key});await pause()}
 const choose=async(role)=>{
  if(legacy&&spec.source==='action'&&button('Cover')?.getBoundingClientRect().width===0)await click('Back',role+'-back')
  await click('Cover',role+'-cover')
  if(spec.source==='action')await click('Library',role+'-source')
  else{const result=await click('Upload',role+'-source','Input.chooseFiles',{name:'cover.png',mimeType:'image/png',base64:PIXEL.split(',')[1]});nativeEvents.push({role:role+'-file',...result})}
  await pause()
 }
 const snapshot=(phase,data,history)=>{check(phase,'canonical',editor.save().blocks,record(data));check(phase,'history',[editor.canUndo,editor.canRedo],history);check(phase,'faults',faults,[])}
 const preview=()=>{const image=holder.querySelector('.oe-embed__preview');return image?{src:image.getAttribute('src'),alt:image.getAttribute('alt')}:null}
 let editor,original,phase='load',error=null,blobUrl=null,fileTrace=null
 try{
  editor=make(initial);original=editor;snapshot(phase,initial,[false,false]);completedPhases.push(phase)
  if(spec.kind==='task'){
   phase='pending';await choose('pending');check(phase,'calls',calls.length,1);check(phase,'signal',calls[0].signal.aborted,false)
   if(spec.source==='upload'){const file=calls[0].file;fileTrace={name:file.name,type:file.type,size:file.size,base64:btoa(String.fromCharCode(...new Uint8Array(await file.arrayBuffer())))};check(phase,'file',fileTrace,{name:'cover.png',type:'image/png',size:atob(PIXEL.split(',')[1]).length,base64:PIXEL.split(',')[1]})}
   snapshot(phase,initial,[false,false]);completedPhases.push(phase)
   phase='retire';let current={...initial},states=[],cursor=[false,false]
   if(spec.variant==='caption'){await type(holder.querySelector('.oe-embed__caption'),' edited','caption',true);current.caption+=' edited';states=[initial];cursor=[true,false]}
   else if(spec.variant==='mode'){editor.setReadOnly(true);editor.setReadOnly(false)}
   else if(spec.variant==='replace'){const input=holder.querySelector('.oe-embed__url-input');await type(input,'https://vimeo.com/67890','replacement');await enter(input,'replacement');current.videoId='67890';states=[initial];cursor=[true,false]}
   else if(spec.variant==='remove-undo'){legacy?editor.blocks.remove(editor.blocks.getBlockIndex('embed')):editor.blocks.remove('embed');editor.undo();cursor=[false,true]}
   else if(spec.variant==='render'){current={...initial,videoId:'67890',title:'Rendered title'};editor.render({version,blocks:record(current)});states=[initial];cursor=[true,false]}
   else if(spec.variant==='destroy-successor'){editor.destroy();current={...initial,videoId:'67890',title:'Successor title'};editor=make(current);original.destroy()}
   await pause();const retired=!['live','caption'].includes(spec.variant);check(phase,'aborted',calls[0].signal.aborted,retired);snapshot(phase,current,cursor);completedPhases.push(phase)
   phase='late';if(spec.outcome==='reject')calls[0].pending.reject(false);else calls[0].pending.resolve({url:RECOVERY});await pause();await pause()
   if(!retired&&spec.outcome==='resolve'){states.push(current);current={...current,cover:RECOVERY};cursor=[true,false]}
   snapshot(phase,current,cursor);completedPhases.push(phase)
   phase='fresh';await choose('fresh');check(phase,'calls',calls.length,2);check(phase,'signalAtFresh',calls[1].signal.aborted,false);calls[1].pending.resolve({url:FRESH});await pause();await pause();states.push(current);current={...current,cover:FRESH};snapshot(phase,current,[true,false]);completedPhases.push(phase)
   phase='replay';const undo=[],redo=[],expectedUndo=[...states].reverse(),expectedRedo=states.slice(1).concat([current]);for(let i=0;i<states.length;i++){editor.undo();undo.push(editor.save().blocks)}for(let i=0;i<states.length;i++){editor.redo();redo.push(editor.save().blocks)}check(phase,'undo',undo,expectedUndo.map(record));check(phase,'redo',redo,expectedRedo.map(record));snapshot(phase,current,[true,false]);completedPhases.push(phase)
  }else if(spec.kind==='preview'){
   phase='settle';const live=requests.filter(r=>!r.signal.aborted);check(phase,'oneLiveRequest',live.length,1);const request=live[0];check(phase,'request',{service:request.service,videoId:request.videoId,url:request.url},{service:'vimeo',videoId:'12345',url:'https://vimeo.com/12345'})
   if(spec.outcome==='timeout'){await new Promise(resolve=>setTimeout(resolve,65));check(phase,'aborted',request.signal.aborted,true);check(phase,'reason',request.signal.reason?.name,'TimeoutError');request.pending.resolve({thumbnailUrl:RECOVERY,title:'Resolved preview'});await pause();check(phase,'preview',preview(),null)}
   else{request.pending.resolve({thumbnailUrl:RECOVERY,title:'Resolved preview'});await pause();check(phase,'preview',preview(),{src:RECOVERY,alt:'Resolved preview'});check(phase,'aborted',request.signal.aborted,false)}
   snapshot(phase,initial,[false,false]);completedPhases.push(phase)
  }else{
   phase='action';let after={...initial},authored=false
   if(spec.kind==='field'){
    const value=spec.field==='caption'?' edited':spec.field==='title'?'Edited title':'2:34'
    if(spec.field==='caption'){await type(holder.querySelector('.oe-embed__caption'),value,'field',true);after.caption+=value}
    else{await click('Settings','settings');const field=holder.querySelectorAll('.oe-embed__dropdown-panel input')[spec.field==='title'?0:1];await type(field,value,'field');field.addEventListener('change',e=>nativeEvents.push({role:'field',type:'change',trusted:e.isTrusted}),{once:true});holder.querySelector('.oe-embed').focus();await pause();after[spec.field]=value;check(phase,'visible',holder.querySelector('.oe-embed__'+spec.field)?.textContent,value)}
    authored=true
   }else if(spec.kind==='cover'){
    await click('Cover','cover')
    if(spec.action==='remove'){await click('Remove','remove');after.cover='';authored=true}
    else if(spec.action==='back')await click('Back','back')
    else{
     const value=spec.action==='url'?RECOVERY:'javascript:alert(1)'
     if(legacy){const response=await click('URL','url','Input.prompt',{value});check(phase,'prompt',response,{type:'prompt',message:'Image URL:',value})}
     else{await click('URL','url');const surface=holder.querySelector('.oe-source-editor[aria-hidden="false"]'),field=surface.querySelector('input');await type(field,value,'url');await click(surface.querySelector('button[type="submit"]'),'submit');if(spec.action==='invalid-url'){check(phase,'invalid',field.getAttribute('aria-invalid'),'true');await click(surface.querySelector('.oe-source-editor__button--secondary'),'cancel')}}
     if(spec.action==='url'){after.cover=RECOVERY;authored=true}
    }
   }else if(spec.kind==='local'){
    await choose('local');await pause();blobUrl=editor.save().blocks[0].data.cover;check(phase,'localUrl',typeof blobUrl==='string'&&blobUrl.startsWith('blob:'+location.origin+'/'),true);after.cover=blobUrl;authored=true;const image=holder.querySelector('.oe-embed__preview');await image.decode();check(phase,'imageSize',[image.naturalWidth,image.naturalHeight],[1,1]);check(phase,'localBytes',btoa(String.fromCharCode(...new Uint8Array(await (await fetch(blobUrl)).arrayBuffer()))),PIXEL.split(',')[1])
   }
   snapshot(phase,after,[authored,false]);completedPhases.push(phase)
   phase='replay';const undo=[],redo=[];if(authored){editor.undo();undo.push(editor.save().blocks);editor.redo();redo.push(editor.save().blocks)}check(phase,'undo',undo,authored?[record(initial)]:[]);check(phase,'redo',redo,authored?[record(after)]:[]);snapshot(phase,after,[authored,false]);if(blobUrl)check(phase,'localStillLive',(await fetch(blobUrl)).ok,true);completedPhases.push(phase)
  }
  phase='dispose';editor.destroy();original.destroy();check(phase,'rootRemoved',!holder.querySelector('.oe-editor'),true);if(blobUrl){let revoked=false;try{await fetch(blobUrl)}catch{revoked=true}check(phase,'localRevoked',revoked,true)}check(phase,'faults',faults,[]);completedPhases.push(phase)
 }catch(e){error=String(e.stack??e)}finally{editor?.destroy();original?.destroy();holder.remove();window.removeEventListener('error',onError);window.removeEventListener('unhandledrejection',onReject)}
 return{id:spec.id,spec,observations,nativeEvents,pointTrace,planned,completedPhases,error,unsupported:[],fileTrace,blobUrl,requestTrace:requests.map(r=>({service:r.service,videoId:r.videoId,url:r.url,aborted:r.signal.aborted}))}
}
