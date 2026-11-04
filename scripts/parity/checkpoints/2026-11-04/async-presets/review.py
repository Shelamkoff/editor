"""Literal model of async API results, error arbitration, snapshots and recovery."""
import argparse,hashlib,io,json,re,subprocess,sys,tarfile
from pathlib import Path
sys.dont_write_bytecode=True
V1='5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340';BASELINE='e981ff308000c1d92d7e820df95113c1e19bcee8';PARENT='dc5a70b860be8564bf4ce04c7806330e7c61ff28';RUNTIME='4727534d3df182ba0fe0ae37580d1641083c35f4'
TYPES=['paragraph','heading','list','quote','code','image','delimiter','table','checklist','warning','embed','raw','gallery','carousel','attaches','linkPreview','toggle','columns','spoiler','poll','person'];BULK=['plugin-preload','plugin-create','renderer-preload','renderer-map']
def sha(b):return hashlib.sha256(b).hexdigest()
def same(a,b):return json.dumps(a,sort_keys=True,ensure_ascii=False)==json.dumps(b,sort_keys=True,ensure_ascii=False)
def specs():return [dict(id=op+'/'+t,operation=op,type=t) for op in ['plugin-load','renderer-load','renderer-create'] for t in TYPES]+[dict(id=op+'/'+value,operation=op,input=value) for op in BULK for value in ['default','list','empty','document','document-unknown']]+[dict(id='orphan/'+op+'/'+later,operation=op,kind='orphan',later=later) for op in ['plugin-preload','plugin-create'] for later in ['invalid-shape','throwing-getter']]+[dict(id='catalog/'+target,kind='catalog',target=target) for target in ['plugin','renderer']]+[dict(id='snapshot/'+target,kind='snapshot',target=target) for target in ['plugin','renderer']]+[dict(id='invalid/'+op+'/'+t,kind='invalid',operation=op,type=t,input='unknown') for op in ['plugin-load','plugin-preload','plugin-create','renderer-load','renderer-create','renderer-preload','renderer-map'] for t in ['missing','constructor']]+[dict(id='invalid/'+op+'/'+value,kind='invalid',operation=op,input=value) for op in BULK for value in ['versionless','legacy-version','bad-schema','sparse-list']]+[dict(id='invalid/'+op+'/'+value,kind='invalid',operation=op,input=value) for op in ['plugin-preload','plugin-create'] for value in ['config-map','config-entry']]+[dict(id='invalid/renderer-map/config-map',kind='invalid',operation='renderer-map',input='config-map'),dict(id='config/renderer-map/opaque-entry',kind='opaque-config',operation='renderer-map')]+[dict(id='invalid/'+op+'/'+value,kind='invalid',operation=op,input=value) for op in ['renderer-create','renderer-map'] for value in ['prefix','locale']]
def document(old=False,unknown=False):
 def record(id,type,data,version):return dict(id=id,type=type,**({} if old else dict(dataVersion=version)),data=data)
 return dict(version='1.0.5' if old else '2.0.0',blocks=[record('p','paragraph',dict(text='Alpha'),2)]+([record('opaque','not-installed',dict(value='Opaque'),9)] if unknown else [])+[record('d','delimiter',{},1),record('p2','paragraph',dict(text='Bravo'),2)])
def caller(s,old=False):
 value=s.get('input');kind=s.get('kind')
 if kind=='invalid':
  if value=='unknown':return ['paragraph',s['type']]
  if value=='sparse-list':return [None]
  if value in ['config-map','config-entry','prefix','locale']:return ['paragraph']
  d=document(old)
  if value=='versionless':del d['version']
  elif value=='legacy-version':d['version']='0.9.0'
  elif value=='bad-schema':d['blocks']=[dict(id='e',type='embed',**({} if old else dict(dataVersion=1)),data=dict(service='foreign',videoId='12345',caption='',cover='',title='',duration=''))]
  return d
 if kind=='opaque-config':return ['paragraph']
 return ['heading','paragraph','heading','delimiter','paragraph'] if value=='list' else [] if value=='empty' else document(old,value=='document-unknown') if value in ['document','document-unknown'] else None
