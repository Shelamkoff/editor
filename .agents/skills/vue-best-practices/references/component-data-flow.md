---
title: Explicit Component Contracts and Context Ownership
impact: HIGH
impactDescription: Hidden mutations and incorrect injection ownership produce stale or inconsistent UI state
type: best-practice
tags: [vue3, props, emits, model, provide-inject, typescript]
---

# Component data flow

Use props for inputs and events for changes. Treat props as readonly contracts;
object/array props can still expose nested mutable values, so do not mutate a
parent's data incidentally. For editing, create an intentional draft or emit a
change. Component events do not bubble through arbitrary ancestor components.

Type public boundaries with defineProps, defineEmits and InjectionKey. Keep
imperative refs for actual imperative behavior (focus/open), not a hidden data
channel. Expose only intended methods and allow template refs to be null.

## Component v-model

Prefer defineModel when it makes a Vue 3.4+ two-way contract clearer. The explicit
modelValue + update:modelValue pattern remains supported on newer Vue too; do not
label it invalid solely because a newer macro exists.

A default value in the child can differ from an undefined parent model. Initialize
the model consistently, make it required where appropriate or deliberately handle
that case. Do not mutate nested model objects as a substitute for the intended
update contract. Handle modifiers and event payloads explicitly.

Self-contained input component:

```vue
<script setup lang="ts">
const value = defineModel<string>({ required: true })
const { label } = defineProps<{ label: string }>()
</script>

<template>
  <label>
    <span>{{ label }}</span>
    <input v-model="value" />
  </label>
</template>
```

## Provide/inject

Use context for meaningful subtree dependencies, not simply because a tree has a
particular number of levels. Export a shared typed Symbol key from a plain module
and import that same key in provider/consumers. Creating a new Symbol per component
instance does not establish a shared injection contract.

A component injects from ancestors/app context, not from its own provide call.
Do not demonstrate provide and inject in the same setup as though the latter
reads the former. Handle a missing required provider explicitly rather than hiding
it with an unsafe assertion. Provider-owned readonly state plus actions can be an
appropriate ordinary context contract; this is not Pinia's owned-state contract.

Keep mutation ownership at the provider or use explicit shared writable contracts.
Do not return injected router/app infrastructure as state from a Pinia setup store.
Use props/events rather than global event buses for ordinary component data flow.

## Verification

Test emitted payloads, parent updates, model defaults, missing/nearest provider,
shared-key identity, null refs and draft isolation. Avoid tests coupled to private
methods when public rendered behavior/events express the contract.

## Primary sources

- [Props](https://vuejs.org/guide/components/props.html)
- [Component v-model](https://vuejs.org/guide/components/v-model.html)
- [Provide/inject](https://vuejs.org/guide/components/provide-inject.html)
