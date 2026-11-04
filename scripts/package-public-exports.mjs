// Executed from src/ in the isolated installed consumer, never the checkout.
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {dirname,relative,resolve,sep} from 'node:path'
import {fileURLToPath} from 'node:url'
const root=dirname(fileURLToPath(import.meta.resolve('@shelamkoff/rector/package.json')))
assert.equal(root,resolve(fileURLToPath(new URL('../node_modules/@shelamkoff/rector',import.meta.url))))
const blocks=[['paragraph','Paragraph'],['heading','Heading'],['list','List'],['quote','Quote'],['code','Code'],['image','Image'],['delimiter','Delimiter'],['table','Table'],['checklist','Checklist'],['warning','Warning'],['embed','Embed'],['raw','Raw'],['gallery','Gallery'],['carousel','Carousel'],['attaches','Attaches'],['link-preview','LinkPreview'],['toggle','Toggle'],['columns','Columns'],['spoiler','Spoiler'],['poll','Poll'],['person','Person']]
const tools=[['bold','createBoldTool'],['italic','createItalicTool'],['strikethrough','createStrikethroughTool'],['link','createLinkTool'],['code','createCodeTool'],['marker','createMarkerTool'],['colorPicker','createBgColorTool'],['fontSize','createFontSizeTool'],['scriptTool','createScriptTool'],['align','createAlignTool'],['caseTransform','createCaseTransformTool'],['clearFormatting','createClearFormattingTool']]
const modules=[
 ['', ['createEditor']],
 ['/plugin-kit',['sanitizeHtml','setSanitizedHtml','insertSanitizedHtml','normalizeRichText','canonicalizeRichText','escapeHtml','getTextOffset','getTextLength','findNodeAtOffset','restoreSelectionByOffsets','editableTextWalker','handleMenuKeydown','uid','setSafeUrlAttribute']],
 ['/preset',['createDefaultInlineTools']],
 ['/plugins',blocks.map(([,name])=>'create'+name+'Plugin')],
 ['/plugins/async',['getAsyncBlockPluginTypes','loadBlockPluginDefinition','preloadBlockPluginDefinitions','createBlockPluginsAsync']],
 ['/renderer',['EditorRenderer','getSupportedBlockTypes']],
 ['/renderer/renderers',['getSupportedBlockTypes','createDefaultRenderers','createRenderer']],
 ['/renderer/renderers/async',['getAsyncRendererTypes','loadRendererFactory','preloadRendererFactories','createRendererAsync','createDefaultRenderersAsync']],
 ...blocks.map(([path,name])=>['/plugins/'+path,['create'+name+'Plugin']]),
 ...blocks.map(([path,name])=>['/renderer/renderers/'+path,['create'+(name==='Heading'?'Header':name)+'Renderer']]),
 ['/inline-plugins/color',['createColorSwatchPlugin']],['/inline-plugins/mention',['createMentionPlugin']],
 ...tools.map(([path,name])=>['/inline-tools/'+path,[name]]),
 ['/locale/en',[]],['/locale/ru',[]],
]
const hash=b=>createHash('sha256').update(b).digest('hex'),results=[]
for(const[path,names]of modules){
 const specifier='@shelamkoff/rector'+path,url=import.meta.resolve(specifier),file=fileURLToPath(url);assert.ok(file.startsWith(root+sep),specifier+' resolved outside the installed package')
 const module=await import(specifier)
 for(const name of names)assert.equal(typeof module[name],'function',specifier+' '+name)
 if(path==='')assert.deepEqual(Object.keys(module),['createEditor'])
 if(path==='/renderer')assert.equal(Object.hasOwn(module,'createEditorRenderer'),false)
 if(path==='/plugin-kit')for(const name of ['setTrustedHtml','insertTrustedHtml'])assert.equal(Object.hasOwn(module,name),false)
 if(path.startsWith('/locale/'))assert.ok(module.default&&typeof module.default==='object'&&!Array.isArray(module.default))
 results.push({kind:'module',specifier,names,file:relative(root,file).split(sep).join('/'),sha256:hash(await readFile(file))})
}
const styles=['/styles.css','/styles/editor.css','/styles/renderer.css',...blocks.flatMap(([path])=>['/plugins/'+path+'/styles.css','/renderer/renderers/'+path+'/styles.css']),'/inline-plugins/color/styles.css','/inline-plugins/mention/styles.css',...['variables','light','dark'].flatMap(name=>['/styles/themes/'+name,'/styles/themes/'+name+'.css'])]
for(const path of styles){const specifier='@shelamkoff/rector'+path,file=fileURLToPath(import.meta.resolve(specifier));assert.ok(file.startsWith(root+sep));const bytes=await readFile(file);assert.ok(bytes.length>0);results.push({kind:'style',specifier,file:relative(root,file).split(sep).join('/'),bytes:bytes.length,sha256:hash(bytes)})}
for(const path of ['/renderer/async','/inline-tools','/core','/shared/DocumentSchema','/types','/renderer/types']){const specifier='@shelamkoff/rector'+path;let error;try{await import(specifier)}catch(failure){error=failure}assert.equal(error?.code,'ERR_PACKAGE_PATH_NOT_EXPORTED',specifier);results.push({kind:'rejected-runtime-entry',specifier,code:error.code})}
assert.equal(modules.length,66);assert.equal(styles.length,53);assert.equal(results.length,125)
console.log(JSON.stringify({status:'PASS',node:process.version,platform:process.platform+' '+process.arch,modules:66,styles:53,rejectedRuntimeEntries:6,installedPackage:true,results}))
