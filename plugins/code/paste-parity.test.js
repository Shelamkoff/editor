import test from 'node:test'
import assert from 'node:assert/strict'

import { createCodePlugin } from './index.js'

// Signature examples from Rector v1 Code.pasteConfig; test the user-visible
// decision to create Code rather than treating recognized source as prose.
const supported = [
  ['PHP', '<?php echo 42;'],
  ['JavaScript', "import { value } from 'pkg'"],
  ['TypeScript', 'interface Shape {'],
  ['Python', 'def greet(name):'],
  ['HTML', '<!DOCTYPE html>'],
  ['CSS', '@media (max-width: 600px) {'],
  ['JSON', '{\n  "count": 1\n}'],
  ['SQL', 'CREATE TABLE entries (id int)'],
  ['Bash', '#!/usr/bin/env bash'],
  ['Go', 'package main\n\nfunc main() {}'],
  ['Rust', 'fn main() {'],
  ['Java', 'public static void main(String[] args) {'],
  ['Kotlin', 'fun main() {'],
  ['Swift', 'import Foundation'],
  ['C++', '#include <iostream>'],
  ['C#', 'using System;'],
  ['XML', '<?xml version="1.0"?>'],
  ['YAML', 'database:\n  host: localhost'],
  ['TOML', "[database]\nhost = 'localhost'"],
  ['Markdown', '```js\nconsole.log(1)\n```'],
  ['Dockerfile', 'FROM node:22'],
  ['Nginx', 'server {'],
]

const ordinaryProse = [
  'import unread mail',
  'SELECT your favorite plan',
  '#include a document',
  '#! heading',
  'Here is an ordinary paragraph.',
]

const paste = createCodePlugin({ injectStyles: false }).capabilities.paste

test('Code text Paste recognizes the v1 language signature families', () => {
  for (const [language, text] of supported) {
    assert.equal(paste.accepts({ kind: 'text', text }), true, language)
  }
})

test('Code text Paste does not turn incidental prose into source blocks', () => {
  for (const text of ordinaryProse) {
    assert.equal(paste.accepts({ kind: 'text', text }), false, text)
  }
  assert.equal(paste.accepts({ kind: 'file', text: '#include <vector>' }), false)
})

test('recognized Code Paste preserves the exact pasted source', () => {
  const text = 'CREATE TABLE entries (id int)\n'
  const input = Object.freeze({ kind: 'text', text })
  assert.equal(paste.accepts(input), true)
  assert.deepEqual(paste.resolve(input), {
    kind: 'block',
    data: { code: text, language: 'auto' },
  })
})
