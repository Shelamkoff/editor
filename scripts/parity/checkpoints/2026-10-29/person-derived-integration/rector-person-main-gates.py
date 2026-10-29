from pathlib import Path
import os, json, subprocess, hashlib
root=Path('/workspace/scratch/61a2ad7355f4/editor')
commands=[('typecheck',['npm','run','typecheck']),('unit',['npm','test']),('package',['npm','run','test:package'])]
env=dict(os.environ, EDITOR_CHROME_PATH='/tmp/rector-browsers-156/chrome-linux64/chrome', EDITOR_PLAYWRIGHT_PATH='/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')
start=subprocess.run(['node','scripts/verification-results.mjs','init',*[name for name,_ in commands]],cwd=root,env=env,text=True,capture_output=True,check=True)
directory=start.stdout.strip().splitlines()[-1]
env['EDITOR_RESULTS_DIR']=directory
print(directory,flush=True)
for label,command in commands:
 output=Path(directory)/(label+'.wrapper.log')
 with output.open('w') as log:
  result=subprocess.run(['node','scripts/verification-results.mjs','run',label,'--',*command],cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT)
 print(json.dumps({'gate':label,'exitCode':result.returncode,'log':str(output),'sha256':hashlib.sha256(output.read_bytes()).hexdigest()}),flush=True)
 if result.returncode:
  print(output.read_text()[-6000:],flush=True)
  break
end=subprocess.run(['node','scripts/verification-results.mjs','finish'],cwd=root,env=env,text=True,capture_output=True)
manifest=Path(directory)/'manifest.json';data=json.loads(manifest.read_text())
print(json.dumps({'manifest':str(manifest),'sha256':hashlib.sha256(manifest.read_bytes()).hexdigest(),'finishExitCode':end.returncode,'outcome':data.get('outcome'),'gates':{name:{key:gate.get(key) for key in ['outcome','startedAt','finishedAt','elapsedMs','sourceUnchanged']} for name,gate in data['gates'].items()}},indent=2),flush=True)
raise SystemExit(end.returncode)
