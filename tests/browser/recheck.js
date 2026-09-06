import { register as compositeMerge } from './regressions/recheck-19-composite-merge.js'
import { register as pasteTail } from './regressions/recheck-07-paste-tail.js'
import { register as crossEnter } from './regressions/recheck-10-cross-enter.js'
import { register as recheck_04_cross_fields } from './regressions/recheck-04-cross-fields.js'
import { register as recheck_05_inline_transfer } from './regressions/recheck-05-inline-transfer.js'
import { register as recheck_09_field_caret } from './regressions/recheck-09-field-caret.js'
import { register as recheck_08_html_wrappers } from './regressions/recheck-08-html-wrappers.js'
import { register as recheck_12_media_export } from './regressions/recheck-12-media-export.js'
import { register as recheck_11_native_fields } from './regressions/recheck-11-native-fields.js'
import { register as r0 } from './regressions/recheck-01-history-notifications.js'
import { register as r1 } from './regressions/recheck-02-atomic-convert.js'
import { register as r2 } from './regressions/recheck-03-atomic-delete.js'
import { register as r3 } from './regressions/recheck-06-observer-mutation.js'
import { register as r4 } from './regressions/recheck-13-duplicate-tunes.js'
import { register as r5 } from './regressions/recheck-14-staged-cleanup.js'
import { register as r6 } from './regressions/recheck-15-stale-inline.js'
import { register as r7 } from './regressions/recheck-16-destroy.js'
import { register as r8 } from './regressions/recheck-17-public-events.js'
import { register as r9 } from './regressions/recheck-18-validation-observer.js'
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
r9()
recheck_11_native_fields()
recheck_12_media_export()
recheck_08_html_wrappers()
recheck_09_field_caret()
recheck_05_inline_transfer()
recheck_04_cross_fields()
crossEnter()
pasteTail()
compositeMerge()
await run()