def failure(s,source='candidate'):
 old=source=='v1';kind=s.get('kind');op=s.get('operation','');value=s.get('input')
 def error(name,message,**extra):return dict(name=name,message=message,**extra)
 if kind=='orphan':
  if old and (op=='plugin-preload' or s['later']=='invalid-shape'):return None
  return error('TypeError','configs.heading must be an object',sameLater=False) if s['later']=='invalid-shape' else error('Error','Later config failure',sameLater=True)
 if kind=='invalid':
  plugin=op.startswith('plugin')
  if value=='unknown':
   if old and s['type']=='constructor':
    messages={'plugin-load':'Ctor is not a constructor','plugin-create':'Plugin is not a constructor','renderer-create':'factory is not a function','renderer-map':'factory is not a function'}
    return error('TypeError',messages[op]) if op in messages else None
   return error('RangeError',('Unknown editor block plugin type: ' if plugin else 'Unknown editor renderer type: ')+s['type'])
  if value=='sparse-list':return error('RangeError',('Unknown editor block plugin type: ' if plugin else 'Unknown editor renderer type: ' if old else 'Unknown editor block renderer type: ')+'undefined')
  if old:return None
  messages={'versionless':'Editor document version is required','legacy-version':'Unsupported document version "0.9.0"; current version is "2.0.0"','bad-schema':'Embed service must be youtube, vimeo, or empty','config-map':'configs must be an object','config-entry':'configs.paragraph must be an object','prefix':'classPrefix must be a string','locale':'locale must be an object'}
  return error('RangeError' if value=='legacy-version' else 'TypeError',messages[value])
 if old and value=='document-unknown':return error('RangeError',('Unknown editor block plugin type: ' if op.startswith('plugin') else 'Unknown editor renderer type: ')+'not-installed')
 return None
def unhandled(s,source):return [dict(name='Error',message='Earlier nested config failure')] if s.get('kind')=='orphan' and source in ['spec-baseline','parent'] else []
def observations(s,source='candidate',normative=False):
 old=source=='v1';kind=s.get('kind');op=s.get('operation','');value=s.get('input');result=[];problem=failure(s,source);pending=[] if normative else unhandled(s,source)
 def add(phase,**items):result.extend((phase,k,v) for k,v in items.items())
 if kind=='orphan':
  wanted=dict(name='TypeError',message='configs.heading must be an object',sameLater=False) if s['later']=='invalid-shape' else dict(name='Error',message='Later config failure',sameLater=True)
  add('invoke',started=True);add('settle',rejected=wanted if normative else problem,reads=1 if normative or not old else 0,unhandled=pending)
 elif kind=='catalog':add('invoke',types=TYPES,freshTypes=TYPES);add('settle',unhandled=[])
 elif kind=='snapshot' and s['target']=='plugin':add('invoke',callerConfig=dict(placeholder='Replacement'));add('settle',placeholder='Before import' if normative or not old else 'Replacement',history=[False,False],rootRemoved=True)
 elif kind=='snapshot':add('invoke',reads=dict(config=1,locale=1) if normative or not old else dict(config=0,locale=0));add('settle',types=['paragraph'],reads=dict(config=1,locale=1 if normative or not old else 0))
 elif kind=='invalid':
  data=caller(s,old);add('invoke',caller=data);add('settle',rejected=True if normative else problem is not None,errorName=('RangeError' if value in ['unknown','sparse-list','legacy-version'] else 'TypeError') if normative else problem['name'] if problem else None,caller=data,unhandled=[])
 else:
  data=caller(s,old);types=['paragraph'] if kind=='opaque-config' else [s['type']] if s.get('type') else ['heading','paragraph','delimiter'] if value=='list' else [] if value=='empty' else ['paragraph','delimiter'] if value in ['document','document-unknown'] else TYPES
  shape=['function' if op in ['renderer-load','renderer-preload'] or old and op=='plugin-preload' else 'object']*len(types);add('invoke',caller=data);add('settle',error=None if normative else problem,types=types if normative or not problem else [],shape=shape if normative or not problem else None,caller=data,unhandled=[])
 add('recover',types=['paragraph'],unhandled=pending);return result
def verify_case(c,source='candidate'):
 s=c['spec'];assert c['id']==s['id'] and c['planned']==c['completedPhases']==['invoke','settle','recover'] and c['error'] is None and c['unsupported']==[] and c['callError']==failure(s,source) and c['unhandled']==unhandled(s,source)
 actual=observations(s,source);expected=observations(s,source,True);assert len(c['observations'])==len(expected);differences=[]
 for o,(phase,key,observed),(_,_,wanted) in zip(c['observations'],actual,expected):
  status='PASS' if same(observed,wanted) else 'FAIL';assert (o['phase'],o['property'])==(phase,key) and same(o['actual'],observed) and same(o['expected'],wanted) and o['status']==status,(s['id'],phase,key,o,observed,wanted)
  if status=='FAIL':differences.append(dict(id=s['id'],phase=phase,property=key))
 return differences

