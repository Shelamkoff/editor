---
title: "Keyed List Transitions with Owned Cleanup"
impact: HIGH
impactDescription: "List identity and cancellable animation matter more than hard-coded timer sequences"
type: best-practice
tags: [vue3, transition-group, keys, motion]
---

# TransitionGroup for changing lists

Give every child a unique stable key representing its item, not its index when
items can move. A tag prop supplies a semantic container; no wrapper is rendered
by default. TransitionGroup has no Transition-style mode prop.

Complete SFC with a parent-owned item list and no ad-hoc timers:

```vue
<script setup lang="ts">
interface Item {
  readonly id: string
  readonly label: string
}
defineProps<{ items: readonly Item[] }>()
</script>

<template>
  <TransitionGroup name="rows" tag="ul">
    <li v-for="item in items" :key="item.id">{{ item.label }}</li>
  </TransitionGroup>
</template>

<style scoped>
.rows-move,
.rows-enter-active,
.rows-leave-active { transition: opacity 160ms ease, transform 160ms ease; }
.rows-enter-from,
.rows-leave-to { opacity: 0; transform: translateY(0.25rem); }
@media (prefers-reduced-motion: reduce) {
  .rows-move,
  .rows-enter-active,
  .rows-leave-active { transition: none; }
}
</style>
```

Motion values are illustrative, not a new design system. An exiting item can
still occupy layout while leaving; move animation strategy must account for
that. Taking leaving nodes out of flow requires a deliberately positioned
container and preserved item dimensions, not an unqualified absolute rule.

## JS staggering is optional

Do not implement staggering with nested setTimeout calls that outlive the list.
When JS hooks are genuinely required, own each timer/animation handle, cancel
stale work on interruption/unmount, and settle the relevant done callback exactly
once. Reduced-motion paths must complete without waiting for a disabled animation.
Use explicit animated properties rather than transition: all.

Virtualized/recycled lists have different mount and identity behavior. Do not
stack TransitionGroup onto a virtualizer without checking its integration.

## Acceptance

Test insertion, removal, reordering, rapid changes, keyboard focus, reduced
motion and disposal during an animation. Do not confuse a passing CSS build with
correct runtime animation cleanup.

## Primary sources

- [Vue TransitionGroup](https://vuejs.org/guide/built-ins/transition-group.html)
- [Transition JS hooks](https://vuejs.org/guide/built-ins/transition.html#javascript-hooks)
