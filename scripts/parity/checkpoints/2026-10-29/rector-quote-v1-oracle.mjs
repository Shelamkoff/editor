import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { chromium } from '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'

const root = '/tmp/rector-v1-5e5c7f8'
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname
    if (pathname === '/') {
      response.setHeader('content-type', 'text/html')
      response.end('<!doctype html><title>Rector v1 Quote oracle</title>')
      return
    }
    response.setHeader('content-type', extname(pathname) === '.js' ? 'text/javascript' : 'text/plain')
    response.end(await readFile(join(root, pathname)))
  } catch (error) {
    response.statusCode = 404
    response.end(String(error))
  }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const browser = await chromium.launch({ executablePath: '/tmp/rector-browsers/chrome-linux64/chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
try {
  const page = await browser.newPage()
  await page.goto(`http://127.0.0.1:${server.address().port}/`)
  const results = await page.evaluate(async () => {
    const { Quote } = await import('/plugins/quote/index.js')
    const plugin = new Quote()
    return ['cite', 'footer', 'figcaption'].map(tag => {
      const element = document.createElement('blockquote')
      element.innerHTML = `<b>Quoted &amp; marked</b><${tag}><i>Author &amp; source</i></${tag}>`
      const before = element.outerHTML
      const actual = plugin.onPaste({ type: 'tag', element })
      if (actual.text !== '<b>Quoted &amp; marked</b>' || actual.caption !== '<i>Author &amp; source</i>' || element.outerHTML !== before) {
        throw new Error(`Baseline ${tag} failed: ${JSON.stringify(actual)}`)
      }
      return { tag, actual, inputUnchanged: element.outerHTML === before }
    })
  })
  console.log(JSON.stringify({ source: '5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340', browser: await browser.version(), boundary: 'Quote.onPaste real DOM, source imports unmodified', results }, null, 2))
} finally {
  await browser.close()
  await new Promise(resolve => server.close(resolve))
}
