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
const native=jsonLines(await read('native-all.log')).find(value=>value.nativeSourceModes)
requireValue(native,'Full native output missing')
const groups=Object.fromEntries(Object.entries(native).filter(([name])=>name.startsWith('native')).map(([name,cases])=>{
 requireValue(Array.isArray(cases)&&cases.length>0&&cases.every(item=>item.status==='PASS'),name+' failed or empty')
 return [name,{cases:cases.length,pass:cases.length,fail:0}]
}))
const nativeCases=Object.values(groups).reduce((count,group)=>count+group.cases,0)
requireValue(nativeCases===1633&&groups.nativeSourceModes?.cases===61&&groups.nativeSourceIndentation?.cases===50&&Object.keys(groups).length===28,'New native fixture missing')
const prior=JSON.parse(await fs.readFile(path.join(root,'test-results/refactor-source-indentation-2026-10-05/verification-summary.json'),'utf8'))
for(const [name,group] of Object.entries(prior.native.groups))requireValue(groups[name]?.cases===group.cases,'Previous group missing '+name)
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
requireValue(snapshot.fileCount===589,'Source set incomplete')
const v1=jsonLines(await read('v1-source-modes.log')).find(value=>value['native-vone-source-modes.html'])?.['native-vone-source-modes.html']
requireValue(v1?.length===8&&v1.every(item=>item.status==='PASS'),'Historical native mode check incomplete')
for(const {observation} of v1){
 requireValue(observation.focused===(observation.name==='Code'),'Historical focus differs')
 requireValue(JSON.stringify(observation.rangeBefore)===JSON.stringify(observation.rangeAfter),'Historical range differs')
}
const historicalStyles=jsonLines(await read('v1-style-ownership.log')).find(value=>value['native-vone-style-ownership.html'])?.['native-vone-style-ownership.html']
requireValue(historicalStyles?.length===3&&historicalStyles.every(item=>item.status==='PASS'&&item.observation.plugins.length===21),'Historical styles incomplete')
const styleMatrix=JSON.parse((await read('style-ownership-browser.log')).split('plugin-style-ownership.html: ')[1])
requireValue(styleMatrix.length===63&&styleMatrix.every(item=>item.status==='PASS'),'Browser stylesheet ownership failed')
const styleNode=nodeCounts(await read('style-ownership-green.log'))
requireValue(styleNode.tests===42,'Style node proof missing')
const modes=jsonLines(await read('source-modes-matrix.log')).find(value=>value['native-source-modes.html'])?.['native-source-modes.html']
requireValue(modes?.length===61&&modes.every(item=>item.status==='PASS'),'Focused mode proof incomplete')
const faults=jsonLines(await read('readme-validation-green.log')).find(value=>value.observations)?.observations
requireValue(faults?.length===3&&faults.every(item=>item.exitCode===1),'README faults were not rejected')
requireValue((await read('source-modes-red.log')).includes('Returning from HTML preview stranded focus'),'Native red missing')
requireValue((await read('style-ownership-red.log')).includes('ℹ fail 22'),'Styles red missing')
const bundle=Object.fromEntries((await read('bundle.log')).split(/\r?\n/).flatMap(line=>{
 const fields=[...line.matchAll(/'([^']+)'/g)].map(match=>match[1])
 return fields.length===4?[[fields[0],{rawKiB:Number(fields[1]),gzipKiB:Number(fields[2]),budgetKiB:Number(fields[3])}]]:[]
}))
requireValue(Object.keys(bundle).length===4,'Bundle output incomplete')
for(const [name,value] of Object.entries(bundle))if(name!=='core')requireValue(value.gzipKiB<=value.budgetKiB,name+' bundle exceeds budget')
const typecheck=await read('typecheck.log')
requireValue(typecheck.includes('tsc -p jsconfig.json')&&typecheck.includes('tsc -p jsconfig.runtime.json')&&!/error TS\d+/.test(typecheck),'Typecheck incomplete')
const declarations=packageLines.find(value=>value.runtimeDeclarations)
requireValue(declarations?.runtimeDeclarations===267&&declarations.sourceDiagnostics===0,'Package declarations failed')
const summary={
 verifiedAt:new Date().toISOString(),baseRevision:snapshot.baseRevision,branch:'refactor/rector-v2-architecture',verifiedLocalDate:new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kaliningrad'}).format(new Date()),
 blockPlugins:21,defaultInlineTools:12,node:nodeCounts(await read('node.log')),consumerTypes:nodeCounts(await read('consumer-types.log')),
 native:{cases:nativeCases,pass:nativeCases,fail:0,groups},browser:{pages:browserPages.length,names:browserPages},
 typecheck:'passed',heap,docs,package:{...archive,...assets,...declarations},production:{...production,demo:productionDemo},demo:{...demo,screenshots:screenshots.length},
 historical:{revision:JSON.parse(await read('v1-source-snapshot.json')).revision,cases:v1.length,observations:v1.map(item=>item.observation)},
 frozenSources:{files:snapshot.fileCount,allMatched:true},bundle,
 modeContinuation:{cases:modes.length,pass:modes.length},styleOwnership:{node:styleNode,browserCases:styleMatrix.length,historical:historicalStyles.map(item=>item.observation)},readmeFaults:faults,
}
requireValue(summary.node.tests===478&&summary.consumerTypes.tests===6,'Node/consumer gate changed')
await fs.writeFile(path.join(proof,'verification-summary.json'),JSON.stringify(summary,null,2)+'\n')
process.stdout.write(JSON.stringify({node:summary.node.tests,native:nativeCases,groups:Object.keys(groups).length,browser:browserPages.length,sources:snapshot.fileCount,screenshots:screenshots.length})+'\n')
