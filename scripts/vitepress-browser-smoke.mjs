import { findChrome } from '../tests/browser/environment.mjs'

// Keep browser discovery shared; the scenario module owns its server/profile.
process.env.EDITOR_CHROME_PATH = findChrome()
await import('./vitepress-browser-scenarios.mjs')
