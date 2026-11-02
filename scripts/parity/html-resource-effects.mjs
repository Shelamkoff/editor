import assert from 'node:assert/strict';
import { createServer as createHttpServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createServer } from '../../node_modules/vite/dist/node/index.js';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findChrome } from '../../tests/browser/environment.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const { chromium } = await import(process.env.EDITOR_PLAYWRIGHT_PATH ? pathToFileURL(resolve(process.env.EDITOR_PLAYWRIGHT_PATH)).href : 'playwright');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const paths = ['scripts/parity/html-resource-effects.mjs', 'shared/embeddedHtml.js', 'shared/embeddedHtmlDocument.js', 'shared/sanitize/sanitizeRawHtml.js', 'shared/sanitize/sanitizeUrl.js', 'shared/sanitize/trustedHtml.js', 'shared/rebaseContentViewport.js', 'plugins/raw/index.js', 'plugins/carousel/index.js', 'renderer/EditorRenderer.js', 'renderer/renderers/raw/index.js', 'renderer/renderers/carousel/index.js', 'package-lock.json', 'node_modules/dompurify/dist/purify.es.mjs', 'node_modules/vitepress/dist/client/theme-default/fonts/inter-roman-latin.woff2', 'tests/browser/carousel-roundtrip-16x16.webm'];
const sourceHashes = Object.fromEntries(paths.map(path => [path, hash(readFileSync(resolve(root, path)))]));
const head = execFileSync('git', ['rev-parse', 'HEAD']).toString().trim(), startedAt = new Date().toISOString();
const git = (...args) => execFileSync('git', args, { cwd: root, maxBuffer: 64 * 1024 * 1024 });
const [argumentRef, extraArgument] = process.argv.slice(2);
assert.equal(extraArgument, undefined, 'Provide at most one immutable production revision');
const requestedRef = argumentRef ?? process.env.EDITOR_RESOURCE_REF;
const sourceRef = requestedRef
    ? git('rev-parse', '--verify', '--end-of-options', requestedRef + '^{commit}').toString().trim() : null;
const modules = {}, moduleBytes = new Map();
const sourcePlugin = {
    name: 'resource-source-identity', enforce: 'pre',
    load(id) {
        const file = resolve(id.split('?')[0]);
        const path = relative(root, file).split(sep).join('/');
        if (!/^(?:core|shared|plugins|plugin-kit|inline-plugins|inline-tools|renderer|preset|locale)\/.+\.(?:js|css)$/.test(path)) return;
        if (!moduleBytes.has(path)) moduleBytes.set(path, sourceRef ? git('show', sourceRef + ':' + path) : readFileSync(file));
        const bytes = moduleBytes.get(path);
        modules[path] = hash(bytes);
        // Vite still performs its ordinary JS/CSS compilation. The supplied
        // production bytes are exact Git objects, without behavior adapters.
        return sourceRef ? bytes.toString('utf8') : undefined;
    },
};
const requests = [], gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'), font = readFileSync('node_modules/vitepress/dist/client/theme-default/fonts/inter-roman-latin.woff2'), video = readFileSync('tests/browser/carousel-roundtrip-16x16.webm');
function resource(req, res) { const url = new URL(req.url, 'http://resource'); if (!url.pathname.startsWith('/resource-'))
    return false; const kind = url.searchParams.get('kind'); requests.push({ case: url.searchParams.get('case'), kind, path: url.pathname, cookie: req.headers.cookie ?? '', origin: req.headers.origin ?? '', referer: req.headers.referer ?? '', range: req.headers.range ?? '' }); res.setHeader('cache-control', 'no-store'); res.setHeader('access-control-allow-origin', '*'); if (kind === 'forbidden') {
    res.setHeader('content-type', 'text/html');
    res.end('<!doctype html><p>Forbidden resource</p>');
    return true;
} const bytes = url.pathname.endsWith('.woff2') ? font : url.pathname.endsWith('.webm') ? video : gif; res.setHeader('content-type', url.pathname.endsWith('.woff2') ? 'font/woff2' : url.pathname.endsWith('.webm') ? 'video/webm' : 'image/gif'); if (url.pathname.endsWith('.webm')) {
    res.setHeader('accept-ranges', 'bytes');
    const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? '');
    if (match) {
        const from = +match[1], to = match[2] ? +match[2] : bytes.length - 1;
        res.statusCode = 206;
        res.setHeader('content-range', `bytes ${from}-${to}/${bytes.length}`);
        res.end(bytes.subarray(from, to + 1));
        return true;
    }
} res.end(bytes); return true; }
const remote = createHttpServer((req, res) => { if (!resource(req, res)) {
    res.statusCode = 404;
    res.end();
} });
await new Promise(resolve => remote.listen(0, '127.0.0.1', resolve));
const remoteOrigin = 'http://127.0.0.1:' + remote.address().port;
let origin, browser;
const server = await createServer({ cacheDir: 'test-results/html-resource-network-cache', logLevel: 'error', server: { host: '127.0.0.1', port: 0 }, plugins: [sourcePlugin, { name: 'resource-reference', configureServer(server) { server.middlewares.use((req, res, next) => { if (req.url === '/resource-owner') {
                res.setHeader('content-type', 'text/html');
                res.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
                res.setHeader('content-security-policy', `default-src 'self';script-src 'self';style-src 'self' 'unsafe-inline';img-src 'self' ${remoteOrigin} data: blob:;font-src 'self' ${remoteOrigin};media-src 'self' ${remoteOrigin} blob:;object-src 'none';require-trusted-types-for 'script';trusted-types rector dompurify`);
                res.end('<!doctype html><title>HTML resource effects</title>');
                return;
            } if (resource(req, res))
                return; next(); }); } }] });
