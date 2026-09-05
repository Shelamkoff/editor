import { register as rollback } from './regressions/rollback.js'
import { register as pendingPaste } from './regressions/pending-paste.js'
import { register as inlinePreservation } from './regressions/inline-preservation.js'
import { run } from './regressions/harness.js'
inlinePreservation()
pendingPaste()
rollback()
await run()
