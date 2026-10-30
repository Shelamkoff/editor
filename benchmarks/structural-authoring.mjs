import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { cpus, loadavg, release, totalmem } from 'node:os'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'

// Two immutable source checkouts, one identical fixture and dependency set.
// node benchmarks/structural-authoring.mjs BASELINE CANDIDATE OUTPUT_DIRECTORY
// Controls also run in the registered native-core-behavior browser page.
const [baseline, candidate, destination] = process.argv.slice(2)
assert(baseline && candidate && destination, 'Provide baseline, candidate and an empty output directory')
const repo = fileURLToPath(new URL('../', import.meta.url))
const output = resolve(destination)
await mkdir(output, { recursive: false })
const hash = value => createHash('sha256').update(value).digest('hex')
const git = (root, ...args) => execFileSync('git', args, { cwd: root, maxBuffer: 64 * 1024 * 1024 })
const sources = [baseline, candidate].map((root, index) => ({
  label: index ? 'candidate' : 'baseline', root: resolve(root),
  sha: git(root, 'rev-parse', 'HEAD').toString().trim(), files: {},
}))
const fixturePath = join(repo, 'tests/browser/structural-authoring-fixture.js')
const fixture = await readFile(fixturePath)
const dependencyRoot = resolve(process.env.EDITOR_DEPENDENCIES_ROOT ?? join(repo, 'node_modules'))
const dependencyFiles = {}, dependencyVersions = {}
const imports = { dompurify: '/dependencies/dompurify/dist/purify.es.mjs' }
dependencyVersions.dompurify = JSON.parse(await readFile(join(dependencyRoot, 'dompurify/package.json'), 'utf8')).version
const manifest = JSON.parse(await readFile(join(repo, 'package.json'), 'utf8'))
const pending = Object.keys(manifest.dependencies).filter(name => name.startsWith('@shelamkoff/'))
while (pending.length) {
  const name = pending.shift()
  if (Object.hasOwn(dependencyVersions, name)) continue
  const dependency = JSON.parse(await readFile(join(dependencyRoot, name, 'package.json'), 'utf8'))
  const entry = dependency.exports?.['.']
  const imported = typeof entry === 'string' ? entry : entry?.import
  assert.equal(typeof imported, 'string', `Missing ESM entry: ${name}`)
  imports[name] = '/dependencies/' + name + '/' + imported.replace(/^\.\//, '')
  dependencyVersions[name] = dependency.version
  pending.push(...Object.keys(dependency.dependencies ?? {}).filter(id => id.startsWith('@shelamkoff/')))
}
const loaded = new Map(), serverErrors = []
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname
    if (path === '/favicon.ico') { response.writeHead(204); response.end(); return }
    if (path === '/') {
      response.setHeader('content-type', 'text/html')
      response.end('<!doctype html><html><head><meta charset="utf-8"><title>Structural authoring</title>'
        + '<script type="importmap">' + JSON.stringify({ imports }) + '</script></head><body></body></html>')
      return
    }
    response.setHeader('content-type', extname(path) === '.css' ? 'text/css' : 'text/javascript')
    if (path === '/fixture.js') { response.end(fixture); return }
    if (!loaded.has(path)) {
      const source = sources.find(value => path.startsWith('/' + value.label + '/'))
      assert(source || path.startsWith('/dependencies/'), 'Unexpected URL: ' + path)
      const relative = path.slice(source ? source.label.length + 2 : '/dependencies/'.length)
      const root = source?.root ?? dependencyRoot, filename = resolve(root, relative)
      assert(filename.startsWith(root + '/'), 'Path escaped fixture root')
      const bytes = await readFile(filename)
      if (source) {
        assert.deepEqual(bytes, git(root, 'show', `${source.sha}:${relative}`), `${source.label}/${relative} is not the pinned source`)
        source.files[relative] = hash(bytes)
      } else dependencyFiles[relative] = hash(bytes)
      loaded.set(path, { bytes, filename })
    }
    response.end(loaded.get(path).bytes)
  } catch (error) { serverErrors.push(error.stack ?? String(error)); response.writeHead(500); response.end(String(error)) }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const playwright = process.env.EDITOR_PLAYWRIGHT_PATH
