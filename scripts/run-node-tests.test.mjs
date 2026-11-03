import test from 'node:test'
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve,dirname,basename} from 'node:path'
import {fileURLToPath} from 'node:url'

test('Node test command executes tracked and new source tests while excluding archived trees',async()=>{
 const temporaryRoot=resolve(tmpdir()),directory=await mkdtemp(join(temporaryRoot,'rector-node-discovery-'))
 assert.equal(dirname(resolve(directory)),temporaryRoot)
 assert.ok(basename(directory).startsWith('rector-node-discovery-'))
 const git=(...args)=>execFileSync('git',args,{cwd:directory,stdio:'pipe',windowsHide:true})
 try{
  git('init','--quiet')
  await writeFile(join(directory,'.gitignore'),'test-results/\nnode_modules/\n')
  await writeFile(join(directory,'case with spaces.test.mjs'),"import test from 'node:test';test('tracked source is exercised',()=>{})\n")
  git('add','--','.gitignore','case with spaces.test.mjs')
  await writeFile(join(directory,'new-source.test.cjs'),"require('node:test')('new untracked source is exercised',()=>{})\n")
  const historical=join(directory,'test-results','navigation-sources','v1');await mkdir(historical,{recursive:true})
  await writeFile(join(historical,'obsolete.test.mjs'),"throw new Error('HISTORICAL_TEST_MUST_NOT_EXECUTE')\n")
  const installed=join(directory,'node_modules','dependency');await mkdir(installed,{recursive:true})
  await writeFile(join(installed,'foreign.test.mjs'),"throw new Error('DEPENDENCY_TEST_MUST_NOT_EXECUTE')\n")
  const output=execFileSync(process.execPath,[fileURLToPath(new URL('./run-node-tests.mjs',import.meta.url)),'--test-reporter=tap'],{
   cwd:directory,encoding:'utf8',windowsHide:true,timeout:20000,maxBuffer:1024*1024,
  })
  assert.match(output,/Node test files: 2/)
  assert.match(output,/tracked source is exercised/)
  assert.match(output,/new untracked source is exercised/)
  assert.doesNotMatch(output,/MUST_NOT_EXECUTE/)
  assert.match(output,/# pass 2/)
 }finally{
  assert.equal(dirname(resolve(directory)),temporaryRoot)
  assert.ok(basename(directory).startsWith('rector-node-discovery-'))
  await rm(directory,{recursive:true,force:true})
 }
})
