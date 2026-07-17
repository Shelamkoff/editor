// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'
import { claimEditorHolder } from './EditorHolderOwnership.js'

test('a holder belongs to one live editor and becomes reusable after release', () => {
  const holder = {}
  const first = claimEditorHolder(holder)
  assert.throws(() => claimEditorHolder(holder), /already owns a live editor/)
  first.destroy()
  assert.doesNotThrow(() => claimEditorHolder(holder).destroy())
  assert.doesNotThrow(() => first.destroy())
})
