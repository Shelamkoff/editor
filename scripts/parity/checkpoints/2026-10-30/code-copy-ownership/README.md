# Code Copy feedback ownership — 2026-10-30

Base: `eae1b93ee6bc39a32230de1b46c67f27b39c8015`. Frozen final tested source: `3906cdec5635521893a7e402771995d1d69f8ee3`.

## Defect and bounded change

Code previously checked only instance disposal and abort after a pending `navigator.clipboard.writeText` resolved, and again when its feedback-reset timer fired. Moving the exact Copy button, its bar, the whole plugin wrapper, or the editor-owned shell into another container did not necessarily dispose that instance. Both later callbacks therefore overwrote the new owner's button DOM.

The change revalidates the captured `copy → bar → wrapper` parent chain and lifetime before and after the existing `context.getData()` owner admission. The core read already proves the original block root/shell ownership; no plugin ancestor lease or ownership registry is invented. The same narrow check protects success feedback and its later reset. Lost-owner feedback stays inert under Copy's existing best-effort failure policy. A completed Clipboard API operation is not reversed. There is no change to highlighting, public APIs, canonical data or history.

The runtime candidate was reviewed by root before application/commit. Its approval required a real browser RED for whole-wrapper/shell adoption; that RED was observed before applying the exact reviewed patch. The audit peer independently reviewed the candidate and browser assertions.

## TDD evidence

| Run | Frozen source | Observed outcome |
| --- | --- | --- |
| run-ltB6L7 | 2a642706 | Public lifecycle RED: 2 controls pass, 2 foreign-button success/reset tests fail |
| run-yTJPu7 | 762d14da | Trusted-browser RED: 2 current-owner controls pass, 8 adoption cases fail on foreign DOM repaint |
| run-k5bmCb | 3906cdec | GREEN: all 4 lifecycle tests, all 10 browser cases, both typecheck projects pass |

Every executed gate reports `sourceUnchanged: true`. Raw source identities, commands, timings and process outcomes remain in original manifests copied without editing.

The Node tests create the real public plugin definition/runtime/instance with controlled Clipboard API and timer boundaries. The fake DOM performs actual parent removal/reparenting in its ownership model. They assert button contents/classes, provider source, live success/reset, disposal, and no reset timer scheduled for an adopted button.

The browser tests use the real editor and DOM, actual trusted clicks and actual 1800 ms reset timers. The two current-owner controls cover editable and read-only mode. For pending success and scheduled reset, separate cases adopt the exact button, bar, wrapper and shell. All eight negative cases independently check unchanged canonical blocks and history before the foreign-HTML assertion; the real RED failures occur at that HTML assertion. Final GREEN also verifies exact button child identities remain unchanged. Unexpected browser errors/rejections are adjudicated by the standard harness.

The controlled `navigator.clipboard` provider records the source and exposes the real pending Promise settlement boundary. These cases do **not** claim a write to or transfer through the system clipboard. The provider descriptor is restored by each fixture. Existing system-clipboard/native transfer coverage is a separate gate.

## Normal gate registration and scope

`tests/browser/native-plugin-parity.js` imports `regressions/code-copy-ownership-native.js`, so the new cases run in the ordinary full native inventory. The scoped RED/GREEN commands use that existing page filtered by `Code copy ownership:`; only those 10 executed cases receive native credit in this checkpoint. Broader combined native and library verification is owned by root.

The Node path is the existing `plugins/code/lifecycle.test.js`, explicitly checked to exist by the sequential GREEN supervisor. Dependencies are a physical copy of main's successful npm-ci installation; the installed Carousel dependency resolves to the actual Git pin f7f6485886a1d77f9213d9079eb70000efeff499. Chrome is 156.0.8078.47 and Node is 24.22.1.

The initial default-sandbox recorder attempt stopped at `spawnSync git EPERM` before tests ran. The named recorded runs used the approved subprocess-capable execution environment. That initialization error is not counted as a RED test result.

## Artifacts

Original manifests are stored byte-for-byte. Logs are deterministic gzip archives; `hash-index.json` records both stored and original hashes/lengths. `source-final.patch.gz` and `source-history.mbox.gz` preserve all three source commits from the combined base through the tested source. Both the exact approved runtime candidate and final aggregate runtime/test review patches are included, together with the sequential GREEN supervisor. `summary.json` records every changed source-file hash. The index excludes itself.

This evidence-only checkpoint was added after the frozen gates finished. It is not relabeled as the tested runtime source and does not claim whole-library or v1 parity completion.
