import subprocess,json,os,hashlib
from pathlib import Path
from datetime import datetime,timezone
root=Path("/tmp/rector-carousel-dist-consumer-20261030")
env=dict(os.environ,npm_config_cache="/tmp/rector-carousel-dist-fresh-cache-20261030")
result={"startedAt":datetime.now(timezone.utc).isoformat(),"commands":[]}
for args in [["npm","install","--ignore-scripts","--no-audit","--no-fund"],["npm","ci","--ignore-scripts","--no-audit","--no-fund"]]:
 code=subprocess.call(args,cwd=root,env=env)
 result["commands"].append({"args":args,"exitCode":code})
 if code: break
if all(row["exitCode"]==0 for row in result["commands"]):
 code=subprocess.call(["node","--input-type=module","-e","import assert from 'node:assert/strict'; import {readFile} from 'node:fs/promises'; import {Carousel} from '@shelamkoff/carousel'; assert.equal(typeof Carousel,'function'); const css=await readFile(new URL(import.meta.resolve('@shelamkoff/carousel/styles.css')),'utf8'); assert(css.includes('.carousel')); console.log('public import and CSS entry PASS')"],cwd=root,env=env)
 result["publicImportExitCode"]=code
 source=Path("/tmp/rector-carousel-release-backport-20261030/dist")
 installed=root/"node_modules/@shelamkoff/carousel/dist"
 result["distFiles"]={str(path.relative_to(source)):{"sha256":hashlib.sha256(path.read_bytes()).hexdigest(),"identical":path.read_bytes()==(installed/path.relative_to(source)).read_bytes()} for path in source.rglob("*") if path.is_file()}
 result["allDistBytesEqual"]=all(row["identical"] for row in result["distFiles"].values())
 result["lockSha256"]=hashlib.sha256((root/"package-lock.json").read_bytes()).hexdigest()
result["finishedAt"]=datetime.now(timezone.utc).isoformat()
Path("/tmp/rector-carousel-dist-consumer.status.json").write_text(json.dumps(result,indent=2))
