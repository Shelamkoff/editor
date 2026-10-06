import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const proof=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(proof,'../..');
const gates={
 typecheck:['npm','run','typecheck'],node:['npm','test'],docs:['npm','run','test:docs'],
 'consumer-types':['npm','run','test:types'],package:['npm','run','test:package'],
 'docs-check':['npm','run','docs:check'],bundle:['node','benchmarks/bundle-budget.mjs','--enforce'],
 browser:['node','tests/browser/run.mjs'],'native-all':['node','tests/browser/physical-history.mjs'],
 heap:['node','tests/browser/heap-gate.mjs'],demo:['node','scripts/vitepress-browser-smoke.mjs'],
};
const name=process.argv[2],args=gates[name];if(!args)throw new Error('Unknown gate '+name);
const env={...process.env};if(name==='demo'){env.RECTOR_DOCS_URL='http://127.0.0.1:5173/ru/';env.RECTOR_QA_DIR=path.join(proof,'demo')}
const output=fs.createWriteStream(path.join(proof,name+'.log'));
const startedAt=new Date().toISOString();
const child=args[0]==='npm'?spawn(process.env.ComSpec||'cmd.exe',['/d','/s','/c',args.join(' ')],{cwd:root,env,windowsHide:true}):spawn(process.execPath,args.slice(1),{cwd:root,env,windowsHide:true});
child.stdout.pipe(output,{end:false});child.stderr.pipe(output,{end:false});
const exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>resolve(code??1))});
await new Promise(resolve=>output.end(resolve));
const outcome={Name:name,Command:args.join(' '),StartedAt:startedAt,FinishedAt:new Date().toISOString(),ExitCode:exitCode};
fs.writeFileSync(path.join(proof,name+'.outcome.json'),JSON.stringify(outcome,null,2)+'\n');
process.stdout.write(JSON.stringify(outcome)+'\n');
if(exitCode!==0)process.stdout.write(fs.readFileSync(path.join(proof,name+'.log'),'utf8').slice(-7000));
process.exitCode=exitCode;
