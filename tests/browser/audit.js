import { register as inlinePreservation } from './regressions/inline-preservation.js'
import { run } from './regressions/harness.js'
inlinePreservation()
await run()
