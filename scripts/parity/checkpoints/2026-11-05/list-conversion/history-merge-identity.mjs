import assert from 'node:assert/strict'
import{createHash}from'node:crypto'
import{execFileSync}from'node:child_process'
import{readFileSync}from'node:fs'
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
export function verifyIdentity(d,candidate,group,parent){
 assert(d.candidatePass===true&&d.headBefore===candidate&&d.headAfter===candidate&&d.group===group&&d.filter==='');assert.deepEqual(d.serverErrors,[])
 assert.deepEqual(d.results.map(r=>[r.source,r.trustedPolicy]),[['v1',false],['spec-baseline',false],['parent',false],['candidate',false],['candidate',true]])
 assert.deepEqual(Object.fromEntries(d.sources.map(s=>[s.label,s.sha])),{v1:'5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340','spec-baseline':'e981ff308000c1d92d7e820df95113c1e19bcee8',parent,candidate})
 const own=['scripts/parity/'+group+'.mjs','tests/browser/'+group+'-fixture.js'],queries=[...new Set([...d.sources.flatMap(s=>Object.keys(s.loaded).map(p=>s.sha+':'+p)),...own.map(p=>candidate+':'+p)])],bytes=execFileSync('git',['cat-file','--batch'],{input:queries.join('\n')+'\n',maxBuffer:128*1024*1024}),blobs=new Map();let cursor=0,modules=0
 for(const q of queries){let end=bytes.indexOf(10,cursor),header=bytes.subarray(cursor,end).toString().split(' ');assert(header[1]==='blob');cursor=end+1;let size=Number(header[2]);blobs.set(q,bytes.subarray(cursor,cursor+size));cursor+=size+1}assert.equal(cursor,bytes.length)
 for(const s of d.sources){assert.equal(s.tree,execFileSync('git',['rev-parse',s.sha+'^{tree}'],{encoding:'utf8'}).trim());assert(Object.keys(s.loaded).length>85);for(const path of['core/index.js','plugins/paragraph/index.js',...(s.label==='v1'?['core/UndoManager.js']:['core/DocumentRuntime.js','core/HistoryStore.js','core/TransactionEngine.js'])])assert(s.loaded[path],path);for(const[p,h]of Object.entries(s.loaded)){assert.equal(hash(blobs.get(s.sha+':'+p)),h);modules++}}
 assert.equal(d.runnerSha256,hash(blobs.get(candidate+':'+own[0])));assert.equal(d.fixtureSha256,hash(blobs.get(candidate+':'+own[1])));assert.equal(d.packageLockSha256,hash(readFileSync('package-lock.json')))
 for(const[p,h]of Object.entries(d.dependencyFiles)){assert(!p.includes('..')&&!p.startsWith('/'));assert.equal(hash(readFileSync('node_modules/'+p)),h)}for(const[p,v]of Object.entries(d.dependencyVersions))assert.equal(JSON.parse(readFileSync('node_modules/'+p+'/package.json')).version,v)
 for(const r of d.results){assert.equal(r.policyEnforced,r.trustedPolicy);for(const k of['pageErrors','inputErrors','externalRequests','mediaRequests','unavailable'])assert.deepEqual(r[k],[]);for(const e of r.environmentRequests)assert(e.blocked&&e.type==='script'&&/^https?:\/\/gc\.kis\.v2\.scr\.kaspersky-labs\.com\/FD126C42-EBFA-4E12-B309-BB3FDD723AC1\/main.js/.test(e.url));for(const c of r.cases){assert.equal(c.error,null);assert.deepEqual(c.completedPhases,c.planned);assert(c.observations.length);for(const o of c.observations){let equal=true;try{assert.deepEqual(o.actual,o.expected)}catch{equal=false}assert.equal(o.status,equal?'PASS':'FAIL')}}}
 return{moduleIdentities:modules,identityReviewerSha256:hash(readFileSync(import.meta.filename))}
}
export const event=(role,key,modifiers)=>({role,type:'keydown',key,trusted:true,modifiers})
export const record=(id,text)=>({id,type:'paragraph',dataVersion:2,data:{text}})
export function verifyObservations(c,model){
 assert.deepEqual(c.diagnostics,[]);assert.deepEqual(c.unsupported,[]);assert.deepEqual(c.planned,[...new Set(model.observations.map(o=>o[0]))]);assert.equal(c.observations.length,model.observations.length)
 for(let i=0;i<model.observations.length;i++){const[p,k,v]=model.observations[i],o=c.observations[i];assert.deepEqual([o.phase,o.property],[p,k]);try{assert.deepEqual(o.actual,v);assert.deepEqual(o.expected,v)}catch(e){throw new Error(c.id+'/'+p+'/'+k+': '+e.message)}}assert.deepEqual(c.nativeEvents,model.native);assert.deepEqual(c.transactions,model.transactions)
}
