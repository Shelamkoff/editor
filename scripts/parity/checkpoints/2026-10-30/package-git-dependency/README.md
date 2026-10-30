# Immutable Git dependency in the package consumer gate — 2026-10-30

This checkpoint repairs the package verification harness after Rector adopted the
published Carousel commit `f7f6485886a1d77f9213d9079eb70000efeff499`. Runtime source,
Rector dependency declarations and `package-lock.json` are unchanged by this slice.
No preservation-ledger row is accepted here.

The unchanged gate at `9a60deb51a6f1906a9ad4a17080deedc52b2426a` repacked installed
Carousel as a same-name file tarball, then tried to install Rector in an offline
consumer with an empty npm cache. npm still had to satisfy Rector's original Git
edge and failed with `ENOTCACHED` for that exact commit's codeload archive.
`runs/run-1AYbcn/manifest.json` and its original `package.log` retain that RED.

## Repair and provenance

Frozen code is `32138be5e2e8a1e72f9d960ce64111a6a5810c3a`. The gate reads the actual
packed Rector manifest and verifies each Git declaration against the project
lock, requiring a full 40-character commit. It stages the exact published Git
artifact with official `npm pack` into the gate's disposable npm cache, with
`--ignore-scripts` and inherited `npm_config_ignore_scripts=true`. The latter
also disables hooks in child npm preparation processes. The staged artifact's
name/version must match the lock; existing package-file checks inspect this real
Git tarball. Registry dependencies continue to use exact installed bytes.

The subsequent consumer command retains `npm install --offline --ignore-scripts`.
The Git artifact is excluded from the direct file-tarball arguments. After the
actual install, the gate verifies the original Git declaration in both installed
Rector's manifest and the consumer lock, rejects any same-name direct override,
and requires the installed Git `resolved` URL and version to equal the original
lock. It also verifies the installed dependency's export targets. No Rector
manifest, dependency edge, production pin or npm cache record is rewritten.

The fetched Carousel tarball's integrity is
`sha512-hZoQ8Zt8m8XUM6uJlpEwtimueUCxTpbcU090DOc+54JpBcOFVRJ0KiSFdkzpSQK2ASe4VMRPBv99NxyShDggAA==`,
matching the existing project lock. The independent pack probe and final package
log record this value. npm's own warning that it skips Git integrity enforcement
is retained; the gate explicitly checks the immutable Git provenance.

## Executed checks

| Frozen run | Outcome |
| --- | --- |
| `run-1AYbcn`, unchanged base | Package RED: exact Git artifact absent from the offline cache |
| `run-l1ye6E`, fixed gate | 14/14 targeted tests, including 10 Git/provenance tests |
| `run-l1ye6E`, full `npm run test:package` | PASS, 29,181.793503 ms |
| Real installed consumer | Both TypeScript modes (`Bundler`, `NodeNext`), Vite build and Node imports PASS |
| External public-extension browser fixture | 39/39 PASS on Chrome 156 |
| Published CSS asset check | 22 assets, no inline stylesheets |

Both C11 runs record unchanged source throughout their own command intervals.
Environment: Node `v24.22.1`, npm `11.9.0`, Chrome `156.0.8078.47`. Full raw logs,
source identities and command intervals are retained under `runs/`; `review.json`
records exact code hashes, declaration/lock hashes, commands and limitations.
`hash-index.json` verifies every copied raw artifact byte-for-byte.

## Earlier setup failures

Initial sandbox execution denied nested `spawnSync git` before C11 initialization,
and a cache probe could not connect to the inherited proxy (`EPERM`). The same
commands subsequently used the normal approved execution path, preserving proxy
and CA settings. These setup attempts are not product test passes.

An actual `npm cache add` probe for the Git spec failed in npm 11.9.0 with
`GitFetcher requires an Arborist constructor to pack a tarball`. Its debug log
is retained under `experiments/`. Official `npm pack` supplies that constructor
and completed the exact-pin probe successfully. No command enabled lifecycle
hooks to work around either failure.

## Reproduce

Install the project dependencies with scripts disabled. From the frozen code,
run `node --test scripts/package-git-dependencies.test.mjs scripts/package-exports.test.mjs`
and `npm run test:package` with a supported Chrome executable selected as in the
C11 manifest. The cache-staging phase may fetch the declared immutable Git
artifact; the following real consumer install is offline. This scoped repair
adds no claim about unexecuted Node/npm versions or overall functional parity.
