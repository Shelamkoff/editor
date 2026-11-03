const PIXEL='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jH1sAAAAASUVORK5CYII='
const valid=[
 ['youtube-watch','https://youtube.com/watch?v=dQw4w9WgXcQ','youtube','dQw4w9WgXcQ'],
 ['youtube-www','https://www.youtube.com/watch?v=dQw4w9WgXcQ','youtube','dQw4w9WgXcQ'],
 ['youtube-mobile','https://m.youtube.com/watch?v=dQw4w9WgXcQ','youtube','dQw4w9WgXcQ'],
 ['youtube-short-host','https://youtu.be/dQw4w9WgXcQ','youtube','dQw4w9WgXcQ'],
 ['youtube-embed','https://youtube.com/embed/dQw4w9WgXcQ','youtube','dQw4w9WgXcQ'],
 ['youtube-shorts','https://youtube.com/shorts/dQw4w9WgXcQ','youtube','dQw4w9WgXcQ'],
 ['youtube-case','https://WWW.YouTube.COM/watch?v=dQw4w9WgXcQ','youtube','dQw4w9WgXcQ'],
 ['youtube-query','https://youtube.com/watch?feature=share&v=dQw4w9WgXcQ&t=2','youtube','dQw4w9WgXcQ'],
 ['youtube-http','http://youtu.be/dQw4w9WgXcQ','youtube','dQw4w9WgXcQ'],
 ['vimeo-main','https://vimeo.com/12345','vimeo','12345'],
 ['vimeo-www','https://www.vimeo.com/12345','vimeo','12345'],
 ['vimeo-player','https://player.vimeo.com/video/12345','vimeo','12345'],
]
const invalid=[
 ['unknown-host','https://videos.example/watch?v=dQw4w9WgXcQ'],
 ['lookalike-host','https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ'],
 ['userinfo-host','https://youtube.com@evil.example/watch?v=dQw4w9WgXcQ'],
 ['script-scheme','javascript:alert(1)'],
 ['relative-url','/watch?v=dQw4w9WgXcQ'],
 ['youtube-missing-id','https://youtube.com/watch'],
 ['youtube-short-id','https://youtube.com/watch?v=short'],
 ['youtube-long-id','https://youtube.com/watch?v=dQw4w9WgXcQx'],
 ['youtube-bad-id','https://youtu.be/dQw4w9WgXc!'],
 ['youtube-wrong-path','https://youtube.com/channel/dQw4w9WgXcQ'],
 ['vimeo-bad-id','https://vimeo.com/12bad'],
 ['vimeo-missing-id','https://player.vimeo.com/video/'],
 ['prototype-host','https://constructor/video/12345'],
]
const malformed=[['unknown','foreign','12345'],['prototype','__proto__','12345'],['constructor','constructor','12345'],['to-string','toString','12345'],['youtube-short','youtube','short'],['youtube-long','youtube','dQw4w9WgXcQx'],['youtube-symbol','youtube','dQw4w9WgXc!'],['vimeo-word','vimeo','12bad'],['vimeo-negative','vimeo','-1'],['vimeo-decimal','vimeo','1.2']]
export const embedServicesCases=[...valid.flatMap(([id,url,service,videoId])=>['enter','button'].map(method=>({id:id+'/'+method,kind:'url',url,service,videoId,method}))),...invalid.map(([id,url])=>({id,kind:'url',url,service:'',videoId:'',method:'enter'})),...malformed.map(([id,service,videoId])=>({id:'schema/'+id,kind:'schema',service,videoId})),...['youtube','vimeo'].flatMap(service=>['reader','renderer'].map(mode=>({id:'loaded/'+service+'/'+mode,kind:'loaded',service,videoId:service==='youtube'?'dQw4w9WgXcQ':'12345',mode})))]
const pause=()=>new Promise(resolve=>setTimeout(resolve,0)),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b)
export async function runEmbedServiceCase({sourceBase,legacy,spec,nativeInput}){
 if(spec.kind==='schema')return runSchemaCase({sourceBase,legacy,spec})
 if(spec.kind==='loaded')return runLoadedCase({sourceBase,legacy,spec,nativeInput})
 const [{createEditor},plugin]=await Promise.all([import(sourceBase+'core/index.js'),import(sourceBase+'plugins/embed/index.js')]),holder=document.createElement('section');document.body.append(holder)
 const observations=[],nativeEvents=[],planned=['load','submit','play','replay','dispose'],completedPhases=[],initial={service:'',videoId:'',caption:'<b>Author caption</b>',cover:PIXEL,title:'Author title',duration:'1:23'},record=data=>[{id:'embed',type:'embed',...(!legacy?{dataVersion:1}:{}),data}],version=legacy?'1.0.5':'2.0.0'
 const check=(phase,property,actual,expected)=>observations.push({phase,property,actual:structuredClone(actual),expected:structuredClone(expected),status:same(actual,expected)?'PASS':'FAIL'})
 let editor,phase='load'
 try{
  const config={resolvePreview:false,injectStyles:false};editor=createEditor({holder,plugins:[legacy?new plugin.Embed(config):plugin.createEmbedPlugin(config)],injectStyles:false,inlineTools:[],data:{version,blocks:record(initial)}})
  const input=holder.querySelector('.oe-embed__url-input');check(phase,'canonical',editor.save().blocks,record(initial));check(phase,'history',[editor.canUndo,editor.canRedo],[false,false]);completedPhases.push(phase)
  phase='submit';input.focus();input.select();input.addEventListener('input',e=>nativeEvents.push({type:'input',trusted:e.isTrusted,inputType:e.inputType}),{once:true});await nativeInput('Input.insertText',{text:spec.url})
  if(spec.method==='button'){const insert=holder.querySelector('.oe-embed__url-bar button');insert.addEventListener('click',e=>nativeEvents.push({type:'insert-click',trusted:e.isTrusted}),{once:true});const r=insert.getBoundingClientRect();await nativeInput('Input.click',{x:r.x+r.width/2,y:r.y+r.height/2})}
  else{input.addEventListener('keydown',e=>nativeEvents.push({type:'keydown',trusted:e.isTrusted,key:e.key}),{once:true});const key={key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13};await nativeInput('Input.dispatchKeyEvent',{type:'keyDown',...key,text:'\r'});await nativeInput('Input.dispatchKeyEvent',{type:'keyUp',...key})}
  await pause();const expected={...initial,service:spec.service,videoId:spec.videoId};check(phase,'canonical',editor.save().blocks,record(expected));check(phase,'history',[editor.canUndo,editor.canRedo],[!!spec.service,false]);completedPhases.push(phase)
  phase='play';await Promise.all(Array.from(holder.querySelectorAll('img'),img=>img.decode().catch(()=>{})));await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);const play=holder.querySelector('.oe-embed__play-btn');if(play){holder.addEventListener('click',e=>{if(e.target.closest('.oe-embed__play-btn'))nativeEvents.push({type:'click',trusted:e.isTrusted})},{once:true,capture:true});play.scrollIntoView({block:'center'});await new Promise(requestAnimationFrame);const r=play.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;nativeEvents.push({type:'pointer-target',connected:play.isConnected,hit:play.contains(document.elementFromPoint(x,y)),className:document.elementFromPoint(x,y)?.getAttribute('class'),rect:{x:r.x,y:r.y,width:r.width,height:r.height}});await nativeInput('Input.click',{x,y});await pause()}
  const iframe=holder.querySelector('iframe'),frame=iframe?{src:iframe.getAttribute('src'),sandbox:iframe.getAttribute('sandbox'),allow:iframe.getAttribute('allow'),title:iframe.title,fullscreen:iframe.allowFullscreen}:null
  check(phase,'iframe',frame,spec.service?{src:spec.service==='youtube'?'https://www.youtube.com/embed/'+spec.videoId+'?autoplay=1&rel=0':'https://player.vimeo.com/video/'+spec.videoId+'?autoplay=1',sandbox:'allow-scripts allow-same-origin allow-presentation allow-popups',allow:'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',title:'Author title',fullscreen:true}:null);check(phase,'canonical',editor.save().blocks,record(expected));check(phase,'history',[editor.canUndo,editor.canRedo],[!!spec.service,false]);completedPhases.push(phase)
  phase='replay';check(phase,'before',[editor.canUndo,editor.canRedo],[!!spec.service,false]);const undoStates=[],redoStates=[];if(editor.canUndo){editor.undo();await pause();undoStates.push(editor.save().blocks);editor.redo();await pause();redoStates.push(editor.save().blocks)}check(phase,'undoStates',undoStates,spec.service?[record(initial)]:[]);check(phase,'redoStates',redoStates,spec.service?[record(expected)]:[]);check(phase,'after',[editor.canUndo,editor.canRedo],[!!spec.service,false]);check(phase,'final',editor.save().blocks,record(expected));check(phase,'iframeAfterReplay',holder.querySelector('iframe')?.getAttribute('src')??null,null);completedPhases.push(phase)
  phase='dispose';editor.destroy();check(phase,'rootRemoved',!holder.querySelector('.oe-editor'),true);completedPhases.push(phase);return{id:spec.id,spec,observations,nativeEvents,planned,completedPhases,error:null,unsupported:[]}
 }catch(error){return{id:spec.id,spec,observations,nativeEvents,planned,completedPhases,phase,error:String(error.stack??error),unsupported:[]}}finally{editor?.destroy();holder.remove()}
}

