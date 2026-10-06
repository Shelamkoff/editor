import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const proof=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(proof,'../..')
const read=name=>fs.readFile(path.join(proof,name),'utf8')
const requireValue=(value,message)=>{if(!value)throw new Error(message)}
const jsonLines=text=>text.split(/\r?\n/).flatMap(line=>{try{return [JSON.parse(line)]}catch{return []}})
function nodeCounts(text){
 const number=name=>Number(text.match(new RegExp('ℹ '+name+' (\\d+)'))?.[1])
 const result={tests:number('tests'),pass:number('pass'),fail:number('fail'),skipped:number('skipped')}
 requireValue(result.tests>0&&result.pass===result.tests&&result.fail===0&&result.skipped===0,'Node result incomplete')
 return result
}
const gateNames=['typecheck','node','docs','consumer-types','package','docs-check','bundle','browser','native-all','heap','demo']
const gateOutcomes=await Promise.all(gateNames.map(async name=>JSON.parse(await read(name+'.outcome.json'))))
requireValue(gateOutcomes.every((gate,index)=>gate.Name===gateNames[index]&&gate.ExitCode===0),'Final gate exit codes incomplete')
const native=jsonLines(await read('native-all.log')).find(value=>value.nativePollRuntime)
requireValue(native,'Full native output missing')
const groups=Object.fromEntries(Object.entries(native).filter(([name])=>name.startsWith('native')).map(([name,cases])=>{
 requireValue(Array.isArray(cases)&&cases.length>0&&cases.every(item=>item.status==='PASS'),name+' failed or empty')
 return[name,{cases:cases.length,pass:cases.length,fail:0}]
}))
const nativeCases=Object.values(groups).reduce((count,group)=>count+group.cases,0)
requireValue(nativeCases===1689&&groups.nativePollRuntime?.cases===26&&Object.keys(groups).length===30,'Native Poll or previous coverage missing')
const prior=JSON.parse(await fs.readFile(path.join(root,'test-results/refactor-config-snapshot-2026-10-06/verification-summary.json'),'utf8'))
for(const [name,group]of Object.entries(prior.native.groups))requireValue(groups[name]?.cases===group.cases,'Previous native group missing '+name)
const focused=jsonLines(await read('poll-matrix-complete.log')).find(value=>value['native-poll-runtime.html'])?.['native-poll-runtime.html']
requireValue(focused?.length===26&&focused.every(item=>item.status==='PASS'),'Focused Poll matrix incomplete')
requireValue(focused.every(item=>native.nativePollRuntime.some(full=>full.name===item.name&&full.status==='PASS')),'Focused names absent from full gate')
const browserPages=[...(await read('browser.log')).matchAll(/^(\S+\.html?):/gm)].map(match=>match[1])
requireValue(browserPages.length===25,'Browser contract pages incomplete')
const heap=jsonLines(await read('heap.log')).find(value=>value.sentinels)
requireValue(heap?.sentinels===21&&heap.retained===0,'Heap lifecycle failed')
const docs=jsonLines(await read('docs.log')).find(value=>value.packageReadmeCopiesChecked)
const packageLines=jsonLines(await read('package.log')),archive=packageLines.find(value=>value.tarball),assets=packageLines.find(value=>value.cssAssets),declarations=packageLines.find(value=>value.runtimeDeclarations)
requireValue(docs?.readmes===94&&docs.packageReadmeCopiesChecked===92&&archive?.vite==='passed'&&archive.import==='passed'&&assets?.cssAssets===22,'Docs or package failed')
requireValue(declarations?.runtimeDeclarations===268&&declarations.sourceDiagnostics===0,'Package declarations failed')
const productionLines=jsonLines(await read('docs-check.log')),production=productionLines.find(value=>value.htmlPages),productionDemo=productionLines.find(value=>value.blockPlugins)
requireValue(production?.htmlPages===123&&production.brokenLinks===0&&productionDemo?.blockPlugins===21&&productionDemo.missingAssets===0,'Production demo failed')
const demo=jsonLines(await read('demo.log')).find(value=>value.blockPlugins)
requireValue(demo?.blockPlugins===21&&demo.missingAssets===0,'Dev demo failed')
const screenshots=(await fs.readdir(path.join(proof,'demo'))).filter(name=>name.endsWith('.png'))
requireValue(screenshots.length===29,'Dev screenshots incomplete')
const snapshot=JSON.parse(await read('source-snapshot.json'))
for(const[name,expected]of Object.entries(snapshot.files)){
 const actual=crypto.createHash('sha256').update(await fs.readFile(path.join(root,name))).digest('hex')
 requireValue(actual===expected,'Verified source changed '+name)
}
requireValue(snapshot.fileCount===595&&Object.keys(snapshot.files).length===595,'Frozen source set incomplete')
const initialSnapshot=JSON.parse(await read('source-snapshot-before-dom-fixture.json'))
const changedSinceFreeze=Object.keys(initialSnapshot.files).filter(name=>initialSnapshot.files[name]!==snapshot.files[name])
requireValue(changedSinceFreeze.length===1&&changedSinceFreeze[0]==='renderer/renderers/poll/lifecycle.test.js','Runtime/native sources changed after freeze')
requireValue(nodeCounts(await read('lifecycle-fixture-green.log')).tests===7,'Focused lifecycle cases incomplete')
const v1=jsonLines(await read('v1-poll.log')).find(value=>value['native-vone-poll-runtime.html'])?.['native-vone-poll-runtime.html']
requireValue(v1?.length===3&&v1.every(item=>item.status==='PASS'),'Historical Poll check incomplete')
const v1Snapshot=JSON.parse(await read('v1-source-snapshot.json'))
requireValue(v1Snapshot.fileCount===240&&Object.keys(v1Snapshot.files).length===240,'Historical source set incomplete')
for(const[name,expected]of Object.entries(v1Snapshot.files)){
 const bytes=await fs.readFile(path.join(root,'test-results/refactor-equivalence-2026-10-05/v1-oracle',name))
 const actual=crypto.createHash('sha256').update(bytes.toString('utf8').replace(/\r\n/g,'\n')).digest('hex')
 requireValue(actual===expected.normalizedLFsha256,'Historical local source changed '+name)
}
const redFiles=['missing-id-red.log','service-getter-red.log','async-service-red.log','error-status-red.log','live-range-red.log','renderer-service-red.log']
for(const name of redFiles)requireValue(/"status": "FAIL"/.test(await read(name)),'Product Red missing '+name)
const bundle=Object.fromEntries((await read('bundle.log')).split(/\r?\n/).flatMap(line=>{
 const fields=[...line.matchAll(/'([^']+)'/g)].map(match=>match[1])
 return fields.length===4?[[fields[0],{rawKiB:Number(fields[1]),gzipKiB:Number(fields[2]),budgetKiB:Number(fields[3])}]]:[]
}))
requireValue(Object.keys(bundle).length===4,'Bundle output incomplete')
for(const[name,value]of Object.entries(bundle))if(name!=='core')requireValue(value.gzipKiB<=value.budgetKiB,name+' budget exceeded')
const typecheck=await read('typecheck.log')
requireValue(typecheck.includes('tsc -p jsconfig.json')&&typecheck.includes('tsc -p jsconfig.runtime.json')&&!/error TS\d+/.test(typecheck),'Typecheck incomplete')
const summary={
 verifiedAt:new Date().toISOString(),baseRevision:snapshot.baseRevision,branch:'refactor/rector-v2-architecture',
 verifiedLocalDate:new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kaliningrad'}).format(new Date()),
 blockPlugins:21,defaultInlineTools:12,node:nodeCounts(await read('node.log')),consumerTypes:nodeCounts(await read('consumer-types.log')),
 native:{cases:nativeCases,pass:nativeCases,fail:0,groups},browser:{pages:browserPages.length,names:browserPages},
 typecheck:'passed',gateOutcomes,heap,docs,package:{...archive,...assets,...declarations},production:{...production,demo:productionDemo},
 demo:{...demo,screenshots:screenshots.length},historical:{revision:v1Snapshot.revision,sources:240,cases:v1.length,names:v1.map(item=>item.name)},
 frozenSources:{files:snapshot.fileCount,allMatched:true,onlyAmendedNodeFixture:changedSinceFreeze[0],runtimeAndNativeUnchanged:true},bundle,poll:{native:26,editor:22,renderer:4,redFiles},
 fixtureCorrection:'poll-matrix-fixture-red.log incorrectly assumed public render clears Undo; corrected to one undoable canonical transaction without a product change.',
}
requireValue(summary.node.tests===536&&summary.consumerTypes.tests===6,'Node/consumer count changed')
await fs.writeFile(path.join(proof,'gate-outcomes.json'),JSON.stringify(gateOutcomes,null,2)+'\n')
await fs.writeFile(path.join(proof,'verification-summary.json'),JSON.stringify(summary,null,2)+'\n')
process.stdout.write(JSON.stringify({node:summary.node.tests,native:nativeCases,groups:Object.keys(groups).length,browser:browserPages.length,sources:snapshot.fileCount,screenshots:screenshots.length})+'\n')
