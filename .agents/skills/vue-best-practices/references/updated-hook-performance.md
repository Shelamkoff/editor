---
title: "Target Effects Instead of Synchronizing on Every Render"
impact: HIGH
impactDescription: "Render-wide effects can create feedback loops and interfere with unrelated user interaction"
type: best-practice
tags: [vue3, lifecycle, watchers, effects, performance]
---

# Update hooks are not a general data pipeline

onUpdated runs after batched component DOM updates, not once for every individual
reactive assignment. Do not fetch/save data or derive application state there.
Updating rendered reactive state from that hook can create a feedback loop.
Computed values own derivations; commands/mutations or targeted watchers own
intentional external effects.

## Choose the actual trigger

Use an explicit event for user-initiated persistence. When autosave is required,
watch the specific draft contract with owned debounce/cancellation/retry semantics,
not every component render or the whole global store. Preserve ecom's repository
and mutation boundary instead of a raw fetch in the component.

For a DOM read that depends on one reactive input, a post-flush watcher can be
more precise than onUpdated. Complete local example: focus a newly shown field
only after the user explicitly opens it.

```vue
<script setup lang="ts">
import { ref, useTemplateRef, watch } from 'vue'
const editing = ref(false)
const title = ref('')
const field = useTemplateRef<HTMLInputElement>('title-field')

watch(editing, (visible) => {
  if (visible) field.value?.focus()
}, { flush: 'post' })
</script>

<template>
  <button type="button" :aria-expanded="editing" @click="editing = !editing">
    Toggle title field
  </button>
  <label v-if="editing">
    Title
    <input ref="title-field" v-model="title" />
  </label>
</template>
```

The effect is not immediate during SSR and typing does not refocus the field.
A production disclosure/dialog should also own focus restoration when closing
from inside the panel; use the established component rather than copying a demo.

## When onUpdated is justified

An idempotent imperative widget sync or a current-attrs side effect may genuinely
need the updated DOM. Guard actual changes, avoid reactive feedback and keep the
operation small. Do not force autoscroll after every render while the user is
reading older content. Disconnect widgets/timers/listeners on disposal and pause
cached views as required. Do not add lodash/VueUse solely for this reference.

## Acceptance

Verify the effect runs only for its intended change, unrelated renders are inert,
rapid updates do not race, and resources stop on disposal. Measure performance
rather than promising a fixed frame rate.

## Primary sources

- [Vue onUpdated](https://vuejs.org/api/composition-api-lifecycle.html#onupdated)
- [Watcher flush timing](https://vuejs.org/guide/essentials/watchers.html#callback-flush-timing)
