import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtemp,mkdir,writeFile,readFile,readdir } from 'node:fs/promises'
import { dirname,join,relative,resolve,sep } from 'node:path'
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
const prefixes=['core/','shared/','plugins/','plugin-kit/','inline-tools/','inline-plugins/','renderer/','preset/','locale/']
const rootFiles=new Set(['index.js','index.d.ts','types.d.ts','package.json'])
/** Materialize exact immutable source bytes in a fresh ignored fixture root. */
export async function createNavigationRoots(repo,specifications){
 const git=(...args)=>execFileSync('git',args,{cwd:repo,maxBuffer:96*1024*1024})
 const directory=await mkdtemp(join(repo,'test-results','navigation-sources-'))
 const sources=[]
 for(const spec of specifications){
  assert(/^[a-z][a-z0-9-]*$/.test(spec.label));const sha=git('rev-parse',spec.sha).toString().trim(),tree=git('rev-parse',sha+'^{tree}').toString().trim()
  const paths=git('ls-tree','-r','-z','--name-only',sha).toString().split('\0').filter(path=>rootFiles.has(path)||prefixes.some(prefix=>path.startsWith(prefix)))
  const queries=paths.map(path=>sha+':'+path),raw=gitBatch(git,queries),sourceRoot=join(directory,spec.label),files={}
  let offset=0
  for(let index=0;index<paths.length;index++){
   const end=raw.indexOf(10,offset),header=raw.subarray(offset,end).toString().split(' ');assert.equal(header[1],'blob',queries[index]);const size=Number(header[2]);offset=end+1
   const bytes=raw.subarray(offset,offset+size);offset+=size;assert.equal(raw[offset++],10)
   const path=paths[index],target=resolve(sourceRoot,path);assert(target.startsWith(resolve(sourceRoot)+sep)&&!path.split('/').includes('..'))
   await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes);files[path]=hash(bytes)
  }
  assert.equal(offset,raw.length)
  sources.push({...spec,sha,tree,root:sourceRoot,webBase:'/'+relative(repo,sourceRoot).split(sep).join('/')+'/',files,served:{}})
 }
 return sources
 function gitBatch(git,queries){return execFileSync('git',['cat-file','--batch'],{cwd:repo,input:queries.join('\n')+'\n',maxBuffer:96*1024*1024})}
}
export async function verifyNavigationRoots(sources){
 for(const source of sources)for(const[path,expected]of Object.entries(source.files))assert.equal(hash(await readFile(join(source.root,path))),expected,source.label+'/'+path)
}
/** Bind installed runtime dependency assets independently of Vite's cache. */
export async function captureNavigationDependencies(repo){
 const pending=Object.keys(JSON.parse(await readFile(join(repo,'package.json'),'utf8')).dependencies),versions={},files={}
 for(const name of pending){
  if(Object.hasOwn(versions,name))continue
  const directory=join(repo,'node_modules',name),manifest=JSON.parse(await readFile(join(directory,'package.json'),'utf8'));versions[name]=manifest.version
  pending.push(...Object.keys(manifest.dependencies??{}).filter(value=>value.startsWith('@shelamkoff/')))
  await scan(directory)
 }
 return{versions,files}
 async function scan(directory){
  for(const entry of await readdir(directory,{withFileTypes:true})){
   if(entry.name==='node_modules')continue
   const path=join(directory,entry.name)
   if(entry.isDirectory())await scan(path)
   else if(entry.isFile()&&/\.(?:[cm]?js|css|json)$/.test(entry.name))files[relative(repo,path).split(sep).join('/')]=hash(await readFile(path))
  }
 }
}
export async function verifyNavigationDependencies(repo,snapshot){
 for(const[path,expected]of Object.entries(snapshot.files))assert.equal(hash(await readFile(join(repo,path))),expected,path)
}
