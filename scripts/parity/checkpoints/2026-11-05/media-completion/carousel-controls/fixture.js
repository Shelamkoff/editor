const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M/wHwAF/gL+Av7lWQAAAABJRU5ErkJggg=='
const video='/candidate/tests/browser/carousel-roundtrip-16x16.webm'
const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x
const pause=(ms=70)=>new Promise(r=>setTimeout(r,ms)),clone=x=>structuredClone(x)
export const imageFunctionalCases=['editor-controls','output-controls','output-loop','output-disabled','output-autoplay'].map(kind=>({id:kind,kind}))
export async function runImageFunctionalCase({sourceBase,legacy,spec,nativeInput}){
 const base=new URL(sourceBase,import.meta.url),observations=[],phases=[],unsupported=[],events=[]
 const check=(phase,property,actual,expected)=>observations.push({phase,property,actual:clone(actual),expected:clone(expected),status:JSON.stringify(stable(actual))===JSON.stringify(stable(expected))?'PASS':'FAIL'})
 const host=document.createElement('section');host.style.cssText='width:600px;margin:80px auto';document.body.append(host)
 const options={loop:spec.kind==='output-loop',autoplay:spec.kind==='output-autoplay',autoplayDelay:700,navigation:spec.kind!=='output-disabled',pagination:spec.kind!=='output-disabled',thumbnails:spec.kind!=='output-disabled',aspectRatio:'16 / 9'}
 const input={type:'carousel',dataVersion:1,data:{slides:[{id:'one',type:'image',src:pixel,alt:'One',caption:'First'},{id:'two',type:'video',src:video,poster:pixel,alt:'Two',caption:'Second'},{id:'three',type:'image',src:pixel,alt:'Three',caption:'Third'}],options}},original=clone(input)
 const editorMode=spec.kind.startsWith('editor');let renderer,editor,root,links=[],error
 const until=async(fn,label)=>{const end=Date.now()+4000;while(!fn()&&Date.now()<end)await pause(20);if(!fn())throw Error(label)}
 const click=async(e,point)=>{if(!e)throw Error('Missing Carousel control');e.scrollIntoView({block:'nearest'});await pause();const b=e.getBoundingClientRect();let trusted=false;const capture=ev=>{trusted=ev.isTrusted&&e.contains(ev.target)};document.addEventListener('mousedown',capture,{capture:true,once:true});await nativeInput('Input.click',{x:point?b.left+25:b.left+b.width/2,y:point?b.bottom-25:b.top+b.height/2});document.removeEventListener('mousedown',capture,true);events.push({kind:point?'native-video-control':'click',trusted,hit:document.elementFromPoint(point?b.left+25:b.left+b.width/2,point?b.bottom-25:b.top+b.height/2)?.tagName,box:{width:b.width,height:b.height}});if(!trusted&&!point)throw Error('Carousel action missed target');await pause(400)}
 const active=()=>editorMode?Number(root.querySelector('.oe-carousel-block__counter').textContent.split('/')[0])-1:[...root.querySelectorAll('.carousel__dot')].findIndex(e=>e.getAttribute('aria-current')==='page')
 try{
  await nativeInput('Input.dispatchMouseEvent',{type:'mouseMoved',x:5,y:5})
  if(editorMode){const[core,module]=await Promise.all([import(new URL('core/index.js',base)),import(new URL('plugins/carousel/index.js',base))]);editor=core.createEditor({holder:host,plugins:[legacy?new module.CarouselBlock():module.createCarouselPlugin()],defaultBlock:'carousel',inlineTools:[],data:{version:legacy?'1.0.5':'2.0.0',blocks:[{id:'carousel',type:'carousel',data:input.data,...(legacy?{}:{dataVersion:1})}]}});root=host.querySelector('.oe-carousel-block')}
  else{const module=await import(new URL('renderer/renderers/carousel/index.js',base));renderer=module.createCarouselRenderer('editor',{});links=renderer.styles.map(url=>{const l=document.createElement('link');l.rel='stylesheet';l.href=url;document.head.append(l);return l});root=renderer.render(input,s=>document.createTextNode(s),{ownerDocument:document});host.append(root)}
  await pause(300);phases.push('render');check('render','caller',input,original)
  const staticOutput=root.classList.contains('editor-carousel-block--static')
  if(staticOutput){
   check('static','captions',[...root.querySelectorAll('figcaption')].map(e=>e.textContent),['First','Second','Third']);check('static','videoControls',root.querySelector('video').controls,true);check('static','ratio',root.querySelector('figure').style.aspectRatio,'16 / 9');phases.push('static')
  }else if(spec.kind==='output-disabled'){
   check('disabled','controls',root.querySelectorAll('.carousel__arrow,.carousel__dot,.carousel__thumb').length,0);check('disabled','slides',root.querySelectorAll('figure').length,3);phases.push('disabled')
  }else if(spec.kind==='output-autoplay'){
   await until(()=>active()!==0,'Autoplay did not advance');check('autoplay','advanced',active()>=1,true);const held=root;renderer.destroy(root);await pause(900);check('autoplay','disposedRuntime',!!held.querySelector('.carousel__track'),false);phases.push('autoplay')
  }else{
   const next=()=>root.querySelector(editorMode?'.oe-carousel-block__nav--next':'.carousel__arrow--next'),prev=()=>root.querySelector(editorMode?(legacy?'.oe-carousel-block__nav--previous':'.oe-carousel-block__nav--prev'):'.carousel__arrow--prev')
   check('controls','initial',active(),0)
   if(!options.loop)check('controls','firstBoundary',!prev()?.checkVisibility()||prev().disabled,true)
   await click(next());await until(()=>active()===1,'Next did not settle on second slide');check('controls','next',active(),1)
   const thumbs=[...root.querySelectorAll(editorMode?'.oe-carousel-block__thumbnail':'.carousel__thumb')];check('controls','thumbnails',thumbs.length,3)
   const vids=[...root.querySelectorAll('video')];const player=vids.find(e=>{const a=e.getBoundingClientRect(),b=root.getBoundingClientRect();return a.right>b.left+20&&a.left<b.right-20})
   await until(()=>player?.readyState>=2,'Actual video did not decode');check('playback','dimensions',[player.videoWidth,player.videoHeight],[16,16]);check('playback','controls',player.controls,true)
   let played=false;player.addEventListener('playing',event=>{played=event.isTrusted},{once:true});player.focus();check('playback','focused',document.activeElement===player,true);for(const type of ['rawKeyDown','keyUp'])await nativeInput('Input.dispatchKeyEvent',{type,key:' ',code:'Space',windowsVirtualKeyCode:32,nativeVirtualKeyCode:32});events.push({kind:'native-video-keyboard',key:'Space'});await until(()=>played&&player.currentTime>0,'Native video keyboard control did not play');check('playback','played',played,true);player.pause()
   await click(next());await until(()=>active()===2,'Next did not settle on last slide');check('controls','last',active(),2)
   if(options.loop){await click(next());await until(()=>active()===0,'Loop did not settle');check('controls','wrap',active(),0)}else check('controls','lastBoundary',!next().checkVisibility()||next().disabled,true)
   await click(root.querySelector(editorMode?'.oe-carousel-block__thumbnail':'.carousel__thumb'));await until(()=>active()===0,'Thumbnail did not settle');check('controls','thumbnailSelected',active(),0)
   if(!editorMode){await click(root.querySelectorAll('.carousel__dot')[2]);await until(()=>active()===2,'Pagination did not settle');check('controls','paginationSelected',active(),2)}
   if(editor){check('controls','data',editor.save().blocks[0].data,input.data);check('controls','history',editor.canUndo,false)}
   phases.push('controls','playback')
  }
 }catch(e){error=String(e.stack??e)}finally{try{editor?.destroy();renderer?.destroy(root)}catch(e){error??=String(e)}links.forEach(e=>e.remove());host.remove();phases.push('dispose')}
 return {...spec,observations,phases,unsupported,events,error}
}
