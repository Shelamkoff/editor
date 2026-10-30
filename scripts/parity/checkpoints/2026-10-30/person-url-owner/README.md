# Person URL control ownership — 2026-10-30

This checkpoint covers a confirmed Person social-icon lifetime defect and the
existing block read/mode boundaries needed to fix it. It is focused evidence,
not acceptance of complete v1 parity or the combined release gate. The directory
uses the shared integration checkpoint date; recording occurred on 2026-10-29
UTC, as shown in `manifest.json`.

## Confirmed behavior

A trusted URL edit on the current Person view correctly changed the social icon.
After the whole Person wrapper was moved into a foreign host, the same native
edit still invoked its retained input listener. That listener overwrote the
foreign icon even though the editor no longer owned the control and accepted no
document or history change.

Removing the listener alone was insufficient. A later host flush or mode change
could enter the old instance through its still-mounted outer block shell. A
custom social resolver could also transfer the wrapper or entire shell during
the synchronous read. Finally, Person teardown cleared its body and tabs,
destroying adopted foreign controls during recovery.

## Bounded implementation

`BlockReconciler.readBlock` and `setReadOnly` now admit the current mounted shell
and require it to contain the original plugin root before calling the instance.
They revalidate that ownership after the callback, including its exception path.
Lost owners enter existing retirement and recovery; retired instances do not
receive reverse-mode callbacks. The checks use containment so harmless host
layout wrappers remain supported. An already detached outer shell keeps the
existing read rejection without terminal retirement, preserving detach/reattach
behavior.

Person projects its URL-derived icon from its existing synchronous control read.
There is no direct URL input listener, additional author action, plain-field
`afterProjection` extension, or new public API. The current rendered view keeps
the exact input, row and icon references. A control already absent from that view
is skipped, preserving its canonical URL/type while healthy fields remain
editable. A control admitted before the custom resolver must retain its source
path and wrapper ancestry afterwards; otherwise the read fails before cache or
icon assignment.

Source ownership and icon ownership are separate. Moving only an icon does not
prevent the current URL from committing, but that icon receives no write. Mode
synchronization does not project icons. Person teardown still aborts controllers
and tasks and disposes resources; it leaves DOM removal to the owning core shell
instead of clearing possibly adopted body/tabs content. Rich name-derived tab
labels continue to use the existing rich-field completion path.

## RED/GREEN evidence

The final ten native test cases use the same bytes in baseline and candidate
runs. Trusted browser input is delivered through the existing native driver;
synthetic input dispatch is not the native behavior oracle.

| Check | Baseline / RED | Candidate / GREEN | Evidence |
| --- | --- | --- | --- |
| Exact final native suite, Chrome 142 | 2 pass, 8 expected failures | 10 pass | `native-red.log`, `native-green.log` |
| Missing URL control with a healthy name edit | intermediate implementation incorrectly rejected the name | included in final 10 pass | `native-sibling-red.log`, `native-green.log` |
| Independent core read/mode boundary tests | 1 pass, 4 expected failures | 5 pass | `core-units-red.log`, `core-units-green.log` |
| Complete BlockReconciler and Person reconciliation unit files | — | 98 pass | `related-units-green.log` |
| Library and runtime TypeScript projects | — | both exit 0 | `types-library.log`, `types-runtime.log` |

The ten native cases cover current URL/icon updates; whole-wrapper adoption;
icon-only adoption; adopted wrapper and shell followed by flush and mode calls;
wrapper and shell adoption inside the custom resolver; and editing a healthy
name after adopting one URL control. Positive URL cases also verify a coalesced
native group with one Undo/Redo. The healthy-name case preserves the absent URL
data, updates the current tab, and verifies one Undo. Foreign controls and icons
retain their sentinels throughout the negative cases and cleanup.

The independent core baseline failures are behavioral: a foreign plugin root
still received `read`, an adopted shell did not retire its old lifetime, and
mode/rollback hooks ran on retired views. Harmless wrappers passed on both
versions. An earlier error-message-only baseline attempt is deliberately not
used as product evidence. `core-unit-provenance.json` retains that attempt's
initial hash for traceability; `meaningfulTestSha256` identifies the identical
final tests used in the archived RED and GREEN runs.
Eight whitespace-only lines in the archived core RED log have trailing spaces
removed so the evidence patch passes whitespace checks. Its original raw log
SHA-256 remains in the peer provenance and manifest; assertions and output text
are unchanged.

## Frozen source and integration identity

The reviewed code patch SHA-256 is
`4d63e7c447fb378acd1aa5b8bdc28ea05a48d9d54fd766c655bc3dcf1be3c899`.
The applicable patch SHA-256 is
`f31d00e00ab9b88fd787d0500e888a5233d6e4a3a8ce17840a0ce58faa87ffaf`.
The only difference is the missing `new file mode 100644` transport header for
`tests/browser/regressions/person-url-owner-native.js`. No source bytes changed.

The applicable patch was integrated as
`60fec50c9ac9ec9a82e1d1c0653ce44cda06d51b`. All six integrated files were
independently compared to the recorded candidate SHA-256 values and matched.
`source-fingerprints.json` preserves the original handoff fingerprints;
`manifest.json` records both patch identities, runtime, results and artifact
hashes. The independent peer review accepted the frozen patch with no blocking
findings in this scope.

## Reproduction

The normal native plugin/media entry imports the regression file:

```sh
EDITOR_CHROME_PATH=/path/to/chrome EDITOR_NATIVE_PAGE=native-plugin-media.html EDITOR_NATIVE_FILTER='Person URL owner' node tests/browser/physical-history.mjs
node --test --test-isolation=none core/BlockReconciler.test.js plugins/person/reconciliation.test.js
node --test --test-isolation=none --test-name-pattern='block (read|mode) rejects an adopted|block root read and mode admission' core/BlockReconciler.test.js
node node_modules/typescript/bin/tsc -p jsconfig.json
node node_modules/typescript/bin/tsc -p jsconfig.runtime.json
```

The archived native logs used a focused harness. To reproduce that exact entry,
copy the archived `native-person-url-owner.html` into `tests/browser/` and run:

```sh
EDITOR_CHROME_PATH=/path/to/chrome EDITOR_NATIVE_PAGE=native-person-url-owner.html node tests/browser/physical-history.mjs
```

Node was v24.22.1 and Chrome for Testing was 142.0.7444.175. Unit execution used
Node's in-process test mode; the native run had approval to start the local
Vite/Chrome processes. Empty typecheck logs mean the commands completed without
output; their successful exit status is recorded in the manifest. Broader
integration, browser-version and release claims belong to their separate gates.
