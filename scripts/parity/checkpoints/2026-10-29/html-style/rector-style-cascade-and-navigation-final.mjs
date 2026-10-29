import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chromium } from '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'

const repo = '/workspace/scratch/61a2ad7355f4/editor'
const sources = [
  { name: 'v1', root: '/tmp/rector-v1-5e5c7f8', sha: '5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340' },
  { name: 'current', root: '/tmp/rector-eh-current-948bc554', sha: '948bc5544dcf57a343733f589883973ec7db6cd7' },
]
const files = ['plugins/paragraph/index.js', 'renderer/renderers/paragraph/index.js', 'plugins/raw/index.js', 'plugins/carousel/index.js', 'renderer/renderers/raw/index.js', 'renderer/renderers/carousel/index.js', 'shared/sanitize/sanitizeRawHtml.js', 'shared/sanitize/sanitizeStyle.js', 'shared/sanitize/walker.js']
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
for (const source of sources) {
  source.fileHashes = {}
  for (const file of files) {
    const bytes = await readFile(join(source.root, file))
    assert.deepEqual(bytes, execFileSync('git', ['show', `${source.sha}:${file}`], { cwd: repo }))
    source.fileHashes[file] = digest(bytes)
  }
}
const imports = { dompurify: '/node_modules/dompurify/dist/purify.es.mjs' }
for (const name of ['carousel', 'color-picker', 'cropper', 'event-bus', 'expose', 'infinite-scroll', 'masonry']) {
  const id = '@shelamkoff/' + name
  const manifest = JSON.parse(await readFile(join(repo, 'node_modules', id, 'package.json'), 'utf8'))
  const entry = typeof manifest.exports['.'] === 'string' ? manifest.exports['.'] : manifest.exports['.'].import
  imports[id] = '/node_modules/' + id + '/' + entry.replace(/^\.\//, '')
}
const requests = []
const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost')
  try {
    if (url.pathname === '/fixture') {
      response.setHeader('content-type', 'text/html')
      response.end('<!doctype html><html><head><meta charset="utf-8"><script type="importmap">' + JSON.stringify({ imports }) + '</script><style>html{font-size:16px}body{margin:0;font:20px sans-serif;color:rgb(18,28,38)}#holder{width:600px;margin:140px 40px 30px;border:2px solid #888}.article-accent,#holder code.article-accent{color:rgb(12,84,156);font-size:1.5em}.app-screen-cover{position:fixed;inset:0;z-index:2147483647;background:rgb(240,200,200)}#outside{position:fixed;top:20px;right:20px}</style></head><body><button id="outside">Host action</button><section id="holder"></section></body></html>')
      return
    }
    if (url.pathname === '/destination') {
      requests.push(url.pathname + url.search)
      response.setHeader('content-type', 'text/html')
      response.end('<!doctype html><title>Permitted destination</title><p>Destination</p>')
      return
    }
    if (url.pathname === '/download.txt') {
      requests.push(url.pathname + url.search)
      response.setHeader('content-type', 'text/plain')
      response.end('Rector controlled download\n')
      return
    }
    if (url.pathname === '/probe.webm') {
      response.setHeader('content-type', 'video/webm')
      response.end(await readFile('/tmp/rector-eh-media.webm'))
      return
    }
    const source = sources.find(value => url.pathname.startsWith('/' + value.name + '/'))
    const relative = source ? url.pathname.slice(source.name.length + 2) : url.pathname.slice(1)
    response.setHeader('content-type', extname(relative) === '.css' ? 'text/css' : 'text/javascript')
    response.end(await readFile(join(source?.root ?? repo, relative)))
  } catch (error) { response.statusCode = 404; response.end(String(error)) }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch({ executablePath: '/tmp/rector-browsers/chrome-linux64/chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const context = await browser.newContext({ viewport: { width: 1100, height: 800 }, acceptDownloads: true })
const results = []
const surfaces = ['paragraph-editor', 'paragraph-renderer']
async function mount(source, surface, html) {
  const page = await context.newPage()
  page.setDefaultTimeout(2500)
  const errors = []
  page.on('pageerror', error => errors.push(String(error)))
  await page.goto(origin + '/fixture')
  await page.evaluate(async ({ version, surface, html }) => {
    window.__hostClicks = 0
    document.querySelector('#outside').addEventListener('click', () => window.__hostClicks++)
    const holder = document.querySelector('#holder')
    if (surface === 'native-browser') { holder.innerHTML = html; return }
    const type = 'paragraph'
    const data = { text: html }
    const block = { id: 'probe', type, ...(version === 'current' ? { dataVersion: 2 } : {}), data }
    const documentData = { version: version === 'current' ? '2.0.0' : '1.0.0', blocks: [block] }
    if (surface.endsWith('renderer')) {
      const { EditorRenderer } = await import('/' + version + '/renderer/index.js')
      const renderer = new EditorRenderer({ blockTypes: [type], injectStyles: true })
      renderer.renderTo(documentData, holder)
      window.__owner = renderer
    } else {
      const { createEditor } = await import('/' + version + '/core/index.js')
      const module = await import('/' + version + '/plugins/' + type + '/index.js')
      const plugin = version === 'current'
        ? module.createParagraphPlugin({ injectStyles: true })
        : new module.Paragraph({ injectStyles: true })
      window.__owner = createEditor({ holder, plugins: [plugin], inlineTools: [], inlinePlugins: [],
        defaultBlock: type, readOnly: true, injectStyles: true, minHeight: 0, data: documentData })
    }
  }, { version: source.name, surface, html })
  await page.waitForTimeout(100)
  let content = page
  if (surface === 'raw-editor') {
    const iframe = page.locator('#holder iframe')
    await iframe.waitFor()
    content = await (await iframe.elementHandle()).contentFrame()
    await content.waitForLoadState('domcontentloaded')
  }
  return { page, content, errors }
}
async function hostHit(page) {
  const box = await page.locator('#outside').boundingBox()
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  const element = await page.evaluate(point => document.elementFromPoint(point.x, point.y)?.outerHTML.slice(0, 180), point)
  await page.mouse.click(point.x, point.y)
  return { element, clicked: await page.evaluate(() => window.__hostClicks) }
}

const observations = []
const platformTargets = new Map()
const values = ['16px','16.5px','1.5em','150%','1.5rem','calc(10px + 1em)','201px','250px','inherit']
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
try {
  for (const source of [{name:'platform-control'}, ...sources]) for (const surface of (source.name==='platform-control'?['native-browser']:surfaces)) {
    let entry
    try {
      const html = '<span class="article-accent">Theme annotation</span> ' + values.map((value, index) => `<span style="font-size:${value}">sample-${index}</span>`).join(' ') + ' <code class="article-accent" lang="javascript">const x = 1</code>'
      entry = await mount(source, surface, html)
      const actual = await entry.page.evaluate(() => {
        const parent = (document.querySelector('.oe-paragraph,.editor-paragraph') ?? document.querySelector('#holder'))
        const base = parseFloat(getComputedStyle(parent).fontSize)
        const rem = parseFloat(getComputedStyle(document.documentElement).fontSize)
        return { base, rem, html: parent.innerHTML,
          theme: [...parent.querySelectorAll('.article-accent')].map(el => ({ tag: el.tagName, color: getComputedStyle(el).color, fontSize: getComputedStyle(el).fontSize, lang: el.getAttribute('lang') })),
          samples: [...parent.querySelectorAll('span[style]')].map(el => ({ text: el.textContent, style: el.getAttribute('style'), px: parseFloat(getComputedStyle(el).fontSize) })) }
      })
      const expected = [16,16.5,actual.base*1.5,actual.base*1.5,actual.rem*1.5,10+actual.base,201,250,actual.base]
      const preserved = actual.samples.length === values.length && actual.samples.every((sample,index) => Math.abs(sample.px-expected[index]) < .02)
      observations.push({ source: source.name, surface, scenario:'nine-font-sizes-theme-and-code', status:preserved && actual.theme.length===2 && actual.theme.every(el=>el.color==='rgb(12, 84, 156)') && actual.theme[1].lang==='javascript'?'PASS':'FAIL', values, expected, actual, errors:entry.errors })
    } catch(error) { observations.push({source:source.name,surface,scenario:'nine-font-sizes-theme-and-code',status:'ERROR',error:String(error)}) }
    finally { await entry?.page.close() }
    entry=undefined
    try {
      entry=await mount(source,surface,'Before <span class="app-screen-cover">Foreign fixed host control</span> after')
      const actual=await entry.page.locator('.app-screen-cover').evaluate(el=>({html:el.outerHTML,position:getComputedStyle(el).position,rect:el.getBoundingClientRect().toJSON()}))
      const hit=await hostHit(entry.page)
      observations.push({source:source.name,surface,scenario:'host-class-overlay',status:hit.clicked===1?'PASS':'FAIL',actual,hit,errors:entry.errors})
    } catch(error) { observations.push({source:source.name,surface,scenario:'host-class-overlay',status:'ERROR',error:String(error)}) }
    finally { await entry?.page.close() }
    for(const target of ['_self','_blank','rector-report-window']) {
      entry=undefined
      const opened=[]
      try {
        entry=await mount(source,surface,`<a href="/destination?from=${target}" target="${target}" rel="noopener noreferrer">Open permitted destination</a>`)
        const {page}=entry
        page.on('popup',popup=>opened.push(popup))
        let namedWindow=null
        if(target==='rector-report-window') {
          await page.evaluate(()=>{
            const control=document.createElement('button');control.id='ehtml-host-opener';control.textContent='Open named report';control.style.cssText='position:fixed;top:20px;left:20px'
            control.addEventListener('click',()=>window.open('/destination?initial=1','rector-report-window'));document.body.appendChild(control)
          })
          const waitForPopup=page.waitForEvent('popup');await page.locator('#ehtml-host-opener').click();namedWindow=await waitForPopup;await namedWindow.waitForLoadState('domcontentloaded')
        }
        const selector='#holder a'
        const attrs=await page.locator(selector).evaluate(a=>({target:a.target,rel:a.rel,href:a.getAttribute('href')}))
        await page.locator(selector).click()
        await wait(200)
        const after={mainUrl:page.url(),namedWindowUrl:namedWindow?.url()??null,popups:[]}
        for(const popup of opened) after.popups.push({url:popup.url(),openerIsNull:await popup.evaluate(()=>opener===null),isOriginalNamed:popup===namedWindow})
        if (source.name==='platform-control') platformTargets.set(target,{attrs,after})
        const expected = platformTargets.get(target)
        const passes=JSON.stringify({attrs,after})===JSON.stringify(expected)
        observations.push({source:source.name,surface,scenario:'native-target-'+target,status:source.name==='platform-control'?'CONTROL':passes?'PASS':'FAIL',expected,attrs,after,errors:entry.errors})
      } catch(error) { observations.push({source:source.name,surface,scenario:'native-target-'+target,status:'ERROR',error:String(error)}) }
      finally {for(const popup of opened)await popup.close();await entry?.page.close()}
    }
  }
  console.log(JSON.stringify({scope:'E-STYLE: native computed typography; benign/hostile host classes; real pointer target navigation including existing named window compared with an independent bare-browser control on the same Chromium; required rel attribute stays exact. Immutable archives; no product edits.',timestamp:new Date().toISOString(),node:process.version,browser:await browser.version(),scriptSha256:digest(await readFile(new URL(import.meta.url))),sources,observations},null,2))
  if(observations.some(result=>!['PASS','CONTROL'].includes(result.status)))process.exitCode=1
} finally {await browser.close();await new Promise(resolve=>server.close(resolve))}
