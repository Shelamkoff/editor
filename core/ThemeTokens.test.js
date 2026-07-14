import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const CANONICAL_ACCENT = '#4357b4'

function readToken(css, name) {
  return css.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1].trim()
}

test('built-in themes preserve the editor accent color', async () => {
  const [variables, dark, light] = await Promise.all([
    readFile(new URL('./themes/variables.css', import.meta.url), 'utf8'),
    readFile(new URL('./themes/dark.css', import.meta.url), 'utf8'),
    readFile(new URL('./themes/light.css', import.meta.url), 'utf8'),
  ])

  assert.equal(readToken(variables, 'oe-accent'), CANONICAL_ACCENT)
  assert.equal(readToken(dark, 'oe-accent'), CANONICAL_ACCENT)
  assert.equal(readToken(light, 'oe-accent'), CANONICAL_ACCENT)
  assert.equal(readToken(light, 'oe-accent-text'), CANONICAL_ACCENT)
  assert.equal(readToken(light, 'oe-border-focus'), CANONICAL_ACCENT)
  assert.equal(readToken(light, 'oe-code-inline-text'), CANONICAL_ACCENT)
})
