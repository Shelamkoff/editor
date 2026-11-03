"""Independent browser destination, hierarchy, activation and source oracle."""
import argparse,hashlib,json,re,subprocess
from pathlib import Path
V1='5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340';BASELINE='e981ff308000c1d92d7e820df95113c1e19bcee8'
PRIMARY=['_self','_blank','_parent','_top','articlePreview','existing-named']
EXTENDED=PRIMARY+['control-click','shift-click','middle-click','relative','fragment-new-tab','fragment-control-click']
SURFACES=['raw-editor','raw-renderer','carousel-editor','carousel-renderer','paragraph-editor','paragraph-renderer']
PREFIXES=['core/','shared/','plugins/','plugin-kit/','inline-tools/','inline-plugins/','renderer/','preset/','locale/']
ROOT_FILES=['index.js','index.d.ts','types.d.ts','package.json']
PATHS=['shared/sanitize/walker.js','shared/sanitize/parseInline.js','shared/sanitize/sanitizeHtml.js','shared/sanitize/contentClasses.js','shared/contentClassStyles.js','shared/contentClassSelectors.js','core/InlineProjectionRuntime.js','renderer/inlineWidgets.js','plugins/paragraph/index.js','renderer/renderers/paragraph/index.js','shared/embeddedHtml.js','shared/embeddedHtmlDocument.js','shared/rebaseContentViewport.js','shared/contentStyles.js','plugins/raw/index.js','plugins/carousel/index.js','core/createEditorRuntime.js','renderer/EditorRenderer.js','renderer/renderers/raw/index.js','renderer/renderers/carousel/index.js','shared/sanitize/sanitizeRawHtml.js','shared/sanitize/sanitizeUrl.js','shared/sanitize/trustedHtml.js','node_modules/dompurify/dist/purify.es.mjs','package-lock.json','scripts/parity/git-navigation-roots.mjs']
def sha(b):return hashlib.sha256(b).hexdigest()
def same(a,b):return json.dumps(a,sort_keys=True,ensure_ascii=False)==json.dumps(b,sort_keys=True,ensure_ascii=False)
def page(url,opener=True):return dict(url=url,openerIsNull=opener)
def expected(name,policy,origin):
 target=name if name in ['_self','_blank','_parent','_top','articlePreview'] else 'articlePreview' if name=='existing-named' else '_blank' if name in ['relative','fragment-new-tab'] else '_self'
 destination='/boundary-owner#destination' if name.startswith('fragment-') else '/boundary-destination?case='+name
 pages=[page('/boundary-host')];middle='/boundary-middle';owner='/boundary-owner'
 if name=='_self':owner=destination
 elif name=='_parent':middle=destination;owner='detached'
 elif name=='_top':pages=[page(destination)];middle=owner='detached'
 else:pages.append(page(destination,name!='existing-named'))
 requests=[] if name.startswith('fragment-') else [dict(url=destination,referer='')]
 if name=='existing-named':requests.insert(0,dict(url='/boundary-destination?initial=1',referer=origin+'/boundary-owner'))
 activation=dict(type='auxclick' if name=='middle-click' else 'click',trusted=True,button=1 if name=='middle-click' else 0,ctrlKey=name in ['control-click','fragment-control-click'],shiftKey=name=='shift-click',altKey=False,metaKey=False)
 return dict(pages=pages,middleUrl=middle,ownerUrl=owner,requests=requests,errors=[],settled=True,policyEnforced=policy,inspected=dict(href=destination,sameOrigin=True,target=target,rel=['noopener','noreferrer']),activations=[activation])
def verify_rows(data,three=False):
 assert data['candidatePass'] is True and data['sourceUnchanged'] is True
 assert data['node']=='v24.22.2' and data['browser']=='156.0.8078.80' and data['platform']=='win32' and data['architecture']=='x64'
 assert data['browserExecutable']==r'C:\Program Files\Google\Chrome\Application\chrome.exe'
 existing=next(row for row in data['results'] if row['name']=='existing-named')['control']['actual']['requests'][0]['referer'];assert re.fullmatch(r'http://127\.0\.0\.1:\d+/boundary-owner',existing);origin=existing[:-len('/boundary-owner')]
 keys=[(source,name,surface) for source in ['v1','spec-baseline','candidate'] for name in PRIMARY for surface in SURFACES[-2:]] if three else [(None,name,surface) for name in EXTENDED for surface in SURFACES]
 assert [(row.get('source'),row['name'],row['surface']) for row in data['results']]==keys
 for row in data['results']:
  wanted=expected(row['name'],not three,origin)
  assert row['status']=='PASS' and row['failure'] is None and row['control']['kind']=='platform-control' and row['candidate']['kind']==row['surface']
  for role in ['control','candidate']:assert same(row[role]['actual'],wanted),(row.get('source'),row['name'],row['surface'],role,row[role]['actual'],wanted)
 return len(keys)
def dependencies():
 pending=list(json.loads(Path('package.json').read_bytes())['dependencies']);versions={};files={}
 for name in pending:
  if name in versions:continue
  directory=Path('node_modules')/name;manifest=json.loads((directory/'package.json').read_bytes());versions[name]=manifest['version'];pending.extend(n for n in manifest.get('dependencies',{}) if n.startswith('@shelamkoff/'))
  for path in directory.rglob('*'):
   if path.is_file() and 'node_modules' not in path.relative_to(directory).parts and path.suffix in ['.js','.mjs','.cjs','.css','.json']:files[path.as_posix()]=sha(path.read_bytes())
 return dict(versions=versions,files=files)
