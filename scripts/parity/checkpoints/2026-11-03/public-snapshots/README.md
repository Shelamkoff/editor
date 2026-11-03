# Public snapshots and unknown-block mode repair — pending acceptance

The immutable pre-fix source `5dbf2458` reproduces a regression: nine of 24 public snapshot cases fail when entering read-only mode with an unregistered block. `BlockReconciler.#captureFieldModes` assumes an entry has a field array, but inert placeholders never initialized it. Fifteen candidate controls and all v1/specification-baseline controls pass their recorded scopes. Two focused Node regressions also fail for an unknown type and an inactive registered type.

The common public fixture checks nested detached payloads, own-key data, immutable envelopes, mutable caller-owned descendants, get/at/list/iterator, catalogs/indices/current ID, snapshots retained across a real host update/replay, and iterators resumed after destroy with a same-ID successor. Optional wire revision metadata is not an automatic transaction counter. The old API's live PublicBlockView and actual known/unknown catalog execute separately; current snapshot payload methods are not emulated.

The repair gives an inert placeholder its actual empty field collection, preserving all existing field-owner validation and mode behavior. This work is pending full integration and independent contract-model acceptance; it adds no accepted register row yet.
