import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
const [rawPath,redPath,candidate,output]=process.argv.slice(2)
const root='scripts/parity/checkpoints/2026-11-04/slash-menu',raw=JSON.parse(readFileSync(rawPath))
mkdirSync(output,{recursive:true})
const review=(path,name)=>spawnSync(process.env.EDITOR_PYTHON_PATH,[root+'/review.py','--raw',path,'--red',redPath,'--candidate',candidate,'--output',join(output,name+'-review.json')],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',PYTHONIOENCODING:'utf-8'}})
const healthy=review(rawPath,'healthy');assert.equal(healthy.status,0,healthy.stderr)
const row=(d,trusted=false)=>d.results.find(r=>r.source==='candidate'&&r.trustedPolicy===trusted)
const item=(d,id='pointer')=>{const c=row(d).cases.find(c=>c.id===id);assert.ok(c);return c}
const replace=(d,id,p,k,v)=>{const o=item(d,id).observations.find(o=>o.phase===p&&o.property===k);assert.ok(o);o.actual=o.expected=structuredClone(v);o.status='PASS'}
const variants=[
 ['wrong-source',d=>{d.sources[3].sha=d.sources[2].sha}],
 ['altered-module',d=>{const l=d.sources[3].loaded;l[Object.keys(l)[0]]='0'.repeat(64)}],
 ['missing-case',d=>{row(d).cases.pop()}],
 ['missing-observation',d=>{item(d).observations.pop()}],
 ['fake-completion',d=>{item(d).completedPhases.pop()}],
 ['menu-items-replaced',d=>replace(d,'pointer','move','nodesRetained',false)],
 ['hover-dom-churn',d=>replace(d,'repeat','move','childReplacements',3)],
 ['wrong-keyboard-target',d=>replace(d,'hover-keyboard','action','meaning',[{type:'quote',data:{text:'',caption:''}}])],
 ['filter-left-query',d=>replace(d,'filter','action','canonical',[{id:'a',type:'paragraph',dataVersion:2,data:{text:'/qu'}}])],
 ['cancel-absorbed-history',d=>replace(d,'escape','undo-action','history',[false,true])],
 ['empty-enter-authored',d=>replace(d,'no-results','action','emptyEnterHistory',[true,true])],
 ['outside-closed-too-late',d=>replace(d,'outside','action','closed',false)],
 ['retired-mode-wrote',d=>replace(d,'lifetime/mode','retire','canonical',[])],
 ['retired-render-closed-successor',d=>replace(d,'lifetime/render','fresh','successorVisible',false)],
 ['old-destroy-killed-successor',d=>replace(d,'lifetime/destroy','fresh','oldDestroyKeptSuccessor',false)],
 ['native-click-missed',d=>{item(d).nativeEvents.find(e=>e.type==='mousedown').hit=false}],
 ['synthetic-input',d=>{item(d).nativeEvents[0].trusted=false}],
 ['lost-transaction',d=>{item(d).transactions.pop()}],
 ['extra-author-command',d=>{item(d).transactions.push({action:'commit',origin:'user',name:'slash.block'})}],
 ['unhit-control',d=>{item(d).pointTrace[0].hit=false}],
 ['unenforced-policy',d=>{row(d,true).policyEnforced=false}],
 ['unexpected-page-error',d=>{row(d).pageErrors.push('lost owner')}],
 ['unexpected-network',d=>{row(d).externalRequests.push({url:'https://example.test/unexpected'})}],
 ['hidden-diagnostic',d=>{item(d).diagnostics.push({code:'bad'})}],
]
const results=[]
for(const[name,mutate]of variants){const d=structuredClone(raw);mutate(d);const path=join(output,name+'.json'),bytes=Buffer.from(JSON.stringify(d));writeFileSync(path,bytes);const r=review(path,name);assert.equal(r.status,1,`${name} was not rejected: ${r.stderr}`);results.push({name,exitCode:r.status,rawSha256:createHash('sha256').update(bytes).digest('hex')})}
const report={healthyExitCode:healthy.status,results};writeFileSync(join(output,'results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report))
