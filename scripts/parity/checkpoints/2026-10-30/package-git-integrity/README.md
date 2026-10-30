# Locked Git artifact integrity — 2026-10-30

This follow-up strengthens the earlier [Git package consumer checkpoint](../package-git-dependency/README.md).
The earlier RED and GREEN manifests/logs remain unchanged. Independent review
found a concrete omission: the helpers discarded `package-lock.json`'s integrity,
and npm itself skips integrity enforcement for Git dependencies. Checking only
commit, URL and version did not prove the lock's archive bytes.

Frozen repair: `00fe355ace54a4dc69005ebe60486bba9afc41e6`. Only the same three gate scripts change. The project
manifest, lockfile and production source remain unchanged.

## Meaningful RED and GREEN

`controls/integrity-control.mjs` uses fixed inputs derived from the actual
published Carousel pin. It changes only the expected lock SRI to another valid
SHA512 value and retains the original SRI in the consumer fixture. The identical
harness and input files execute immutable helper sources copied with `git show`:

| Helper source | Observed result |
| --- | --- |
| `32138be5e2e8a1e72f9d960ce64111a6a5810c3a` | RED, exit 1: the pin drops integrity and the mismatched consumer is accepted |
| `00fe355ace54a4dc69005ebe60486bba9afc41e6` | GREEN, exit 0: the pin carries the locked SRI and the mismatched consumer is rejected |

Both original outputs, both exact helper sources, commands, hashes and unchanged
inputs are retained under `controls/`. This is an assertion failure for the real
missing check, not a missing-export or broken-import failure.

## Exact archive and installed-consumer checks

The gate now requires a canonical single `sha512-…` lock value, retains it in the
pin, compares npm's packed metadata, and independently computes SHA512 from the
actual staged `.tgz` bytes. Both must equal the lock. After the real offline
consumer install, its lock entry must retain that same SRI, immutable Git URL and
version, while Rector retains its original transitive Git declaration. A direct
same-name override is still rejected. CLI and inherited child npm settings keep
lifecycle scripts disabled.

The fixed unit suite also exercises missing/malformed lock SRI, missing/wrong
packed metadata, and tampered gzip-tar bytes paired with unchanged expected npm
metadata. The small gzip-tar fixture has a fixed independently calculated SRI.
Missing or wrong installed-consumer SRI is rejected separately.

`run-ph0ERM` is a fresh actual package run on the frozen source. It records:

- **20/20** targeted tests: 16 Git/provenance/integrity tests and four existing export tests.
- The complete `npm run test:package` command passing in **32851.707596 ms**.
- Both installed-consumer TypeScript modes, Vite and Node imports passing.
- **39/39** external public-extension browser cases on Chrome 156.
- **22** published CSS assets, with no inline stylesheets.

The actual staged archive and actual installed consumer both record:

```text
name: @shelamkoff/carousel
commit: f7f6485886a1d77f9213d9079eb70000efeff499
version: 1.0.0
integrity: sha512-hZoQ8Zt8m8XUM6uJlpEwtimueUCxTpbcU090DOc+54JpBcOFVRJ0KiSFdkzpSQK2ASe4VMRPBv99NxyShDggAA==
```

The consumer log values are read from the installed manifest and its generated
lockfile. `review.json` retains those observations and the staged archive's
computed SRI. The final C11 manifest records source identity unchanged throughout
both gates. `hash-index.json` covers all copied original artifacts. This checkpoint
adds no preservation-ledger acceptance or claim for an unexecuted environment.
