import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const CANONICAL_ACCENT = '#4357b4'

function readToken(css, name) {
  return css.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1].trim()
}

function relativeLuminance(hex) {
  const value = hex.replace('#', '')
  const normalized = value.length === 3
    ? [...value].map(channel => channel.repeat(2)).join('')
    : value
  const channels = normalized.match(/[a-f\d]{2}/gi).map(channel => parseInt(channel, 16) / 255)
  const [red, green, blue] = channels.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue)
}

function contrastRatio(foreground, background) {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background))
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background))
  return (lighter + 0.05) / (darker + 0.05)
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

test('light theme tertiary text keeps accessible contrast', async () => {
  const light = await readFile(new URL('./themes/light.css', import.meta.url), 'utf8')
  const background = readToken(light, 'oe-bg')
  const tertiaryText = readToken(light, 'oe-text-3')

  assert.ok(contrastRatio(tertiaryText, background) >= 4.5)
})
