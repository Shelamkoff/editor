import test from 'node:test'
import assert from 'node:assert/strict'

import { decideMentionLabelEdit, mentionCharacterDeletion } from './labelEdit.js'

const edit = (display, range, replacement, trigger = '@', current = {id:'member-1', name:'Alice'}) =>
  decideMentionLabelEdit({ trigger, current, display, range, replacement })

test('editing authored label text preserves Mention identity and returns the local caret', () => {
  assert.deepEqual(edit('@Alice',{start:2,end:3},'ll'),
    {kind:'update',data:{id:'member-1',name:'Allce'},caret:4})
})

test('removing the trigger converts the label to ordinary text without retaining identity', () => {
  assert.deepEqual(edit('@Alice',{start:0,end:1},''),
    {kind:'replace-text',text:'Alice',caret:0})
})

test('deleting the entire label removes its occurrence and returns zero caret', () => {
  assert.deepEqual(edit('@',{start:0,end:1},'', '@', {id:'member-1',name:''}),
    {kind:'remove',caret:0})
})

test('inserting plain text before a surviving trigger retires Mention identity', () => {
  assert.deepEqual(edit('@Alice',{start:0,end:0},'Hello '),
    {kind:'replace-text',text:'Hello @Alice',caret:6})
})

test('whitespace is meaningful author label content', () => {
  assert.deepEqual(edit('@Alice',{start:2,end:2},' '),
    {kind:'update',data:{id:'member-1',name:'A lice'},caret:3})
})

test('a supplementary Unicode trigger is one code point but two UTF-16 units', () => {
  assert.deepEqual(edit('🌀Alice',{start:2,end:3},'', '🌀'),
    {kind:'update',data:{id:'member-1',name:'lice'},caret:2})
  assert.deepEqual(edit('🌀Alice',{start:0,end:2},'', '🌀'),
    {kind:'replace-text',text:'Alice',caret:0})
})

test('a paste replacing a whole label with ordinary text does not preserve its identity', () => {
  assert.deepEqual(edit('@Alice',{start:0,end:6},'Other'),
    {kind:'replace-text',text:'Other',caret:5})
})

test('range bounds and surrogate boundaries must be valid before any decision', () => {
  for (const range of [
    {start:-1,end:2}, {start:5,end:2}, {start:0,end:9},
    {start:1.5,end:2}, {start:0,end:NaN},
  ]) {
    assert.throws(()=>edit('@Alice',range,''),TypeError)
  }
  assert.throws(()=>edit('🌀Alice',{start:1,end:2},'', '🌀'),TypeError)
})

test('one code-point deletion fallback never separates a surrogate pair', () => {
  assert.deepEqual(mentionCharacterDeletion('@😀A',3,'backward'),{start:1,end:3})
  assert.deepEqual(mentionCharacterDeletion('@😀A',1,'forward'),{start:1,end:3})
  assert.deepEqual(mentionCharacterDeletion('@😀A',4,'backward'),{start:3,end:4})
  assert.equal(mentionCharacterDeletion('@😀A',2,'backward'),null)
})

test('missing-range directional boundaries do not invent an edit', () => {
  assert.equal(mentionCharacterDeletion('abc',0,'backward'),null)
  assert.equal(mentionCharacterDeletion('abc',3,'forward'),null)
  assert.equal(mentionCharacterDeletion('abc',1,'word'),null)
})

test('result is detached from original payload and frozen', () => {
  const original={id:'member-1',name:'Alice'}
  const result=edit('@Alice',{start:1,end:2},'B','@',original)
  assert.equal(original.name,'Alice')
  assert.equal(Object.isFrozen(result),true)
  assert.equal(Object.isFrozen(result.data),true)
})
