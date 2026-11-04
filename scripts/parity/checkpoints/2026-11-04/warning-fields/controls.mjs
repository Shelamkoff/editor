import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
const [rawPath,candidate,output]=process.argv.slice(2),root='scripts/parity/checkpoints/2026-11-04/warning-fields',raw=JSON.parse(readFileSync(rawPath));mkdirSync(output,{recursive:true})
const review=(path,name)=>spawnSync(process.env.EDITOR_PYTHON_PATH,[root+'/review.py','--raw',path,'--candidate',candidate,'--output',join(output,name+'-review.json')],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',PYTHONIOENCODING:'utf-8'}})
const healthy=review(rawPath,'healthy');assert.equal(healthy.status,0,healthy.stderr)
const row=(d,trusted=false)=>d.results.find(r=>r.source==='candidate'&&r.trustedPolicy===trusted),item=(d,id='edit/title/caret')=>{const c=row(d).cases.find(c=>c.id===id);assert(c);return c},change=(d,id,p,k,fn)=>{const o=item(d,id).observations.find(o=>o.phase===p&&o.property===k);assert(o);const v=structuredClone(o.actual);fn(v);o.actual=o.expected=v;o.status='PASS'},replace=(d,id,p,k,v)=>{const o=item(d,id).observations.find(o=>o.phase===p&&o.property===k);assert(o);o.actual=o.expected=structuredClone(v);o.status='PASS'}
const variants=[
 ['wrong-source',d=>{d.sources[3].sha=d.sources[2].sha}],
 ['altered-module',d=>{const l=d.sources[3].loaded;l[Object.keys(l)[0]]='0'.repeat(64)}],
 ['missing-case',d=>{row(d).cases.pop()}],
 ['lost-caption-edit',d=>change(d,'edit/message/caret','action','canonical',v=>{v[1].data.message='<i>Beta</i> {{capref}}<br>finish'})],
 ['wrong-backward-replacement',d=>change(d,'edit/title/backward','action','canonical',v=>{v[1].data.title='<b>X</b> {{swatch}}<br>tail'})],
 ['wrong-mixed-bold-meaning',d=>change(d,'format/remove/Text/forward','action','meaning',v=>{v[1].data.title[2].marks=['b']})],
 ['lost-caption-italic',d=>change(d,'format/apply/Element/backward','action','meaning',v=>{v[1].data.message[0].marks=['b']})],
 ['deleted-neighbor',d=>change(d,'empty/message','action','canonical',v=>{v.pop()})],
 ['lost-sidecar-id',d=>change(d,'edit/title/caret','action','sidecars',v=>{delete v[1].capref})],
 ['lost-widget-dot',d=>change(d,'format/remove/Element/forward','action','widgets',v=>{v[0][0].dot=null})],
 ['field-remounted',d=>replace(d,'edit/message/caret','action','fieldsRetained',false)],
 ['title-enter-wrote-data',d=>replace(d,'navigate/title-enter','navigate','history',[true,false])],
 ['wrong-tab-focus',d=>replace(d,'navigate/message','navigate','firstFocus',{field:0,anchor:[0,null],focus:[0,null]})],
 ['direction-collapsed',d=>replace(d,'format/apply/Text/backward','action','directedSelection',{anchor:[2,null],focus:[null,2]})],
 ['undo-lost-other-field',d=>change(d,'edit/title/caret','undo','canonical',v=>{v[1].data.message=''})],
 ['reader-editable',d=>replace(d,'edit/title/backward','roundtrip','readerFields',['true','true'])],
 ['caller-mutated',d=>change(d,'edit/message/backward','roundtrip','caller',v=>{v.blocks[1].data.title='lost'})],
 ['extra-command',d=>{item(d).transactions.push({action:'commit',origin:'native-input',name:'native-input'})}],
 ['synthetic-input',d=>{item(d).nativeEvents[0].trusted=false}],
 ['unenforced-policy',d=>{row(d,true).policyEnforced=false}],
 ['unexpected-page-error',d=>{row(d).pageErrors.push('field failure')}],
]
const results=[]
for(const[name,mutate]of variants){const d=structuredClone(raw);mutate(d);const path=join(output,name+'.json'),bytes=Buffer.from(JSON.stringify(d));writeFileSync(path,bytes);const r=review(path,name);assert.equal(r.status,1,`${name} was not rejected: ${r.stderr}`);results.push({name,exitCode:r.status,rawSha256:createHash('sha256').update(bytes).digest('hex')})}
const report={healthyExitCode:healthy.status,results};writeFileSync(join(output,'results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report))
