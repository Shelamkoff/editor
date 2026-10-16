# Rector v2 — независимая дополнительная проверка, 2026-10-16

## База и границы проверки

- Целевая ветка: `refactor/rector-v2-architecture`. Исходный проверенный HEAD до данного аудита — `298ff69bfe5c3da05dd72944e547dc28c79bfe1f`.
- Эталон v1: `master`, `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340`.
- Цель: **поведенческий паритет пользовательских возможностей**, а не совместимость старых v1 API, сериализованных данных или переименование фабрик обратно в классы. Это ограничение установлено в `RECTOR_V2_REFACTOR_PLAN.md` и действующей `RECTOR_V2_REMEDIATION_SPEC.md`.
- Источники: актуальный GitHub tree/файлы обеих ревизий, существующие тесты и исторические отчёты, независимые изолированные воспроизведения ошибок непосредственно из полученного JavaScript исходника.
- Ограничение: этот дополнительный аудит **не запускал полный Node/TypeScript/Chrome pipeline в клонированном checkout**. Изолированные проверки JavaScript не заменяют `npm test`, нативный браузерный ввод или испытание опубликованного пакета.

## Подтверждённые дефекты и исправления

| ID | Приоритет | Дефект до исправления | Подтверждение | Исправление |
|---|---|---|---|---|
| N1 | P2 | `ChangeNotifier`: уже поставленный в очередь устаревший timer callback мог выполнить `save()` после замены/уничтожения и стирал handle нового таймера, мешая его отмене | Изолированное воспроизведение на исходнике: 1 устаревший `save` вместо 0; handle второго таймера не очищался | `87e713e`, generation/destroy lease проверяется **до** очистки handle и вызова `save()` |
| N2 | P2 | `ChangeNotifier`: отклонение старой асинхронной операции после `destroy()` или нового `schedule()` доходило до `onError` | Изолированное воспроизведение: `onError` получает `stale rejected save` после `destroy()` | `87e713e`, обработчик `catch` проверяет generation/destroy lease |
| S1 | P2 | `styleRegistry`: при ошибке посередине пакетной загрузки `<link>` ранее захваченные URL и borrowed refcounts оставались в таблице владения | Искусственный, но детерминированный `head.appendChild` failure: после следующего acquire/destroy первый `link` не удалялся | `9407c38`, единый rollback tracked URLs и частично добавленного DOM link |

Внесено 5 регрессионных тестов в `core/ChangeNotifier.test.js` и `shared/styleRegistry.realm.test.js`. После изменения повторные изолированные проверки ключевых сценариев прошли. **Полные тестовые наборы в этом проходе не выполнялись.**

## Сопоставление с первой версией

| Область | Проверка в этом проходе | Результат и доказательство |
|---|---|---|
| Типы блоков / фабрики плагинов | Сопоставлены `plugins/index.js` v1/v2 | Все **21 уникальных типа** представлены в v2; у v1 было 22 export строки из-за алиаса Carousel; пропусков по типам нет |
| Стандартные inline-инструменты | Сопоставлены списки фабрик в `inline-tools/defaults.js` | Все **12 именованных инструментов** присутствуют |
| Рендеринг типов | Сопоставлены фабрики `renderer/renderers/index.js` | Обе ревизии перечисляют те же 21 built-in renderer |
| Общая текстовая нормализация | Побайтовое сравнение `shared/textFormat.js` | Модуль v1/v2 идентичен |
| Взаимодействие редактора, Enter/Shift+Enter, clipboard, Undo/Redo, range/conversion, Mention и Poll | Изучены `RECTOR_V2_FULL_AUDIT_2026-10-07.md`, `RECTOR_V2_IMPLEMENTATION_PROGRESS.md`, перечни native/browser suites и соответствующие production-модули | Исторический локальный отчёт от 16.10 сообщает о 730 Node tests, 27 browser suites, 1 900 native cases в 39 матрицах. Этот проход **не подтверждает повторным запуском** те показатели и не исполняет v1/v2 сквозное дифференциальное сравнение |
| Старый API и JSON форматы | Сопоставлены файлы экспорта и действующая спецификация | Отличия v1→v2 являются **запланированными несовместимостями**, а не отсутствующим поведенческим паритетом |

Инвентаризация не гарантирует отсутствия регрессий в конкретных пользовательских жестах; результаты исторического отчёта следует трактовать только как зафиксированные доказательства выполнения тестов на проверенном тогда checkout.

## Архитектура

Положительные наблюдения по прочитанному коду:

- Источником авторского состояния служит канонический документ; `TransactionEngine` отделяет подготовку проекции, фиксацию модели/истории и публикацию.
- `ExtensionRegistry` снапшотирует контракт сторонних определений и методов, отдельные runtime owners контролируют teardown.
- Отложенные операции каретки, триггеров и clipboard проверяют generation/revision/mode epoch, что уменьшает риск использования устаревших прав.
- `shared/DocumentSchema.js` использует точный текущий versioned contract, сохраняет неизвестные типы как инертные JSON payloads, валидирует shape и ownership.
- Отчёт предыдущей архитектурной проверки зафиксировал отсутствие циклов/запрещённых направлений среди статических и литеральных импортов; **в этом проходе весь граф импортов не строился заново**.