def package_bindings():
 blocks=[('link-preview' if t=='linkPreview' else t,t[0].upper()+t[1:]) for t in TYPES]
 tools=[('bold','createBoldTool'),('italic','createItalicTool'),('strikethrough','createStrikethroughTool'),('link','createLinkTool'),('code','createCodeTool'),('marker','createMarkerTool'),('colorPicker','createBgColorTool'),('fontSize','createFontSizeTool'),('scriptTool','createScriptTool'),('align','createAlignTool'),('caseTransform','createCaseTransformTool'),('clearFormatting','createClearFormattingTool')]
 modules=[('', ['createEditor'],'dist/index.js'),('/plugin-kit',['sanitizeHtml','setSanitizedHtml','insertSanitizedHtml','normalizeRichText','canonicalizeRichText','escapeHtml','getTextOffset','getTextLength','findNodeAtOffset','restoreSelectionByOffsets','editableTextWalker','handleMenuKeydown','uid','setSafeUrlAttribute'],'dist/plugin-kit/index.js'),('/preset',['createDefaultInlineTools'],'dist/preset/index.js'),('/plugins',['create'+name+'Plugin' for _,name in blocks],'dist/plugins/index.js'),('/plugins/async',['getAsyncBlockPluginTypes','loadBlockPluginDefinition','preloadBlockPluginDefinitions','createBlockPluginsAsync'],'dist/plugins/async.js'),('/renderer',['EditorRenderer','getSupportedBlockTypes'],'dist/renderer/index.js'),('/renderer/renderers',['getSupportedBlockTypes','createDefaultRenderers','createRenderer'],'dist/renderer/renderers/index.js'),('/renderer/renderers/async',['getAsyncRendererTypes','loadRendererFactory','preloadRendererFactories','createRendererAsync','createDefaultRenderersAsync'],'dist/renderer/renderers/async.js')]+[('/plugins/'+path,['create'+name+'Plugin'],'dist/plugins/'+path+'/index.js') for path,name in blocks]+[('/renderer/renderers/'+path,['create'+('Header' if name=='Heading' else name)+'Renderer'],'dist/renderer/renderers/'+path+'/index.js') for path,name in blocks]+[('/inline-plugins/color',['createColorSwatchPlugin'],'dist/inline-plugins/color.js'),('/inline-plugins/mention',['createMentionPlugin'],'dist/inline-plugins/mention/index.js')]+[('/inline-tools/'+path,[name],'dist/inline-tools/'+path+'.js') for path,name in tools]+[('/locale/'+lang,[],'dist/locale/'+lang+'.js') for lang in ['en','ru']]
 styles=[('/styles.css','dist/styles.css'),('/styles/editor.css','dist/styles/editor.css'),('/styles/renderer.css','dist/styles/renderer.css')]+[(url,file) for path,_ in blocks for url,file in [('/plugins/'+path+'/styles.css','dist/styles/plugins/'+path+'.css'),('/renderer/renderers/'+path+'/styles.css','dist/styles/renderers/'+path+'.css')]]+[('/inline-plugins/'+name+'/styles.css','dist/styles/inline-plugins/'+name+'.css') for name in ['color','mention']]+[('/styles/themes/'+name+ext,'dist/core/themes/'+name+'.css') for name in ['variables','light','dark'] for ext in ['', '.css']]
 return modules,styles
