const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M/wHwAF/gL+Av7lWQAAAABJRU5ErkJggg=='
const pause=(ms=40)=>new Promise(r=>setTimeout(r,ms)),copy=x=>structuredClone(x),stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x
const slots={'1':1,'2':2,'3a':3,'3b':3,'3c':3,'4a':4,'4b':4,'4c':4,'5a':5,'5b':5,'5c':5,'6a':6,'6b':6,'6c':6,triptych:3,'poly-5':5,'poly-3arch':3,'poly-5flat':5,'poly-3steps':3,auto:6,masonry:7}
export const galleryOutputLayoutCases=Object.keys(slots).map(layout=>({id:layout,layout}))
export async function runGalleryOutputLayoutCase({sourceBase='../../',legacy=false,spec}){
 const {EditorRenderer}=await import(new URL('renderer/index.js',new URL(sourceBase,import.meta.url)))
 const observations=[],phases=[],unsupported=[],geometry=[]
 const check=(phase,property,actual,expected)=>observations.push({phase,property,actual:copy(actual),expected:copy(expected),status:JSON.stringify(stable(actual))===JSON.stringify(stable(expected))?'PASS':'FAIL'})
 const input={version:legacy?'1.0.5':'2.0.0',blocks:[{id:'gallery',type:'gallery',...(!legacy?{dataVersion:2}:{}),data:{images:Array.from({length:7},(_,i)=>({id:'image-'+i,url:pixel,caption:'Picture '+i})),layout:spec.layout,styles:{},options:{captions:true}}}]},original=copy(input)
 const host=document.createElement('section');host.style.cssText='width:600px;margin:0';document.body.append(host)
 const renderer=new EditorRenderer({blockTypes:['gallery']}),root=()=>host.querySelector('.editor-gallery'),items=()=>[...root().querySelectorAll('.editor-gallery__item')]
 let error
 const ready=async()=>{const end=Date.now()+4000;while((!root()||!root().offsetHeight||[...document.querySelectorAll('link[rel="stylesheet"]')].some(l=>!l.sheet)||items().some(e=>!e.querySelector('img').complete))&&Date.now()<end)await pause(20);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));await pause(60)}
 const inspect=(phase,width,updated=false)=>{
  const list=items(),box=root().getBoundingClientRect(),expected=Array.from({length:slots[spec.layout]},(_,i)=>pixel),captions=Array.from({length:slots[spec.layout]},(_,i)=>(updated?'Updated ':'Picture ')+i)
  check(phase,'count',list.length,slots[spec.layout]);check(phase,'urls',list.map(e=>e.querySelector('img').getAttribute('src')),expected);check(phase,'captions',list.map(e=>e.querySelector('img').alt),captions);check(phase,'ownerWidth',Math.abs(box.width-width)<1,true);check(phase,'visibleArea',box.height>0&&list.every(e=>{const b=e.getBoundingClientRect();return b.width>0&&b.height>0}),true)
  if(spec.layout!=='auto'&&spec.layout!=='masonry')check(phase,'declaredLayout',root().classList.contains('eg--'+spec.layout),true)
  geometry.push({phase,width,items:list.map(e=>{const b=e.getBoundingClientRect();return{x:b.left-box.left,y:b.top-box.top,width:b.width,height:b.height}})})
 }
 try{
  renderer.renderTo(input,host);await ready();phases.push('render')
  for(const width of [320,600]){host.style.width=width+'px';await ready();inspect('width-'+width,width);phases.push('width-'+width)}
  const retained=root(),children=items();retained.remove();await pause(50);host.append(retained);await ready();check('reinsert','sameItems',items().every((e,i)=>e===children[i]),true);inspect('reinsert',600);phases.push('reinsert')
  const next=copy(input);next.blocks[0].data.images.forEach((image,i)=>{image.caption='Updated '+i});renderer.renderTo(next,host);await ready();inspect('update',600,true);check('update','caller',input,original);phases.push('update')
  renderer.destroy(host);check('dispose','cleared',host.childNodes.length,0)
 }catch(e){error=String(e.stack??e)}finally{renderer.destroy();host.remove();phases.push('dispose')}
 return {...spec,observations,phases,geometry,unsupported,error,events:[]}
}
