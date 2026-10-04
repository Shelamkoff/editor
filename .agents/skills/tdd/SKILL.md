---
name: tdd
description: Test-driven development using red-green-refactor. Use when the user asks to build features or fix bugs test-first, or to apply TDD to unit or integration tests.
---

# Test-Driven Development

Use the red → green → refactor cycle to develop behavior through tests of the public contract. Follow the project's testing conventions and existing contracts when choosing test boundaries and tools.

When exploring the codebase, read `CONTEXT.md` (if it exists) so test names and interface vocabulary match the project's domain language, and respect ADRs in the area you're touching.

## What a good test is

Tests verify behavior through public interfaces and observable effects. A test should survive changes to internal structure when the public contract stays the same. A good test reads like a specification: "user can checkout with valid cart" describes a capability rather than the calls used to implement it.

See [tests.md](tests.md) for examples and [mocking.md](mocking.md) for mocking guidelines.

## Seams: where tests go

A **seam** is the public boundary you test at: the interface where you exercise behavior and observe its promised results or effects. It may be a function, class, service, or system boundary; it does not require a new interface type.

Choose the boundary from the task, existing contracts, and project tests. Reuse boundaries already agreed with the user. Proceed when the intended behavior and boundary are clear; ask only when unresolved ambiguity would materially change the contract, scope, or expected result.

For a new or changed contract, identify its inputs, outputs, observable effects, and failure behavior before writing assertions. Focus on meaningful risks and avoid inventing requirements to fill a test matrix.

Observe effects at the boundary that owns them. A persistence integration test may inspect committed database state; a payment test may verify one charge with the agreed amount. Avoid coupling those checks to incidental SQL, helper calls, or private state.

## Anti-patterns

- **Implementation-coupled**: asserts private methods, incidental call order, or internal collaborators instead of the promised outcome. Interaction assertions are appropriate when the interaction itself is the contract.
- **Tautological**: derives expected values by copying the implementation or accepting its current output without checking the specification. Use independently justified values or properties. A regression test must describe the intended behavior, not preserve the bug.
- **Horizontal slicing**: writes a large batch of tests against a speculative implementation before running any of them. Keep a behavior checklist if useful, then implement one failing behavior at a time so each cycle informs the next.

## Rules of the loop

1. **Red.** Write a focused test for the next behavior and run it. Confirm it fails for the intended missing or incorrect behavior, not a broken fixture, missing dependency, or unrelated failure.
2. **Green.** Implement only enough to satisfy that behavior and rerun the focused tests. Keep expectations tied to the contract; do not weaken them to accept a bug.
3. **Refactor.** With tests green, improve the implementation or tests where useful while preserving the contract. Rerun the affected tests after changes. A cycle with nothing to simplify needs no forced refactor.
4. **Repeat.** Add the next meaningful behavior. Before completion, run the relevant broader checks required by the project and the change's risk.

If tests cannot run, report what prevented execution and which results remain unverified. Writing a test alone does not demonstrate the red or green step.
