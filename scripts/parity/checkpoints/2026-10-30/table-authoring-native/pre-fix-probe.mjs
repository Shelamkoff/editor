// Portable public block ROUNDTRIP differential. Supply immutable baseline roots
// and an installed Playwright module; no production module is transformed.
// See block-roundtrip.md for the exact invocation and result boundaries.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repo = resolve(process.env.EDITOR_REPO_ROOT)
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const git = (...args) => execFileSync('git', args, { cwd: repo })
const baselineRoot = name => {
  assert(process.env[name], `${name} must name an immutable Git archive directory`)
  return resolve(process.env[name])
}
const playwright = process.env.EDITOR_PLAYWRIGHT_PATH
const { chromium } = await import(playwright ? pathToFileURL(resolve(playwright)).href : 'playwright')
const startedAt = new Date().toISOString()
const sourceSha256 = digest(await readFile(fileURLToPath(import.meta.url)))
const headBefore = git('rev-parse', 'HEAD').toString().trim()
const requestedFilter = process.env.EDITOR_ROUNDTRIP_FILTER ?? ''
const sources = [
  { label: 'v1', sha: '5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340', root: baselineRoot('EDITOR_V1_ROOT'), legacy: true },
  { label: 'candidate', sha: process.env.EDITOR_CANDIDATE_SHA ?? headBefore, root: resolve(process.env.EDITOR_CANDIDATE_ROOT ?? repo), legacy: false },
].map(source => ({ ...source, loaded: {} }))

const dependencyRoot = resolve(process.env.EDITOR_DEPENDENCIES_ROOT ?? join(repo, 'node_modules'))
const imports = { dompurify: '/dependencies/dompurify/dist/purify.es.mjs' }
const dependencyVersions = { dompurify: JSON.parse(await readFile(join(dependencyRoot, 'dompurify/package.json'), 'utf8')).version }
const manifest = JSON.parse(await readFile(join(repo, 'package.json'), 'utf8'))
const pendingPackages = Object.keys(manifest.dependencies).filter(name => name.startsWith('@shelamkoff/'))
const packages = new Set()
while (pendingPackages.length) {
  const name = pendingPackages.shift()
  if (packages.has(name)) continue
  packages.add(name)
  const dependency = JSON.parse(await readFile(join(dependencyRoot, name, 'package.json'), 'utf8'))
  const entry = dependency.exports?.['.']
  const imported = typeof entry === 'string' ? entry : entry?.import
  assert.equal(typeof imported, 'string', `No public ESM entry for ${name}`)
  imports[name] = '/dependencies/' + name + '/' + imported.replace(/^\.\//, '')
  dependencyVersions[name] = dependency.version
  pendingPackages.push(...Object.keys(dependency.dependencies ?? {}).filter(id => id.startsWith('@shelamkoff/')))
}

const loaded = new Map(), dependencyFiles = {}, serverErrors = []
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname
    if (pathname === '/favicon.ico') { response.statusCode = 204; response.end(); return }
    if (pathname === '/') {
      response.setHeader('content-type', 'text/html')
      response.end('<!doctype html><html><head><meta charset="utf-8"><title>Block roundtrip differential</title>'
        + '<script type="importmap">' + JSON.stringify({ imports }) + '</script></head><body></body></html>')
      return
    }
    response.setHeader('content-type', extname(pathname) === '.css' ? 'text/css' : 'text/javascript')
    if (!loaded.has(pathname)) {
      const source = sources.find(value => pathname.startsWith('/' + value.label + '/'))
      assert(source || pathname.startsWith('/dependencies/'), 'Unexpected fixture URL: ' + pathname)
      const relative = pathname.slice(source ? source.label.length + 2 : '/dependencies/'.length)
      const root = source?.root ?? dependencyRoot
      const path = resolve(root, relative)
      assert(path.startsWith(resolve(root) + '/'), 'Fixture URL escaped its source root')
      const bytes = await readFile(path)
      if (source) {
        assert.deepEqual(bytes, git('show', `${source.sha}:${relative}`), `${source.label}/${relative} differs from its pinned Git source`)
        source.loaded[relative] = digest(bytes)
      } else dependencyFiles[relative] = digest(bytes)
      loaded.set(pathname, { bytes, path })
    }
    response.end(loaded.get(pathname).bytes)
  } catch (error) {
    serverErrors.push(String(error))
    response.statusCode = 500
    response.end(String(error))
  }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
