import assert from 'node:assert/strict'
import{createHash}from'node:crypto'
import{spawnSync}from'node:child_process'
import{mkdirSync,readFileSync,writeFileSync}from'node:fs'
import{join}from'node:path'
const[reviewer,path,candidate,output]=process.argv.slice(2),raw=JSON.parse(readFileSync(path));mkdirSync(output,{recursive:true})
const review=(file,name)=>spawnSync(process.execPath,[reviewer,file,candidate,join(output,name+'-review.json')],{encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024}),healthy=review(path,'healthy');assert.equal(healthy.status,0,healthy.stderr)
const row=d=>d.results.find(r=>r.source==='candidate'&&!r.trustedPolicy),item=(d,id)=>{const c=row(d).cases.find(c=>c.id===id);assert(c);return c},change=(d,id,p,k,fn)=>{const o=item(d,id).observations.find(o=>o.phase===p&&o.property===k);assert(o);const v=structuredClone(o.actual),result=fn(v);o.actual=o.expected=result===undefined?v:result;o.status='PASS'}
const variants=[
 ['wrong-source',d=>{d.sources[3].sha=d.sources[2].sha}],['altered-module',d=>{const l=d.sources[3].loaded;l[Object.keys(l)[0]]='0'.repeat(64)}],['missing-case',d=>row(d).cases.pop()],['unenforced-policy',d=>{d.results.at(-1).policyEnforced=false}],['page-error',d=>row(d).pageErrors.push('failure')],
 ['synthetic-space',d=>{item(d,'pattern/0/Space').nativeEvents[0].trusted=false}],
 ['shift-enter-lost',d=>{item(d,'pattern/3/ShiftEnter').nativeEvents[0].modifiers=0}],
 ['default-value-wrong',d=>change(d,'public/false/false','action','canonical',v=>{v[1].inline.inserted.data.value='#000000'})],
 ['alpha-payload-normalized',d=>change(d,'public/true/true','action','canonical',v=>{v[1].inline.inserted.data.value='rgba(171,205,239,0.5)'})],
 ['wrong-swatch',d=>change(d,'pattern/4/Space','action','projection',v=>{v.dot='rgb(0, 0, 0)'})],
 ['missing-aria',d=>change(d,'pattern/5/Enter','action','projection',v=>{v.aria=null})],
 ['prefix-mark-lost',d=>change(d,'public/true/false','action','canonical',v=>{v[1].data.text='Al{{inserted}}a tail'})],
 ['enter-invents-block',d=>change(d,'pattern/6/Enter','action','canonical',v=>{v.splice(2,0,{id:'extra',type:'paragraph',dataVersion:2,data:{text:''}})})],
 ['delimiter-duplicated',d=>change(d,'pattern/1/Space','action','canonical',v=>{v[1].data.text+=' '})],
 ['public-result-false',d=>change(d,'public/false/true','action','publicResult',()=>false)],
 ['public-caller-mutated',d=>change(d,'public/true/false','action','publicCaller',v=>{v.value='#000000'})],
 ['preview-commits',d=>change(d,'popup/apply','action','previewHistory',()=>[true,false])],
 ['cancel-commits',d=>change(d,'popup/cancel','action','canonical',v=>{v[1].inline.swatchA.data.value='#ff0000'})],
 ['noop-transaction',d=>{item(d,'popup/noop').transactions.push({action:'commit',origin:'plugin',name:'inline-widget.update'})}],
 ['popup-focus-lost',d=>change(d,'popup/apply','action','widgetFocused',()=>false)],
 ['undo-direction-lost',d=>change(d,'public/false/true','undo','nativeSelection',v=>{[v.anchor,v.focus]=[v.focus,v.anchor]})],
 ['redo-id-drift',d=>change(d,'pattern/0/ShiftEnter','redo','canonical',v=>{v[1].id='different'})],
 ['widget-duplicated',d=>change(d,'public/true/true','action','widgets',()=>2)],
 ['caller-mutated',d=>change(d,'pattern/2/Enter','redo','caller',v=>{v.blocks[1].data.text='changed'})]
];assert.equal(variants.length,24);const results=[];for(const[name,mutate]of variants){const d=structuredClone(raw);mutate(d);const file=join(output,name+'.json'),bytes=Buffer.from(JSON.stringify(d));writeFileSync(file,bytes);const r=review(file,name);assert.equal(r.status,1,name+' was not rejected: '+r.stderr);writeFileSync(join(output,name+'.stderr'),r.stderr);results.push({name,exitCode:r.status,rawSha256:createHash('sha256').update(bytes).digest('hex')})}const report={group:raw.group,healthyExitCode:healthy.status,results};writeFileSync(join(output,'results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report))
