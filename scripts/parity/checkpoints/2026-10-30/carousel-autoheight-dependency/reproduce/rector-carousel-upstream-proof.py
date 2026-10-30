import hashlib,json,os,subprocess,sys
from pathlib import Path
from datetime import datetime,timezone
root=Path('/tmp/rector-carousel-upstream-20261030')
label=sys.argv[1]
command=sys.argv[2:]
def stamp(): return datetime.now(timezone.utc).isoformat()
def snapshot():
 def git(*args): return subprocess.check_output(['git',*args],cwd=root)
 paths=git('ls-files','--cached','--others','--exclude-standard','-z').decode().split('\0')
 return {'head':git('rev-parse','HEAD').decode().strip(), 'tree':git('rev-parse','HEAD^{tree}').decode().strip(),
  'diffSha256':hashlib.sha256(git('diff','--binary','HEAD')).hexdigest(),
  'files':{path:hashlib.sha256((root/path).read_bytes()).hexdigest() for path in paths if path and (root/path).is_file()},
  'dependencies':{name:json.loads((root/'node_modules'/name/'package.json').read_text())['version'] for name in ['@playwright/test','playwright','@shelamkoff/event-bus','typescript']}}
before=snapshot()
started=stamp()
result=subprocess.run(command,cwd=root,check=False)
after=snapshot()
manifest={'startedAt':started,'finishedAt':stamp(),'cwd':str(root),'command':command,'chromePath':os.environ.get('EDITOR_CHROME_PATH'),'before':before,'after':after,'sourceUnchanged':before==after,'exitCode':result.returncode}
path=Path('/tmp/rector-carousel-upstream-'+label+'-manifest.json'); path.write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'upstreamManifest':str(path),'sourceUnchanged':before==after,'exitCode':result.returncode}),flush=True)
sys.exit(result.returncode if before==after else 2)
