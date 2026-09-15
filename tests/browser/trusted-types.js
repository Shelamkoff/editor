import { Raw } from '../../plugins/raw/index.js'

const results = []
function assert(value, message) { if (!value) throw new Error(message) }
async function test(name, fn) {
  try { await fn(); results.push({ name, status: 'PASS' }) }
  catch (error) { results.push({ name, status: 'FAIL', error: error?.stack ?? String(error) }) }
}

await test('Raw preview assigns TrustedHTML under require-trusted-types-for', async () => {
  assert(typeof /** @type {any} */ (globalThis).trustedTypes === 'object', 'Trusted Types API unavailable under the test browser')
  const raw = new Raw()
  let wrapper = null
  try {
    wrapper = raw.render(
      { html: '<p style="color:red" onclick="bad()">safe</p><script>bad()</script>' },
      {
        ownerDocument: document,
        readOnly: true,
        mutate(fn) { return fn() },
      },
    )
    document.body.appendChild(wrapper)
    const frame = wrapper.querySelector('iframe')
    assert(frame, 'Raw preview iframe missing')
    assert(frame.srcdoc.includes('safe'), 'safe Raw content missing from preview')
    assert(!/onclick|<script/i.test(frame.srcdoc), 'unsafe Raw content survived preview sanitization')
  } finally {
    if (wrapper) {
      raw.destroy(wrapper)
      wrapper.remove()
    }
  }
})

const failed = results.filter(result => result.status !== 'PASS')
document.querySelector('#result').textContent = JSON.stringify(results, null, 2)
document.body.dataset.status = failed.length ? 'fail' : 'pass'