let browser
const observations = []
try {
  browser = await chromium.launch({ executablePath: process.env.EDITOR_CHROME_PATH, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  const origin = `http://127.0.0.1:${server.address().port}`
  for (const source of sources) {
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(String(error)))
    await page.goto(origin + '/')
    await page.evaluate(async source => {
      const base = '/' + source.label + '/'
      const { createEditor } = await import(base + 'core/index.js')
      const tableModule = await import(base + 'plugins/table/index.js')
      const holder = document.createElement('section')
      document.body.append(holder)
      const definition = source.legacy ? new tableModule.Table({injectStyles:false}) : tableModule.createTablePlugin({injectStyles:false})
      const data = source.legacy ? {withHeadings:false,content:[['<b>Alpha</b>','Bravo']]} : {
        withHeadings:false,rows:[{id:'row',cells:[{id:'first',text:'<b>Alpha</b>'},{id:'second',text:'Bravo'}]}],
      }
      const input = {version:source.legacy?'1.0.5':'2.0.0',blocks:[{id:'table',type:'table',...(!source.legacy?{dataVersion:2}:{}),data}]}
      const beforeInput = JSON.stringify(input)
      const editor = createEditor({holder,plugins:[definition],defaultBlock:'table',inlinePlugins:[],inlineTools:[],injectStyles:false,data:input})
      const field = holder.querySelector('.oe-table__cell')
      field.focus()
      const text = field.querySelector('b').firstChild
      const selection = getSelection()
      selection.setBaseAndExtent(text,5,text,5)
      const trusted = []
      for(const type of ['keydown','beforeinput','input']) field.addEventListener(type,event=>trusted.push({type,key:event.key??null,inputType:event.inputType??null,isTrusted:event.isTrusted}))
      window.probe = {editor,holder,input,beforeInput,field,trusted}
      window.observe = () => {
        const {editor,holder,input,beforeInput,field,trusted} = window.probe
        const selection = getSelection()
        return {saved:editor.save().blocks,html:field.innerHTML,text:field.textContent,boldText:field.querySelector('b')?.textContent??'',
          active:document.activeElement===field,anchor:selection.anchorNode?.nodeName,anchorText:selection.anchorNode?.textContent,anchorOffset:selection.anchorOffset,
          inputUnchanged:JSON.stringify(input)===beforeInput,canUndo:editor.canUndo,canRedo:editor.canRedo,trusted:[...trusted]}
      }
    }, source)
    const before = await page.evaluate(()=>window.observe())
    await page.keyboard.press('Enter')
    const afterEnter = await page.evaluate(()=>window.observe())
    await page.keyboard.type('X')
    const afterInput = await page.evaluate(()=>window.observe())
    await page.keyboard.press('Control+z')
    const undoInput = await page.evaluate(()=>window.observe())
    await page.keyboard.press('Control+z')
    const undoEnter = await page.evaluate(()=>window.observe())
    observations.push({source:source.label,before,afterEnter,afterInput,undoInput,undoEnter,errors})
    await page.evaluate(()=>{window.probe.editor.destroy();window.probe.holder.remove()})
    await page.close()
  }
  for(const {bytes,path} of loaded.values())assert.deepEqual(await readFile(path),bytes)
  console.log(JSON.stringify({scope:'Real Table Enter at the end of bold text, trusted follow-up input and separate Undo on pinned v1/current sources; behavioral investigation, not full parity acceptance.',sourceSha256,startedAt,finishedAt:new Date().toISOString(),browser:browser.version(),sources,dependencyVersions,dependencyFiles,serverErrors,observations,sourceUnchanged:true,sourceIdentityVerified:serverErrors.length===0},null,2))
  assert.deepEqual(serverErrors,[])
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve))}
