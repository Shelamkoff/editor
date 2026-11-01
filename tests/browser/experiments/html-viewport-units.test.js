import assert from 'node:assert/strict'
import test from 'node:test'
import { rebaseViewportUnits } from './html-viewport-units.js'

const viewport = { width: 1100, height: 800, vertical: false }
for (const [input, expected] of [
  ['calc(100vh + 20px)', 'calc(800px + 20px)'],
  ['min(50vw, 20vmin)', 'min(550px, 160px)'],
  ['1svh 1lvw 1dvh 1vmax', '8px 11px 8px 11px'],
  ['1vi 1vb', '11px 8px'],
  ['-.5vw +2VH 1e1vh', '-5.5px 16px 80px'],
  ['var(--10vh, calc(2vw + 1px))', 'var(--10vh, calc(22px + 1px))'],
  ['url(https://example.test/10vh.png) 20vh', 'url(https://example.test/10vh.png) 160px'],
  ['url("10vh.png") 2vh', 'url("10vh.png") 16px'],
  ['image-set(url(10vh.png) 1x, url(20vw.png) 2x)', 'image-set(url(10vh.png) 1x, url(20vw.png) 2x)'],
  ['/* 100vh */ "50vw" 3vh', '/* 100vh */ "50vw" 24px'],
  ['#100vh .theme-50vw { --size: 10vh; height: var(--size) }', '#100vh .theme-50vw { --size: 80px; height: var(--size) }'],
  ['10v\\68  1e1vW', '80px  110px'],
  // The first space terminates the hex escape, so the following digit is
  // still part of this unrecognized dimension unit rather than a new token.
  ['10v\\68 1e1vW', '10v\\68 1e1vW'],
  ['-0vh 0vw', '-0px 0px'],
]) test(`parent viewport dimension tokens: ${input}`, () => {
  assert.equal(rebaseViewportUnits(input, viewport), expected)
})

test('logical viewport units follow the content root writing mode', () => {
  assert.equal(rebaseViewportUnits('10vi 10vb', { ...viewport, vertical: true }), '80px 110px')
})

test('ordinary units, identifiers, custom-property names and quoted escapes remain literal', () => {
  const input = '1.5em 201px 150% --100vh theme100vh "a\\\"100vh" url(data:image/png,a100vh)'
  assert.equal(rebaseViewportUnits(input, viewport), input)
})

test('each parent resize uses the source value without cumulative scaling', () => {
  const input = 'calc(100vh + 20px)'
  assert.equal(rebaseViewportUnits(input, { ...viewport, height: 500 }), 'calc(500px + 20px)')
  assert.equal(rebaseViewportUnits(input, { ...viewport, height: 700 }), 'calc(700px + 20px)')
})
