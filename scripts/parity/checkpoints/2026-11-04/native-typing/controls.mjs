import assert from 'node:assert/strict'
import{createHash}from'node:crypto'
import{spawnSync}from'node:child_process'
import{mkdirSync,readFileSync,writeFileSync}from'node:fs'
import{join}from'node:path'
const[reviewer,path,candidate,output]=process.argv.slice(2),raw=JSON.parse(readFileSync(path));mkdirSync(output,{recursive:true})
const review=(file,name)=>spawnSync(process.execPath,[reviewer,file,candidate,join(output,name+'-review.json')],{encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024}),healthy=review(path,'healthy');assert.equal(healthy.status,0,healthy.stderr)
const row=d=>d.results.find(r=>r.source==='candidate'&&!r.trustedPolicy),item=(d,id)=>{const c=row(d).cases.find(c=>c.id===id);assert(c);return c},change=(d,id,p,k,fn)=>{const o=item(d,id).observations.find(o=>o.phase===p&&o.property===k);assert(o);const v=structuredClone(o.actual),result=fn(v);o.actual=o.expected=result===undefined?v:result;o.status='PASS'}
const variants=[
 ['wrong-source',d=>{d.sources[3].sha=d.sources[2].sha}],
 ['altered-module',d=>{const l=d.sources[3].loaded;l[Object.keys(l)[0]]='0'.repeat(64)}],
 ['missing-case',d=>row(d).cases.pop()],
 ['unenforced-policy',d=>{d.results.at(-1).policyEnforced=false}],
 ['page-error',d=>row(d).pageErrors.push('failure')],
 ['synthetic-beforeinput',d=>{item(d,'ascii').nativeEvents[0].trusted=false}],
 ['synthetic-undo-key',d=>{item(d,'astral').nativeEvents.at(-2).trusted=false}],
 ['stale-field-authored',d=>change(d,'ascii','action','canonical',v=>{v[0].data.text='BeforeX';v[1].data.text='AB'})],
 ['astral-duplicated',d=>change(d,'astral','action','canonical',v=>{v[1].data.text='A😀😀B'})],
 ['combining-mark-lost',d=>change(d,'combining','action','canonical',v=>{v[1].data.text='AeB'})],
 ['rich-mark-stripped',d=>change(d,'rich','action','canonical',v=>{v[1].data.text='AXB<i>CD</i>'})],
 ['backward-range-collapsed',d=>change(d,'replace-backward','select','selection',v=>{v.anchor=v.focus=1})],
 ['half-surrogate-deleted',d=>change(d,'backspace-astral','action','canonical',v=>{v[1].data.text='A\ud83dB'})],
 ['line-break-literal-newline',d=>change(d,'line-break','action','canonical',v=>{v[1].data.text='AB\nCD'})],
 ['dom-text-stale',d=>change(d,'ascii','action','domText',()=> 'AB')],
 ['dom-extra-break',d=>change(d,'line-break','redo','domBreaks',()=>2)],
 ['dom-lost-mark',d=>change(d,'rich','action','domMarks',()=>[['i','CD']])],
 ['empty-field-wrong-text',d=>change(d,'empty','action','canonical',v=>{v[1].data.text='中中'})],
 ['undo-left-duplicate-entry',d=>change(d,'delete-forward','undo','history',()=>[true,true])],
 ['redo-replaced-id',d=>change(d,'delete-break','redo','canonical',v=>{v[1].id='replacement'})],
 ['neighbor-remounted',d=>change(d,'rich','action','neighborsRetained',()=>false)],
 ['caller-mutated',d=>change(d,'empty','redo','caller',v=>{v.blocks[1].data.text='中'})],
 ['extra-native-commit',d=>item(d,'line-break').transactions.push({action:'commit',origin:'native-input',name:'native-input'})],
 ['undo-direction-lost',d=>change(d,'delete-backward','undo','selection',v=>{v.anchor=1;v.focus=4})]
]
assert.equal(variants.length,24);const results=[];for(const[name,mutate]of variants){const d=structuredClone(raw);mutate(d);const file=join(output,name+'.json'),bytes=Buffer.from(JSON.stringify(d));writeFileSync(file,bytes);const r=review(file,name);assert.equal(r.status,1,name+' was not rejected: '+r.stderr);writeFileSync(join(output,name+'.stderr'),r.stderr);results.push({name,exitCode:r.status,rawSha256:createHash('sha256').update(bytes).digest('hex')})}const report={healthyExitCode:healthy.status,results};writeFileSync(join(output,'results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report))
