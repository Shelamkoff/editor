const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M/wHwAF/gL+Av7lWQAAAABJRU5ErkJggg=='
const pause=(ms=60)=>new Promise(r=>setTimeout(r,ms)),clone=x=>structuredClone(x)
const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x
export const imageFunctionalCases=[...['local','upload','partial','action','cancel-upload','cancel-action'].map(mode=>({kind:'gallery',mode})),...['local','upload','partial','action','cancel-upload','cancel-action'].map(mode=>({kind:'carousel',mode})),...['video-local','video-upload'].map(mode=>({kind:'carousel',mode})),...['local','remote','crop-remote','crop-cancel'].map(mode=>({kind:'person',mode}))].map((s,i)=>({...s,id:`${s.kind}/${s.mode}/${i}`}))
export async function runImageFunctionalCase({spec,sourceBase,legacy,nativeInput}){
 const observations=[],phases=[],unsupported=[],events=[],base=new URL(sourceBase,import.meta.url)
 const check=(phase,property,actual,expected)=>observations.push({phase,property,actual:clone(actual),expected:clone(expected),status:JSON.stringify(stable(actual))===JSON.stringify(stable(expected))?'PASS':'FAIL'})
 const [{createEditor},module]=await Promise.all([import(new URL('core/index.js',base)),import(new URL(`plugins/${spec.kind}/index.js`,base))])
 let editor,frame,error,requests=[],calls=[],resolvePending,signal,ownedSource=null
 const foreign=spec.kind==='person'&&!spec.mode.startsWith('crop')
 let enforced=false;try{document.createElement('span').innerHTML='probe'}catch{enforced=true}
 if(foreign){frame=document.createElement('iframe');frame.style.cssText='display:block;border:0;width:750px;height:600px';document.body.append(frame)}
 const doc=frame?.contentDocument??document,holder=doc.createElement('section');holder.style.width='600px';doc.body.append(holder)
 const isVideo=spec.mode.startsWith('video-'),sourceUrl=isVideo?'/candidate/tests/browser/carousel-roundtrip-16x16.webm':pixel,mime=isVideo?'video/webm':'image/png'
 const bytes=isVideo?new Uint8Array(await(await fetch(sourceUrl)).arrayBuffer()):Uint8Array.from(atob(pixel.split(',')[1]),c=>c.charCodeAt(0)),names=isVideo?['clip.webm']:['first.png','skip.png','last.png']
 const localUrl=isVideo?'data:video/webm;base64,'+btoa(String.fromCharCode(...bytes)):pixel
 const media=spec.kind==='gallery'?'images':'slides'
 const initial=spec.kind==='gallery'?{images:[{id:'old',url:pixel,caption:'Existing'}],layout:'1',styles:{},options:{}}:spec.kind==='carousel'?{slides:[{id:'old',type:'image',src:pixel,alt:'Existing',caption:'Existing'}],options:{loop:false,autoplay:false,navigation:true,pagination:true,thumbnails:false,autoplayDelay:3000,aspectRatio:'16 / 9'}}:{persons:[{id:'ada',avatar:'',name:'Ada',role:'Engineer',bio:'Retain biography',links:[]}]}
 const view=x=>spec.kind==='gallery'?x.images.map(({url,caption})=>({url,caption})):spec.kind==='carousel'?x.slides.map(({type,src,html,alt,caption,poster})=>type==='html'?{type,html,caption}:{type,src:src===ownedSource?'owned-video-blob':src,alt:alt??'',caption, ...(type==='video'?{poster:poster??''}:{})}):x.persons.map(({avatar,name,role,bio})=>({avatar,name,role,bio}))
 const batch=spec.kind==='gallery'?[{url:pixel,alt:'First'},{url:pixel,alt:'Second'}]:[{id:'new-image',type:'image',src:pixel,alt:'First',caption:'First'},{id:'new-html',type:'html',html:'<p>Second HTML</p>',caption:'Second'}]
 const pending=context=>{signal=context.signal;return new Promise(resolve=>{resolvePending=resolve})}
 const config={actions:[{label:'Proof library',handler:context=>{calls.push('action');return spec.mode.startsWith('cancel')?pending(context):Promise.resolve(clone(batch))}}]}
 if(!['local','video-local','action','cancel-action'].includes(spec.mode)||spec.kind==='person'&&spec.mode==='remote')config.uploadFile=async(file,context)=>{
  calls.push({name:file.name,type:file.type,bytes:[...new Uint8Array(await file.arrayBuffer())]});signal=context.signal
  if(spec.mode==='cancel-upload')return pending(context)
  if(spec.mode==='partial'&&file.name==='skip.png')throw Error('controlled member failure')
  return {url:sourceUrl,alt:file.name}
 }
 const definition=legacy?new module[spec.kind==='gallery'?'Gallery':spec.kind==='carousel'?'CarouselBlock':'Person'](config):module[spec.kind==='gallery'?'createGalleryPlugin':spec.kind==='carousel'?'createCarouselPlugin':'createPersonPlugin'](config)
 const input={version:legacy?'1.0.5':'2.0.0',blocks:[{id:'media',type:spec.kind,...(!legacy?{dataVersion:spec.kind==='carousel'?1:2}:{}),data:clone(initial)}]},original=clone(input)
 const root=()=>holder.querySelector(spec.kind==='gallery'?'.oe-gallery':spec.kind==='carousel'?'.oe-carousel-block':'.oe-person')
 const button=label=>[...root().querySelectorAll('button')].find(e=>e.checkVisibility()&&e.textContent.trim()===label)
 const click=async e=>{if(!e)throw Error('Missing live source action');e.scrollIntoView({block:'center'});await pause();const b=e.getBoundingClientRect(),f=frame?.getBoundingClientRect()??{left:0,top:0};let trusted=false;e.addEventListener('mousedown',event=>{trusted=event.isTrusted},{once:true});await nativeInput('Input.click',{x:f.left+b.left+b.width/2,y:f.top+b.top+b.height/2});check('trigger','trusted',trusted,true);await pause()}
 const until=async fn=>{const deadline=Date.now()+3000;while(!fn()&&Date.now()<deadline)await pause(20);if(!fn())throw Error('Source did not settle')}
 try{
  editor=createEditor({holder,plugins:[definition],defaultBlock:spec.kind,inlineTools:[],changeDebounceMs:0,data:input});await pause(200);phases.push('create')
  const before=clone(editor.save().blocks[0].data);check('create','meaning',view(before),view(initial))
  if(spec.mode.includes('action')){if(!button('Proof library'))await click(button('Add')??button('Add images'));await click(button('Proof library'))}
  else{
   if(spec.kind!=='person'&&!button('Upload'))await click(button('Add')??button('Add images'))
   let picker;const realms=[...new Set([window,doc.defaultView])],originals=realms.map(w=>w.HTMLInputElement.prototype.click)
   realms.forEach((w,i)=>{w.HTMLInputElement.prototype.click=function(){if(this.type==='file')picker=this;else originals[i].call(this)}})
   try{await click(spec.kind==='person'?root().querySelector('.oe-person__avatar-upload'):button('Upload'))}finally{realms.forEach((w,i)=>{w.HTMLInputElement.prototype.click=originals[i]})}
   if(!picker)throw Error('Native source did not open its file chooser')
   const transfer=new DataTransfer();for(const name of spec.kind==='person'?['photo.png']:names)transfer.items.add(new File([bytes],name,{type:mime}));picker.files=transfer.files;picker.dispatchEvent(new Event('change',{bubbles:true}));events.push({kind:'file delivery',trusted:false})
  }
  phases.push('trigger')
  if(spec.mode.startsWith('crop')&&!enforced){await until(()=>!!document.querySelector('.oe-cropper-btn--confirm'));await pause(150);await click(document.querySelector(spec.mode==='crop-cancel'?'.oe-cropper-btn--cancel':'.oe-cropper-btn--confirm'));phases.push('crop')}
  if(spec.mode==='crop-cancel'&&!enforced){check('crop','cancelled',view(editor.save().blocks[0].data),view(before));check('crop','uploadCalls',calls.length,0);check('crop','history',editor.canUndo,false);phases.push('cancel')}else if(spec.mode.startsWith('cancel')){
   await until(()=>!!resolvePending);editor.setReadOnly(true);check('cancel','signal',signal.aborted,true);resolvePending(spec.mode==='cancel-action'?clone(batch):{url:pixel,alt:'Late'});await pause(180);check('cancel','meaning',view(editor.save().blocks[0].data),view(before));check('cancel','history',editor.canUndo,false);phases.push('cancel')
  }else{
   if(spec.kind==='person'){await until(()=>editor.save().blocks[0].data.persons[0].avatar!=='');check('avatar','fallback',view(editor.save().blocks[0].data),[{avatar:pixel,name:'Ada',role:'Engineer',bio:'Retain biography'}]);check('avatar','cropper',!!document.querySelector('.oe-cropper-overlay')||!!doc.querySelector('.oe-cropper-overlay'),false);if(spec.mode==='crop-remote'&&!enforced){check('avatar','croppedFile',{name:calls[0]?.name,type:calls[0]?.type,nonempty:(calls[0]?.bytes.length??0)>0},{name:'avatar.webp',type:'image/webp',nonempty:true})}else if(spec.mode!=='local')check('avatar','file',calls,[{name:'photo.png',type:'image/png',bytes:[...bytes]}])}
   else{
    const accepted=spec.mode==='partial'?names.filter(n=>n!=='skip.png'):names
    const expected=spec.mode==='action'?(spec.kind==='gallery'?batch.map(x=>({url:x.url,caption:x.alt})):batch.map(x=>x.type==='html'?{type:x.type,html:x.html,caption:x.caption}:{type:x.type,src:x.src,alt:x.alt,caption:x.caption})):accepted.map(name=>spec.kind==='gallery'?{url:pixel,caption:spec.mode==='local'?'':name}:{type:isVideo?'video':'image',src:spec.mode==='video-local'?'owned-video-blob':sourceUrl,alt:name,caption:'',...(isVideo?{poster:''}:{})})
    await until(()=>editor.save().blocks[0].data[media].length>1)
    if(spec.mode==='video-local'){ownedSource=editor.save().blocks[0].data.slides.at(-1).src;check('settle','blobPrefix',ownedSource.startsWith('blob:'),true);const response=await fetch(ownedSource);check('settle','blobType',response.headers.get('content-type'),mime);check('settle','blobBytes',[...new Uint8Array(await response.arrayBuffer())],[...bytes])}
    check('settle','allMembers',view(editor.save().blocks[0].data),[...view(before),...expected])
    if(spec.mode==='upload'||spec.mode==='partial'||spec.mode==='video-upload')check('settle','inputFiles',calls,names.map(name=>({name,type:mime,bytes:[...bytes]})))
   }
   const after=clone(editor.save().blocks[0].data);check('settle','history',editor.canUndo,true)
   editor.undo();check('undo','meaning',view(editor.save().blocks[0].data),view(before));check('undo','history',[editor.canUndo,editor.canRedo],[false,true]);editor.redo();check('redo','meaning',view(editor.save().blocks[0].data),view(after));if(ownedSource){check('redo','exactBlob',editor.save().blocks[0].data.slides.at(-1).src,ownedSource);check('redo','blobBytes',[...new Uint8Array(await(await fetch(ownedSource)).arrayBuffer())],[...bytes])};phases.push('settle','undo','redo')
  }
  check('settle','caller',input,original)
 }catch(e){error=String(e.stack??e)}finally{try{editor?.destroy()}catch(e){error??=String(e)}if(ownedSource){let released=false;try{await fetch(ownedSource)}catch{released=true};check('dispose','blobReleased',released,true)};document.querySelector('.oe-cropper-btn--cancel')?.click();holder.remove();frame?.remove();phases.push('dispose')}
 return {...spec,observations,phases,unsupported,events,error}
}