const fields=()=>({service:'',videoId:'',caption:'<b>Author caption</b>',cover:PIXEL,title:'Author title',duration:'1:23'})
const playerFrame=spec=>({src:spec.service==='youtube'?'https://www.youtube.com/embed/'+spec.videoId+'?autoplay=1&rel=0':'https://player.vimeo.com/video/'+spec.videoId+'?autoplay=1',sandbox:'allow-scripts allow-same-origin allow-presentation allow-popups',allow:'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',title:'Author title',fullscreen:true})
const inspectFrame=holder=>{const frame=holder.querySelector('iframe');return frame?{src:frame.getAttribute('src'),sandbox:frame.getAttribute('sandbox'),allow:frame.getAttribute('allow'),title:frame.title,fullscreen:frame.allowFullscreen}:null}
async function runSchemaCase({sourceBase,legacy,spec}){
 const [{createEditor},plugin]=await Promise.all([import(sourceBase+'core/index.js'),import(sourceBase+'plugins/embed/index.js')]),holder=document.createElement('section');document.body.append(holder)
 const observations=[],planned=['create','dispose'],completedPhases=[],check=(phase,property,actual,expected)=>observations.push({phase,property,actual:structuredClone(actual),expected:structuredClone(expected),status:same(actual,expected)?'PASS':'FAIL'}),data={version:legacy?'1.0.5':'2.0.0',blocks:[{id:'embed',type:'embed',...(!legacy?{dataVersion:1}:{}),data:{...fields(),service:spec.service,videoId:spec.videoId}}]},caller=structuredClone(data)
 let editor,creationError=null,error=null
 try{try{editor=createEditor({holder,plugins:[legacy?new plugin.Embed({injectStyles:false,resolvePreview:false}):plugin.createEmbedPlugin({injectStyles:false,resolvePreview:false})],injectStyles:false,inlineTools:[],data})}catch(e){creationError={name:e.name,message:e.message}}
  check('create','rejected',!!creationError,true);check('create','holderEmpty',holder.childNodes.length===0,true);check('create','noIframe',!holder.querySelector('iframe'),true);check('create','callerUnchanged',data,caller);completedPhases.push('create');editor?.destroy();check('dispose','editorRemoved',!holder.querySelector('.oe-editor'),true);completedPhases.push('dispose')
 }catch(e){error=String(e.stack??e)}finally{editor?.destroy();holder.remove()}
 return{id:spec.id,spec,observations,nativeEvents:[],creationError,error,planned,completedPhases,unsupported:[]}
}
async function runLoadedCase({sourceBase,legacy,spec,nativeInput}){
 const holder=document.createElement('section');document.body.append(holder);const observations=[],nativeEvents=[],planned=['load','play','dispose'],completedPhases=[],check=(phase,property,actual,expected)=>observations.push({phase,property,actual:structuredClone(actual),expected:structuredClone(expected),status:same(actual,expected)?'PASS':'FAIL'}),data={version:legacy?'1.0.5':'2.0.0',blocks:[{id:'embed',type:'embed',...(!legacy?{dataVersion:1}:{}),data:{...fields(),service:spec.service,videoId:spec.videoId}}]},caller=structuredClone(data)
 let owner,error=null
 try{
  if(spec.mode==='renderer'){const {EditorRenderer}=await import(sourceBase+'renderer/index.js');owner=new EditorRenderer({blockTypes:['embed'],injectStyles:false,classPrefix:'oe'});owner.renderTo(data,holder)}
  else{const [{createEditor},plugin]=await Promise.all([import(sourceBase+'core/index.js'),import(sourceBase+'plugins/embed/index.js')]);owner=createEditor({holder,plugins:[legacy?new plugin.Embed({injectStyles:false,resolvePreview:false}):plugin.createEmbedPlugin({injectStyles:false,resolvePreview:false})],injectStyles:false,readOnly:true,inlineTools:[],data})}
  check('load','noIframe',inspectFrame(holder),null);check('load','callerUnchanged',data,caller);if(spec.mode==='reader')check('load','history',[owner.canUndo,owner.canRedo],[false,false]);completedPhases.push('load')
  await Promise.all(Array.from(holder.querySelectorAll('img'),img=>img.decode().catch(()=>{})));await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);const play=holder.querySelector('.oe-embed__play-btn');play.addEventListener('click',e=>nativeEvents.push({type:'click',trusted:e.isTrusted}),{once:true});play.scrollIntoView({block:'center'});await new Promise(requestAnimationFrame);const r=play.getBoundingClientRect();await nativeInput('Input.click',{x:r.x+r.width/2,y:r.y+r.height/2});await pause();check('play','iframe',inspectFrame(holder),playerFrame(spec));check('play','callerUnchanged',data,caller);if(spec.mode==='reader'){check('play','canonical',owner.save().blocks,data.blocks);check('play','history',[owner.canUndo,owner.canRedo],[false,false])}completedPhases.push('play');owner.destroy();if(spec.mode==='reader')check('dispose','editorRemoved',!holder.querySelector('.oe-editor'),true);completedPhases.push('dispose')
 }catch(e){error=String(e.stack??e)}finally{owner?.destroy();holder.remove()}
 return{id:spec.id,spec,observations,nativeEvents,error,planned,completedPhases,unsupported:[]}
}
