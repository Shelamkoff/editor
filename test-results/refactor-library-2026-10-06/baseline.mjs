import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const proof=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(proof,'../..')
const revision='41c205ea663f896f052d3bd84aea2752892c8c82'
const entries=[
 ['renderer/index.js','renderer/.qa-renderer-before-library.js'],
 ['renderer/pollConfigSnapshot.js','renderer/.qa-poll-before-library.js'],
 ['inline-plugins/mention/index.js','inline-plugins/mention/.qa-before-library.js'],
]
const created=[],hashes={}
try{
 for(const [source,destination]of entries){
  const bytes=execFileSync('git',['show',revision+':'+source],{cwd:root})
  hashes[source]=crypto.createHash('sha256').update(bytes).digest('hex')
  let text=bytes.toString('utf8')
  if(source==='renderer/index.js')text=text.replace("'./pollConfigSnapshot.js'","'./.qa-poll-before-library.js'")
  await fs.writeFile(path.join(root,destination),text,{flag:'wx'});created.push(destination)
 }
 const implementation=await fs.readFile(path.join(root,'renderer/EditorRenderer.js'))
 const original=execFileSync('git',['show',revision+':renderer/EditorRenderer.js'],{cwd:root})
 const normalized=bytes=>crypto.createHash('sha256').update(bytes.toString('utf8').replace(/\r\n/g,'\n')).digest('hex')
 if(normalized(implementation)!==normalized(original))throw new Error('Renderer implementation changed; baseline seam not independent')
 await fs.writeFile(path.join(proof,'baseline-sources.json'),JSON.stringify({revision,files:hashes,unchangedRendererImplementation:true,rewrittenImports:['renderer/index.js Poll configuration helper import redirects to the pinned helper only']},null,2)+'\n')
 const result=spawnSync(process.execPath,['--test','renderer/schema-ownership.test.js','inline-plugins/mention.config.test.js'],{
  cwd:root,encoding:'utf8',env:{...process.env,RECTOR_RENDERER_ENTRY:'./.qa-renderer-before-library.js',RECTOR_MENTION_ENTRY:'./mention/.qa-before-library.js'},windowsHide:true,
 })
 await fs.writeFile(path.join(proof,'baseline-ownership-red.log'),result.stdout+result.stderr)
 if(result.error)throw result.error
 const output=result.stdout+result.stderr
 if(result.status!==1||!output.includes('ℹ fail '))throw new Error('Pinned baseline did not reproduce product failures')
 process.stdout.write(JSON.stringify({revision,baselineExit:result.status,failed:Number(output.match(/ℹ fail (\d+)/)?.[1]),cases:Number(output.match(/ℹ tests (\d+)/)?.[1])})+'\n')
}finally{
 for(const name of created.reverse())await fs.unlink(path.join(root,name))
}
