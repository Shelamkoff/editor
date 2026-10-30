# Canonical Carousel upstream CI

PR: https://github.com/Shelamkoff/carousel/pull/1

Head: `ebbc9758e3d4fdef415335e692b14538cecabb72`  
Base: `9896ddf60e594501b612ce38dbac66270f93181e`  
Checked-out PR merge: `54d97ff6b433526262d3d0c673d83a5e7489c38a`

Quality workflow run 40987280915, job `test` 123841137674: **completed / success**.

- 38 unit tests, 0 failures.
- Typecheck and package build passed.
- Eight browser tests passed (5.9 seconds, two workers), including the unchanged native-CDN Pages smoke tests and four new auto-height controls.
- GitHub runner used Node 22.23.4 and Playwright Chromium 156.0.8078.4.

The job ran ordinary `npm run check` and `npm run test:browser` against the PR merge commit. The local cached-CDN fixture was not published and was not used in CI. This closes the earlier local browser certificate qualification for runtime verification. The PR remains open and draft; this read-only check changed no refs or settings.

The full decoded job log is retained as `job.log.gz`, with hashes in `artifact-hashes.json`. Metadata is recorded in `ci-result.json`. Previous local-evidence hashes were not changed.

