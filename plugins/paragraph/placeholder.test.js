// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'
import { Paragraph } from './index.js'

test('Paragraph preserves an explicit constructor placeholder over the editor placeholder', () => {
  const paragraph = new Paragraph({ placeholder: '' })

  paragraph.setPlaceholder('Editor placeholder')

  assert.equal(paragraph.getPluginConfig().placeholder, '')
})

test('Paragraph accepts an empty editor placeholder as an explicit override', () => {
  const paragraph = new Paragraph()

  paragraph.setPlaceholder('')

  assert.equal(paragraph.getPluginConfig().placeholder, '')
  assert.equal(Object.hasOwn(paragraph.getPluginConfig(), 'placeholder'), true)
})
