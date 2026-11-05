const pause=(ms=40)=>new Promise(r=>setTimeout(r,ms))
const clone=x=>structuredClone(x)
export const imageFunctionalCases=[...['a','b','f','g'].map(variant=>({kind:'individual',variant})),...['name','download'].map(target=>({kind:'group',variant:'a',target})),...['complete','partial','destroy','replacement'].map(mode=>({kind:'zip',variant:'a',mode}))].map((s,i)=>({...s,id:`${s.kind}/${i}`}))
export async function runImageFunctionalCase({spec,sourceBase,legacy,nativeInput}){
 const observations=[],phases=[],unsupported=[],events=[]
 const check=(phase,property,actual,expected)=>observations.push({phase,property,actual:clone(actual),expected:clone(expected),status:JSON.stringify(actual)===JSON.stringify(expected)?'PASS':'FAIL'})
 const base=new URL(sourceBase,import.meta.url)
 const [{createAttachesRenderer},zip]=await Promise.all([import(new URL('renderer/renderers/attaches/index.js',base)),import(new URL('shared/zipRuntime.js',base))])
 zip.setZipRuntime(window.JSZip)
 const payloads=[[0,1,127,255],[66,10,0]],names=['alpha Ω.bin','beta.txt']
 const urls=payloads.map(p=>URL.createObjectURL(new Blob([new Uint8Array(p)],{type:'application/octet-stream'})))
 if(spec.mode==='partial')URL.revokeObjectURL(urls[1])
 const data={files:payloads.slice(0,spec.kind==='individual'?1:2).map((p,i)=>({id:`f${i}`,url:urls[i],name:names[i],size:p.length,extension:i?'txt':'bin'})),variant:spec.variant}
 const input={type:'attaches',dataVersion:2,data:clone(data)},original=clone(input)
 const host=document.createElement('section');host.style.width='600px';document.body.append(host)
 const renderer=createAttachesRenderer('article',{}),links=renderer.styles.map(url=>{const a=document.createElement('link');a.rel='stylesheet';a.href=url;document.head.append(a);return a})
 let root,error,oldFetch,requests=[],retired=false
 const click=async element=>{if(!element)throw Error('Missing live download control');element.scrollIntoView({block:'center'});await pause();const b=element.getBoundingClientRect();let trusted=false;const capture=e=>{trusted=e.isTrusted};element.addEventListener('mousedown',capture,{once:true});await nativeInput('Input.click',{x:b.left+b.width/2,y:b.top+b.height/2});events.push({kind:'click',trusted});if(!trusted)throw Error('Untrusted action');await pause()}
 try{
  root=renderer.render(input,text=>document.createTextNode(text),{ownerDocument:document});host.append(root);await pause(250);phases.push('render')
  check('render','input',input,original)
  if(spec.kind==='individual'){
   await click(root.querySelector('a[download]'))
   check('download','completed',await nativeInput('Download.take'),{name:names[0],bytes:payloads[0]});phases.push('download')
  }else if(spec.kind==='group'){
   await click(root.querySelector('.article-attaches__chevron'))
   await click(root.querySelectorAll('.article-attaches__row')[1].querySelector(spec.target==='name'?'.article-attaches__row-name':'.article-attaches__download'))
   check('download','completed',await nativeInput('Download.take'),{name:names[1],bytes:payloads[1]});phases.push('download')
  }else{
   const button=root.querySelector('.article-attaches__group-header .article-attaches__download')
   const count=await nativeInput('Download.count')
   if(['destroy','replacement'].includes(spec.mode)){
    oldFetch=window.fetch;window.fetch=(url,options)=>new Promise(resolve=>requests.push({url,signal:options?.signal,resolve}))
    await click(button)
    check('pending','requests',requests.length,2)
    if(spec.mode==='replacement'){await click(button);check('replacement','requests',requests.length,4);check('replacement','oldSignals',requests.slice(0,2).map(r=>r.signal.aborted),[true,true])}
    renderer.destroy?.(root);retired=true
    check('retire','allSignals',requests.map(r=>r.signal.aborted),requests.map(()=>true))
    requests.forEach((r,i)=>r.resolve(new Response(new Uint8Array(payloads[i%2]))));await pause(250)
    check('retire','downloads',await nativeInput('Download.count'),count)
    check('retire','disabled',button.classList.contains('loading'),false)
    button.click();await pause();check('retire','oldControlRequests',requests.length,spec.mode==='replacement'?4:2);phases.push('pending','retire')
   }else{
    await click(button);const downloaded=await nativeInput('Download.take');check('download','filename',downloaded.name,'files.zip')
    const archive=await window.JSZip.loadAsync(new Uint8Array(downloaded.bytes))
    const expected=spec.mode==='partial'?names.slice(0,1):names
    check('download','entries',Object.keys(archive.files),expected)
    for(const name of expected)check('download',name,[...await archive.file(name).async('uint8array')],payloads[names.indexOf(name)])
    phases.push('download')
   }
  }
  check('settle','input',input,original)
 }catch(e){error=String(e.stack??e)}finally{
  if(oldFetch)window.fetch=oldFetch
  try{renderer.destroy?.(root)}catch(e){error??=String(e)}
  host.remove();links.forEach(x=>x.remove());urls.forEach(x=>URL.revokeObjectURL(x));phases.push('dispose')
 }
 return {...spec,observations,phases,unsupported,events,error}
}
