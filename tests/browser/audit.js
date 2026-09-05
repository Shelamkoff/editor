import { register as historyVersion } from './regressions/history-version.js'
import { register as enterSelection } from './regressions/enter-selection.js'
import { register as atomicOperations } from './regressions/atomic-operations.js'
import { register as commitFailure } from './regressions/commit-failure.js'
import { register as rollback } from './regressions/rollback.js'
import { register as pendingPaste } from './regressions/pending-paste.js'
import { register as inlinePreservation } from './regressions/inline-preservation.js'
import { run } from './regressions/harness.js'
inlinePreservation()
pendingPaste()
rollback()
commitFailure()
atomicOperations()
enterSelection()
historyVersion()
await run()
