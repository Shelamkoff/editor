import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
const file='plugins/raw/README.md', original=readFileSync(file,'utf8')
const faults=[
 ['required section missing',text=>text.replace('## Capabilities','## Removed capabilities')],
 ['code fence unclosed',text=>text+'\n```js\n'],
 ['removed mutation contract',text=>text+'\nUse `context.mutate()`.\n'],
]
const observations=[]
try {
 for(const [name,mutate] of faults){
  writeFileSync(file,mutate(original))
  const result=spawnSync(process.execPath,['scripts/validate-extension-readmes.mjs'],{encoding:'utf8',windowsHide:true})
  observations.push({name,exitCode:result.status,stdout:result.stdout.trim(),stderr:result.stderr.trim()})
 }
}finally{writeFileSync(file,original)}
console.log(JSON.stringify({observations}))
if(observations.some(item=>item.exitCode===0))throw new Error('Invalid README content was accepted')
