import { register as rendererStyles } from './regressions/recheck-36-renderer-style-ownership.js'
import { register as edgeFieldFocus } from './regressions/recheck-35-edge-field-focus.js'
import { register as dragLifetime } from './regressions/recheck-34-drag-lifetime.js'
import { register as structuralLifetime } from './regressions/recheck-33-structural-context-lifetime.js'
import { register as inlineBoundaries } from './regressions/recheck-32-inline-field-boundaries.js'
import { register as sourceRemainders } from './regressions/recheck-31-source-remainders.js'
import { register as nativeConversion } from './regressions/recheck-30-native-conversion.js'
import { register as crossMetadata } from './regressions/recheck-29-cross-convert-metadata.js'
import { register as nativePasteRange } from './regressions/recheck-28-native-paste-range.js'
import { register as emptyFieldBoundaries } from './regressions/recheck-27-empty-field-boundaries.js'
import { register as formInput } from './regressions/recheck-26-form-input.js'
import { register as opaqueClipboard } from './regressions/recheck-25-opaque-clipboard.js'
import { register as mergeCaret } from './regressions/recheck-24-merge-caret.js'
import { register as pendingTargets } from './regressions/recheck-23-paste-target.js'
import { register as textReplacement } from './regressions/recheck-20-text-replacement.js'
import { register as whitespaceHistory } from './regressions/recheck-22-whitespace-history.js'
import { register as renderVersion } from './regressions/recheck-21-render-version.js'
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
renderVersion()
whitespaceHistory()
textReplacement()
pendingTargets()
mergeCaret()
opaqueClipboard()
formInput()
emptyFieldBoundaries()
nativePasteRange()
crossMetadata()
nativeConversion()
sourceRemainders()
inlineBoundaries()
structuralLifetime()
dragLifetime()
edgeFieldFocus()
rendererStyles()
await run()
