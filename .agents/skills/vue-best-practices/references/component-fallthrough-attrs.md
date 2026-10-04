---
title: "Attribute Forwarding Without Stale Snapshots or Duplicate Events"
impact: HIGH
impactDescription: "Attrs are current but not a watched state source; forwarding must preserve the intended element and event contract"
type: best-practice
tags: [vue3, attrs, events, typescript]
---

# Fallthrough attributes

Use ordinary attribute inheritance for a simple single-root component. When a
wrapper or multiple roots need explicit routing, use `inheritAttrs: false` and
forward `$attrs` to the intended element. Preserve class, style, accessibility
attributes and applicable listeners, not only a hand-picked test attribute.

## Current values are not a reactive source

`useAttrs()` exposes current attributes, but Vue does not document it as a
reactive source for observation. Do not depend on an implementation-specific
tracking behavior in a computed getter or watcher.
Do not cache `computed(() => attrs['aria-label'])` as a reactive contract or
snapshot attrs once in setup and expect future updates.

Bind `$attrs` directly in the template. Promote a value to a typed prop when
reactive derivation/observation is required. `onUpdated` is an option for a
necessary idempotent imperative effect, not a reason to create a mirrored state
object or a render-feedback loop.

Hyphenated keys use bracket notation. Listener keys include `onClick`; declared
props and declared emitted-event listeners are consumed and are not fallthrough
attributes.

## Forward an event once

This complete SFC declares its click contract and forwards other attributes to
the actual button. Declaring `click` prevents its listener from being forwarded
again through `$attrs` when the component emits it.

```vue
<script setup lang="ts">
defineOptions({ inheritAttrs: false })
const emit = defineEmits<{ click: [event: MouseEvent] }>()

function handleClick(event: MouseEvent): void {
  emit('click', event)
}
</script>

<template>
  <div class="button-wrapper">
    <button v-bind="$attrs" type="button" @click="handleClick">
      <slot />
    </button>
  </div>
</template>
```

This contract deliberately fixes `type="button"`. A component supporting submit
buttons should instead declare and forward that option explicitly. Do not call
`attrs.onClick` manually as an arbitrary function: the value is untyped and
merged listeners can have more than one handler. Use Vue's forwarding or emits.

## Acceptance

Update/remove attrs after mount; verify the real button receives current values.
Verify a parent click handler fires once, native disabled behavior is preserved,
and accessible naming/focus remains intact. Test wrapper and multi-root cases.

## Primary sources

- [Vue fallthrough attributes](https://vuejs.org/guide/components/attrs.html)
- [Declared events](https://vuejs.org/guide/components/events.html#declaring-emitted-events)