def git_blobs(queries):
 queries=sorted(set(queries));raw=subprocess.check_output(['git','cat-file','--batch'],input=('\n'.join(queries)+'\n').encode());result={};offset=0
 for query in queries:
  end=raw.index(b'\n',offset);header=raw[offset:end].split();assert len(header)==3 and header[1]==b'blob',query
  size=int(header[2]);offset=end+1;result[query]=raw[offset:offset+size];offset+=size;assert raw[offset:offset+1]==b'\n';offset+=1
 assert offset==len(raw);return result
def main():
 p=argparse.ArgumentParser();p.add_argument('--navigation',type=Path,required=True);p.add_argument('--comparison',type=Path,required=True);p.add_argument('--native',type=Path);p.add_argument('--candidate',required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--exploratory',action='store_true');a=p.parse_args()
 primary_raw=a.navigation.read_bytes();comparison_raw=a.comparison.read_bytes();primary=json.loads(primary_raw);comparison=json.loads(comparison_raw)
 assert primary['head']==comparison['head']==a.candidate
 assert verify_rows(primary)==72 and verify_rows(comparison,True)==36
 assert [(s['label'],s['sha'],s['legacy']) for s in comparison['sources']]==[('v1',V1,True),('spec-baseline',BASELINE,False),('candidate',a.candidate,False)]
 dep=dependencies();assert same(primary['dependencies'],dep) and same(comparison['dependencies'],dep)
 own=['scripts/parity/html-content-navigation.mjs','scripts/parity/html-targets.mjs','scripts/parity/git-navigation-roots.mjs','scripts/parity/checkpoints/2026-11-03/html-targets/review.py','scripts/parity/checkpoints/2026-11-03/html-targets/controls.mjs','tests/browser/native-html-content.html','tests/browser/regressions/html-content-native.js','tests/browser/embedded-html-helpers.js','tests/browser/physical-history.mjs']
 queries=[]
 for data,runner in [(primary,own[0]),(comparison,own[1])]:
  assert set(data['sourceHashes'])==set(PATHS+[runner])
  queries.extend(a.candidate+':'+path for path in data['sourceHashes'] if not path.startswith('node_modules/'))
 for source in comparison['sources']:
  paths=subprocess.check_output(['git','ls-tree','-r','-z','--name-only',source['sha']]).decode().split('\0');paths=[path for path in paths if path in ROOT_FILES or any(path.startswith(prefix) for prefix in PREFIXES)]
  assert set(source['files'])==set(paths) and set(source['served'])<=set(paths) and len(source['served'])>=90
  assert {'core/index.js','plugins/paragraph/index.js','renderer/index.js'}<=set(source['served'])
  assert source['tree']==subprocess.check_output(['git','rev-parse',source['sha']+'^{tree}']).decode().strip()
  assert re.fullmatch(r'/test-results/navigation-sources-[A-Za-z0-9]+/'+source['label']+'/',source['webBase'])
  queries.extend(source['sha']+':'+path for path in paths)
 if not a.exploratory:queries.extend(a.candidate+':'+path for path in own)
 blobs=git_blobs(queries)
 for source in comparison['sources']:
  for path,h in source['files'].items():assert sha(blobs[source['sha']+':'+path])==h
  for path,h in source['served'].items():assert h==source['files'][path]
 for data in [primary,comparison]:
  for path,h in data['sourceHashes'].items():
   local=Path(path).read_bytes();assert sha(local)==h
   if not path.startswith('node_modules/'):assert local.replace(b'\r\n',b'\n')==blobs[a.candidate+':'+path].replace(b'\r\n',b'\n')
 if not a.exploratory:
  for path in own:assert Path(path).read_bytes().replace(b'\r\n',b'\n')==blobs[a.candidate+':'+path].replace(b'\r\n',b'\n')
  assert a.native
  text=a.native.read_text(encoding='utf-8');native=json.loads(next(line for line in text.splitlines() if line.startswith('{"native-html-content.html":')))['native-html-content.html']
  labels=["short content retains only its surface's preview affordance",'trusted wheel cannot scroll short content into an artificial blank page','application-owned body scrolling remains a usable native control','retirement during a parent activation observer revokes navigation','a live trusted link retains its requested parent destination','a real trusted download preserves the application Blob and filename','scriptless content retains actual native video playback and retires it']
  names=[surface+': '+label for label in labels for surface in ['Raw editor','Raw renderer','Carousel editor','Carousel renderer']]
  assert [row['name'] for row in native]==names and all(row['status']=='PASS' for row in native)
  frozen=json.loads((a.native.parent/'manifest.json').read_bytes());assert frozen['source']['head']==a.candidate and frozen['source']['dirty'] is False
  for name in ['navigation','target-comparison','native-html']:
   gate=frozen['gates'][name];assert gate['outcome']=='passed' and gate['sourceUnchanged'] is True and gate['sourceBefore']['identity']==gate['sourceAfter']['identity']==frozen['source']['identity']
 runtime=['core','shared','plugins','plugin-kit','inline-tools','inline-plugins','renderer','preset','locale','index.js','index.d.ts','types.d.ts','package.json','package-lock.json'];assert subprocess.check_output(['git','diff','--name-only','4e153854221027141a2b7152f4f067be9d74f228',a.candidate,'--',*runtime])==b''
 report=dict(status='PASS',candidate=a.candidate,nativeControlComparisons=72,threeSourceComparisons=36,comparisonsPerSource=12,servedModuleIdentities=sum(len(s['served']) for s in comparison['sources']),preparedSourceFiles=sum(len(s['files']) for s in comparison['sources']),dependencyFiles=len(dep['files']),dependencyVersions=dep['versions'],navigationSha256=sha(primary_raw),comparisonSha256=sha(comparison_raw),reviewerSha256=sha(Path(__file__).read_bytes()))
 if not a.exploratory:report.update(nativeCases=28,nativeLogSha256=sha(a.native.read_bytes()))
 a.output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report))
if __name__=='__main__':main()
