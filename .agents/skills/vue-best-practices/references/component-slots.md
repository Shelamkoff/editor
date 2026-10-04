---
title: "Typed Slot Contracts and Deliberate Fallbacks"
impact: HIGH
impactDescription: "A slot function being present does not prove that it renders meaningful content"
type: best-practice
tags: [vue3, slots, typescript, contracts]
---

# Slots are public component contracts

Choose slots when callers own presentation within a component. Choose a composable
for reusable reactive logic; renderless components remain valid when a slot-based
API is the useful boundary. Do not convert one into the other just for style.

Both `v-slot:header` and `#header` are supported; prefer the project's spelling.
Mark optional slots as optional and give useful fallback content where appropriate.

## Typed scoped slots

Complete Vue 3.5 SFC:

```vue
<script setup lang="ts">
interface Product {
  readonly id: string
  readonly title: string
}

defineProps<{ products: readonly Product[] }>()
defineSlots<{
  default(props: { product: Product; index: number }): unknown
  empty?(): unknown
}>()
</script>

<template>
  <ul v-if="products.length > 0">
    <li v-for="(product, index) in products" :key="product.id">
      <slot :product="product" :index="index" />
    </li>
  </ul>
  <p v-else>
    <slot name="empty">No products</slot>
  </p>
</template>
```

`defineSlots` provides slot-prop typing; the documented return type is not used
for return-content validation. `unknown` avoids explicit `any` without pretending
to validate the rendered result. Slot content must respect the surrounding HTML
structure (the example's empty slot is inline content inside a paragraph).

## Presence is not non-empty content

`$slots.header` checks whether a slot function was supplied. It does not prove
that the function currently produces visible content: conditional content can
render nothing/comments. Decide whether wrappers depend on the slot contract or
an explicit visibility prop. Do not execute slot functions once in setup to cache
presence/content; slots should be consumed in the render path.

Keep fallback rendering deliberate: omitting a wrapper with `v-if="$slots.header"`
also removes fallback content inside that wrapper. Avoid incidental empty spacing,
but do not build a generic VNode inspector for a simple header contract.

## Acceptance

Test omitted/optional slots, conditionally empty slots, prop updates in scoped
slots and default fallbacks. Preserve semantic HTML and caller-owned accessibility.

## Primary sources

- [Vue slots](https://vuejs.org/guide/components/slots.html)
- [defineSlots](https://vuejs.org/api/sfc-script-setup.html#defineslots)
