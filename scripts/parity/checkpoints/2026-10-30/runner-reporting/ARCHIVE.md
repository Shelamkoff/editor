# Retained reporting-fix evidence

The original README and all 52 source-manifest payloads retain their contents.
For stdout/stderr, a duplicate plain copy is represented by its existing gzip
payload. `archive-layout.json` maps each original path to the retained file and
states whether decompression is needed; `original-artifact-hashes.json` remains
unchanged. No failing result has been removed or relabelled.

The original isolated repair is `67bb364d01ff3939ff3f7724df087211643efce7` over
`24cc569c2fdcb3f115417ae895a01084858cdf67`. Its four runner files are identical
to the integrated repair. Original raw commit bytes and the exact patch remain
in `source.json` and `reproduce/fix.patch`; the parent raw object is retained in
the sixth-agent publication map. Publication does not preserve the original
commit metadata, so its exact tree mapping follows separately.

Independent read-only review checked the real positive/negative CLI outcomes,
all 62 report probes, and both phase planners against the complete earlier raw
corpora: 30 completed Columns source-cases and 59 Heading/List source-cases,
with the six/four historical unavailable surfaces kept separate. The explicit
phase plans match every completed case. Future fixture lifecycle changes must
update those plans; a mismatch fails closed.

The three empty-filter CLI controls all finish with exit 1 and candidatePass
false. Four positive CLI controls keep candidatePass true and historical exit 1.
These report controls add no preservation-row acceptance or browser-platform
claim. The earlier 208-case integration has its own source and evidence in
[the sixth integration checkpoint](../sixth-integration/README.md).
