const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M/wHwAF/gL+Av7lWQAAAABJRU5ErkJggg=='
const pause=(ms=70)=>new Promise(r=>setTimeout(r,ms)),copy=x=>structuredClone(x),stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x
export const imageFunctionalCases=[{id:'custom-social',kind:'custom-social'}]
export async function runImageFunctionalCase({sourceBase,legacy,spec,nativeInput}){
 const base=new URL(sourceBase,import.meta.url),[core,person,render]=await Promise.all([import(new URL('core/index.js',base)),import(new URL('plugins/person/index.js',base)),import(new URL('renderer/renderers/person/index.js',base))])
 const observations=[],phases=[],unsupported=[],events=[]
 const check=(phase,property,actual,expected)=>observations.push({phase,property,actual:copy(actual),expected:copy(expected),status:JSON.stringify(stable(actual))===JSON.stringify(stable(expected))?'PASS':'FAIL'})
 const destination=location.origin+'/destination?author=grace',icon='<svg xmlns="http://www.w3.org/2000/svg" data-proof-social="true" width="16" height="16"><circle cx="8" cy="8" r="4"/></svg>'
 const config={socialResolvers:[{type:'library',test:url=>url.startsWith(location.origin+'/destination'),icon}]}
 const definition=legacy?new person.Person(config):person.createPersonPlugin(config)
 const profiles=[{id:'ada',avatar:pixel,name:'Ada',role:'Engineer',bio:'First biography',links:[{id:'github',type:'github',url:'https://github.com/ada'}]},{id:'grace',avatar:'',name:'Grace',role:'Admiral',bio:'Second biography',links:[{id:'site',type:'website',url:'https://example.com/old'}]}]
 const data={version:legacy?'1.0.5':'2.0.0',blocks:[{id:'people',type:'person',...(!legacy?{dataVersion:2}:{}),data:{persons:copy(profiles)}}]},original=copy(data)
 const holder=document.createElement('section'),output=document.createElement('section');holder.style.width='650px';output.style.width='500px';document.body.append(holder,output)
 let editor,renderer,root,error,styles=[]
 const meaningful=persons=>persons.map(p=>({avatar:p.avatar,name:p.name,role:p.role,bio:p.bio,links:p.links.map(l=>({type:l.type,url:l.url}))}))
 const until=async(fn,label)=>{const end=Date.now()+4000;while(!fn()&&Date.now()<end)await pause(20);if(!fn())throw Error(label)}
 const click=async el=>{if(!el)throw Error('Missing Person control');el.scrollIntoView({block:'center'});await pause();const r=el.getBoundingClientRect();let trusted=false;const capture=e=>{trusted=e.isTrusted&&el.contains(e.target)};document.addEventListener('mousedown',capture,{capture:true,once:true});await nativeInput('Input.click',{x:r.left+r.width/2,y:r.top+r.height/2});document.removeEventListener('mousedown',capture,true);events.push({kind:'click',trusted});if(!trusted)throw Error('Person pointer missed live control');await pause()}
 const key=async(key,code,vk,modifiers=0)=>{for(const type of ['rawKeyDown','keyUp'])await nativeInput('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode:vk,nativeVirtualKeyCode:vk,modifiers});await pause()}
 try{
  editor=core.createEditor({holder,plugins:[definition],defaultBlock:'person',inlineTools:[],data});await pause(180);phases.push('create');check('create','profiles',meaningful(editor.save().blocks[0].data.persons),meaningful(profiles))
  await click(holder.querySelectorAll('.oe-person__tab')[1]);const field=holder.querySelector('.oe-person__link-url');await click(field);await key('a','KeyA',65,2);await nativeInput('Input.insertText',{text:destination});await key('Enter','Enter',13)
  const expected=copy(profiles);expected[1].links[0]={id:'site',type:'library',url:destination}
  check('edit','profiles',meaningful(editor.save().blocks[0].data.persons),meaningful(expected));check('edit','customIcon',!!holder.querySelector('[data-proof-social]'),true);check('edit','history',editor.canUndo,true);phases.push('edit')
  editor.undo();check('undo','profiles',meaningful(editor.save().blocks[0].data.persons),meaningful(profiles));check('undo','history',[editor.canUndo,editor.canRedo],[false,true]);editor.redo();check('redo','profiles',meaningful(editor.save().blocks[0].data.persons),meaningful(expected));phases.push('undo','redo')
  renderer=render.createPersonRenderer('editor',{});styles=renderer.styles.map(url=>{const l=document.createElement('link');l.rel='stylesheet';l.href=url;document.head.append(l);return l});root=renderer.render({type:'person',dataVersion:2,data:{persons:expected}},text=>document.createTextNode(text),{ownerDocument:document});output.append(root)
  await until(()=>root.querySelectorAll('.editor-person__card').length===2,'Both output cards did not materialize');await pause(180)
  const cards=[...root.querySelectorAll('.editor-person__card')];check('output','names',cards.map(c=>c.querySelector('.editor-person__name').textContent),['Ada','Grace']);check('output','roles',cards.map(c=>c.querySelector('.editor-person__role').textContent),['Engineer','Admiral']);check('output','biographies',cards.map(c=>c.querySelector('.editor-person__bio').textContent),['First biography','Second biography']);check('output','links',cards.map(c=>c.querySelector('a').getAttribute('href')),['https://github.com/ada',destination]);check('output','icons',cards.map(c=>!!c.querySelector('a svg')),[true,true]);phases.push('output')
  // On a narrow ordinary output, use its actual Next button before activating
  // the second card. The CSP list fallback already exposes both author cards.
  const next=root.querySelectorAll('.editor-person__nav-btn')[1];if(next?.checkVisibility()){await click(next);await until(()=>{const a=[...root.querySelectorAll('a')].find(a=>a.getAttribute('href')===destination).getBoundingClientRect(),r=root.querySelector('.carousel__viewport').getBoundingClientRect();return a.left>=r.left&&a.right<=r.right},'Next person did not expose the second link')}
  await click([...root.querySelectorAll('a')].find(a=>a.getAttribute('href')===destination))
  check('navigation','destination',await nativeInput('Navigation.take'),{url:destination,title:'Author destination',text:'Author destination'});check('navigation','authorUnchanged',meaningful(editor.save().blocks[0].data.persons),meaningful(expected));check('navigation','caller',data,original);phases.push('navigation')
 }catch(e){error=String(e.stack??e)}finally{try{editor?.destroy();renderer?.destroy(root)}catch(e){error??=String(e)}styles.forEach(s=>s.remove());holder.remove();output.remove();phases.push('dispose')}
 return {...spec,observations,phases,unsupported,events,error}
}
