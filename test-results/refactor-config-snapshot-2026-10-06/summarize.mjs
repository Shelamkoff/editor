import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const proof=path.dirname(fileURLToPath(import.meta.url))
const root=path.resolve(proof,'../..')
const read=name=>fs.readFile(path.join(proof,name),'utf8')
const requireValue=(value,message)=>{if(!value)throw new Error(message)}
const jsonLines=text=>text.split(/\r?\n/).flatMap(line=>{try{return [JSON.parse(line)]}catch{return []}})
function nodeCounts(text){
 const number=name=>Number(text.match(new RegExp('ℹ '+name+' (\\d+)'))?.[1])
 const result={tests:number('tests'),pass:number('pass'),fail:number('fail'),skipped:number('skipped')}
 requireValue(result.tests>0&&result.pass===result.tests&&result.fail===0&&result.skipped===0,'Node results incomplete')
 return result
}
const gateOutcomes=JSON.parse((await read('gate-outcomes.json')).replace(/^\uFEFF/,''))
requireValue(gateOutcomes.length===11&&new Set(gateOutcomes.map(gate=>gate.Name)).size===11&&gateOutcomes.every(gate=>gate.ExitCode===0),'Final gate exit codes incomplete')
const native=jsonLines(await read('native-all.log')).find(value=>value.nativeConfigSnapshot)
requireValue(native,'Full native output missing')
const groups=Object.fromEntries(Object.entries(native).filter(([name])=>name.startsWith('native')).map(([name,cases])=>{
 requireValue(Array.isArray(cases)&&cases.length>0&&cases.every(item=>item.status==='PASS'),name+' failed or empty')
 return [name,{cases:cases.length,pass:cases.length,fail:0}]
}))
const nativeCases=Object.values(groups).reduce((count,group)=>count+group.cases,0)
requireValue(nativeCases===1663&&groups.nativeConfigSnapshot?.cases===30&&groups.nativeSourceModes?.cases===61&&Object.keys(groups).length===29,'New native fixture missing')
const prior=JSON.parse(await fs.readFile(path.join(root,'test-results/refactor-source-modes-2026-10-06/verification-summary.json'),'utf8'))
for(const [name,group] of Object.entries(prior.native.groups))requireValue(groups[name]?.cases===group.cases,'Previous group missing '+name)
const firstNative=jsonLines(await read('native-all-before-methods.log')).find(value=>value.nativeConfigSnapshot)
const firstGroups=Object.entries(firstNative??{}).filter(([name])=>name.startsWith('native'))
const firstCases=firstGroups.reduce((count,[,cases])=>count+cases.length,0)
requireValue(firstCases===1651&&firstGroups.length===29&&firstGroups.every(([,cases])=>cases.every(item=>item.status==='PASS')),'First checkpoint observations incomplete')
const browserPages=[...(await read('browser.log')).matchAll(/^(\S+\.html?):/gm)].map(match=>match[1])
requireValue(browserPages.length===25,'Browser contract pages incomplete')
const heap=jsonLines(await read('heap.log')).find(value=>value.sentinels)
requireValue(heap?.sentinels===21&&heap.retained===0,'Heap lifecycle failed')
const docs=jsonLines(await read('docs.log')).find(value=>value.packageReadmeCopiesChecked)
const packageLines=jsonLines(await read('package.log')),archive=packageLines.find(value=>value.tarball),assets=packageLines.find(value=>value.cssAssets)
requireValue(docs?.readmes===94&&archive?.vite==='passed'&&archive.import==='passed'&&assets?.cssAssets===22,'Docs or package failed')
const productionLines=jsonLines(await read('docs-check.log')),production=productionLines.find(value=>value.htmlPages),productionDemo=productionLines.find(value=>value.blockPlugins)
requireValue(production?.htmlPages===123&&production.brokenLinks===0&&productionDemo?.blockPlugins===21&&productionDemo.missingAssets===0,'Production demo failed')
const demo=jsonLines(await read('demo.log')).find(value=>value.blockPlugins)
requireValue(demo?.blockPlugins===21&&demo.missingAssets===0,'Dev demo failed')
const screenshots=(await fs.readdir(path.join(proof,'demo'))).filter(name=>name.endsWith('.png'))
requireValue(screenshots.length===29,'Dev screenshots incomplete')
const snapshot=JSON.parse(await read('source-snapshot.json'))
for(const [name,expected] of Object.entries(snapshot.files)){
 const actual=crypto.createHash('sha256').update(await fs.readFile(path.join(root,name))).digest('hex')
 requireValue(actual===expected,'Verified source changed: '+name)
}
requireValue(snapshot.fileCount===593,'Source set incomplete')
const v1=jsonLines(await read('v1-config.log')).find(value=>value['native-vone-config-snapshot.html'])?.['native-vone-config-snapshot.html']
requireValue(v1?.length===27&&v1.every(item=>item.status==='PASS'),'Historical config check incomplete')
const getterCases=v1.filter(item=>item.observation.reads)
const recordCases=v1.filter(item=>item.observation.aliased)
requireValue(getterCases.length===21&&getterCases.every(item=>Object.values(item.observation.reads).every(reads=>reads===1)&&item.observation.callerFrozen===false),'Historical getter count differs')
requireValue(recordCases.length===6,'Historical record aliases incomplete')
const configNode=nodeCounts(await read('config-complete-green.log'))
requireValue(configNode.tests===58,'Focused configuration tests incomplete')
const configNative=jsonLines(await read('native-config-matrix.log')).find(value=>value['native-config-snapshot.html'])?.['native-config-snapshot.html']
requireValue(configNative?.length===30&&configNative.every(item=>item.status==='PASS'),'Focused native configuration checks incomplete')
const redFiles=['style-getter-red.log','config-matrix-red.log','async-config-red.log','action-record-red.log','record-matrix-red.log','async-record-red.log','record-methods-red.log']
for(const name of redFiles)requireValue(/FAIL|ℹ fail [1-9]/.test(await read(name)),'Red proof missing '+name)
const methods=jsonLines(await read('record-methods-green.log')).find(value=>value['native-config-record-methods.html'])?.['native-config-record-methods.html']
requireValue(methods?.length===12&&methods.every(item=>item.status==='PASS'),'Method receiver proof incomplete')
const bundle=Object.fromEntries((await read('bundle.log')).split(/\r?\n/).flatMap(line=>{
 const fields=[...line.matchAll(/'([^']+)'/g)].map(match=>match[1])
 return fields.length===4?[[fields[0],{rawKiB:Number(fields[1]),gzipKiB:Number(fields[2]),budgetKiB:Number(fields[3])}]]:[]
}))
requireValue(Object.keys(bundle).length===4,'Bundle output incomplete')
for(const [name,value] of Object.entries(bundle))if(name!=='core')requireValue(value.gzipKiB<=value.budgetKiB,name+' bundle exceeds budget')
const typecheck=await read('typecheck.log')
requireValue(typecheck.includes('tsc -p jsconfig.json')&&typecheck.includes('tsc -p jsconfig.runtime.json')&&!/error TS\d+/.test(typecheck),'Typecheck incomplete')
const declarations=packageLines.find(value=>value.runtimeDeclarations)
requireValue(declarations?.runtimeDeclarations===268&&declarations.sourceDiagnostics===0,'Package declarations failed')
const summary={
 verifiedAt:new Date().toISOString(),baseRevision:snapshot.baseRevision,branch:'refactor/rector-v2-architecture',verifiedLocalDate:new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kaliningrad'}).format(new Date()),
 blockPlugins:21,defaultInlineTools:12,node:nodeCounts(await read('node.log')),consumerTypes:nodeCounts(await read('consumer-types.log')),
 native:{cases:nativeCases,pass:nativeCases,fail:0,groups},browser:{pages:browserPages.length,names:browserPages},
 typecheck:'passed',gateOutcomes,heap,docs,package:{...archive,...assets,...declarations},production:{...production,demo:productionDemo},demo:{...demo,screenshots:screenshots.length},
 historical:{revision:JSON.parse(await read('v1-source-snapshot.json')).revision,cases:v1.length,observations:v1.map(item=>item.observation)},
 frozenSources:{files:snapshot.fileCount,allMatched:true},bundle,
 firstCheckpoint:{nativeCases:firstCases,methodCasesNotYetIncluded:true,devDemo:'local server was stopped; see demo-before-methods.log'},
 configuration:{node:configNode,native:{cases:configNative.length,pass:configNative.length},methodReceiverCases:methods.length,historicalGetterCases:getterCases.length,historicalAliasCases:recordCases.length,redFiles},
}
requireValue(summary.node.tests===536&&summary.consumerTypes.tests===6,'Node/consumer gate changed')
await fs.writeFile(path.join(proof,'verification-summary.json'),JSON.stringify(summary,null,2)+'\n')
process.stdout.write(JSON.stringify({node:summary.node.tests,native:nativeCases,groups:Object.keys(groups).length,browser:browserPages.length,sources:snapshot.fileCount,screenshots:screenshots.length})+'\n')
