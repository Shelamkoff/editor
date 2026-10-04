# When to Mock

Choose doubles by the boundary under test, not by who owns the dependency. Prefer real domain objects. Use a double when a dependency crosses a meaningful boundary or introduces nondeterminism:

- External services or application ports (payment, email, etc.)
- Persistence ports for isolated service behavior; use a real test database to verify persistence or transactions
- Time/randomness
- File system boundaries

A port defined in your own code can represent such a boundary. Do not replace the behavior you are trying to verify, or mock every internal helper merely because it can be mocked.

- Use a **stub** for controlled responses and a **fake** when a small working implementation makes the test clearer.
- Use a **spy or mock** when the contract promises communication, such as a payment request or dispatched event.
- Assert arguments, count, or order only when they are part of that promise. Avoid incidental interactions.
- Keep doubles consistent with the real dependency's contract. A passing test with a fake does not establish that the real adapter or framework wiring works.

## Designing for Mockability

Expose dependencies at meaningful boundaries. Do not add a new abstraction solely to satisfy a mocking framework.

**1. Use dependency injection**

Pass external dependencies in rather than creating them internally:

```typescript
// Easy to mock
function processPayment(order, paymentClient) {
  return paymentClient.charge(order.total);
}

// Hard to mock
function processPayment(order) {
  const client = new StripeClient(process.env.STRIPE_KEY);
  return client.charge(order.total);
}
```

**2. Match the interface to the responsibility**

A payment port exposing `charge()` can express the service's needs more clearly than a generic HTTP client. A transport adapter may legitimately depend on a generic client. Keep the existing boundary when it fits; choose the double and assertions for the contract being tested instead of redesigning production code around the test.
