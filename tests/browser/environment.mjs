import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const editorRoot = new URL('../../', import.meta.url)
export const vitePath = process.env.EDITOR_VITE_PATH
  ?? fileURLToPath(new URL('node_modules/vite/bin/vite.js', editorRoot))

/** Resolve an installed browser without assuming a developer's OS or workspace. */
export function findChrome() {
  const configured = process.env.EDITOR_CHROME_PATH
  const candidates = configured ? [configured] : process.platform === 'win32'
    ? ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']
    : process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium']
      : ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']
  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ['--version'], { stdio: 'ignore', timeout: 5000 })
      return candidate
    } catch { /* Try the next installed executable. */ }
  }
  throw new Error('Chrome/Chromium was not found. Set EDITOR_CHROME_PATH to its executable.')
}
