import { register as pendingPaste } from './regressions/pending-paste.js'
import { register as inlinePreservation } from './regressions/inline-preservation.js'
import { run } from './regressions/harness.js'
inlinePreservation()
pendingPaste()
await run()