try {
    await server.listen();
    origin = server.resolvedUrls.local[0].replace(/\/$/, '');
    browser = await chromium.launch({ headless: true, executablePath: findChrome() });
    const results = [];
    for (const profile of ['same-origin', 'cross-origin'])
        for (const cssMode of ['plain', 'grouped'])
            for (const surface of ['native', 'native-cssom', 'raw-editor', 'raw-renderer', 'carousel-editor', 'carousel-renderer']) {
                const context = await browser.newContext({ viewport: { width: 1000, height: 800 }, deviceScaleFactor: 1 });
                await context.addCookies([{ name: 'task_owner', value: 'owned-resource', url: origin, httpOnly: true, sameSite: 'Lax' }]);
                const page = await context.newPage(), errors = [];
                page.on('pageerror', e => errors.push(String(e)));
                await page.goto(origin + '/resource-owner');
                const caseId = profile + '-' + cssMode + '-' + surface;
                let observation, resized, error;
                try {
                    await page.evaluate(async ({ profile, surface, caseId, remoteOrigin, cssMode }) => {
                        const base = profile === 'same-origin' ? '' : remoteOrigin, url = (path, kind) => `${base}/resource-${path}?case=${caseId}&kind=${kind}`;
                        const html = `<p id="proof">Resource font</p><div id="viewport">Viewport</div><div id="animation">Animation</div><img id="relative" src="${url('relative.gif', 'relative')}"><img id="responsive" src="${url('fallback.gif', 'fallback')}" srcset="${url('srcset.gif', 'srcset')} 1x, ${url('retina.gif', 'retina')} 2x"><img id="private" referrerpolicy="no-referrer" src="${url('private.gif', 'private')}"><img id="policy-default" ${surface.startsWith('native') ? '' : 'referrerpolicy="unsafe-url"'} src="${url('policy.gif', 'policy-default')}"><div id="inline" style="width:4px;height:4px;background-image:url('${url('inline.gif', 'inline-css')}')"></div><div id="application">Application CSS</div><video id="video" width="16" height="16" preload="metadata" controls poster="${url('poster.gif', 'poster')}" src="${url('media.webm', 'media')}"></video>`;
                        const contentStyles = [`@font-face{font-family:ResourceProof;src:url('${url('font.woff2', 'font')}') format('woff2')}html,body{margin:0}#proof{font:24px ResourceProof}#viewport{width:10vw;height:10vh}#animation{animation:ResourceDrift 10s linear infinite}@keyframes ResourceDrift{from{transform:translateX(0)}to{transform:translateX(10vw)}}#application{width:4px;height:4px;background-image:url('${url('application.gif', 'application-css')}')}`];
                        if (cssMode === 'grouped')
                            contentStyles[0] = `@supports(width:10vw){@media(min-width:1px){${contentStyles[0]}}}`;
                        const holder = document.createElement('section');
                        holder.style.width = '600px';
                        document.body.append(holder);
                        let editor, renderer, child = document, frame;
                        if (surface.startsWith('native')) {
                            const { toTrustedHtml } = await import('/shared/sanitize/trustedHtml.js');
                            holder.innerHTML = toTrustedHtml(html);
                            const sheet = new CSSStyleSheet();
                            sheet.replaceSync(contentStyles[0]);
                            document.adoptedStyleSheets = [sheet];
                        }
                        else {
                            const [type, mode] = surface.split('-'), danger = `<base href="${remoteOrigin}/forbidden/"><iframe src="${url('forbidden.html', 'forbidden')}"></iframe><link rel="stylesheet" href="${url('forbidden.css', 'forbidden')}"><script src="${url('forbidden.js', 'forbidden')}"></script>`, source = danger + html;
                            const data = { version: '2.0.0', blocks: [{ id: 'content', type, dataVersion: 1, data: type === 'raw' ? { html: source } : { slides: [{ id: 'html', type: 'html', html: source, caption: '' }], options: { loop: false, autoplay: false, autoplayDelay: 3000, navigation: true, pagination: true, thumbnails: false } } }] };
                            const before = JSON.stringify(data.blocks);
                            if (mode === 'editor') {
                                const { createEditor } = await import('/core/index.js'), module = await import('/plugins/' + type + '/index.js');
                                editor = createEditor({ holder, data, contentStyles, readOnly: true, injectStyles: false, plugins: [type === 'raw' ? module.createRawPlugin({ injectStyles: false }) : module.createCarouselPlugin({ injectStyles: false })] });
                            }
                            else {
                                const { EditorRenderer } = await import('/renderer/index.js');
                                renderer = new EditorRenderer({ blockTypes: [type], contentStyles, injectStyles: false });
                                renderer.renderTo(data, holder);
                            }
                            frame = holder.querySelector('iframe');
                            const deadline = performance.now() + 5000;
                            while (!frame.contentDocument?.querySelector('#proof')) {
                                if (performance.now() > deadline)
                                    throw Error('Authored resource content unavailable');
                                await new Promise(resolve => setTimeout(resolve, 10));
                            }
                            child = frame.contentDocument;
                            window.sourceUnchanged = () => JSON.stringify(editor ? editor.save().blocks : data.blocks) === before;
                        }
                        const fontReady = async () => {
                            let timer;
                            try { await Promise.race([child.fonts.ready, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Native font readiness timed out')), 5000); })]); }
                            finally { clearTimeout(timer); }
                        };
                        await fontReady();
                        const deadline = performance.now() + 5000;
                        while ([...child.querySelectorAll('img')].some(image => !image.complete || !image.naturalWidth) || child.querySelector('#video').readyState < 1) {
                            if (performance.now() > deadline)
                                throw Error('Native image/media decode did not settle');
                            await new Promise(resolve => setTimeout(resolve, 10));
                        }
                        const video = child.querySelector('#video'), faces = [...child.fonts], animation = child.querySelector('#animation').getAnimations()[0], firstTime = animation?.currentTime;
                        window.resourceProbe = { holder, child, frame, fontReady, sourceUnchanged: window.sourceUnchanged ?? (() => true), read: () => ({ font: child.fonts.check('24px ResourceProof'), sameFaces: [...child.fonts].every((face, at) => face === faces[at]), animationPresent: !!animation, animationPreserved: child.querySelector('#animation').getAnimations()[0] === animation, animationAdvances: typeof animation?.currentTime === 'number' && animation.currentTime >= firstTime, faces: [...child.fonts].map(face => ({ family: face.family, status: face.status })), viewport: { width: child.querySelector('#viewport').getBoundingClientRect().width, height: child.querySelector('#viewport').getBoundingClientRect().height }, referrerPolicy: child.querySelector('#private').getAttribute('referrerpolicy'), untrustedReferrerPolicy: child.querySelector('#policy-default').getAttribute('referrerpolicy'), image: [...child.querySelectorAll('img')].map(image => ({ id: image.id, width: image.naturalWidth, src: new URL(image.currentSrc).pathname })), media: { width: video.videoWidth, height: video.videoHeight }, forbidden: child.querySelectorAll('base,iframe,link,script').length }), destroy: () => { editor?.destroy(); renderer?.destroy(); holder.remove(); } };
                    }, { profile, surface, caseId, remoteOrigin, cssMode });
                    await page.waitForTimeout(120);
                    observation = await page.evaluate(() => { const p = window.resourceProbe; return { ...p.read(), sourceUnchanged: p.sourceUnchanged() }; });
                    await page.setViewportSize({ width: 1200, height: 900 });
                    if (surface === 'native-cssom')
                        await page.evaluate(() => { const find = rules => { for (const rule of rules) {
                            if (rule.name === 'ResourceDrift')
                                return rule;
                            if (rule.cssRules) {
                                const found = find(rule.cssRules);
                                if (found)
                                    return found;
                            }
                        } }; find(window.resourceProbe.child.adoptedStyleSheets[0].cssRules).cssRules[1].style.transform = 'translateX(120px)'; });
                    await page.evaluate(async () => { await window.resourceProbe.fontReady(); });
                    await page.waitForTimeout(150);
                    resized = await page.evaluate(() => { const p = window.resourceProbe, result = { ...p.read(), sourceUnchanged: p.sourceUnchanged() }; p.destroy(); return result; });
                }
                catch (e) {
                    error = String(e);
                }
                const network = requests.filter(r => r.case === caseId).map(({ case: _case, ...r }) => r).sort((a, b) => a.kind.localeCompare(b.kind) || a.path.localeCompare(b.path));
                results.push({ profile, cssMode, surface, observation, resized, network, errors, error });
                await context.close();
            }
    const failures = [];
    for (const row of results) {
        try {
            assert.equal(row.error, undefined);
            assert.deepEqual(row.errors, []);
            assert.equal(row.observation.font, true);
            for (const phase of [row.observation, row.resized])
                for (const key of ['animationPresent', 'animationPreserved', 'animationAdvances'])
                    assert.equal(phase[key], true, key);
            assert.deepEqual(row.observation.faces, [{ family: 'ResourceProof', status: 'loaded' }]);
            assert.equal(row.observation.referrerPolicy, 'no-referrer');
            assert.equal(row.observation.untrustedReferrerPolicy, null, 'Author content must not increase referrer exposure');
            assert.equal(row.observation.sameFaces, true);
            const cssom = results.find(r => r.profile === row.profile && r.cssMode === row.cssMode && r.surface === 'native-cssom');
            if (!row.resized.sameFaces)
                assert.equal(cssom.resized.sameFaces, false, 'Independent native keyframe mutation must explain FontFace identity changes');
            assert.deepEqual([...new Set(row.network.map(r => r.kind))].sort(), ['application-css', 'font', 'inline-css', 'media', 'policy-default', 'poster', 'private', 'relative', 'srcset']);
            assert.equal(row.observation.sourceUnchanged, true);
            assert.equal(row.observation.forbidden, 0);
            const control = results.find(r => r.profile === row.profile && r.cssMode === row.cssMode && r.surface === 'native');
            if (row.surface !== 'native') {
                assert.deepEqual(row.observation.image, control.observation.image);
                assert.deepEqual(row.observation.media, control.observation.media);
                assert.deepEqual(row.observation.viewport, control.observation.viewport);
                const { sameFaces: actualIdentity, ...actualResize } = row.resized, { sameFaces: referenceIdentity, ...expectedResize } = control.resized;
                assert.deepEqual(actualResize, expectedResize);
                assert.deepEqual(row.network, control.network);
            }
            assert(!row.network.some(r => ['forbidden', 'fallback', 'retina'].includes(r.kind)));
            for (const r of row.network) {
                assert.equal(r.cookie, row.profile === 'cross-origin' && r.kind === 'font' ? '' : 'task_owner=owned-resource');
                assert.equal(r.referer, r.kind === 'private' ? '' : row.profile === 'cross-origin' ? origin + '/' : origin + '/resource-owner');
            }
        }
        catch (error) {
            failures.push({ profile: row.profile, cssMode: row.cssMode, surface: row.surface, error: String(error) });
        }
    }
    for (const [path, digest] of Object.entries(sourceHashes))
        assert.equal(hash(readFileSync(resolve(root, path))), digest, 'Source changed: ' + path);
    for (const [path, digest] of Object.entries(modules))
        assert.equal(hash(sourceRef ? git('show', sourceRef + ':' + path) : readFileSync(resolve(root, path))), digest, 'Loaded source changed: ' + path);
    assert.equal(execFileSync('git', ['rev-parse', 'HEAD']).toString().trim(), head);
    const candidatePass = results.length === 24 && failures.length === 0;
    console.log(JSON.stringify({ scope: 'Real HTTP resource, credential and referrer comparison on four public HTML surfaces against independent native markup and native CSSOM keyframe controls; actual viewport resize without production behavior adapters', head, sourceHashes,
        productionSource: { storage: sourceRef ? 'git-object' : 'working-tree', sha: sourceRef, modules },
        sourceUnchanged: true, startedAt, finishedAt: new Date().toISOString(), node: process.version, browser: browser.version(), origin, remoteOrigin, results, failures, candidatePass }, null, 2));
    if (!candidatePass)
        process.exitCode = 1;
}
finally {
    await browser?.close();
    await server.close();
    await new Promise(resolve => remote.close(resolve));
}
