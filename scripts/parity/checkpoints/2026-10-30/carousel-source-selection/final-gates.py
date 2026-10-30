from pathlib import Path
import subprocess, os, hashlib, json, datetime, time
root=Path('/tmp/rector-third-carousel-20261030')
prefix=Path('/tmp/rector-third-carousel-add-final')
def now(): return datetime.datetime.now(datetime.timezone.utc).isoformat()
def capture():
    names=subprocess.check_output(['git','ls-files','-z','core','plugins','renderer','shared','plugin-kit','inline-tools','inline-plugins','tests/browser'],cwd=root).decode().split('\0')
    names=[p for p in names if p]+['tests/browser/regressions/carousel-structure-native.js']
    return {name:hashlib.sha256((root/name).read_bytes()).hexdigest() for name in sorted(set(names))}
manifest={'startedAt':now(),'head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'sourceBefore':capture(),'commands':[]}
plan=[
    ('native-plugin-parity',['node','tests/browser/physical-history.mjs'],{'EDITOR_CHROME_PATH':'/tmp/rector-browsers-156/chrome-linux64/chrome','EDITOR_VITE_PATH':'/tmp/rector-root-vite.mjs','EDITOR_NATIVE_PAGE':'native-plugin-parity.html'}),
    ('native-plugin-media',['node','tests/browser/physical-history.mjs'],{'EDITOR_CHROME_PATH':'/tmp/rector-browsers-156/chrome-linux64/chrome','EDITOR_VITE_PATH':'/tmp/rector-root-vite.mjs','EDITOR_NATIVE_PAGE':'native-plugin-media.html'}),
    ('typecheck',['npm','run','typecheck'],{}),
    ('units',['node','--test','--test-isolation=none','plugins/carousel/file-reader-lifecycle.test.js','plugins/carousel/settings-lifecycle.test.js','plugins/carousel/video-paste-parity.test.js','shared/carouselData.test.js','plugins/media-blob-commit.test.js'],{}),
]
for name,command,extra in plan:
    log=str(prefix)+'-'+name+'-green.log'
    env=os.environ.copy()
    for key in ['EDITOR_NATIVE_FILTER','EDITOR_NATIVE_PAGE','EDITOR_CHROME_PATH','EDITOR_VITE_PATH']: env.pop(key,None)
    env.update(extra)
    item={'name':name,'command':command,'environment':extra,'startedAt':now(),'log':log}
    print(json.dumps({'started':name,'log':log}),flush=True)
    with open(log,'w') as handle:
        result=subprocess.run(command,cwd=root,env=env,stdout=handle,stderr=subprocess.STDOUT)
    item.update(exitCode=result.returncode,finishedAt=now(),logSha256=hashlib.sha256(Path(log).read_bytes()).hexdigest())
    manifest['commands'].append(item)
    print(json.dumps({'finished':name,'exitCode':result.returncode}),flush=True)
manifest['sourceAfter']=capture()
manifest['sourceUnchanged']=manifest['sourceAfter']==manifest['sourceBefore']
manifest['finishedAt']=now()
manifest['status']='PASS' if manifest['sourceUnchanged'] and all(item['exitCode']==0 for item in manifest['commands']) else 'FAIL'
Path(str(prefix)+'-gates.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'status':manifest['status'],'sourceUnchanged':manifest['sourceUnchanged'],'files':len(manifest['sourceBefore'])}),flush=True)
raise SystemExit(0 if manifest['status']=='PASS' else 1)
