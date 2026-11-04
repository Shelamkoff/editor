import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
const [rawPath,redPath,candidate,output]=process.argv.slice(2),raw=JSON.parse(readFileSync(rawPath)),root='scripts/parity/checkpoints/2026-11-04/i18n-contexts';mkdirSync(output,{recursive:true})
const review=(path,name)=>spawnSync(process.env.EDITOR_PYTHON_PATH,[root+'/review.py','--raw',path,'--red',redPath,'--candidate',candidate,'--output',join(output,name+'-review.json')],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',PYTHONIOENCODING:'utf-8'}})
const healthy=review(rawPath,'healthy');assert.equal(healthy.status,0,healthy.stderr)
const row=(d,trusted=false)=>d.results.find(r=>r.source==='candidate'&&r.trustedPolicy===trusted),item=(d,id='menus/literal')=>{const c=row(d).cases.find(c=>c.id===id);assert.ok(c);return c},replace=(c,p,k,v)=>{const o=c.observations.find(o=>o.phase===p&&o.property===k);assert.ok(o);o.actual=o.expected=structuredClone(v);o.status='PASS'}
const variants=[
 ['wrong-source',d=>{d.sources[2].sha=d.sources[1].sha}],
 ['altered-module',d=>{const l=d.sources[2].loaded;l[Object.keys(l)[0]]='0'.repeat(64)}],
 ['overwritten-explicit-key',d=>replace(item(d,'literal-key/public-runtime-contexts'),'create','plugin.paragraph/echo','Fallback')],
 ['lost-inline-translation',d=>replace(item(d,'literal-key/public-runtime-contexts'),'create','inlinePlugin.color/echo','Fallback')],
 ['empty-changed-to-fallback',d=>replace(item(d,'literal-key/public-runtime-contexts'),'create','plugin.paragraph/empty','Fallback')],
 ['interpolation-rescanned',d=>replace(item(d,'literal-key/public-runtime-contexts'),'create','plugin.paragraph/params','Hello A $& B; B')],
 ['plural-object-selected-one',d=>replace(item(d,'literal-key/public-runtime-contexts'),'create','plugin.paragraph/forms','One 21')],
 ['overwritten-menu-label',d=>replace(item(d),'inline','labels',['Text','Quote'])],
 ['translated-label-became-command',d=>replace(item(d),'toolbox-action','insertedType','plugin.quote.title')],
 ['wrong-slash-command',d=>replace(item(d),'slash-action','finalTypes',['paragraph','quote','paragraph'])],
 ['lost-exact-undo',d=>{const c=item(d),o=c.observations.find(o=>o.phase==='undo-slash'&&o.property==='canonical'),v=structuredClone(o.actual);v[2].data.text='';replace(c,'undo-slash','canonical',v)}],
 ['lost-widget-sidecar',d=>{const c=item(d),o=c.observations.find(o=>o.phase==='redo-toolbox'&&o.property==='canonical'),v=structuredClone(o.actual);delete v[0].inline;replace(c,'redo-toolbox','canonical',v)}],
 ['menu-open-authored-history',d=>replace(item(d),'toolbox','history',[true,false])],
 ['extra-transaction',d=>{item(d).transactions.push({action:'commit',origin:'user',name:'translation'})}],
 ['synthetic-native-key',d=>{item(d).nativeEvents.find(e=>e.role==='slash-choose').trusted=false}],
 ['pointer-missed-control',d=>{item(d).pointTrace[0].hit=false}],
 ['missing-case',d=>{row(d).cases.pop()}],
 ['unenforced-policy',d=>{row(d,true).policyEnforced=false}],
 ['ignored-product-network',d=>{row(d).externalRequests=[{url:'https://foreign.example/fetch',type:'fetch',blocked:true}]}],
 ['hidden-parent-defect',d=>{d.results.find(r=>r.source==='parent').cases[0].observations[0].actual='plugin.paragraph.echo'}],
]
const hash=b=>createHash('sha256').update(b).digest('hex'),results=[]
for(const[name,mutate]of variants){const d=structuredClone(raw);mutate(d);const path=join(output,name+'.json');writeFileSync(path,JSON.stringify(d));const r=review(path,name);assert.equal(r.status,1,name+' was accepted');results.push({name,exitCode:r.status,sha256:hash(readFileSync(path)),stderr:r.stderr.slice(-1400)})}
writeFileSync(join(output,'results.json'),JSON.stringify({healthyExitCode:healthy.status,results},null,2));console.log(JSON.stringify({healthyExitCode:healthy.status,rejected:results.map(r=>r.name)}))
