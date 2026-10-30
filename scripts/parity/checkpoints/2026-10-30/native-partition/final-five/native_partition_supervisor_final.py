from pathlib import Path
import datetime,hashlib,json,os,subprocess,sys,time

repo=Path('/workspace/scratch/2231de9d6b0d/work-native-partition-seventh')
output=repo/'test-results/native-partition-final-five';output.mkdir(parents=True,exist_ok=True)
jobs={
 'remaining':(['node','tests/browser/physical-history.mjs'],{'EDITOR_NATIVE_PAGE':'native-plugin-parity.html'}),
 'settings':(['node','tests/browser/physical-history.mjs'],{'EDITOR_NATIVE_PAGE':'native-block-settings.html'}),
 'inventory':(['node','/workspace/scratch/2231de9d6b0d/native_partition_inventory_final.mjs'],{}),
}
name=sys.argv[1];command,extra=jobs[name]
env=dict(os.environ)
for key in ['EDITOR_NATIVE_PAGE','EDITOR_NATIVE_FILTER','EDITOR_BROWSER_PAGE','EDITOR_BROWSER_ROOT']:env.pop(key,None)
env.update(EDITOR_CHROME_PATH='/tmp/rector-chrome/opt/google/chrome/chrome',EDITOR_PLAYWRIGHT_PATH='/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs',**extra)
def git(*parts):return subprocess.check_output(['git',*parts],cwd=repo)
def sha(payload):return hashlib.sha256(payload).hexdigest()
head=git('rev-parse','HEAD').decode().strip();assert head=='d06547af677fc55152bd2d6e3f0df9b941eeb159';assert not git('diff','--name-only','HEAD').strip()
paths=['tests/browser/physical-history.mjs','tests/browser/native-plugin-parity.js','tests/browser/native-plugin-parity.html','tests/browser/regressions/harness.js','tests/browser/native-input-driver.js','tests/browser/native-input-helpers.js']
for capability,module in [('code-source-language','code-source-language-native'),('person-modes','person-modes-native'),('table-keyboard','table-keyboard-native')]:
 paths.extend(['tests/browser/native-'+capability+'.html','tests/browser/native-'+capability+'.js','tests/browser/regressions/'+module+'.js'])
paths.extend(['tests/browser/native-block-settings.html','tests/browser/native-block-settings.js','tests/browser/regressions/text-block-settings-native.js','tests/browser/regressions/columns-layout-native.js'])
hashes={path:sha((repo/path).read_bytes()) for path in paths}
stdout=output/(name+'.stdout');stderr=output/(name+'.stderr');meta=output/(name+'.meta.json')
assert not meta.exists(), 'Refuse to overwrite a process outcome'
status_before=git('status','--short').decode()
link=repo/'node_modules'
dependency={'path':'node_modules','isSymlink':link.is_symlink(),'target':os.readlink(link) if link.is_symlink() else None}
record={'gitStatusBefore':status_before,'dependencyLinkState':dependency,'job':name,'headBefore':head,'trackedCleanBefore':True,'sourceSha256':hashes,'command':command,'environment':extra,'pageDeadlineMs':120000,'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'running'}
meta.write_text(json.dumps(record,indent=2)+'\n');started=time.monotonic()
with stdout.open('w') as out,stderr.open('w') as err:r=subprocess.run(command,cwd=repo,env=env,stdout=out,stderr=err)
after=git('rev-parse','HEAD').decode().strip();clean=not git('diff','--name-only','HEAD').strip();same=head==after and clean and hashes=={path:sha((repo/path).read_bytes()) for path in paths}
record.update(gitStatusAfter=git('status','--short').decode(),status='complete',actualExitCode=r.returncode,elapsedSeconds=round(time.monotonic()-started,3),completedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),headAfter=after,trackedCleanAfter=clean,sourceUnchanged=same,stdoutSha256=sha(stdout.read_bytes()),stderrSha256=sha(stderr.read_bytes()))
meta.write_text(json.dumps(record,indent=2)+'\n');print(json.dumps({'job':name,'exitCode':r.returncode,'elapsedSeconds':record['elapsedSeconds'],'sourceUnchanged':same,'metadata':str(meta)}),flush=True)
sys.exit(r.returncode if same else 2)
