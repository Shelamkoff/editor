# Rector v2 — plural rules, fallback language and locale tag audit

**Date:** 2026-10-18  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `8e183462549b6edab92d22db6badf54610066b2d`  
**Scope:** `core/I18n.js`, `core/I18n.plural.test.js`, actual locale initialization in `core/createEditorRuntime.js`, historical v1 `core/I18n.js` for provenance; separate recheck of the prior `core/Diagnostics.js` changes.

## Source and conformance context

The production `createEditorRuntime` resolves the primary locale from `config.locale`, the requested language from `locale.__lang`, and English `core/locale/en.js` as the fallback when the primary is not that same English object. Public `locale/ru.js` and `locale/en.js` advertise `__lang: 'ru'` and `__lang: 'en'`.

`I18n.plural()` previously chose a grammatical rule solely from the UI language even when the translation value came from the English fallback dictionary. It also matched only exact `ru` and `en` keys, misidentifying the common regional tag `ru-RU` as English. These are localization correctness findings, **not proof of a v2 regression against v1**: historical `master` `core/I18n.js` also chose `PLURAL_RULES[this.#lang]` without considering the fallback source.

## I18N-1 — wrong plural category for English fallback under Russian UI (P2)

**Verified before fix with the real source:** primary locale `ru`, English fallback `items: {one: '{count} item', other: '{count} items'}`; `plural('items', 21)` and `plural('items', 101)` produced `21 item` and `101 item`. Russian counts 21 and 101 select `one`; English requires `other`.

**Fix:** use the primary-language rule when `Object.hasOwn(#messages, key)` is true, otherwise use English for the production English fallback dictionary. `mergeFallback()` and frozen dictionaries follow the same rule, while existing primary Russian forms remain unchanged.

- [Regression tests `90bbadb`](https://github.com/Shelamkoff/editor/commit/90bbadb3e2b872bd75684de631522b39e1d99fcb)
- [Fix `5c73238`](https://github.com/Shelamkoff/editor/commit/5c73238060c33c68bf150d8d573074493c6e8e67)

## I18N-2 — region and case-sensitive language lookup fell back to English (P2)

**Verified before fix:** `new I18n({amount:{one,few,many,other}}, undefined, 'ru-RU').plural('amount', 2)` returned `other`, while `Intl.PluralRules('ru-RU').select(2)` returns `few`. The same problem applied to `ru_RU` and upper-case `RU`.

**Fix:** use the base language portion of the source locale tag before selecting a built-in rule, lower-casing it. Russian and English primary dictionaries use their expected CLDR categories for both simple and regional tags. Unknown language names retain the existing English fallback. Prototype-like strings (e.g. `constructor`) cannot access inherited rule functions because the lookup still checks `Object.hasOwn`.

- [Regression tests `55e5f77`](https://github.com/Shelamkoff/editor/commit/55e5f7752f65e4e2e322981695fd325cbb7ee22f)
- [Fix `79f8ee1`](https://github.com/Shelamkoff/editor/commit/79f8ee101ac2f27c8a51ef5647aa453a06bd5eb9)

## Deterministic verification

The fetched *actual post-fix source* was evaluated in an isolated JavaScript/V8 test runner with only its ESM import/export directives adapted. Actual test bodies were also fetched and run for:

- `core/I18n.plural.test.js`;
- `core/I18n.interpolation.test.js`;
- `core/I18n.prototype.test.js`.

**Result: 19/19 test bodies and 687 assertions passed** after the two changes. Additionally, a preliminary exhaustive check over integer counts `-150` through `150` compared both primary Russian and English fallback plural output against `Intl.PluralRules`: **605/605 assertions passed** following I18N-1.

The previous audit's `Diagnostics` tests were independently re-executed against fetched `core/Diagnostics.js` and `shared/invokeObserver.js` using an isolated V8 microtask adapter: **6/6 test bodies, 27 assertions passed**. This recheck does not prove the full `createEditorRuntime` integration or a complete Node suite.

These V8 checks do **not** substitute for `node --test` with Node's actual assertion runner, TypeScript, Chrome/OS IME, package-consumer or complete v1/v2 UI parity acceptance. The current container cannot reach GitHub directly for a full git checkout (`Could not resolve host: github.com`); repository reads and writes here used the connected GitHub API.

## Review of nearby false positives

`shared/jsonData.js` drops own array extra properties during JSON clone. This is **intentional and covered** by `shared/cloneEditorData.test.js` because JSON serialization ignores array metadata; no patch was made for that behavior. `I18n.prototype.test.js` explicitly tests reserved/prototype locale names and own dictionary snapshots, and those cases still pass.

## Remaining acceptance

```sh
npm ci
node --test core/I18n.plural.test.js core/I18n.interpolation.test.js core/I18n.prototype.test.js core/Diagnostics.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

This narrow pass improves locale correctness and independently rechecks diagnostics. It does **not** establish that the complete Rector library is stable or behaviorally equivalent to v1 across editors, plugins, browser inputs, history, clipboard and rendering.
