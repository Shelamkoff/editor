---
title: Normalize Shareable URL State Without Duplicate Store Ownership
impact: HIGH
impactDescription: Ambiguous query values and two-way watcher loops corrupt filters and navigation history
type: best-practice
tags: [vue3, nuxt4, pinia, url, validation]
---

# URL-owned filters

Use the URL for public filters, sorting, pagination or views that should be
shareable. Not every temporary value belongs there: keep private drafts, tokens,
session data and sensitive searches out of URLs and browser history.

Use Nuxt's useRoute (auto-import or #app), not the direct vue-router composable.
Read middleware inputs from to/from. Derive accepted filters from the route;
keep only an intentional editing/debounce draft locally rather than mirroring
all fields into Pinia with competing bidirectional watchers.

## Validate query values

Query values are untrusted and may be absent, null or repeated arrays. Decide
how each contract handles those cases. Never parse textual booleans with Boolean:
Boolean('false') is true. Do not accept partial numeric strings with parseInt.

These pure helpers deliberately reject repeated/ambiguous values. The feature
supplies its maximum page; this skill does not invent a product limit.

```ts
export function readFlag(value: unknown): boolean | undefined {
  if (value === 'true' || value === '1') return true
  if (value === 'false' || value === '0') return false
  return undefined
}

export function readPage(value: unknown, maximum: number): number {
  if (!Number.isSafeInteger(maximum) || maximum < 1) {
    throw new RangeError('maximum must be a positive safe integer')
  }
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return 1
  const page = Number(value)
  return Number.isSafeInteger(page) && page >= 1 && page <= maximum ? page : 1
}
```

Defaults, rejected values and canonical serialization are contract decisions.
Arrays may be valid for multi-select filters; normalize them according to that
specific schema rather than using the single-value helpers indiscriminately.

## Update the URL deliberately

Preserve unrelated query parameters and the intended hash when applying a filter.
Use replace for debounced edits where each keystroke should not create history;
use push for deliberate view transitions when Back should undo them. Coalesce
related changes into one navigation and compare normalized state before writing.

A draft should resynchronize on successful Back/Forward/external navigation.
Handle rejected/failed navigation without silently leaving the displayed filter
and URL inconsistent. Avoid a pair of watchers that rewrites each other's state.
Reset pagination when a filter change changes that feature's result set, according
to the existing contract.

Do not install VueUse just to reproduce a reference example. Existing helpers are
usable only after checking their coercion semantics, Nuxt compatibility and the
project's dependencies. URL filters do not automatically imply an SEO benefit:
indexing/canonical URL policy is a separate concern.

## Verification

Test absent/null/repeated values, false/0 flags, invalid/negative/out-of-range
pages, preserving unrelated params, Back/Forward and no redirect/sync loop.
The bundled Node test executes the pure helpers above; it is not a browser router
or Nuxt integration test.

## Primary sources

- [Nuxt useRoute](https://nuxt.com/docs/4.x/api/composables/use-route)
- [Vue Router query types](https://router.vuejs.org/api/type-aliases/LocationQuery.html)
- [Vue Router navigation](https://router.vuejs.org/guide/essentials/navigation.html)
