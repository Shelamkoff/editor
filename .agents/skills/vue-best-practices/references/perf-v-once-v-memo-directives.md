---
title: "Memoize Only a Complete Render Dependency Contract"
impact: HIGH
impactDescription: "Omitted parent-driven dependencies can freeze stale resource data while child-local effects still run"
type: best-practice
tags: [vue3, performance, memoization, ownership]
---

# v-once and v-memo are measured escape hatches

Vue already optimizes compiled templates. It does not blindly recreate every
node/component on every reactive write. Profile before adding memoization.

Use v-once only when the subtree is intentionally a lifetime snapshot. Locale,
account identity, validation, permissions or resource updates usually invalidate
that assumption. Static markup may already benefit from compiler optimizations.
Never use v-once as a way to conceal stale state or hydration differences.

## Include every parent-driven dependency

For a memoized item, selection alone is insufficient when title, price, status or
other displayed resource fields can change. Under an **immutable replacement**
contract, item identity can cover its data. In-place mutation needs a revision or
explicit relevant values instead; a stable object reference will not detect it.

Complete SFC with immutable items and selection as its full parent-driven inputs:

```vue
<script setup lang="ts">
interface Item {
  readonly id: string
  readonly title: string
}
defineProps<{ items: readonly Item[]; selectedId?: string }>()
const emit = defineEmits<{ select: [id: string] }>()
</script>

<template>
  <ul>
    <li v-for="item in items" :key="item.id" v-memo="[item, item.id === selectedId]">
      <button type="button" :aria-pressed="item.id === selectedId" @click="emit('select', item.id)">
        {{ item.title }}
      </button>
    </li>
  </ul>
</template>
```

The parent must replace an item object when its data changes. Add other consumed
inputs to the dependency array if the contract expands; TypeScript readonly alone
does not freeze objects at runtime. Keep v-memo on the same element as v-for.
An empty dependency array is an intentional once-only contract.

## Do not confuse parent and child updates

A memoized parent's skipped patch does not suspend a child's independently
scheduled reactive effects. The risk is stale **parent-provided** props/slots/
listeners, not a blanket statement that children or v-model stop working.
Do not add unsupported tables promising exactly two renders or fixed speedups.

## Acceptance

Test changed item content, selection, independent child state, locale/auth inputs
and mutations. Remove memoization when the dependency contract becomes brittle
or a measured benefit is absent. Sanitization requirements still apply to HTML;
these directives do not make untrusted content safe.

## Primary sources

- [Vue v-memo/v-once](https://vuejs.org/api/built-in-directives.html#v-memo)
- [Vue rendering optimizations](https://vuejs.org/guide/extras/rendering-mechanism.html)
- [Vue performance](https://vuejs.org/guide/best-practices/performance.html)
