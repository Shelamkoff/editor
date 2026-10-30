# Reconcile the retained Person proof with the published continuation

This merge preserves both histories: local `f3822d98ef6f06fb90e9accb69a84f13a14433a9`
and published `69c8425e0081fde69cf5176ccb73d032720c15fc`. It adds no production
behavior and does not represent a new browser or differential execution.

The four local commits contain the earlier independent Person comparison and
its documentation. Their full raw evidence remains in the adjacent date's
`person-roundtrip` directory and `person-roundtrip-docs-verification.json`.
The original source identities, failures, historical classifications and
successful 51-case results retain their original scope. They are not results
for the later integrated code.

The active shared fixture, runner, parity guide, preservation registers and
current progress reports use the published continuation. That version already
includes the later Person renderer and inactive-label repairs, Gallery and
Carousel comparisons, 65 shared cases across 21 block types, and the subsequent
bounded acceptance work. Restoring the older local fixture would discard those
changes. The current register remains 46 accepted and 163 open out of 209 rows;
this reconciliation accepts no additional row.

The retained `2026-10-29/publication-map.json` has 110 verified source/published
pairs through `a7d0dcecb927fa8166a149b05a5428ffb7d5b4d6`. Its first 105 entries are
identical to that file in the published continuation; the five additional Image
publication mappings are preserved. Later publication mappings in their own
checkpoint directories remain unchanged.

Before committing the merge, all production, test-runner and active
documentation bytes were compared against the published continuation. The only
additional files are the historical Person evidence, this reconciliation note
and the five preserved publication mappings. Original local commits remain in
the merge ancestry and in the explicit local checkpoint reference.

The published baseline also completed GitHub Actions run `41094120045`
successfully. `published-baseline-ci.json` preserves the retrieved run identity
and all seven successful jobs: browser, Node 20.19.0/22/24, package,
documentation and size report. This is the remote result for `69c8425e`,
not verification of subsequent local repairs.
