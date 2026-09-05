import { register as composition } from './regressions/composition.js'
import { register as apiLifetime } from './regressions/api-lifetime.js'
import { register as logicalPositions } from './regressions/logical-positions.js'
import { register as widgetLifecycle } from './regressions/widget-lifecycle.js'
import { register as blockIndices } from './regressions/block-indices.js'
import { register as rendererLifecycle } from './regressions/renderer-lifecycle.js'
import { register as historyRecovery } from './regressions/history-recovery.js'
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
historyRecovery()
rendererLifecycle()
blockIndices()
widgetLifecycle()
logicalPositions()
apiLifetime()
composition()
await run()
