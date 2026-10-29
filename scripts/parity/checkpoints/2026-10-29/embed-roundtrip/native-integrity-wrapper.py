from pathlib import Path
import subprocess,hashlib,json,os,time,datetime
root=Path('/tmp/rector-embed-pageerror-attribution-20261029')
head=lambda:subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
paths=subprocess.check_output(['git','ls-files','-z'],cwd=root).decode().split('\0')
paths=[p for p in paths if p]
def snapshot():return {p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in paths}
before=snapshot(); started=datetime.datetime.now(datetime.timezone.utc).isoformat(); head_before=head(); clock=time.monotonic()
env={**os.environ,'EDITOR_CHROME_PATH':'/tmp/rector-browsers/chrome-linux64/chrome','EDITOR_NATIVE_PAGE':'native-roundtrip-preservation.html','EDITOR_NATIVE_FILTER':''}
with open('/tmp/rector-embed-native-final42.log','w') as log:
 result=subprocess.run(['node','tests/browser/physical-history.mjs'],cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT)
after=snapshot();raw=Path('/tmp/rector-embed-native-final42.log').read_text()
lines=[line for line in raw.splitlines() if line.startswith('{"native-roundtrip-preservation.html"')]
cases=json.loads(lines[-1])['native-roundtrip-preservation.html'] if lines else []
report={'root':str(root),'headBefore':head_before,'headAfter':head(),'startedAt':started,'finishedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'elapsedSeconds':round(time.monotonic()-clock,3),'exitCode':result.returncode,'caseCount':len(cases),'sourceUnchanged':before==after,'trackedFileCount':len(before),'trackedFilesSha256':hashlib.sha256(json.dumps(before,sort_keys=True).encode()).hexdigest(),'logSha256':hashlib.sha256(raw.encode()).hexdigest(),'changedPaths':[p for p in paths if before[p]!=after[p]],'command':'EDITOR_CHROME_PATH=/tmp/rector-browsers/chrome-linux64/chrome EDITOR_NATIVE_PAGE=native-roundtrip-preservation.html EDITOR_NATIVE_FILTER= node tests/browser/physical-history.mjs','cases':cases}
Path('/tmp/rector-embed-native-final42.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k!='cases'}))
assert result.returncode==0 and len(cases)==42 and before==after and head_before==head()
