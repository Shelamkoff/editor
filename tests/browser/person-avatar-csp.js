import { register } from './regressions/person-avatar-csp.js'
import { run } from './regressions/harness.js'
register(true)
await run()
