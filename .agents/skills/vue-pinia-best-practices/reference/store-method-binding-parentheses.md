---
title: Distinguish Bound Pinia Actions from Unbound Object Methods
impact: MEDIUM
impactDescription: Blanket parentheses rules confuse method binding with event argument forwarding
type: gotcha
tags: [vue3, pinia, actions, events, this-binding]
---

# Pinia actions and event arguments

Pinia actions are bound to their store. Direct action destructuring and a bare
event handler reference are supported. Do not require parentheses merely to
preserve `this` for a Pinia action.

These expressions differ in their arguments, not Pinia binding:

```vue
<template>
  <!-- Method handler receives the DOM event. -->
  <button @click="counter.increment">Increment</button>
  <!-- Inline call passes no arguments. -->
  <button @click="counter.increment()">Increment</button>
</template>
```

This is a template fragment assuming a counter store from setup. When an action
accepts an optional domain argument (for example quantity), use an explicit call
such as `cart.add(productId, 1)` so MouseEvent is not treated as that argument.

Use storeToRefs for state/getters, not for actions. `const { increment } = counter`
is valid for a Pinia action and does not have the state-destructuring problem.

## Unbound ordinary objects are different

A hand-written object's method that uses `this` can lose its receiver when passed
as a function. Call it through its object, bind it deliberately, or use a closure.
That JavaScript distinction is not a blanket ban on bare Pinia action handlers.
Do not introduce a global reactive singleton to demonstrate a Nuxt store.

Test actual arguments and observable state transitions rather than enforcing a
parenthesis style by text matching.

## Primary sources

- [Pinia destructuring](https://pinia.vuejs.org/core-concepts/#destructuring-from-a-store)
- [Vue event handling](https://vuejs.org/guide/essentials/event-handling.html)
