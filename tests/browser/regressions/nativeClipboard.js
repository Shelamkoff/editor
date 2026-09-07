import { assert, pause } from './harness.js'

export async function nativeClipboardShortcut(key, code) {
  const params = { key, code: 'Key' + key.toUpperCase(), windowsVirtualKeyCode: code, modifiers: 2 }
  await window.__testInput('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...params })
  await window.__testInput('Input.dispatchKeyEvent', { type: 'keyUp', ...params })
  await pause(30)
}

/** Seed only test-owned clipboard data through an actual browser copy event. */
export async function copyTestText(text) {
  const field = document.createElement('textarea'); field.value = text; document.body.appendChild(field)
  field.focus(); field.select(); let copied = false
  field.addEventListener('copy', event => {
    copied = true; event.preventDefault(); event.clipboardData.setData('text/plain', text)
  }, { once: true })
  try { await nativeClipboardShortcut('c', 67); assert(copied) } finally { field.remove() }
}
