## Problem

Auto-height carousels can update layout synchronously from ResizeObserver callbacks, producing observer feedback during real media/content resizing. A rebuild that cancels a pending resize also needs to settle the current viewport width; otherwise a later resize can put the interactive original loop slide in the wrong visible slot.

## Change

- Coalesce observed viewport/slide changes in one owned animation frame.
- Cancel pending observed layout on rebuild and destroy.
- Record the current viewport width when recalculating layout synchronously.
- Cover mounted/detached construction, looping/non-looping media resize, caption growth, cleanup, and pending-frame rebuild/destroy regressions.

The only production file changed is `src/TrackRenderer.js`. This carries the same targeted fix as the release backport while preserving canonical master's current loop-copy implementation.

## Verification

- `npm test`: 38 passed.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- Four new real-browser auto-height cases: passed with the local installed dependency.
- Complete eight-case browser suite: passed with a test-only cache of the exact CDN EventBus response, obtained with TLS verification enabled.

The four existing native-CDN smoke cases are blocked in the local managed browser by `ERR_CERT_AUTHORITY_INVALID` before examples instantiate. Original failed runs are retained; no production or assertion changes were made for the cached-response run. Upstream CI should confirm the unchanged native CDN transport in its normal browser environment.
