import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const editorRoot = new URL('../', import.meta.url)

test('interactive editor and renderer controls expose keyboard and screen-reader state', async () => {
  const [heading, editableSpoiler, renderedSpoiler, person, checklist, imageSettings, gallerySettings, embedPlayer] = await Promise.all([
    readFile(new URL('plugins/heading/HeadingLevelSelect.js', editorRoot), 'utf8'),
    readFile(new URL('plugins/spoiler/index.js', editorRoot), 'utf8'),
    readFile(new URL('renderer/renderers/spoiler/index.js', editorRoot), 'utf8'),
    readFile(new URL('renderer/renderers/person/index.js', editorRoot), 'utf8'),
    readFile(new URL('plugins/checklist/index.js', editorRoot), 'utf8'),
    readFile(new URL('plugins/image/settings.js', editorRoot), 'utf8'),
    readFile(new URL('plugins/gallery/settings.js', editorRoot), 'utf8'),
    readFile(new URL('shared/embedPlayer.js', editorRoot), 'utf8'),
  ])

  assert.match(heading, /handleMenuKeydown/)
  assert.match(heading, /aria-haspopup/)
  assert.match(heading, /aria-expanded/)
  assert.match(heading, /menuitemradio/)
  assert.match(editableSpoiler, /aria-controls/)
  assert.match(editableSpoiler, /aria-expanded/)
  assert.match(renderedSpoiler, /body\.hidden/)
  assert.match(renderedSpoiler, /aria-expanded/)
  assert.match(person, /renderer\.person\.previous/)
  assert.match(person, /renderer\.person\.next/)
  assert.match(checklist, /aria-pressed/)
  assert.match(checklist, /plugin\.checklist|_t\('toggle'/)
  assert.match(imageSettings, /aria-haspopup/)
  assert.match(imageSettings, /aria-pressed/)
  assert.match(gallerySettings, /aria-pressed/)
  assert.match(embedPlayer, /iframe\.title/)
  assert.match(embedPlayer, /playLabel/)
})
