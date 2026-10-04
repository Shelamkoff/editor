import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative, isAbsolute } from 'node:path'
import { findChrome } from '../tests/browser/environment.mjs'

test('browser discovery returns a configured file without launching it', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'rector-browser-discovery-'))
  const configured = process.env.EDITOR_CHROME_PATH
  try {
    const browser = join(directory, 'browser.exe')
    // An inert file cannot answer --version. Discovery must only locate it:
    // probing chrome.exe this way can open a blank window on Windows.
    await writeFile(browser, '')
    process.env.EDITOR_CHROME_PATH = browser
    assert.equal(findChrome(), browser)
  } finally {
    if (configured === undefined) delete process.env.EDITOR_CHROME_PATH
    else process.env.EDITOR_CHROME_PATH = configured
    const withinTemp = relative(tmpdir(), directory)
    assert.ok(withinTemp && !withinTemp.startsWith('..') && !isAbsolute(withinTemp))
    await rm(directory, { recursive: true, force: true })
  }
})
