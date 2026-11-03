import {execFileSync,spawnSync} from 'node:child_process'
import {resolve} from 'node:path'

// Include new untracked source tests while honoring Git's exclusions for
// generated output, installed dependencies and materialized historical trees.
const root=process.cwd()
const paths=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{
 cwd:root,encoding:'utf8',maxBuffer:16*1024*1024,windowsHide:true,
}).split('\0')
const files=[...new Set(paths.filter(path=>/\.test\.[cm]?js$/.test(path)))].sort()
if(!files.length)throw new Error('No source Node tests found in this Git checkout')
console.log(`Node test files: ${files.length}`)
const env={...process.env}
// This explicit command starts a fresh runner even when invoked by a Node test.
delete env.NODE_TEST_CONTEXT
const result=spawnSync(process.execPath,['--test',...process.argv.slice(2),...files.map(path=>resolve(root,path))],{
 cwd:root,env,stdio:'inherit',windowsHide:true,
})
if(result.error)throw result.error
process.exitCode=result.status??1