const { chromium } = await import(playwright ? pathToFileURL(resolve(playwright)).href : 'playwright')
const warmup = Number(process.env.EDITOR_STRUCTURAL_WARMUP ?? 5)
const repeats = Number(process.env.EDITOR_STRUCTURAL_SAMPLES ?? 21)
const requestedStages = (process.env.EDITOR_STRUCTURAL_STAGES ?? 'controls,timing,attribution,memory').split(',')
const kinds = ['noop-empty', 'noop-equal', 'public', 'native']
const results = { startedAt: new Date().toISOString(), outcome: 'running',
  boundaries: {
    synchronousMs: 'Public command return, or trusted beforeinput through completed input event; includes schema, projection, history and event observers. No paint is inferred.',
    notificationMs: 'Command/input start through scheduled onChange delivery, configured changeDebounceMs=0.',
    settledRenderOpportunityMs: 'Start through notification then two animation frames; a render opportunity, not proof of a paint.',
    trace: 'Separate Chrome trace: actual Layout/Paint/UpdateLayoutTree records within marked command+notification+frame windows.',
    allocation: 'Separate V8 statistical allocation profiles; sampled byte estimates include the full edit/undo/redo/reset sequence and oracle checks. Not retained heap size.',
    retention: 'Separate forced-GC observations of released event envelopes and mutable snapshots, with live positive controls. Heap usage is an observation, not an allocation count.',
  },
  environment: { node: process.version, v8: process.versions.v8, platform: process.platform, architecture: process.arch,
    osRelease: release(), cpuModel: cpus()[0]?.model, cpuCount: cpus().length, memoryBytes: totalmem(), loadBefore: loadavg(),
    viewport: { width: 1100, height: 900 }, browserArguments: ['--no-sandbox', '--disable-dev-shm-usage'],
    chromePath: process.env.EDITOR_CHROME_PATH ?? null },
  runnerSha256: hash(await readFile(new URL(import.meta.url))), fixtureSha256: hash(fixture),
  lockSha256: hash(await readFile(join(repo, 'package-lock.json'))), warmup, repeats, requestedStages,
  order: 'Paired variants alternate first/second by sample; no overlapping benchmark samples.',
  controls: [], timings: [], attribution: [], memory: [], pageErrors: [], serverErrors,
}
let browser
const percentile = (values, fraction) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * fraction))]
async function makePage(source) {
  const page = await browser.newPage({ viewport: results.environment.viewport })
  const cdp = await page.context().newCDPSession(page)
  page.on('pageerror', error => results.pageErrors.push({ variant: source.label, error: error.stack ?? String(error) }))
  await page.exposeFunction('__structuralInput', async (action, value) => {
    if (action === 'type') await page.keyboard.type(value)
    else if (action === 'compose') await cdp.send('Input.imeSetComposition', value)
    else if (action === 'insert') await cdp.send('Input.insertText', { text: value })
    else throw new Error('Unknown native action: ' + action)
  })
  await page.goto(`http://127.0.0.1:${server.address().port}/`)
  return { source, page, cdp }
}
async function mount(subject, shape, sensitivity = null) {
  await subject.page.bringToFront()
  return subject.page.evaluate(async ({ prefix, shape, sensitivity }) => {
    const { createStructuralFixture } = await import('/fixture.js')
    window.fixture = await createStructuralFixture(shape, { prefix, native: window.__structuralInput, sensitivity })
    return window.fixture.metadata
  }, { prefix: '/' + subject.source.label, shape, sensitivity })
}
async function sample(subject, kind, options = {}) {
  await subject.page.bringToFront()
  return subject.page.evaluate(({ kind, options }) => window.fixture.sample(kind, options), { kind, options })
}
async function unmount(subject) {
  await subject.page.evaluate(() => { window.fixture?.destroy(); window.fixture = null })
}
async function traced(subject, kind, traceId) {
  const traceEvents = []
  const collect = event => traceEvents.push(...event.value)
  subject.cdp.on('Tracing.dataCollected', collect)
  await subject.cdp.send('Tracing.start', { categories: 'devtools.timeline,blink.user_timing', transferMode: 'ReportEvents' })
  let observations
  try { observations = await sample(subject, kind, { traceId }) }
  finally {
    const complete = new Promise(resolve => subject.cdp.once('Tracing.tracingComplete', resolve))
    await subject.cdp.send('Tracing.end'); await complete
    subject.cdp.off('Tracing.dataCollected', collect)
  }
  await writeFile(join(output, traceId + '.trace.json.gz'), gzipSync(JSON.stringify({ traceEvents })))
  const windows = observations.map(observation => {
    const start = traceEvents.find(event => event.name === observation.traceId + ':start')
    const end = traceEvents.find(event => event.name === observation.traceId + ':end')
    assert(start && end && end.ts >= start.ts, 'Trace lost a command boundary')
    const totals = {}
    for (const name of ['Layout', 'Paint', 'UpdateLayoutTree']) {
      const events = traceEvents.filter(event => event.pid === start.pid && event.name === name && event.ph === 'X' && event.ts >= start.ts && event.ts < end.ts)
      totals[name] = { count: events.length, durationMs: events.reduce((sum, event) => sum + (event.dur ?? 0), 0) / 1000 }
    }
    return { kind: observation.kind, totals }
  })
  return { artifact: traceId + '.trace.json.gz', windows }
}
try {
  browser = await chromium.launch({ headless: true, args: results.environment.browserArguments,
    ...(process.env.EDITOR_CHROME_PATH ? { executablePath: process.env.EDITOR_CHROME_PATH } : {}) })
  results.environment.browser = browser.version()
  const subjects = await Promise.all(sources.map(makePage))
  results.environment.browserProtocol = await subjects[0].cdp.send('Browser.getVersion')
  const shapes = await subjects[0].page.evaluate(async filter => {
    const { structuralShapes } = await import('/fixture.js')
    return structuralShapes.filter(shape => !filter || shape.id.includes(filter))
  }, process.env.EDITOR_STRUCTURAL_FILTER ?? '')
  assert(shapes.length, 'No selected structural shapes')
  for (const shape of shapes) {
    const metadata = []
    for (const subject of subjects) metadata.push(await mount(subject, shape))
    assert.deepEqual(metadata[0], metadata[1], 'Variants did not mount equal fixtures')
    try {
      if (requestedStages.includes('controls')) for (const subject of subjects) {
        for (const kind of [...kinds, 'composition']) {
          const observations = await sample(subject, kind, { traceId: `${subject.source.label}-${shape.id}-control-${kind}` })
          results.controls.push({ variant: subject.source.label, shape: shape.id, kind, outcome: 'passed', observations })
        }
      }
      if (requestedStages.includes('timing')) for (const kind of kinds) {
        const raw = [[], []]
        for (const subject of subjects) for (let count = 0; count < warmup; count++) await sample(subject, kind)
        for (let round = 0; round < repeats; round++) for (const index of round % 2 ? [1, 0] : [0, 1]) {
          raw[index].push(await sample(subjects[index], kind, { traceId: `${subjects[index].source.label}-${shape.id}-${kind}-${round}` }))
        }
        for (const [index, subject] of subjects.entries()) {
          const summaries = raw[index][0].map((step, at) => ({ kind: step.kind, metrics: Object.fromEntries(
            ['synchronousMs', 'notificationMs', 'settledRenderOpportunityMs'].map(metric => {
              const values = raw[index].map(sample => sample[at][metric]).filter(value => value !== null)
              return [metric, values.length ? { p50: percentile(values, .5), p95: percentile(values, .95), min: Math.min(...values), max: Math.max(...values) } : null]
            }),
          ) }))
          results.timings.push({ variant: subject.source.label, shape: shape.id, kind, metadata: metadata[index], summaries, rawSamples: raw[index] })
        }
      }
      if (requestedStages.includes('attribution')) for (const subject of subjects) for (const kind of kinds) {
        const id = `${subject.source.label}-${shape.id}-${kind}`
        const counted = await sample(subject, kind, { instrument: true, traceId: id + '-counted' })
        const trace = await traced(subject, kind, id)
        await subject.cdp.send('HeapProfiler.startSampling', { samplingInterval: 8192,
          includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true })
        try { await sample(subject, kind, { traceId: id + '-allocated' }) }
        finally {
          const { profile } = await subject.cdp.send('HeapProfiler.stopSampling')
          await writeFile(join(output, id + '.allocation.json.gz'), gzipSync(JSON.stringify(profile)))
          results.attribution.push({ variant: subject.source.label, shape: shape.id, kind, counted, trace,
            allocation: { artifact: id + '.allocation.json.gz', samplingInterval: 8192,
              sampledBytes: profile.samples.reduce((sum, sample) => sum + sample.size, 0), samples: profile.samples.length,
              includesCollectedObjects: true, includesResetAndOracle: true } })
        }
      }
      if (requestedStages.includes('memory')) for (const subject of subjects) {
        await subject.page.evaluate(() => window.fixture.beginRetention())
        await subject.cdp.send('HeapProfiler.collectGarbage')
        const before = await subject.cdp.send('Runtime.getHeapUsage')
        for (let round = 0; round < 12; round++) await sample(subject, round % 2 ? 'native' : 'public')
        for (let round = 0; round < 3; round++) {
          await subject.cdp.send('HeapProfiler.collectGarbage')
          await subject.page.evaluate(() => new Promise(resolve => setTimeout(resolve, 10)))
        }
        const after = await subject.cdp.send('Runtime.getHeapUsage')
        const observation = await subject.page.evaluate(() => window.fixture.observeRetention())
        assert.equal(observation.livePositiveControl, true, 'GC control was not live')
        assert.equal(observation.retainedReleasedObjects, 0, 'Released event or public snapshot remained reachable')
        results.memory.push({ variant: subject.source.label, shape: shape.id, iterations: 12, before, after, observation })
      }
    } finally { for (const subject of subjects) await unmount(subject) }
    console.log('Completed structural shape: ' + shape.id)
  }
  if (requestedStages.includes('controls')) for (const subject of subjects) for (const sensitivity of ['sibling-data', 'missing-notification']) {
    await mount(subject, { id: 'table-small', type: 'table', size: 2 }, sensitivity)
    let failure
    try { await sample(subject, 'public') } catch (error) { failure = error.message } finally { await unmount(subject) }
    assert.match(failure ?? '', sensitivity === 'sibling-data' ? /Structural DOM differs/ : /Missing scheduled onChange/)
    results.controls.push({ variant: subject.source.label, sensitivity, outcome: 'deliberate-failure-detected', failure })
  }
  assert.deepEqual(results.pageErrors, [], 'Unexpected browser errors')
  assert.deepEqual(serverErrors, [], 'Unexpected source server errors')
  results.outcome = 'passed'
} catch (error) { results.outcome = 'failed'; results.error = error.stack ?? String(error); process.exitCode = 1 }
finally {
  await browser?.close()
  await new Promise(resolve => server.close(resolve))
  results.sources = sources
  results.dependencies = { root: dependencyRoot, versions: dependencyVersions, files: dependencyFiles }
  results.sourceUnchanged = true
  for (const { bytes, filename } of loaded.values()) if (!bytes.equals(await readFile(filename))) results.sourceUnchanged = false
  if (!fixture.equals(await readFile(fixturePath))) results.sourceUnchanged = false
  if (!results.sourceUnchanged) { results.outcome = 'failed'; process.exitCode = 1 }
  results.finishedAt = new Date().toISOString(); results.environment.loadAfter = loadavg()
  await writeFile(join(output, 'results.json'), JSON.stringify(results, null, 2) + '\n')
  console.log(JSON.stringify({ outcome: results.outcome, output, error: results.error ?? null }))
}
