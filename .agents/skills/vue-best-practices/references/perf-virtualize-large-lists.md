---
title: "Reactive Virtualization with SSR and Accessibility Boundaries"
impact: HIGH
impactDescription: "Snapshot option counts become stale after data changes; virtualization also changes the rendered content contract"
type: best-practice
tags: [vue3, nuxt4, virtualization, performance, reactivity]
---

# Virtualize a demonstrated rendering bottleneck

There is no universal 50/100-item threshold. Measure realistic content and devices,
then compare virtualization with pagination, simpler rows and smaller payloads.
Virtualization limits rendered items, not necessarily fetched data or its memory.
A viewport must be bounded/observable; it need not have a hard-coded pixel height.

Ecom already declares @tanstack/vue-virtual. Check its resolved version and existing
integration rather than installing a competing scroller from a generic example.

## Options must track their inputs

`count: rows.value.length` evaluated once is a snapshot. Use computed options so
collection/target changes update the virtualizer. Complete composable for an
existing virtual-list host (call during setup):

```ts
import { computed, toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'

export interface Row {
  readonly id: string
}

export function useVirtualRows(
  rows: MaybeRefOrGetter<readonly Row[]>,
  target: MaybeRefOrGetter<HTMLElement | null>,
) {
  return useVirtualizer(computed(() => {
    const keys = toValue(rows).map(row => row.id)
    const scrollElement = toValue(target)
    return {
      count: keys.length,
      getScrollElement: () => scrollElement,
      getItemKey: (index: number) => {
        const key = keys[index]
        if (key === undefined) throw new RangeError('Virtual row index is outside the collection')
        return key
      },
      estimateSize: () => 80,
      overscan: 5,
    }
  }))
}
```

The estimate/overscan are illustrative and must fit the host. Supply a ref/getter,
not an already unwrapped array snapshot. IDs must be unique. Reading IDs inside computed also tracks same-length
reordering for reactive arrays, rather than observing only length. A host also needs
spacer/positioning and, for variable heights, the supported measurement API;
this composable alone is not a complete visual list implementation.

## Rendering is a product contract

A virtual window can omit offscreen content from SSR, search, print and assistive
navigation. Preserve essential SEO content and a useful non-virtual/paginated path
where required. Keep server/client initial ranges consistent or use a deliberate
client-only progressive enhancement; do not hide an SSR regression with ClientOnly.

Plan keyboard focus when rows are recycled/removed. Preserve list/table semantics
and any relevant position/count information. Test resize and dynamic row heights.

## Acceptance

Check initial empty data followed by a fetch, append, shrink, reorder, target
replacement, scrolling, hydration and focus. A constant row count in a demo does
not verify a live catalogue. Avoid fabricated DOM-node counts or speedup guarantees.

## Primary sources

- [TanStack Vue adapter](https://tanstack.com/virtual/latest/docs/framework/vue/vue-virtual)
- [Reactive infinite-scroll example](https://tanstack.com/virtual/latest/docs/framework/vue/examples/infinite-scroll)
- [Vue large-list guidance](https://vuejs.org/guide/best-practices/performance.html#virtualize-large-lists)
