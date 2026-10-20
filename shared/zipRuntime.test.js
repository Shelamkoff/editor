import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getZipRuntime,
  loadZipRuntime,
  setZipRuntime,
} from './zipRuntime.js'

test('a later explicitly injected ZIP provider wins over an earlier lazy import', async () => {
  const original = getZipRuntime()
  class PreferredZip {}
  try {
    setZipRuntime(null)
    const pending = loadZipRuntime()
    setZipRuntime(PreferredZip)
    assert.equal(await pending, PreferredZip)
    assert.equal(getZipRuntime(), PreferredZip)
  } finally {
    setZipRuntime(original)
  }
})

test('clearing a completed lazy ZIP provider permits a fresh acquisition', async () => {
  const original = getZipRuntime()
  try {
    setZipRuntime(null)
    const first = await loadZipRuntime()
    assert.equal(getZipRuntime(), first)
    setZipRuntime(null)
    const second = await loadZipRuntime()
    assert.equal(getZipRuntime(), second)
    assert.equal(typeof second, 'function')
  } finally {
    setZipRuntime(original)
  }
})

test('resetting during lazy ZIP import revokes the pending provider publication', async () => {
  const original = getZipRuntime()
  try {
    setZipRuntime(null)
    const oldRequest = loadZipRuntime()
    setZipRuntime(null)
    await oldRequest
    assert.equal(getZipRuntime(), null,
      'a retired import must not republish a ZIP provider after reset')
    const replacement = await loadZipRuntime()
    assert.equal(getZipRuntime(), replacement)
  } finally {
    setZipRuntime(original)
  }
})

test('concurrent ZIP requests share one active lazy import', async () => {
  const original = getZipRuntime()
  try {
    setZipRuntime(null)
    const first = loadZipRuntime()
    const second = loadZipRuntime()
    assert.equal(first, second)
    const loaded = await first
    assert.equal(getZipRuntime(), loaded)
  } finally {
    setZipRuntime(original)
  }
})
