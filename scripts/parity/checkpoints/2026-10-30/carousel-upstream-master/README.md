# Canonical Carousel auto-height fix: source and verification

## Publishable source

- Repository: `Shelamkoff/carousel`.
- Local branch: `fix/autoheight-observed-layout-master-20261030`.
- Parent: `9896ddf60e594501b612ce38dbac66270f93181e`.
- Commit: `824c6eb7266393d900be09854229f4ec275cf064`.
- Tree: `973e4e29bb0eac44842ddd9c247fab79d5f04f4c`.
- Patch SHA-256: `9d902e06a616ce522a0eb2380f6a577195a38685deb5175aed35e8fb55c4877b`.
- Three changed files: `src/TrackRenderer.js`, `test/navigation-regressions.test.js`, `tests/browser/auto-height.spec.mjs`.

The production fix coalesces ResizeObserver work in one owned animation frame, cancels pending work before rebuild or destroy, and records the current viewport width during synchronous recalculation. This avoids ResizeObserver feedback while retaining the correct visible original slide after a rebuild. The four observer/scheduling methods match the final narrow release backport source at `2f07052ef69723d6185471233363279b58d1604d`. Canonical master loop-copy behavior is preserved. No package, generated distribution, declaration, manager, or shim is changed here.

## Fresh results

| Check | Result | Evidence |
| --- | --- | --- |
| `npm test` | 38 passed, 0 failed | `direct-units.log.gz` |
| `npm run typecheck` | Passed | `direct-types.log.gz` |
| `npm run build` | Passed | `direct-build.log.gz` |
| Four new browser auto-height cases, local installed EventBus | 4 passed | `direct-browser.log.gz` |
| Four existing browser smoke cases, original CDN transport | Environment blocked | `direct-browser.log.gz`, `proxy-browser-proxy.log.gz`, network diagnostic |
| Complete eight-case suite, exact CDN response cache | 8 passed, 0 failed | `cached-cdn-browser-cached-cdn.log.gz` |

The direct C11 run `run-5B1cgy` and explicit-proxy run `run-KMP4LV` remain recorded as failed. The cached-response C11 run `run-RHrbbb` is passed. All three manifests record unchanged tracked source during their execution. The tests ran against the final source bytes before the local commit; `source-and-results.json` binds those bytes to the resulting commit.

Browser coverage includes loop on/off, construction while detached/already mounted, natural image resize at viewport widths 640 and 320, subsequent caption growth, logical index preservation, browser error channels, cleanup, existing Pages examples, keyboard interaction, fractional looping, and lifecycle controls. Unit controls cover pending observed resize cancellation at rebuild/destroy and preservation of the interactive original's visible loop slot after a synchronous rebuild. Historical upstream RED and lifecycle RED/GREEN artifacts are retained with their original manifests.

## CDN qualification

The unchanged existing Pages smoke tests load `https://cdn.jsdelivr.net/npm/@shelamkoff/event-bus@1.0.0/+esm`. This environment's Chromium reports `net::ERR_CERT_AUTHORITY_INVALID` for that module and the examples never instantiate (zero carousel instances). The exact diagnostic is retained in `rector-carousel-master-network-diagnostic.json`.

The same URL succeeds through the permitted inherited proxy using curl with normal TLS verification. Its exact 1583-byte response was cached, SHA-256 `191adc7ff085945a0f70c2fb2e802e822fed8c842903146f51637147398d98d7`. A temporary test-only route fulfils only that exact URL with those unchanged response bytes. Original assertions and production files remain unchanged. No TLS verification was disabled and no trust store was changed. This establishes runtime behavior for all eight cases; native CDN transport still needs the normal upstream CI/browser environment. Do not describe the original native-CDN run as green.

`rector-carousel-master-cdn-fixture-20261030.json` records the precise inserted hook, copied test hashes, CDN URL and response hash. Gzipped copies of the transport-adjusted tests are included to make the fixture reviewable. They are outside the publishable source patch.

## Commands and environment

Run unit/type/build commands from `/tmp/rector-carousel-master-autoheight-20261030`. The full original browser command was:

```sh
EDITOR_CHROME_PATH=/tmp/rector-browsers-156/chrome-linux64/chrome node node_modules/@playwright/test/cli.js test --config=/tmp/rector-carousel-master-autoheight-test.config.mjs
```

The same command with `/tmp/rector-carousel-master-autoheight-cached-test.config.mjs` runs the temporary exact-response transport fixture. Config files are retained; the proxy config reads inherited proxy settings at runtime without persisting their values. Each run uses one worker and zero retries.

Observed versions: Node 24.22.1, Chromium 156.0.8078.47, Playwright 1.64.1, TypeScript 5.8.3, installed EventBus 1.0.0. Dependency installation was copied from the existing verified canonical checkout. No release-branch files were changed during this work.

## Artifact integrity

`artifact-hashes.json` records each stored artifact's SHA-256, raw SHA-256, byte counts, and original local location. Gzip files use deterministic metadata. `source.patch.gz` is the complete publishable patch; three `source-*.gz` files contain the final source. The immutable upstream Git parent supplies the remaining unchanged files.
