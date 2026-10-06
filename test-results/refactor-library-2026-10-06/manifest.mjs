
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const proof=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(proof,'../..')
const summary=JSON.parse(fs.readFileSync(path.join(proof,'verification-summary.json'),'utf8'))
if(summary.gateOutcomes.some(gate=>gate.ExitCode!==0))throw new Error('Incomplete gates')
const changed=execFileSync('git',['-c','core.safecrlf=false','diff','--name-only'],{cwd:root}).toString().trim().split(/\r?\n/).filter(Boolean)
const untracked=execFileSync('git',['ls-files','--others','--exclude-standard'],{cwd:root}).toString().trim().split(/\r?\n/).filter(Boolean)
const allowedNew=new Set(['RECTOR_V2_LIBRARY_AUDIT_2026-10-06.md','inline-plugins/mention.config.test.js','renderer/schema-ownership.test.js','shared/snapshotDataSchema.js','tests/browser/native-library-boundaries.html','tests/browser/native-library-boundaries.js'])
for(const name of untracked)if(!allowedNew.has(name))throw new Error('Unexpected untracked file '+name)
const sourcePaths=[...new Set([...changed,...untracked])].sort()
const evidence=[]
function walk(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
 const target=path.join(directory,entry.name)
 if(entry.isDirectory())walk(target)
 else if(entry.isFile())evidence.push(path.relative(root,target).replaceAll('\\','/'))
}}
walk(proof)
const manifestPath=path.relative(root,path.join(proof,'source-manifest.json')).replaceAll('\\','/')
const paths=[...new Set([...sourcePaths,...evidence,manifestPath])].sort()
const files=Object.fromEntries(paths.filter(name=>name!==manifestPath).map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex')]))
fs.writeFileSync(path.join(proof,'source-manifest.json'),JSON.stringify({createdAt:new Date().toISOString(),baseRevision:summary.baseRevision,algorithm:'SHA-256',hashScope:'Local bytes before Git CRLF normalization; own manifest excluded',sourcePaths,evidencePaths:paths.filter(name=>!sourcePaths.includes(name)),paths,files},null,2)+'\n')
process.stdout.write(JSON.stringify({sourcePaths:sourcePaths.length,evidencePaths:paths.length-sourcePaths.length,paths:paths.length,hashes:Object.keys(files).length})+'\n')
