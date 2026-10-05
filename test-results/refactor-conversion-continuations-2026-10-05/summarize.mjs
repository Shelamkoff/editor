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
const native=jsonLines(await read('native-all.log')).find(value=>value.nativeConversionContinuations)
requireValue(native,'Full native output missing')
const groups=Object.fromEntries(Object.entries(native).filter(([name])=>name.startsWith('native')).map(([name,cases])=>{
 requireValue(Array.isArray(cases)&&cases.length>0&&cases.every(item=>item.status==='PASS'),name+' failed or empty')
 return [name,{cases:cases.length,pass:cases.length,fail:0}]
}))
const nativeCases=Object.values(groups).reduce((count,group)=>count+group.cases,0)
requireValue(groups.nativeConversionContinuations?.cases===65&&Object.keys(groups).length===22,'New native fixture missing')
const browserPages=[...(await read('browser.log')).matchAll(/^(\S+\.html?):/gm)].map(match=>match[1])
requireValue(browserPages.length===24,'Browser contract pages incomplete')
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
const v1=jsonLines(await read('v1-continuations.log')).find(value=>value['native-vone-continuations.html'])?.['native-vone-continuations.html']
requireValue(v1?.length===4&&v1.every(item=>item.status==='PASS'),'Historical oracle failed')
for(const item of v1){
 const observation=item.observation,expected=observation.control==='end'?'BraX':'Bra'
 requireValue(observation.blocks[2][1]===expected,'Unexpected historical continuation')
 if(observation.control==='backgroundCancel')requireValue(observation.focusBeforeTyping==='BODY','Historical focus differs')
}
const summary={
 verifiedAt:new Date().toISOString(),baseRevision:snapshot.baseRevision,branch:'refactor/rector-v2-architecture',
 blockPlugins:21,defaultInlineTools:12,node:nodeCounts(await read('node.log')),consumerTypes:nodeCounts(await read('consumer-types.log')),
 native:{cases:nativeCases,pass:nativeCases,fail:0,groups},browser:{pages:browserPages.length,names:browserPages},
 heap,docs,package:{...archive,...assets},production:{...production,demo:productionDemo},demo:{...demo,screenshots:screenshots.length},
 historical:{revision:JSON.parse(await read('v1-source-snapshot.json')).revision,cases:v1.length,observations:v1.map(item=>item.observation)},
 frozenSources:{files:snapshot.fileCount,allMatched:true},
}
await fs.writeFile(path.join(proof,'verification-summary.json'),JSON.stringify(summary,null,2)+'\n')
process.stdout.write(JSON.stringify({node:summary.node.tests,native:nativeCases,groups:Object.keys(groups).length,browser:browserPages.length,sources:snapshot.fileCount,screenshots:screenshots.length})+'\n')
