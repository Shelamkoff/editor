---
title: "State-driven Motion with Stable SSR and Accessible Controls"
impact: HIGH
impactDescription: "Visual interpolation must not change ownership or depend on an unapproved animation library"
type: best-practice
tags: [vue3, animation, ssr, accessibility]
---

# State drives the value; CSS may interpolate it

Use reactive style/class bindings for visual state and CSS transitions where
appropriate. Avoid a second canonical animated state for business data. A progress
animation must not control when a real operation is considered complete.

Complete component demonstrating a keyboard-operable control, deterministic
initial state and reduced-motion handling:

```vue
<script setup lang="ts">
import { computed, ref, useId } from 'vue'
const controlId = useId()
const progress = ref(0)
const scale = computed(() => Math.min(100, Math.max(0, progress.value)) / 100)
</script>

<template>
  <label :for="controlId">Preview progress</label>
  <input :id="controlId" v-model.number="progress" type="range" min="0" max="100" />
  <div class="track" aria-hidden="true">
    <div class="fill" :style="{ transform: `scaleX(${scale})` }" />
  </div>
</template>

<style scoped>
.track { block-size: 0.5rem; overflow: hidden; }
.fill {
  block-size: 100%;
  background: currentColor;
  transform-origin: left;
  transition: transform 160ms ease;
}
@media (prefers-reduced-motion: reduce) {
  .fill { transition: none; }
}
</style>
```

This is a numeric range-control example, not an API validator. External progress
values still need validation at their boundary. Adopt the project's RTL direction
and motion/token conventions when integrating a real progress component.

## Browser effects and tweening

Read viewport/scroll/browser APIs after mount or within an established client
boundary. Do not generate different initial SSR markup from window dimensions.
Throttled frame loops, observers and scroll listeners need teardown and a
KeepAlive pause policy. Do not force users' scroll position for decoration.

A tweening library is optional, not a default dependency. When an approved library
is required, cancel/replace the previous tween on source changes, stop it on
disposal, and implement a reduced-motion path. Do not copy a GSAP import into ecom
without installation/approval. Do not add a second theme-token system for a demo.

## Acceptance

Test keyboard and pointer input, rapid updates, reduced motion, server/client
parity and cleanup. Measure expensive animations; transform/opacity often avoid
layout work, but no property alone guarantees a particular frame rate.

## Primary sources

- [Vue animation techniques](https://vuejs.org/guide/extras/animation.html)
- [Nuxt hydration](https://nuxt.com/docs/4.x/guide/best-practices/hydration)
- [Reduced-motion preference](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)
