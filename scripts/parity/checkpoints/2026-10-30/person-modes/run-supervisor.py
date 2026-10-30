from pathlib import Path
import datetime, hashlib, json, os, subprocess, sys
kind,name=sys.argv[1:]
root=Path('/workspace/scratch/2231de9d6b0d/work-person-seventh')
out=root/'test-results/person-modes-seventh'; out.mkdir(parents=True,exist_ok=True)
settings={'EDITOR_CHROME_PATH':'/tmp/rector-chrome/opt/google/chrome/chrome'}
if kind=='native':
 command=['node','tests/browser/physical-history.mjs']
 settings.update({'EDITOR_NATIVE_PAGE':'native-plugin-parity.html','EDITOR_NATIVE_FILTER':'Person mode parity '})
 suffix='.log'
elif kind=='comparison':
 command=['node','scripts/parity/person-modes.mjs']
 settings['EDITOR_PLAYWRIGHT_PATH']='/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
 suffix='.json'
else: raise ValueError(kind)
def git(*args): return subprocess.check_output(['git',*args],cwd=root,text=True).strip()
def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()
stdout=out/(name+suffix); stderr=out/(name+'.stderr')
metadata={'command':command,'environment':settings,'headBefore':git('rev-parse','HEAD'),'treeBefore':git('rev-parse','HEAD^{tree}'),'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'trackedCleanBefore':not git('diff','--name-only','HEAD'),'fixtureSha256':digest(root/'tests/browser/person-modes-parity-fixture.js'),'runnerSha256':digest(root/(command[1]))}
with stdout.open('wb') as output,stderr.open('wb') as error:
 result=subprocess.run(command,cwd=root,env=dict(os.environ,**settings),stdout=output,stderr=error)
metadata.update({'actualExitCode':result.returncode,'completedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'headAfter':git('rev-parse','HEAD'),'trackedCleanAfter':not git('diff','--name-only','HEAD'),'stdoutFile':stdout.name,'stdoutSha256':digest(stdout),'stderrFile':stderr.name,'stderrSha256':digest(stderr)})
(out/(name+'.meta.json')).write_text(json.dumps(metadata,indent=2)+'\n')
print(json.dumps(metadata,indent=2))
sys.exit(result.returncode)
