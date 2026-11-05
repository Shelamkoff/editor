# Color popup lifetime 2026-11-05

**Accepted: INLINE_COLOR_LIFETIME.**
Register: **157 accepted / 52 open / 209 total**. Tested source: `a00e131ce6a6dc790370ad639f1cd120f63a3eff`.

`INLINE_COLOR_LIFETIME` is accepted on `a00e131c`: **157/209 obligations accepted, 52 open**. All **seven affected gates** pass on one clean unchanged source. [Evidence](https://github.com/Shelamkoff/editor/blob/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-11-05/color-lifetime/README.md): **12 current executions / 518 observations**, **389 module identities**, **24 rejected corruptions**. No production change is needed.

Six cases retire an actual source color popup through block removal, document replacement with/without its widget, a read-only mode cycle, another widget or editor destruction. Current editors share one immutable definition and deliberately reuse identical block/widget IDs in independent documents. Canonical data, exact swatches/labels/ARIA, popup ownership, input callers and action owners are literal expectations.

After retirement, four retained input/change/blur/click events are delivered synthetically to old controls. Each case repeats that delivery while the other editor owns a newly opened actual picker: **96 explicitly synthetic deliveries** across current policies. They cannot change source/successor/foreign data or paint, close the current owner or add a transaction. Real opening, input selection, Apply and keyboard replay use trusted native events. A native change in the other editor still commits one correctly owned action and Undo/Redo remains exact after source retirement, including source destruction.

All six reference bodies finish without page/input errors. v1 retains **52 differences**; baseline, immutable parent and both current policies retain zero. V1 forbids sharing one plugin object between live editors, so separate old objects exercise its real popup lifetime while current editors reuse an immutable definition. That unavailable sharing contract and missing observers are explicit. The initial exploratory process stopped before a report at that old sharing restriction; exact stderr, fixture/runner bytes and the unreached source-completion check remain archived, without inferring a current pass.

Native pages pass **86 cases**, including current Color action and popup regressions; inventory is **132 native pages**. Documentation and site checks pass. Exact runtime/package identity and 115 verified Git artifacts retain all fifteen full integration gates on `c0054fb8`, with actual sources/dates. The existing lifecycle unit test is verified by its passing name in the inherited full Node log. Only Color lifetime is newly accepted; Color roundtrip and full readiness remain open.
