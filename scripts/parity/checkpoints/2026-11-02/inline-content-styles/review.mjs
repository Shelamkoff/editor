import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {resolve} from 'node:path'
import {isDeepStrictEqual} from 'node:util'
const [directory,parityPath,candidateRef]=process.argv.slice(2)
assert(directory&&parityPath&&candidateRef,'Provide frozen run, FONT differential and candidate ref')
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
const git=(...args)=>execFileSync('git',args,{maxBuffer:64*1024*1024})
const sha=ref=>git('rev-parse',ref).toString().trim()
const json=async path=>JSON.parse((await readFile(path,'utf8')).replace(/^\uFEFF/,''))
const manifest=await json(resolve(directory,'manifest.json')),candidate=sha(candidateRef)
assert.equal(manifest.outcome,'passed');assert.equal(manifest.sourceUnchanged,true)
assert.equal(manifest.source.head,candidate);assert.equal(manifest.source.dirty,false)
assert.deepEqual(Object.keys(manifest.gates),['build','node','types','browser','native','glyph','navigation','heap','docs','package','site'])
for(const gate of Object.values(manifest.gates)){assert.equal(gate.outcome,'passed');assert.equal(gate.exitCode,0);assert.equal(gate.sourceUnchanged,true);assert.equal(gate.sourceBefore.identity,manifest.source.identity)}
const text=await readFile(resolve(directory,'native.log'),'utf8'),start=text.lastIndexOf('{"enterScenario":')
assert(start!==-1,'Missing complete native aggregate')
const native=JSON.parse(text.slice(start)),groups=Object.entries(native).filter(([name,value])=>name.startsWith('native')&&Array.isArray(value))
assert.equal(groups.length,50);assert.equal(groups.reduce((count,[name,rows])=>count+rows.length,0),2757)
for(const[name,rows]of groups)for(const row of rows)assert.equal(row.status,'PASS',name+'/'+row.name)
assert.equal(native.nativeInlineContentStyles.length,33)
const glyph=await json(resolve(directory,'glyph.log'))
assert.equal(glyph.source.head,candidate);assert.equal(glyph.source.patch,hash(''))
assert.deepEqual(glyph.results.map(row=>row.kind),['native-benign','native-hostile','editor','renderer'])
for(const row of glyph.results){
 assert.deepEqual(row.errors,[]);assert.equal(row.view.inputUnchanged,true)
 assert.equal(row.view.fontSize,'201px');assert.equal(row.view.fontStyle,'italic')
 assert.equal(hash(await readFile(resolve('test-results/inline-content-glyph',row.kind+'.png'))),row.pngSha256)
 if(row.kind==='native-hostile'){assert.equal(row.view.position,'fixed');assert.equal(row.host.clicks,0)}
 else{assert.equal(row.view.position,'static');assert.equal(row.host.clicks,1);assert.equal(row.host.trusted,true)}
 if(['editor','renderer'].includes(row.kind)){assert.equal(row.sameGlyphPng,true);assert.equal(row.pngSha256,glyph.results[0].pngSha256)}
}
const navigation=await json(resolve(directory,'navigation.log'))
assert.equal(navigation.head,candidate);assert.equal(navigation.candidatePass,true);assert.equal(navigation.sourceUnchanged,true);assert.equal(navigation.results.length,72)
for(const row of navigation.results){assert.equal(row.status,'PASS');assert.deepEqual(row.candidate.actual,row.control.actual);assert.equal(row.control.actual.settled,true)}
const parity=await json(parityPath),ids=Array.from({length:9},(_,index)=>'PRESENTATION_VALUES_FONT_'+(index+1)).concat(['PRESENTATION_VALUES_CLASS_SPAN','PRESENTATION_VALUES_CLASS_CODE'])
const pixels=[16,16.5,30,30,24,30,201,250,20,30,30]
assert.equal(parity.headBefore,candidate);assert.equal(parity.headAfter,candidate);assert.equal(parity.sourceUnchanged,true);assert.equal(parity.sourceIdentityVerified,true);assert.deepEqual(parity.serverErrors,[])
let observations=0,modules=0,historicalDifferences=0
for(const source of parity.sources){
 assert.equal(source.label==='candidate'?sha(source.sha):source.sha,source.label==='candidate'?candidate:source.label==='v1'?sha('5e5c7f8'):sha('e981ff3'))
 for(const[path,digest]of Object.entries(source.loaded)){assert.equal(hash(git('show',`${source.sha}:${path}`)),digest);modules++}
 const result=parity.results.find(row=>row.source===source.label);assert(result);assert.deepEqual(result.errors,[]);assert.deepEqual(result.cases.map(row=>row.id),ids)
 for(const[index,entry]of result.cases.entries()){
  assert.equal(entry.observations.length,48);assert.deepEqual(entry.phases.map(phase=>phase.phase),['load-save-render','neighbor-edit','undo','redo']);assert.deepEqual(entry.unexpectedFailures,[])
  const failed=[]
  for(const item of entry.observations){const pass=isDeepStrictEqual(item.actual,item.expected);assert.equal(item.status,pass?'PASS':'FAIL');observations++;if(!pass)failed.push(item)
   if(['editorCssMeaning','rendererCssMeaning'].includes(item.property)){const expected={base:20,root:16,sample:pixels[index],...(index>8?{color:'rgb(12, 84, 156)'}:{})};assert.deepEqual(item.actual,expected);assert.deepEqual(item.expected,expected)}
  }
  assert.deepEqual(entry.failures,failed)
  if(source.label==='v1'){assert.equal(failed.length,2);for(const item of failed){assert.equal(item.property,'neighborDomIdentity');assert(['undo','redo'].includes(item.phase));assert.equal(item.actual,false);assert.equal(item.expected,true)};assert.deepEqual(entry.classifiedDifferences,failed.map(item=>({...item,classification:'repaired-v1-history-remount'})));historicalDifferences+=failed.length}
  else{assert.deepEqual(failed,[]);assert.deepEqual(entry.classifiedDifferences,[])}
 }
}
assert.equal(observations,1584);assert.equal(historicalDifferences,22)
console.log(JSON.stringify({candidate,frozenRun:directory,gates:11,nativeGroups:50,nativeCases:2757,inlineCases:33,navigationComparisons:72,glyphs:'native byte-identical',fontObservations:observations,historicalDifferences,verifiedProductionModules:modules,status:'PASS'},null,2))