def verify_package(report,tarball,manifest,contract):
 assert report['status']=='PASS' and report['node']=='v24.22.2' and report['platform']=='win32 x64' and report['modules']==66 and report['styles']==53 and report['rejectedRuntimeEntries']==6 and report['installedPackage'] is True
 assert report['tarball']=='shelamkoff-rector-'+manifest['version']+'.tgz' and report['tarballSha256']==sha(tarball) and report['tarballBytes']==len(tarball) and report['contractSha256']==sha(contract)
 modules,styles=package_bindings();assert len(modules)==66 and len(styles)==53 and len(report['results'])==125
 ts='\n'.join("import * as entry"+str(i)+" from '@shelamkoff/rector"+path+"'\nvoid ["+','.join('entry'+str(i)+'.'+name for name in names or ['default'])+"]" for i,(path,names,_) in enumerate(modules))+'\n';assert report['typescriptSha256']==sha(ts.encode())
 with tarfile.open(fileobj=io.BytesIO(tarball),mode='r:gz') as archive:
  entries=archive.getmembers();assert len({entry.name for entry in entries})==len(entries)
  for entry in entries:assert entry.name.startswith('package/') and '..' not in entry.name.split('/') and not any(p in ['node_modules','tests','benchmarks','docs','.vitepress'] for p in entry.name.split('/')) and not entry.name.endswith(('.html','.vue')) and entry.isfile()
  def read(path):return archive.extractfile('package/'+path).read()
  published=json.loads(read('package.json'))
  for key in ['name','version','exports','dependencies','files']:assert published[key]==manifest[key]
  wanted=[]
  def declaration_text(path,seen=None):
   import posixpath
   seen=set() if seen is None else seen
   if path in seen:return ''
   seen.add(path);text=read(path).decode();combined=text
   for target in re.findall(r'''export\s+\*\s+from\s+['"]([^'"]+)['"]''',text):
    assert target.startswith('.')
    next_path=posixpath.normpath(posixpath.join(posixpath.dirname(path),target));assert next_path.startswith('dist/')
    combined+='\n'+declaration_text(next_path[:-3]+'.d.ts' if next_path.endswith('.js') else next_path,seen)
   return combined
  for path,names,file in modules:
   b=read(file);assert b;wanted.append(dict(kind='module',specifier='@shelamkoff/rector'+path,names=names,file=file,sha256=sha(b)))
   declaration=declaration_text(file[:-3]+'.d.ts');assert declaration
   for name in names:assert re.search(r'\b'+re.escape(name)+r'\b',declaration),(path,name)
  for path,file in styles:
   b=read(file);assert b;wanted.append(dict(kind='style',specifier='@shelamkoff/rector'+path,file=file,bytes=len(b),sha256=sha(b)))
  for path in ['/renderer/async','/inline-tools','/core','/shared/DocumentSchema','/types','/renderer/types']:wanted.append(dict(kind='rejected-runtime-entry',specifier='@shelamkoff/rector'+path,code='ERR_PACKAGE_PATH_NOT_EXPORTED'))
  assert report['results']==wanted
  for path in ['dist/types.d.ts','dist/renderer/types.d.ts','README.md','LICENSE','NOTICE','THIRD_PARTY_LICENSES.txt']:assert read(path)
 return dict(modules=66,styles=53,rejectedRuntimeEntries=6,bindings=125,tarballSha256=sha(tarball),tarballBytes=len(tarball),typescriptSha256=report['typescriptSha256'])

def validate_identity(d,source,helper,working=False):
 assert d['headBefore']==d['headAfter']==source and d['group']=='async-presets' and d['filter']=='' and d['serverErrors']==[] and d['node']=='v24.22.2' and d['browser']=='156.0.8078.80' and d['platform']=='win32 x64'
 assert [(s['label'],s['sha']) for s in d['sources']]==[('v1',V1),('spec-baseline',BASELINE),('parent',PARENT),('candidate',source)]
 own=['scripts/parity/async-presets.mjs','tests/browser/async-presets-fixture.js'];queries=[s['sha']+':'+p for s in d['sources'] for p in s['loaded']]+[source+':'+p for p in own];blobs=helper['git_blobs'](queries)
 for s in d['sources']:
  assert s['tree']==subprocess.check_output(['git','rev-parse',s['sha']+'^{tree}']).decode().strip() and len(s['loaded'])>80
  for path,h in s['loaded'].items():assert sha(blobs[s['sha']+':'+path])==h
 assert d['runnerSha256']==sha(blobs[source+':'+own[0]]) and d['fixtureSha256']==sha(blobs[source+':'+own[1]])
 if working:
  for path in own:assert Path(path).read_bytes().replace(b'\r\n',b'\n')==blobs[source+':'+path]
 for path,h in d['dependencyFiles'].items():assert sha((Path('node_modules')/path).read_bytes())==h
 for name,version in d['dependencyVersions'].items():assert json.loads((Path('node_modules')/name/'package.json').read_bytes())['version']==version
 assert d['packageLockSha256']==sha(Path('package-lock.json').read_bytes())
 return sum(len(s['loaded']) for s in d['sources'])


