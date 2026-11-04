import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
const [rawPath,redPath,revocationPath,revocationRedPath,pointerPath,pointerRedPath,candidate,output]=process.argv.slice(2)
const root='scripts/parity/checkpoints/2026-11-04/slash-scroll',raw=JSON.parse(readFileSync(rawPath));mkdirSync(output,{recursive:true})
const review=(path,name)=>spawnSync(process.env.EDITOR_PYTHON_PATH,[root+'/review.py','--raw',path,'--red',redPath,'--revocation',revocationPath,'--revocation-red',revocationRedPath,'--pointer',pointerPath,'--pointer-red',pointerRedPath,'--candidate',candidate,'--output',join(output,name+'-review.json')],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',PYTHONIOENCODING:'utf-8'}})
const healthy=review(rawPath,'healthy');assert.equal(healthy.status,0,healthy.stderr)
const row=(d,trusted=false)=>d.results.find(r=>r.source==='candidate'&&r.trustedPolicy===trusted),item=(d,id='down')=>{const c=row(d).cases.find(c=>c.id===id);assert(c);return c}
const replace=(d,id,p,k,v)=>{const o=item(d,id).observations.find(o=>o.phase===p&&o.property===k);assert(o);o.actual=o.expected=structuredClone(v);o.status='PASS'}
const variants=[
 ['wrong-source',d=>{d.sources[3].sha=d.sources[2].sha}],
 ['altered-module',d=>{const l=d.sources[3].loaded;l[Object.keys(l)[0]]='0'.repeat(64)}],
 ['missing-case',d=>{row(d).cases.pop()}],
 ['down-hover-stole-step',d=>replace(d,'down','navigate','active-6',2)],
 ['up-hover-stole-step',d=>replace(d,'up','navigate','active-7',24)],
 ['wrap-tab-selected-hover',d=>replace(d,'wrap','action','canonical',[{id:'a',type:'choice-5',dataVersion:1,data:{text:'',caption:''}}])],
 ['scrolled-pointer-missed',d=>{item(d,'pointer').nativeEvents.find(e=>e.type==='mousedown').hit=false}],
 ['keyboard-replaced-items',d=>replace(d,'down','navigate','nodesRetained',false)],
 ['menu-did-not-scroll',d=>replace(d,'up','navigate','scrollMoved',false)],
 ['undo-lost-query',d=>replace(d,'down','undo-action','canonical',[])],
 ['synthetic-query',d=>{item(d).nativeEvents[0].trusted=false}],
 ['extra-command',d=>{item(d).transactions.push({action:'commit',origin:'user',name:'slash.block'})}],
 ['unenforced-policy',d=>{row(d,true).policyEnforced=false}],
 ['unexpected-page-error',d=>{row(d).pageErrors.push('scroll failure')}],
]
const results=[]
for(const[name,mutate]of variants){const d=structuredClone(raw);mutate(d);const b=Buffer.from(JSON.stringify(d)),path=join(output,name+'.json');writeFileSync(path,b);const r=review(path,name);assert.equal(r.status,1,`${name} was not rejected: ${r.stderr}`);results.push({name,exitCode:r.status,rawSha256:createHash('sha256').update(b).digest('hex')})}
const report={healthyExitCode:healthy.status,results};writeFileSync(join(output,'results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report))