Риски, **требующие отдельного теста, не объявленные здесь подтверждёнными багами**:

1. `renderer/EditorRenderer.js:renderTo()` создаёт новые результаты и освобождает прежних owners до DOM reorder/replacement и до публикации следующей `#mountedContainers` записи. Fault injection на сбой `insertBefore`/`replaceChildren` и reentrant custom element callbacks должен проверять восстановление предыдущего mounted состояния, release вновь созданных owner resources и успешный повторный `renderTo`. Код содержит отдельный try/catch для стадии создания, но DOM commit stage не имеет симметричного rollback.
2. Полный дифференциальный native браузерный тест v1 против v2 не выполнен в этом проходе: необходимы реальные caret, selection direction, Unicode, IME, Cut/Paste, Undo/Redo и цепочки действий для 21 типа блоков/12 инструментов.
3. Не перепроверены Firefox/WebKit, настоящие OS-specific IME, внешние upload/media providers, длительный heap/retention и установленный npm archive после данных фиксов.

Эти пункты не отменяют исторически пройденные существующие матрицы; они ограничивают степень независимого подтверждения паритета и релизной готовности.

## Необходимый локальный gate после этих коммитов

Из чистого checkout целевой ветки выполнить последовательно:

```bash
npm ci
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

При ошибках зафиксировать failing case и провести red/green исправление; отдельные новые регрессии N1/N2/S1 должны войти в общее число тестов. Дополнительно выполнить независимое v1/v2 native сравнение пользовательских сценариев, не смешивая deliberate API/JSON breaking changes с поведенческими отклонениями.

**Заключение:** два подтверждённых проблемных lifecycle contracts (три проявления) исправлены с тестами. Инвентаризационный паритет 21 блоков/12 инструментов/21 рендерера подтверждён. Полный поведенческий паритет в настоящем дополнительном проходе не объявляется доказанным без сквозного дифференциального и полного регрессионного прогона.

## Дополнительная независимая перепроверка, тот же день

Исходный HEAD продолжения: `cb304ea250f853c7022122e0b9ff139c44bf54fa`; исправления этой перепроверки завершены на `750d743a72e3b1ef421e146fb015b30ddae0d93e`. Предыдущие разделы сохраняются как хронология первого прохода. Сведения ниже **дополняют** их, а не означают полный повторный запуск historical gates.

### Дополнительно подтверждённые проблемы

| ID | Приоритет | Подтверждённое поведение до исправления | Исправление и доказательство |
|---|---|---|---|
| R1 | P1 | `renderer/EditorRenderer.js:renderTo()` освобождал старый owner **до** успешного DOM commit. Ошибка `insertBefore()` после частичного изменения удаляла содержимое, не освобождала новый результат и приводила к повторному destroy старого | `1ebbf26`: подготовка стилей и новых элементов до DOM commit, восстановление wrapper/container children при сбое, очистка новых owners, публикация нового owner map **до** вызова старых disposers. Три новых регрессионных теста; три изолированных сценария DOM failure/success прошли |
| T1 | P2 | `core/TransactionEngine.js` принимал callback с возвращённым Promise при отсутствии синхронных изменений и немедленно возвращал Promise как «успешную» операцию. Вложенный thenable мог не отравить общий draft | `1e80a90`: `synchronousResult` для outer/nested callbacks. Два новых теста, изолированные проверки native Promise, затем getter и вложенной операции |
| E1 | P2 | `renderer/inlineWidgets.js` для **зарегистрированного** renderer возвращающего `null` или Promise незаметно сохранял в пользовательском DOM исходный `{{id}}`; Promise не поглощался. Блочный renderer тоже не изолировал асинхронный return | `750d743`: оба renderer classes проверяют синхронность, invalid registered inline result теперь бросает TypeError, unknown/unregistered type продолжает оставаться inert token. Четыре новых теста, изолированные positive/negative проверки |

### Результаты контроля

- Всего **9 новых регрессионных тестов** в продолжении; совместно с предыдущим проходом создано **14**.
- Пройдены изолированные JavaScript воспроизведения исходных ошибок и green checks на подготовленных исправлениях. Сверены точные файлы в целевой ветке после коммитов.
- Новые тесты зарегистрированы в `renderer/reentrancy.test.js`, `renderer/inlineWidgets.test.js` и `core/TransactionEngine.test.js`. Node syntax checks выполнены через JavaScript parser после удаления module-only imports; это не full-runtime proof.
- Перепроверка `renderTo()` включает ошибку после частичного изменения wrapper, ошибку после изменения container и нормальное успешное обновление с проверкой порядка disposal.
- Проверка renderer boundary отличает malformed **registered** renderer от **unregistered** widget, данные которого намеренно сохраняются как буквальный токен.

### Не закрытые доказательные границы

Полные `npm run typecheck`, `npm test`, `npm run test:browser`, `npm run test:docs`, `npm run test:types`, `npm run test:package` и `npm run docs:check` **не запускались повторно в данном проходе**: доступ к клонированию репозитория из рабочей среды отсутствовал. Не проверены native Chrome/Firefox/WebKit, реальные системные IME, большой heap run, installed npm tarball и полная дифференциальная матрица v1/v2 после этих коммитов. Исторические green reports не подменяют данные проверки.

**Текущее заключение:** четыре новых проявления проблем R1/T1/E1 исправлены тестами; существенный механизм синхронных транзакций, атомарного DOM owner release и корректного отказа сторонним renderer результатам усилен. Полный поведенческий паритет и релизная приёмка в этом независимом проходе ещё не доказаны.

## Повторная проверка ownership и history, 2026-10-16 (следующий проход)

**Baseline before this pass:** `2357008476ff226fbc65a31c33f96e0fb2e379d5`.
**Resulting branch HEAD:** `5623fec5c25eda5ecabc8e61d99137d66770bd65`.
Previous sections remain historical. This is a further independent defect search; it is not a complete new execution of the historical native/browser acceptance matrices.

### Verified regressions and fixes

| ID | Priority | Reproduced failure | Committed correction |
|---|---|---|---|
| H1 | P2 | `TransactionEngine` queued an Undo/Redo caret restore keyed only to the document revision. A newer native/programmatic caret movement or `onCommit` focus change without a document edit was overwritten by the queued microtask | `7aa5d85`: capture the selection after immediate restore and skip deferred replay if the current selection differs; 2 regression tests |
| R2 | P1 | A custom block renderer could return the exact same DOM element for two blocks or two independent renderer instances. The DOM then contained one node while two owners called destroy. A root from a foreign `ownerDocument` was also accepted | `81d30a4`: exclusive cross-instance WeakMap ownership, owner-document validation, release after failed element decoration; 4 regression tests and paired EN/RU rendering guide updates |
| R3 | P2 | A custom block renderer's `destroy(element)` thenable was ignored. A delayed rejected Promise could escape error containment and an invalid asynchronous completion was not reported | `7f9a6e5`: use the existing `synchronousResult()` boundary on cleanup, with catch/finally preserving exactly-once release; 1 regression test |
| P1 | P2 | `InlinePopupHost.showPopup()` leaked an appended popup and deferred its cleanup after synchronous positioning/append failures. Reentrant successor popups could also be followed by stale registration of the retired surface | `5623fec`: rollback both partial mount failures, make position listeners scope-specific, retire popup safely after later resize failures, avoid stale reentry takeover; 4 new unit tests |

### Independent red/green evidence

- Actual retrieved baseline `TransactionEngine` with controlled selection port: moving caret to offset 3 after synchronous Undo was overwritten back to 1. With the fix, native/programmatic and `onCommit` moves to offset 3 remain at 3; an unchanged selection still receives its deferred restoration.
- Actual baseline `EditorRenderer` with a controlled DOM: two block records shared one rendered child and ran its disposer twice; two renderer instances also accepted a live shared element. A foreign-document element was accepted. A decoration exception skipped cleanup. The modified in-memory source rejected all three invalid ownership cases and performed exactly-once cleanup on decoration failure; reuse after release remained valid.
- Actual baseline cleanup did not observe a thenable return (`then` getter access count 0); the modified source observed it once, reported the invalid synchronous contract, and kept cleanup ownership consistent.
- Actual baseline `InlinePopupHost`: error after layout or partial append left one orphaned popup and zero cleanup callbacks until explicit destroy. The modified source left zero popup nodes and called cleanup once. Reentrant popup replacement left one valid successor, and closing the stale handle did not affect it.
- After push, checked the branch HEAD and reparsed 10 modified/related JavaScript source and test files using V8 with ESM imports removed for the syntax-only check. All ten parsed. This is not equivalent to installed Node tests, TypeScript checking, native DOM/browser execution or the npm consumer gate.

**New regressions added in this pass:** 11 (`TransactionEngine.test.js` 2, `renderer/reentrancy.test.js` 5, `InlinePopupHost.test.js` 4).
**Cumulative regressions across the previous two independent passes and this pass:** 25 (5 + 9 + 11). These are authored assertions, not claims that the whole suite has passed.

### Acceptance still outstanding

The full local `npm ci`, project `typecheck`, `npm test`, native/browser/history/heap, docs, package-consumer and dual TypeScript resolution gates have **not** been run on this latest HEAD. The container here cannot resolve the public GitHub hostname to clone the repository, so independent production-level tests could not be run. Previous reports' Chrome/Windows green figures are historical and must not be silently attributed to this HEAD. Full v1/v2 differential behavioral parity and OS-specific IME, Firefox/WebKit remain unconfirmed in this pass.

Recommended final local commands from this specific HEAD:

```bash
npm ci
npm run typecheck
node --test core/TransactionEngine.test.js renderer/reentrancy.test.js core/InlinePopupHost.test.js
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

The validated **inventory** parity remains 21 built-in block types and 12 default inline tools. Exact old API/JSON compatibility is intentionally outside the normative v2 target. Independent behavior parity is not complete merely because the inventory and historical tests match.
