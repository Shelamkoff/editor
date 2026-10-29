# Table default construction checkpoint

`rector-table-default-probe.mjs` is the exact source executed on
2026-10-29 at 16:30:24–16:30:28 UTC. Its SHA-256 is
`d094229862612493d07824eef326357cd61291234c4bd8844fc6d29d6ff1d351`.
The file is preserved byte-for-byte, including its inherited ROUNDTRIP
runner header; the actual scope below and the JSON `scope` are narrower.
Generated traces and logs are not committed.

## Observed public behavior

| Source | No-data editor construction and renderer | Explicit 3-by-3 document in editor and renderer |
| --- | --- | --- |
| v1 `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340` | Three rows of three cells | Three rows of three cells |
| Specification baseline `e981ff308000c1d92d7e820df95113c1e19bcee8` | One row of one cell | Three rows of three cells |
| Candidate `4f1ccfd3c2364dbc2f1e3e982302c24b5ac5d0b6` | One row of one cell | Three rows of three cells |

All three sources kept the explicit caller document unchanged. The probe
uses public editor construction, `save()`, `EditorRenderer.renderTo()` and
disposal. Only the fixture translates v1 `content: string[][]` to the
identified v2 `rows` / `cells` wire shape. It does not install a production
compatibility adapter.

The difference remains unresolved. v1 `plugins/table/README.md` explicitly
documents a 3-by-3 default, while the current README documents 1-by-1.
`git blame` attributes the current schema default to
`fab6eb36d92cc6583bcb39d49f9503b3be3a5db6` (`feat: add table stable-id
schema`). Explicit 3-by-3 data remains supported, but that does not make
the changed no-data default equivalent. This checkpoint neither accepts
the change nor changes the current default.

## Reproduction and recorded environment

The successful execution used Node `v24.22.1`, Chromium `142.0.7444.175`,
installed candidate dependencies and these paths:

```sh
EDITOR_REPO_ROOT=/workspace/scratch/61a2ad7355f4/editor \
EDITOR_V1_ROOT=/tmp/rector-v1-5e5c7f8 \
EDITOR_SPEC_BASELINE_ROOT=/tmp/rector-e981ff3 \
EDITOR_CANDIDATE_ROOT=/tmp/rector-roundtrip-current-4f1ccfd3 \
EDITOR_CANDIDATE_SHA=4f1ccfd3c2364dbc2f1e3e982302c24b5ac5d0b6 \
EDITOR_PLAYWRIGHT_PATH=/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs \
EDITOR_CHROME_PATH=/tmp/rector-browsers/chrome-linux64/chrome \
node /tmp/rector-table-default-probe.mjs
```

These are recorded session paths, not a ready-to-run installation recipe.
To reproduce elsewhere, provide immutable archives of the exact three
commits, a Git repository retaining their objects, installed dependencies,
Playwright and Chromium, and substitute the paths. The committed script
can replace the final `/tmp` script argument without changing its bytes.
`EDITOR_DEPENDENCIES_ROOT` can point at the installed dependencies; it
otherwise defaults to `EDITOR_REPO_ROOT/node_modules`.

The successful trace verified 138 / 156 / 156 loaded source files against
their Git objects and checked all served source and dependency bytes again
after execution. It recorded dependency versions, source hashes and
`sourceIdentityVerified: true`, `sourceUnchanged: true`, with no page or
server errors. Its original trace was
`/tmp/rector-table-default-probe.json`; that transient output is not part
of this checkpoint.

This is a bounded investigative probe. It does not execute Table mode
changes, native field editing, Undo/Redo, inline sidecars or the full
`BLOCK_TABLE_ROUNDTRIP` template, and it is not a portable CI runner or a
declaration of full parity.
