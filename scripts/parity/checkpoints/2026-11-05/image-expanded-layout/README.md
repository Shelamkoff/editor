# Image expanded layout repair — 2026-11-05

Maintained source: `c51905f9`. Production changes only `plugins/image/image.css`.
Environment: Linux x64, Node 24.22.1, Chromium 155.0.8059.79.

Expanded Image containers now fill their owner rather than shrinking to the
intrinsic image width when width/min/max styles are suspended. The explicit
border-box size includes background padding. Authored sizes, height and caption
remain intact; width controls are disabled only while expanded.

Four scenarios combine both owner widths (320px/600px) and background states.
They check stylesheet admission, actual geometry, exact canonical data and
caller ownership, dimension controls, readonly output, one action per toggle,
raw Undo/Redo and read-only projection. All four fail with the parent production
stylesheet and pass after the repair. Native execution passes four cases and
five with enforcing Trusted Types. The previous source-race regressions also
pass thirteen native cases under enforcing policy.

The existing native design page passes 84 cases across all 21 plugins, light
and dark themes, 288px/640px widths and all four document states. Build, existing
plugin surfaces and lifecycle resource checks pass. The built minified Image
stylesheet contains the repaired container rule. The previous full 2247-test
Node gate and 60-page ordinary browser gate retain their actual `a5bc6567`
source/date; only affected browser checks are newly executed for this CSS patch.

The initial unstyled test prototype is excluded: without stylesheet injection,
its geometry cannot establish a production CSS regression. Correct styled RED
and GREEN logs remain separate. `source.json` records the exact source hashes;
`artifact-hashes.json` covers stored/decoded evidence bytes. The register stays
169 accepted / 40 open / 209 total; this is a bounded repair rather than complete
historical acceptance of `BLOCK_IMAGE_EXPANDED`.

Reproduce with installed dependencies and Chromium:

```sh
EDITOR_BROWSER_PAGE=image-expanded-layout.html node tests/browser/run.mjs
EDITOR_NATIVE_PAGE=native-image-expanded-layout.html node tests/browser/physical-history.mjs
EDITOR_NATIVE_PAGE=native-image-expanded-layout-trusted.html node tests/browser/physical-history.mjs
```
