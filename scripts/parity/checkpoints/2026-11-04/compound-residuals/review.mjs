import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {readFileSync,writeFileSync} from 'node:fs'
const [rawPath,candidate,output]=process.argv.slice(2),raw=readFileSync(rawPath),d=JSON.parse(raw),hash=b=>createHash('sha256').update(b).digest('hex'),copy=structuredClone
const git=(...args)=>execFileSync('git',args,{maxBuffer:128*1024*1024}),same=(a,b)=>assert.deepEqual(a,b)
const parent='2ae2e95e8082aa37abf7de3be10cf69415822f12',v1='5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340',baseline='e981ff308000c1d92d7e820df95113c1e19bcee8'
assert(d.candidatePass===true&&d.headBefore===candidate&&d.headAfter===candidate&&d.filter==='');same(d.serverErrors,[])
same(d.results.map(r=>[r.source,r.trustedPolicy]),[['v1',false],['spec-baseline',false],['parent',false],['candidate',false],['candidate',true]])
same(Object.fromEntries(d.sources.map(s=>[s.label,s.sha])),{v1,'spec-baseline':baseline,parent,candidate})
const cut=d.group==='compound-residual-cut',conversion=d.group==='warning-conversion';assert(cut||conversion||d.group==='warning-merge')
const own=['scripts/parity/'+d.group+'.mjs','tests/browser/'+d.group+'-fixture.js'],ids=[...new Set([...d.sources.flatMap(s=>Object.keys(s.loaded).map(p=>s.sha+':'+p)),...own.map(p=>candidate+':'+p)])]
const batch=execFileSync('git',['cat-file','--batch'],{input:ids.join('\n')+'\n',maxBuffer:128*1024*1024}),blobs=new Map();let cursor=0
for(const id of ids){let end=batch.indexOf(10,cursor),head=batch.subarray(cursor,end).toString().split(' ');assert(head[1]==='blob');let size=Number(head[2]);cursor=end+1;blobs.set(id,batch.subarray(cursor,cursor+size));cursor+=size+1}
let modules=0;for(const s of d.sources){same(s.tree,git('rev-parse',s.sha+'^{tree}').toString().trim());assert(Object.keys(s.loaded).length>95);for(const[p,h]of Object.entries(s.loaded)){same(hash(blobs.get(s.sha+':'+p)),h);modules++}}
same(d.runnerSha256,hash(blobs.get(candidate+':'+own[0])));same(d.fixtureSha256,hash(blobs.get(candidate+':'+own[1])));same(d.packageLockSha256,hash(readFileSync('package-lock.json')))
for(const[p,h]of Object.entries(d.dependencyFiles)){assert(!p.includes('..')&&!p.startsWith('/'));same(hash(readFileSync('node_modules/'+p)),h)}
for(const[p,v]of Object.entries(d.dependencyVersions))same(JSON.parse(readFileSync('node_modules/'+p+'/package.json')).version,v)
const color=value=>({type:'color',dataVersion:1,data:{value}}),record=(id,type,data,inline)=>({id,type,dataVersion:type==='paragraph'?2:1,data,...(inline?{inline}: {})}),before=()=>record('prefix','paragraph',{text:'Before'}),after=()=>record('suffix','paragraph',{text:'After'})
const names={warning:['title','message'],toggle:['title','content'],spoiler:['label','content']}
const specs=conversion?['title','message'].flatMap(field=>['text','widget','empty'].flatMap(survivor=>[false,true].map(backward=>({id:[field,survivor,backward?'backward':'forward'].join('/'),field,survivor,backward})))):cut?['warning','toggle','spoiler'].flatMap(family=>['first','last'].flatMap(side=>['text','widget','empty'].flatMap(survivor=>[false,true].map(backward=>({id:[family,side,survivor,backward?'backward':'forward'].join('/'),family,side,survivor,backward}))))):['source','target'].flatMap(placement=>['rich','first-plain','first-mark','last-plain','last-mark','both-plain','both-mark'].flatMap(content=>['Backspace','Delete'].map(key=>({id:placement+'/'+content+'/'+key,placement,content,key}))))
const event=(role,key,modifiers)=>({role,type:'keydown',key,trusted:true,modifiers}),events=name=>['commit','undo','redo'].map((action,i)=>({action,origin:i?'history':'user',name}))
function cutModel(s){
 const keys=names[s.family],first=s.side==='first',selected=first?0:1,survivor={text:'<i>Keep</i> {{swatch}}',widget:'{{swatch}}',empty:'<i></i>'}[s.survivor],data={[keys[0]]:first?'<b>Alpha</b>':survivor,[keys[1]]:first?survivor:'<b>Alpha</b>',...(s.family==='toggle'?{open:true}:{})},subject=record('subject',s.family,data,s.survivor==='empty'?null:{swatch:color('#aBcDef')}),initial=[before(),subject,after()],result=copy(initial)
 result[0].data.text=first?'Be':'Before';result[2].data.text=first?'After':'ter'
 if(s.survivor==='empty')result.splice(1,1);else result[1].data[keys[selected]]=''
 const exact=copy(result);if(s.survivor!=='empty')exact[1].data[keys[selected]]='<b></b>'
 const o=[],add=(p,k,v)=>o.push([p,k,v]);add('load','canonical',initial);add('load','history',[false,false]);add('load','selectedFieldVisible',true);add('select','nativeRange',{anchor:true,focus:true,selectedOnly:true});add('select','canonical',initial);add('select','history',[false,false]);add('cut','canonical',result);add('cut','history',[true,false]);add('cut','clipboardEvents',1);add('cut','trustedCut',true);add('cut','selectedPlainOnly',true);add('cut','privateFragment',true);add('cut','neighborsRetained',true);add('cut','subjectPresence',s.survivor!=='empty')
 if(s.survivor!=='empty'){add('cut','survivorHostRetained',true);add('cut','survivorWidget',{retained:true,id:'swatch',value:'#aBcDef',label:'#aBcDef',dot:'rgb(171, 205, 239)'})}
 add('undo','canonical',initial);add('undo','history',[false,true]);add('redo','canonical',exact);add('redo','normalized',result);add('redo','history',[true,false]);add('redo','caller',{version:'2.0.0',blocks:initial});add('redo','diagnostics',[]);add('dispose','rootRemoved',true)
 const block={kind:'block',block:{type:s.family,dataVersion:1,data:{[keys[0]]:first?'<b>Alpha</b>':'',[keys[1]]:first?'':'<b>Alpha</b>',...(s.family==='toggle'?{open:true}:{})}}},text={kind:'rich-text',html:first?'fore':'Af'}
 return {o,native:[event('cut','x',2),{role:'cut-event',type:'cut',trusted:true},event('undo','z',2),event('redo','z',10)],transactions:events('clipboard.cut'),clipboard:{version:2,parts:first?[text,block]:[block,text]},plain:first?'foreAlpha':'AlphaAf'}
}
function mergeModel(s){
 const first=/^(first|both)-/.test(s.content),last=/^(last|both)-/.test(s.content),mark=s.content.endsWith('-mark'),onTarget=s.placement==='target',title=first?(mark?'<b></b>':''):'<b>Next</b>',message=last?(mark?'<i></i>':''):'<i>Body</i> {{swatchB}}'
 const target=record('target','warning',{title:onTarget&&first?title:'<b>First</b>',message:onTarget&&last?message:'<i>Keep</i> {{swatchA}}'},onTarget&&last?null:{swatchA:color('#123456')}),source=record('source','warning',{title:onTarget?'<b>Next</b>':title,message:onTarget?'<i>Body</i> {{swatchB}}':message},!onTarget&&last?null:{swatchB:color('#aBcDef')}),initial=[before(),target,source,after()]
 const expected=record('target','warning',{title:onTarget&&first?'<b>Next</b>':!onTarget&&first?'<b>First</b>':'<b>First</b><br><b>Next</b>',message:onTarget&&last?'<i>Body</i> {{swatchB}}':!onTarget&&last?'<i>Keep</i> {{swatchA}}':'<i>Keep</i> {{swatchA}}<br><i>Body</i> {{swatchB}}'},{...(!(onTarget&&last)?{swatchA:color('#123456')}:{}),...((onTarget||!last)?{swatchB:color('#aBcDef')}:{})}),result=[before(),expected,after()]
 return {o:[['load','canonical',initial],['load','history',[false,false]],['merge','canonical',result],['merge','history',[true,false]],['merge','widgetCount',last?1:2],['undo','canonical',initial],['undo','history',[false,true]],['redo','canonical',result],['redo','history',[true,false]],['redo','caller',{version:'2.0.0',blocks:initial}],['redo','diagnostics',[]],['dispose','removed',true]],native:[event('merge',s.key,0),event('undo','z',2),event('redo','z',10)],transactions:events(!onTarget&&first&&last?'block.remove':'block.merge')}
}
function conversionModel(s,c){
 const base=cutModel({...s,family:'warning',side:s.field==='title'?'first':'last'}),initial=base.o[0][2],retained=s.survivor!=='empty',converted=record('converted','paragraph',{text:'<b>Alpha</b>'}),result=[before()],o=[],add=(p,k,v)=>o.push([p,k,v])
 if(retained){const residue=copy(initial[1]);residue.data[s.field]='';result.push(residue)}result.push(converted,after())
 const raw=c.observations.find(o=>o.phase==='redo'&&o.property==='canonical').actual,target=raw[retained?2:1];assert(target&&typeof target.id==='string');if(retained)assert(target.id!=='subject'&&target.id!=='prefix'&&target.id!=='suffix'&&target.id.length>0);else same(target.id,'subject');same(new Set(raw.map(b=>b.id)).size,raw.length)
 const exact=copy(result);exact[retained?2:1].id=target.id;if(retained)exact[1].data[s.field]='<b></b>'
 add('load','canonical',initial);add('load','history',[false,false]);add('select','nativeRange',{anchor:true,focus:true,text:'Alpha'});add('select','history',[false,false]);add('convert','canonical',result);add('convert','history',[true,false]);add('convert','targetIdentity',{unique:true,sourceReused:!retained});add('convert','neighborsRetained',true)
 if(retained){add('convert','survivorFieldRetained',true);add('convert','survivorWidget',{retained:true,id:'swatch',value:'#aBcDef',label:'#aBcDef',dot:'rgb(171, 205, 239)'})}
 add('undo','canonical',initial);add('undo','history',[false,true]);add('redo','canonical',exact);add('redo','normalized',result);add('redo','history',[true,false]);add('redo','caller',{version:'2.0.0',blocks:initial});add('redo','diagnostics',[]);add('dispose','rootRemoved',true)
 return{o,native:[{role:'type-open',type:'mousedown',trusted:true},{role:'type-choose',type:'mousedown',trusted:true},event('undo','z',2),event('redo','z',10)],transactions:events('selection.convert')}
}
const results=[];for(const r of d.results){same(r.policyEnforced,r.trustedPolicy);for(const k of ['pageErrors','inputErrors','externalRequests','mediaRequests','unavailable'])same(r[k],[]);for(const e of r.environmentRequests)assert(e.blocked&&e.type==='script'&&/^https?:\/\/gc\.kis\.v2\.scr\.kaspersky-labs\.com\/FD126C42-EBFA-4E12-B309-BB3FDD723AC1\/main.js/.test(e.url));same(r.cases.map(c=>c.spec),specs);let count=0,differences=[]
 for(const c of r.cases){same(c.id,c.spec.id);same(c.error,null);same(c.completedPhases,c.planned);assert(c.observations.length);count+=c.observations.length;for(const o of c.observations){let equal=true;try{same(o.actual,o.expected)}catch{equal=false}same(o.status,equal?'PASS':'FAIL');if(!equal)differences.push([c.id,o.phase,o.property])}
  if(r.source==='candidate'){
   const m=conversion?conversionModel(c.spec,c):cut?cutModel(c.spec):mergeModel(c.spec);same(c.unsupported,[]);same(c.diagnostics,[]);same(c.planned,[...new Set(m.o.map(o=>o[0]))]);same(c.observations.length,m.o.length)
   for(let i=0;i<m.o.length;i++){const [p,k,v]=m.o[i],o=c.observations[i];same([o.phase,o.property],[p,k]);try{same(o.actual,v);same(o.expected,v)}catch(e){throw new Error(c.id+'/'+p+'/'+k+': '+e.message)}}same(c.nativeEvents,m.native);same(c.transactions,m.transactions)
   if(cut){same(c.clipboard.length,1);const cb=c.clipboard[0];same(cb.trusted,true);same(cb.prevented,true);same(Object.keys(cb.values).sort(),['application/x-rector-fragment','text/html','text/plain']);same(cb.values['text/plain'],m.plain);same(JSON.parse(cb.values['application/x-rector-fragment']),m.clipboard);assert(cb.values['text/html'].includes('<b>Alpha</b>')&&!/Keep|swatch|#aBcDef/.test(cb.values['text/html']))}
  }else if(r.source==='v1'){same(c.unsupported.length,1);same(c.unsupported[0].property,'currentObservers')}else same(c.unsupported,[])
 }
 if(r.source==='candidate')same(differences,[]);results.push({source:r.source,trustedPolicy:r.trustedPolicy,cases:r.cases.length,observations:count,differences})
}
const report={status:'PASS',candidate,parent,group:d.group,currentCases:specs.length*2,currentObservations:results.filter(r=>r.source==='candidate').reduce((s,r)=>s+r.observations,0),moduleIdentities:modules,rawSha256:hash(raw),reviewerSha256:hash(readFileSync(import.meta.filename)),results};writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,results:results.map(r=>({...r,differences:r.differences.length}))}))
