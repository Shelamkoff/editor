# B-PRESENTATION: why recovery stays within the failed field

This checkpoint records a bounded architectural experiment made on 29 October
2026. It is decision evidence for C12 §16.5, not an acceptance gate for the
published editor or the later production repair.

The experiment compared two outcomes of the existing block-acquisition path
after a presentation failure had already been contained in one field. Block A
had a failing `back` field and a separate, healthy `note` field with an active
inline occurrence, a live DataTask, and real browser composition. Block B was an
independent control.

## Observed outcomes

| Existing acquisition outcome | A.note element and widget | A.note task | Genuine preedit and range | B.note | Accepted data/history |
| --- | --- | --- | --- | --- | --- |
| Acquiring a replacement A succeeded | Replaced | Aborted | Lost | Preserved | Unchanged |
| Acquiring the replacement A threw before publication | Preserved | Live | Preserved | Preserved | Unchanged |

The successful replacement therefore failed the requirement to preserve
unrelated work in the same block. The second case proves only that this failed
candidate left the already-contained predecessor in place. It does not prove a
general recovery-failure policy for the unmodified baseline.

The recorded native page contained two selected comparison scenarios: one
expected contract FAIL and one PASS. The runner exited 1 because of the first
scenario, not because of browser startup, a timeout, or a changed test source.
The original source hashes were unchanged throughout the recorded run.
`observed-results.json` retains the relevant observations without the raw log.

This evidence supports preserving the healthy fields of A while retiring and
disabling only its failed field. It does not establish performance, all-plugin
parity, or the final implementation's acceptance. Implementation acceptance belongs to the standard test suite and separately
recorded final integration gates; this checkpoint does not establish that result.

## Exact source identity

- Original snapshot: `948bc5544dcf57a343733f589883973ec7db6cd7`.
- Published commit with the same tree: `3103eb5f3a605b22e6ebdabc7d276be4a5b58179`.
- Tree: `407f0edc50ddfd36352852982f874f4de53cdb40`.
- Browser: Chromium `142.0.7444.175`; Node `v24.22.1`.
- Dependency input: the original snapshot's `package-lock.json`. The historical
  run preceded the later DOMPurify/Vite maintenance update.

`REPRODUCTION-MANIFEST.json` records the exact nine source hashes from the
original run, the unchanged runner/driver/environment hashes, input locations,
artifact hashes, and original result provenance. Applying the included patch
in a separate minimal tree was checked: all nine reconstructed hashes exactly
matched the original trace. That reconstruction check did not rerun Chromium.

## Prototype-only instrumentation

`historical-runtime-prototype.patch` contains an earlier experimental
field-containment implementation and two investigation-only hooks:

- `globalThis.__capturePresentationProbe` exposes the already-created owners to
  the fixture so it can observe exact scopes and native-input state.
- `BlockReconciler.probeRecoverBlock` invokes the existing candidate acquisition,
  publication, and retirement sequence for the comparison.

The second hook deliberately makes the alternative block replacement concrete;
it is not a proposed public API or an automatic retry mechanism. Neither hook
belongs in the runtime. Production integration must exclude both hooks.

The fixture contains the original broader scenario definitions, but its
`data-probe-mode="comparison"` carrier selects only the two comparison cases.
Keeping these exact bytes preserves the connection with the recorded hashes;
the broader historical scenarios are not newly accepted by this checkpoint.

## Reproduction in an isolated source tree

Use a disposable directory. Do not apply the historical prototype patch to a
working checkout. The following commands assume this checkpoint is copied to
`scripts/parity/checkpoints/2026-10-29/presentation` in the repository. Set
`EDITOR_CHROME_PATH` to an installed Chromium executable; reproducing the
original browser observation requires the version above.

```bash
presentation_repo=/absolute/path/to/editor
presentation_checkpoint="$presentation_repo/scripts/parity/checkpoints/2026-10-29/presentation"
presentation_scratch=$(mktemp -d /tmp/rector-presentation-comparison.XXXXXX)

git -C "$presentation_repo" archive 3103eb5f3a605b22e6ebdabc7d276be4a5b58179 | tar -x -C "$presentation_scratch"
git -C "$presentation_scratch" apply "$presentation_checkpoint/historical-runtime-prototype.patch"
cp -R "$presentation_checkpoint/fixture/." "$presentation_scratch/"
cd "$presentation_scratch"
npm ci

EDITOR_NATIVE_PAGE=native-presentation-remount-comparison.html node tests/browser/physical-history.mjs
```

For offline reproduction, the preserved dependency tree can replace `npm ci`
provided its identity is verified against the recorded lockfile and dependency
manifest. The original runner, native driver, and timeouts remain unchanged.
The included Vite configuration disables HMR and uses the historical scratch
cache directory. Run this comparison alone; its deliberately failing result is
not suitable for a release-gate aggregate.

The expected observation is the table above. Do not turn the first case green
by changing its preservation assertions or by accepting a discarded preedit.

## Files to retain

Retain this README, `REPRODUCTION-MANIFEST.json`, `observed-results.json`,
`historical-runtime-prototype.patch`, and the `fixture/` directory. No raw logs,
dependency tree, or instrumented production source copy is needed in the repo.
