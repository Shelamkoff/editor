
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const proof=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(proof,'../..')
const wrapper=path.join(root,'tests/browser/native-vone-library-boundaries.html')
let created=false
try{
 await fs.writeFile(wrapper,await fs.readFile(path.join(proof,'v1-wrapper.html')),{flag:'wx'});created=true
 const result=spawnSync(process.execPath,['tests/browser/physical-history.mjs'],{cwd:root,env:{...process.env,EDITOR_NATIVE_PAGE:'native-vone-library-boundaries.html'},encoding:'utf8',windowsHide:true,maxBuffer:67108864})
 await fs.writeFile(path.join(proof,'v1-mention.log'),(result.stdout??'')+(result.stderr??''))
 process.stdout.write(result.stdout??'');process.stderr.write(result.stderr??'')
 process.exitCode=result.status??1
 if(result.error)throw result.error
}finally{if(created)await fs.unlink(wrapper)}
