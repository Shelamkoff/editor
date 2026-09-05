import { register as r0 } from './regressions/recheck-01-history-notifications.js'
import { register as r1 } from './regressions/recheck-06-observer-mutation.js'
import { run } from './regressions/harness.js'
r0()
r1()
await run()
