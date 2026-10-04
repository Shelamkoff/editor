# Good and Bad Tests

## Good Tests

Test through public interfaces and observable effects. Use unit tests for isolated behavior and integration tests when correctness depends on wiring or infrastructure.

```typescript
// GOOD: Tests observable behavior
test("user can checkout with valid cart", async () => {
  const cart = createCart();
  cart.add(product);
  const result = await checkout(cart, paymentMethod);
  expect(result.status).toBe("confirmed");
});
```

Characteristics:

- Tests behavior users/callers care about
- Exercises the public API and observes the contract's results or effects
- Survives internal refactors
- Describes WHAT, not HOW
- Covers one coherent behavior; several assertions may describe that behavior

## Bad Tests

**Implementation-detail tests**: Coupled to internal structure. For example, asserting that checkout calls an internal pricing helper exactly once constrains its implementation unless that interaction is explicitly part of the contract.

Red flags:

- Replacing the domain logic being tested with mocks
- Testing private methods
- Asserting on call counts/order that the contract does not require
- Test breaks when refactoring without behavior change
- Test name describes HOW not WHAT
- Inspecting incidental private state or storage layout

Prefer the public read API when the promise is that a newly created user can be retrieved:

```typescript
test("createUser makes user retrievable", async () => {
  const user = await createUser({ name: "Alice" });
  const retrieved = await getUser(user.id);
  expect(retrieved.name).toBe("Alice");
});
```

For a repository or transaction integration test, persisted state may itself be the contract. Use an isolated test database and observe it independently when necessary: for example, verify that rollback leaves no committed row. A database query is not inherently an implementation detail; relying on incidental schema or SQL in an unrelated service test is.

**Contractual interactions**: A double is appropriate when the promised behavior is an interaction with another boundary. Here the stated contract is one charge of 1500 cents for this order:

```typescript
test("checkout charges the agreed amount once", async () => {
  const payments = { charge: jest.fn().mockResolvedValue({ id: "payment-1" }) };
  const checkout = new CheckoutService(payments);
  const order = { id: "order-1", totalCents: 1500 };

  await checkout.execute(order);

  expect(payments.charge).toHaveBeenCalledTimes(1);
  expect(payments.charge).toHaveBeenCalledWith("order-1", 1500);
});
```

This verifies the service's payment protocol, not the real provider's implementation. Use an integration test when the behavior under test depends on the real adapter, database, or transaction.

**Duplicated expectations**: Repeating the implementation's calculation can repeat its bug in the expected value. Derive expectations independently from the contract. Literal self-comparisons are tautologies and cannot detect a regression at all.

```typescript
// BAD: Expected value is recomputed the way the code computes it
test("calculateTotal sums line items", () => {
  const items = [{ price: 10 }, { price: 5 }];
  const expected = items.reduce((sum, i) => sum + i.price, 0);
  expect(calculateTotal(items)).toBe(expected);
});

// GOOD: Expected value is an independent, known literal
test("calculateTotal sums line items", () => {
  expect(calculateTotal([{ price: 10 }, { price: 5 }])).toBe(15);
});
```
