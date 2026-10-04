---
title: "Teleport Targets Across Nuxt SSR and Client Lifecycles"
impact: HIGH
impactDescription: "A valid browser target is not automatically a supported SSR hydration target"
type: best-practice
tags: [vue3, nuxt4, teleport, ssr, accessibility]
---

# Teleport with an explicit rendering boundary

Teleport changes DOM placement, not Vue parentage. Props, emits and provide/inject
still work; inherited CSS, ancestor selectors and stacking contexts follow the
actual DOM instead. Use it only where that placement solves a real problem.

## Nuxt SSR target

The Nuxt documentation supports SSR Teleport to `#teleports`. Use the established
project overlay host. Do not copy a generic `to="body"` example into an SSR page
and assume it has the same hydration support.

Complete Nuxt page/component showing placement, not a production modal:

```vue
<script setup lang="ts">
import { ref } from 'vue'
const visible = ref(false)
</script>

<template>
  <button type="button" :aria-pressed="visible" @click="visible = !visible">
    Toggle notice
  </button>
  <Teleport to="#teleports">
    <p v-if="visible" role="status">Notice is visible</p>
  </Teleport>
</template>
```

For other targets use Nuxt's documented `ClientOnly` boundary, or a deliberately
implemented and tested server-rendering integration. The destination must exist
when the Teleport resolves. Vue 3.5 `defer` can resolve a target later in the same
mount/update tick; it does not wait for an arbitrary asynchronous target.

## Hydration and responsive placement

Keep initial `disabled`, target and content state consistent on server/client.
A viewport check during client setup can disagree with SSR markup. Prefer CSS
for responsive layouts; defer a genuinely necessary DOM relocation to a suitable
client lifecycle boundary. Do not add VueUse solely for this example.

## Overlay behavior is a separate contract

Teleport does not implement modal semantics, focus trapping/restoration, Escape,
background inertness or scroll locking. Use existing accessible overlay components
and layering tokens. Clean up browser effects and consider route changes,
KeepAlive deactivation and nested overlays. Keep client-only fallback content
and styles usable when SSR does not include the overlay subtree.

## Acceptance

Check direct SSR entry and hydration with the overlay initially open and closed,
target presence, route disposal, keyboard focus and stacking. A client-only
screenshot is not an SSR acceptance test.

## Primary sources

- [Nuxt Teleport](https://nuxt.com/docs/4.x/api/components/teleports)
- [Vue Teleport and defer](https://vuejs.org/guide/built-ins/teleport.html)
- [Vue SSR Teleports](https://vuejs.org/guide/scaling-up/ssr.html#teleports)
