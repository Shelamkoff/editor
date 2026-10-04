---
title: "Class Animation Without Timer Races or Lost Error State"
impact: HIGH
impactDescription: "Decorative completion must not own validation or leave resources after disposal"
type: best-practice
tags: [vue3, animation, cleanup, accessibility]
---

# Class-based feedback

Use a CSS class for decorative feedback on an element that stays mounted. Use
Transition for enter/leave and TransitionGroup for changing lists. Keep validation,
save status and accessible text separate from a short-lived animation flag:
finishing a shake must not erase a still-valid error message.

## Own the decorative timer

This complete Vue composable illustrates a bounded feedback flag, not a promise
that repeatedly setting the same class will restart a CSS keyframe animation.
Call from setup/an active scope. Repeated triggers extend the flag's interval;
disposal clears the timer and subsequent triggers are ignored.

```ts
import { onScopeDispose, readonly, ref } from 'vue'

export function useFeedbackFlag() {
  const active = ref(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  let disposed = false

  function clear(): void {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
    active.value = false
  }

  function trigger(): void {
    if (disposed) return
    clear()
    active.value = true
    timer = setTimeout(clear, 500)
  }

  onScopeDispose(() => {
    disposed = true
    clear()
  })
  return { active: readonly(active), trigger, clear }
}
```

The duration is illustrative. A real CSS-animation restart needs its own policy;
do not remount a focused control or force layout casually to replay decoration.
For KeepAlive decide whether deactivation should clear feedback too.

## Events and reduced motion

An animationend handler can be useful, but is not guaranteed to fire after
cancellation, removal or animation: none. Filter the event's target/name so a
child's unrelated animation does not clear the parent's state. Clean up fallback
timers and cancellation listeners. Use prefers-reduced-motion styling; the
application's success/error state must work without motion and without an end event.

## Acceptance

Check repeated triggers, unmount/deactivation, suppressed motion and interrupted
animations. Keep styles scoped and reuse project feedback components/tokens.
Avoid decorative state tied to unresolved promises or arbitrary global listeners.

## Primary sources

- [Vue animation techniques](https://vuejs.org/guide/extras/animation.html)
- [Effect cleanup](https://vuejs.org/api/reactivity-advanced.html#onscopedispose)
- [Animation end and cancellation](https://developer.mozilla.org/en-US/docs/Web/API/Element/animationend_event)
