# Preparation record

The final comparison worktree is `/workspace/scratch/61a2ad7355f4/worktrees/final-differential-verification`, branch `agent/final-differential-verification-20261030`. Its `node_modules` is a physical copy of the main worktree's completed lockfile installation. Carousel is pinned to `f7f6485886a1d77f9213d9079eb70000efeff499`.

The first planned C11 run, `run-gXXU3x`, was initialized on `c6e537e5d7433f0d902749719c8af265c6ae8591`. Root then corrected Russian README prose in `plugins/embed/README.ru.md`. Before fast-forwarding, the planned run was finished with all 15 gates unstarted: outcome `not-run`, `sourceUnchanged: true`. It supplies no browser or comparison evidence.

The clean worktree was fast-forwarded to `1c933545c6f05701741031997945c64b1ab5ba9d`; the diff contains only the Russian README change. Fresh C11 run `run-AYPL00` was initialized on that SHA. Browser execution waits for root to release lane A.

An initial preparation attempt stopped before C11 initialization because the archived Code pre-fix source has a different SHA. The supervisor now records that difference, includes the actual source SHA in comparison signatures, and separately checks all archived loaded-module hashes. The archived SHA `b856d85e13848d7129fb3f2ad96fd8cb9e2b7d13` is unavailable in the present object store, so a full-tree identity claim cannot be made from that object here. All 91 module hashes recorded for that source match the current pinned `b09c0079c5f2ebbbc68264b4892ce5f8bb8ae63c`, whose tree is `baf06b081131d14f80501fd930f0a55ff02293df`. Failure signatures are not rewritten to hide the SHA difference.

The ordinary sandbox rejected the recorder's Node-to-Git subprocess with `spawnSync git EPERM`. The same preparation was then executed with an approved local sandbox override. This was an environment prerequisite, not a comparison result. No browser was started by these preparation commands.

An offline parser check read the 11 existing raw archived witnesses. It observed the expected current-case counts and zero candidate failures in those historical reports; it is a parser check, not fresh product validation. The fresh run will independently verify loaded source bytes against the final Git objects.
