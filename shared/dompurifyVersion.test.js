import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import DOMPurify from 'dompurify'

test('runtime sanitizer stays on the audited DOMPurify release', () => {
  assert.equal(DOMPurify.version, '3.4.17')
})

test('the audited sanitizer pin agrees with its resolved lock entry', () => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'))
  assert.equal(manifest.dependencies.dompurify, '3.4.17')
  assert.equal(lock.packages[''].dependencies.dompurify, '3.4.17')
  const resolved = lock.packages['node_modules/dompurify']
  assert.equal(resolved.version, '3.4.17')
  assert.equal(resolved.resolved, 'https://registry.npmjs.org/dompurify/-/dompurify-3.4.17.tgz')
  assert.equal(resolved.integrity, 'sha512-B/pSlYVHQ58kqISD/yDjuJ1yfzI34m1gF4lAod2bwSRhiN4K5Cl3H8Af7hqB2PmTL911tdEudnnXn5FnhRoz0w==')
  assert.equal(resolved.license, '(MPL-2.0 OR Apache-2.0)')
})

test('distributed attribution identifies the installed sanitizer and includes its complete selected license', () => {
  const notice = readFileSync(new URL('../NOTICE', import.meta.url), 'utf8')
  const licenses = readFileSync(new URL('../THIRD_PARTY_LICENSES.txt', import.meta.url), 'utf8')
  const apache = readFileSync(new URL('../LICENSE', import.meta.resolve('dompurify')), 'utf8')
  assert.ok(notice.includes('DOMPurify 3.4.17,'))
  assert.ok(licenses.startsWith('DOMPurify 3.4.17 (Apache-2.0 option selected)\n'))
  assert.ok(licenses.includes('Source: https://github.com/cure53/DOMPurify/tree/3.4.17\n'))
  assert.ok(licenses.includes(apache), 'the selected upstream license must be complete')
})
