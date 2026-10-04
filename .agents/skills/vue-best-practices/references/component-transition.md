---
title: "Transition Identity and Motion Policy"
impact: HIGH
impactDescription: "Vue 3 already distinguishes conditional branches; forced keys and sequential modes are deliberate choices"
type: best-practice
tags: [vue3, transition, keys, accessibility]
---

# Animate a meaningful transition

Transition accepts a single element or a component rendering a single element.
Use TransitionGroup for changing keyed lists. Do not add wrappers or animation
when there is no UX requirement. Use Nuxt's page/layout transition integration
for Nuxt navigation rather than replacing NuxtPage.

## Keys distinguish identity, not every update

Vue 3 generates distinct keys for v-if/v-else branches. Those branches do not
need manual keys just because they share a tag. Explicit keys are useful when
changing content within one node should replace it, as in this complete SFC:

```vue
<script setup lang="ts">
defineProps<{ status: string }>()
</script>

<template>
  <Transition name="status" mode="out-in">
    <span :key="status">{{ status }}</span>
  </Transition>
</template>

<style scoped>
.status-enter-active,
.status-leave-active { transition: opacity 120ms ease; }
.status-enter-from,
.status-leave-to { opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .status-enter-active,
  .status-leave-active { transition: none; }
}
</style>
```

The duration is illustrative; reuse project motion tokens. `out-in` intentionally
waits for the previous node to leave. Simultaneous transitions are also valid;
choose sequencing from layout/focus requirements. Use stable primitive identity
keys, not component objects, random values or arbitrary route.fullPath strings.

## Completion and cancellation

Prefer CSS opacity/transform when they express the desired motion, but do not
claim layout animation is always forbidden or GPU acceleration is guaranteed.
For JS hooks with a done callback, handle completion, cancellation and teardown
once. Do not rely on an uncancelled timer or a transitionend event that may never
arrive under reduced motion. Preserve focus and persistent validation/error text.

## Acceptance

Test rapid toggles, interruption, reduced motion and focus. In SSR, keep initial
markup identical; a decorative key is not a hydration fix.

## Primary sources

- [Vue Transition](https://vuejs.org/guide/built-ins/transition.html)
- [Vue 3 conditional keys](https://v3-migration.vuejs.org/breaking-changes/key-attribute.html)
- [Nuxt transitions](https://nuxt.com/docs/4.x/getting-started/transitions)
