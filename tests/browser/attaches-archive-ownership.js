import JSZip from 'jszip'
import { createAttachesRenderer } from '../../renderer/renderers/attaches/index.js'

// Real DOM, AbortSignal, streaming Response and JSZip. Requests are controlled;
// clicking the generated download anchor is intercepted to inspect its bytes.
export async function runAttachesArchiveOwnership() {
  const cases = []
  for (const mode of ['abort-destroy', 'abort-successor-destroy', 'abort-successor-complete', 'ordinary-replacement']) {
    const entry = { id: `attaches-archive/${mode}`, observations: [], errors: [], complete: false }
    const check = (property, actual, expected) => entry.observations.push({
      property, actual: structuredClone(actual), expected: structuredClone(expected),
      status: JSON.stringify(actual) === JSON.stringify(expected) ? 'PASS' : 'FAIL',
    })
    const originalFetch = window.fetch
    const originalClick = HTMLAnchorElement.prototype.click
    const originalCreate = URL.createObjectURL
    const originalRevoke = URL.revokeObjectURL
    const requests = [], downloads = [], created = [], revoked = []
    const payloads = [[65, 10], [66, 0, 255]]
    const renderer = createAttachesRenderer('archive-test', {})
    let wrapper
    let control
    const tick = () => new Promise(resolve => setTimeout(resolve, 10))
    const until = async predicate => {
      const deadline = performance.now() + 3000
      while (!predicate()) {
        if (performance.now() > deadline) throw new Error('Archive did not settle')
        await tick()
      }
    }
    const resolveAll = () => {
      for (const request of requests) request.resolve(new Response(new Uint8Array(payloads[request.index])))
    }
    try {
      window.fetch = (url, { signal }) => {
        const index = ['/zip-ownership/one', '/zip-ownership/two'].indexOf(String(url))
        if (index < 0) throw new Error(`Unexpected archive URL: ${url}`)
        return new Promise(resolve => requests.push({ index, signal, resolve }))
      }
      URL.createObjectURL = blob => {
        const url = originalCreate.call(URL, blob)
        created.push({ url, blob })
        return url
      }
      URL.revokeObjectURL = url => { revoked.push(url); originalRevoke.call(URL, url) }
      HTMLAnchorElement.prototype.click = function () {
        if (this.download === 'files.zip') downloads.push({ name: this.download, blob: created.find(value => value.url === this.href)?.blob })
        else originalClick.call(this)
      }
      wrapper = renderer.render({ data: { variant: 'a', files: [
        { id: 'one', url: '/zip-ownership/one', name: 'report.txt', size: 2, extension: 'txt' },
        { id: 'two', url: '/zip-ownership/two', name: 'report.txt', size: 3, extension: 'txt' },
      ] } }, () => {}, { ownerDocument: document })
      document.body.append(wrapper)
      control = wrapper.querySelector('.archive-test-attaches__group-header .archive-test-attaches__download')
      control.click()
      await until(() => requests.length === 2)
      check('initialRequests', requests.length, 2)
      if (mode === 'abort-destroy') {
        requests[0].signal.addEventListener('abort', () => renderer.destroy(wrapper), { once: true })
      } else if (mode.startsWith('abort-successor')) {
        // Native HTMLElement.click suppresses a recursive click on itself.
        // An application abort observer can dispatch a newer request event.
        requests[0].signal.addEventListener('abort', () => control.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })), { once: true })
      }
      control.click()
      await tick()
      check('requestsAfterReplacement', requests.length, mode === 'abort-destroy' ? 2 : 4)
      check('previousRequestCancelled', requests.slice(0, 2).every(value => value.signal.aborted), true)
      const destroy = mode.endsWith('destroy')
      if (destroy) {
        renderer.destroy(wrapper)
        check('allRequestsCancelled', requests.every(value => value.signal.aborted), true)
      } else {
        check('successorStillLive', requests.slice(2).every(value => !value.signal.aborted), true)
      }
      resolveAll()
      if (!destroy) await until(() => downloads.length > 0)
      // Let compression and URL cleanup settle, including any obsolete work.
      await new Promise(resolve => setTimeout(resolve, 50))
      check('downloadCount', downloads.length, destroy ? 0 : 1)
      if (!destroy) {
        check('downloadName', downloads[0]?.name, 'files.zip')
        check('archiveMime', downloads[0]?.blob?.type, 'application/zip')
        const zip = await JSZip.loadAsync(await downloads[0].blob.arrayBuffer())
        check('archiveNames', Object.keys(zip.files).sort(), ['report (2).txt', 'report.txt'])
        check('firstFileBytes', [...await zip.file('report.txt').async('uint8array')], payloads[0])
        check('secondFileBytes', [...await zip.file('report (2).txt').async('uint8array')], payloads[1])
      }
      check('allCreatedUrlsReleased', revoked.length, created.length)
      check('eachUrlReleasedOnce', new Set(revoked).size, revoked.length)
      renderer.destroy(wrapper)
      const before = requests.length
      control.click(); await tick()
      check('retiredControlInert', requests.length, before)
      entry.complete = true
    } catch (error) { entry.errors.push(error.stack ?? String(error)) }
    finally {
      renderer.destroy(wrapper)
      resolveAll()
      await tick()
      wrapper?.remove()
      window.fetch = originalFetch
      HTMLAnchorElement.prototype.click = originalClick
      URL.createObjectURL = originalCreate
      URL.revokeObjectURL = originalRevoke
    }
    cases.push(entry)
  }
  return cases
}
