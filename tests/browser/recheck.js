import { register as r0 } from './regressions/recheck-01-history-notifications.js'
import { register as r1 } from './regressions/recheck-02-atomic-convert.js'
import { register as r2 } from './regressions/recheck-03-atomic-delete.js'
import { register as r3 } from './regressions/recheck-06-observer-mutation.js'
import { register as r4 } from './regressions/recheck-13-duplicate-tunes.js'
import { register as r5 } from './regressions/recheck-14-staged-cleanup.js'
import { register as r6 } from './regressions/recheck-15-stale-inline.js'
import { register as r7 } from './regressions/recheck-16-destroy.js'
import { register as r8 } from './regressions/recheck-17-public-events.js'
import { run } from './regressions/harness.js'
r0()
r1()
r2()
r3()
r4()
r5()
r6()
r7()
r8()
await run()
