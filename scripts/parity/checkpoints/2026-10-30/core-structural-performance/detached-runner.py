import os,sys,json,subprocess
from pathlib import Path
cfg=json.loads(Path(sys.argv[1]).read_text())
os.chdir(cfg["cwd"])
env=dict(os.environ,**cfg.get("environment",{}))
run=subprocess.check_output(["node","scripts/verification-results.mjs","init",*[gate["name"] for gate in cfg["gates"]]],env=env,text=True).strip()
env["EDITOR_RESULTS_DIR"]=run
result={"run":run,"gates":[]}
for gate in cfg["gates"]:
 current=dict(env,**gate.get("environment",{}))
 code=subprocess.call(["node","scripts/verification-results.mjs","run",gate["name"],"--",*gate["command"]],env=current)
 result["gates"].append({"name":gate["name"],"exitCode":code})
 Path(cfg["status"]).write_text(json.dumps(result))
 if code and cfg.get("stopOnFailure",False): break
result["finish"]=subprocess.call(["node","scripts/verification-results.mjs","finish"],env=env)
Path(cfg["status"]).write_text(json.dumps(result))