def main():
 p=argparse.ArgumentParser();p.add_argument('--raw',type=Path,required=True);p.add_argument('--package-report',type=Path,required=True);p.add_argument('--tarball',type=Path,required=True);p.add_argument('--candidate',required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
 helper_path='scripts/parity/checkpoints/2026-11-03/extension-tasks/review.py';helper_bytes=subprocess.check_output(['git','show','0aa9e27eb7899089f45b62eec0f11b8fd9d1f805:'+helper_path]);assert Path(helper_path).read_bytes().replace(b'\r\n',b'\n')==helper_bytes;helper={'__name__':'accepted_identity_helper'};exec(compile(helper_bytes,'accepted-identity-helper','exec'),helper)
 service_path='scripts/parity/checkpoints/2026-11-04/embed-services/review.py';service_bytes=helper['git_blobs'](['cb88f9fbb7be0afb45763651932dabae3c1d5efd:'+service_path])['cb88f9fbb7be0afb45763651932dabae3c1d5efd:'+service_path];assert Path(service_path).read_bytes().replace(b'\r\n',b'\n')==service_bytes;service={'__name__':'accepted_environment_helper'};exec(compile(service_bytes,'accepted-environment-helper','exec'),service)
 raw=a.raw.read_bytes();d=json.loads(raw);modules=validate_identity(d,a.candidate,helper,True);assert d['candidatePass'] is True and [(r['source'],r['trustedPolicy']) for r in d['results']]==[('v1',False),('spec-baseline',False),('parent',False),('candidate',False),('candidate',True)]
 summaries={}
 for row in d['results']:
  service['validate_environment'](row);assert row['inputErrors']==row['unavailable']==row['mediaRequests']==[] and row['policyEnforced'] is row['trustedPolicy'] and [c['spec'] for c in row['cases']]==specs()
  count=4 if row['source'] in ['spec-baseline','parent'] else 0;assert len(row['pageErrors'])==count
  for e in row['pageErrors']:
   assert re.fullmatch(r'Error: Earlier nested config failure\n    at runAsyncPresetCase \(http://127\.0\.0\.1:[0-9]+/fixture\.js:[0-9]+:[0-9]+\)\n    at async eval \(eval at evaluate \(:[0-9]+:[0-9]+\), <anonymous>:[0-9]+:[0-9]+\)\n    at async <anonymous>:[0-9]+:[0-9]+',e)
  failures=[f for c in row['cases'] for f in verify_case(c,row['source'])];assert len(failures)==(74 if row['source']=='v1' else 8 if row['source'] in ['spec-baseline','parent'] else 0)
  key=row['source']+('/trusted' if row['trustedPolicy'] else '/compatible');summaries[key]=dict(cases=len(row['cases']),observations=sum(len(c['observations']) for c in row['cases']),differences=failures,pageErrors=count,blockedEnvironmentRequests=len(row['environmentRequests']))
 assert all(s['cases']==131 and s['observations']==990 for s in summaries.values())
 own=['scripts/parity/checkpoints/2026-11-04/async-presets/review.py','scripts/parity/checkpoints/2026-11-04/async-presets/controls.mjs','scripts/package-public-exports.mjs','scripts/package-consumer-gate.mjs','package.json'];blobs=helper['git_blobs']([a.candidate+':'+path for path in own])
 for path in own:assert Path(path).read_bytes().replace(b'\r\n',b'\n')==blobs[a.candidate+':'+path]
 package_raw=a.package_report.read_bytes();package=verify_package(json.loads(package_raw),a.tarball.read_bytes(),json.loads(blobs[a.candidate+':package.json']),blobs[a.candidate+':scripts/package-public-exports.mjs'])
 runtime=['core','shared','plugins','plugin-kit','inline-tools','inline-plugins','renderer','preset','locale','index.js','index.d.ts','types.d.ts','package.json','package-lock.json'];assert subprocess.check_output(['git','diff','--name-only',RUNTIME,a.candidate,'--',*runtime])==b'';assert subprocess.check_output(['git','diff','--name-only',PARENT,RUNTIME,'--',*runtime]).decode().splitlines()==['plugins/async.js']
 report=dict(status='PASS',candidate=a.candidate,runtimeBasis=RUNTIME,parent=PARENT,currentCases=262,currentObservations=1980,casesPerPolicy=131,observationsPerPolicy=990,moduleIdentities=modules,results=summaries,package=package,rawSha256=sha(raw),packageReportSha256=sha(package_raw),reviewerSha256=sha(Path(__file__).read_bytes()),identityHelperSha256=sha(helper_bytes),environmentHelperSha256=sha(service_bytes),scope='Every canonical async type and seven operation families execute their real public APIs. Legacy constructor spelling and document envelope spelling alone are adapted. Unknown document and explicit-list routes retain distinct current contracts. Four original orphaned-rejection controls are retained on the immutable parent. The installed package contract checks runtime imports, declarations, CSS, private/type-only runtime rejection and exact retained tarball bytes.')
 a.output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report))
if __name__=='__main__':main()
