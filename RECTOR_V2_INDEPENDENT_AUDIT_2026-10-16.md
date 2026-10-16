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

## Дополнительный проход — владение содержимым popup и CSS, 2026-10-16

Исходная ревизия этого прохода: `fd5d40e411784df2a40ce0d6e798fb5d4cccca5f`. Последний кодовый HEAD после исправлений: `c297989a397e715aaffc6ac33d4f76ca6aa85d9a`. Этот раздел **дополняет** исторические проверки и не объявляет все приемочные тесты зелёными.

### Подтверждённые проблемы

| ID | Приоритет | Воспроизведённое поведение | Исправление |
|---|---|---|---|
| N3 | P2 | `ChangeNotifier` вызывал `onError` прямо в `catch` асинхронного debounce callback. Исключение из error sink отвергало Promise timer task; асинхронное отклонение sink также не изолировалось | `4856f75`: вызов через общий `invokeObserver`, отдельное безопасное сообщение об ошибке sink; 2 теста |
| P2 | P2 | Сохранённый прежний callback `mousedown` после замены popup мог вызвать общий `hidePopup` и закрыть новый popup | `25f947f`: callback привязан к exact presentation, регистрация после microtask обрабатывает ошибки и синхронный повторный вход; 2 теста |
| P3 | P1 | `showPopup(owner, anchor, anchor)` перемещал живой элемент редактора внутрь transient popup; при закрытии удалял его из редактора | `eae3617`: исключить содержимое, принадлежащее корню editor; 1 тест и описание EN/RU |
| P4 | P1 | Popup content, уже смонтированный в другом редакторе/приложении того же `Document`, тоже мог быть перенесён и удалён | `fa44b22`: запретить connected content, оставить detached popup content; 1 тест, документы EN/RU |
| R4 | P2 | `EditorRenderer.destroy(container)` безусловно вызывал `container.replaceChildren()`, удаляя новое содержимое приложения или второго renderer после замены wrapper | `5dbc7ca`: удалять только принадлежащий первому renderer wrapper, освобождая его ресурсы; 2 теста |
| S2 | P2 | Повторный `acquireStyleUrls` из синхронного `appendChild` создавал две ссылки CSS, перезаписывал текущий владелец refcount и оставлял orphan link после двух `destroy()` | `c297989`: document-scoped reentry guard при acquisition с `finally` release; 2 теста |

### Проверки

На оригинальных исходниках из GitHub до изменений отдельно воспроизведены: rejected debounce callback, закрытие successor popup устаревшим callback, удаление якоря вместе с popup, удаление чужого содержимого в `destroy(container)`, утечка 1 CSS link при повторном входе. Изолированные исправленные версии устранили эти наблюдаемые дефекты.

Дополнительно проверен внешний `@shelamkoff/color-picker`: `ColorPicker.open()` обновляет состояние и display, но не монтирует popup surface в документ. Новый запрет connected popup content соответствует встроенному способу интеграции этого компонента. После последнего коммита восемь актуальных исходных/тестовых JavaScript-файлов успешно разобраны V8 (ESM imports заменены только в синтаксической проверке). Референсный обычный refcount test подтвердил: две leases используют один link; первая не удаляет общий link, вторая удаляет; повторное отдельное acquire создаёт новый link.

В этом проходе **10 новых регрессионных тестов** (`ChangeNotifier`: 2, `InlinePopupHost`: 4, `renderer/reentrancy`: 2, `styleRegistry.realm`: 2). Общий счёт новых тестов во всех независимых проходах после исторической convergence: **35** (5 + 9 + 11 + 10).

### Границы завершённости

Полный `npm ci` и `npm test`, оба TypeScript проекта, Chrome/native/heap и installed-package/документация **не запускались повторно** на этой ревизии: среда выполнения не смогла разрешить `github.com` для клонирования. Отдельные воспроизведения, проверка модулей через JavaScript parser и старые green logs не заменяют полный проектный gate. Сопоставление пользовательских сценариев v1/v2 по всей матрице по-прежнему не закончено; инвентаризация встроенных типов и инструментов ранее подтверждена.

## Дополнительный независимый проход: reentrant popup, DOM ownership и Poll, 2026-10-16

Проверенная исходная ревизия: `41834f54130ca66ecabdfce656c5e9d8b09e6aa3`. Итоговый кодовый HEAD этого прохода: `7f7df0a91536f00260c4369da34db1ac8f71d05c`. Работа произведена непосредственно в `refactor/rector-v2-architecture`, без PR или merge чужих файлов. Предыдущие разделы остаются историческими доказательствами.

### Подтверждённые нарушения

| Код | Область / приоритет | Независимое исходное воспроизведение | Коммит |
|---|---|---|---|
| P5 | `InlinePopupHost.#hide()`, P1 | Повторный `showPopup` из DOM `remove()` старого popup оставлял один новый popup в DOM, но его cleanup вызывался немедленно; последующее `handle.close()` не освобождало его | `ffc223a`: атомарно снять старую ownership до `abort`/`removeEventListener`/`remove`, cleanup в `finally`. Два теста на повторный вход |
| R5 | `EditorRenderer`, P1 | Custom block renderer мог вернуть уже смонтированный в приложении `HTMLElement`: `renderTo()` перемещал его из приложения в собственный контейнер | `1a80bae`: проверка `element.isConnected` до захвата ресурса, исключение без вызова чужого disposer; 2 теста + EN/RU docs |
| PO1 | Poll editor + read-only renderer, P2 | Promise/thenable из `dataSource.subscribe()` или его disposer проходил как успешный sync hook, позднее отклонение оставалось без надлежащего учёта | `9ba3145`: shared `synchronousResult()` на acquisition/disposal; 4 теста |
| PO2 | Poll live-subscription, P2 | `subscribe()` синхронно вызывал уведомление с удалением Poll и возвращал отписку **после** уничтожения владельца; возвращённый disposer никогда не вызывался | `c990bd5`: после возвращения disposer проверяется актуальность владельца/сигнала и выполняется немедленная очистка в случае отзыва; 2 теста |
| PO3 | Poll revision ordering и push observer, P2 | Comparator `compareRevisions()`, вернувший Promise с положительным результатом, воспринимался как `false`, теряя обновление; `Infinity` принимался как положительный порядок. Поздняя ошибка сравнения из onUpdate могла выйти в чужой dataSource callback | `7f7df0a`: sync/finiteness check и изоляция ошибок в editor onUpdate; 4 теста |

### Проверки этого прохода

- RED/GREEN: контролируемый реальный исходник `InlinePopupHost`: после удаления старого окна — 1 unowned successor, очистки `['old','new']` до завершения, а его `close()` ничего не делал; после патча — 1 owned successor, только `['old']` до его закрытия, затем 0 окон и `['old','new']`.
- RED/GREEN: реальный исходник `EditorRenderer` с контролируемым DOM: ранее connected application node перемещался из приложения в `renderTo`; теперь исключение до DOM-мутации, исходный узел остаётся у приложения.
- RED/GREEN: реальный исходник read-only Poll с минимальными DOM адаптерами: async subscription/acquired disposer теперь возвращает зарегистрированную sync-контрактную ошибку вместо silent acceptance.
- RED/GREEN: renderer Poll reentrant subscribe раньше возвращал cleanup после destroy, который не вызывался (0), теперь вызывается ровно раз (1). Editor Poll при немедленном abort исходно не выполнял cleanup до будущего destroy (0→1); после патча освобождает его до завершения create (1→1).
- RED/GREEN: общий Poll comparator с Promise раньше отвергал обновление как обычное сравнение `false`, а `Infinity` принимался; теперь оба контракта ошибочны и вызывают TypeError. Нормальные положительный, отрицательный и равный числовые результаты сохраняются. Изолированный editor Poll со слушателем push после load revision 1: до исправления 0 ошибок и тихо потерянное обновление revision 2, после — одна ошибка синхронного контракта через `onError`, без исключения в источник событий.
- Синтаксис девяти изменённых/связанных JavaScript источников и тестов проверен через V8-парсер после удаления импортов только в проверочном коде. Это не полноценный `npm test` или `tsc`.

Новые регрессионные тесты этого прохода: **14**. В независимых аудиторских проходах по состоянию на этот кодовый HEAD суммарно написано **49 новых регрессионных тестов** (35 ранее и 14 сейчас). Эти числа относятся к внесённым тестовым определениям, **не** к прошедшим тестам полного проекта.

### Приёмка и паритет

Историческая матрица продолжает содержать 21 блочный тип, 12 стандартных inline tools и native Chrome-проверки, но новый код после `7f7df0a` ещё не проходил полный официальный локальный gate. `npm ci`, оба TypeScript проекта, `npm test`, native/IME/clipboard, `test:browser`, heap, пакетное испытание и `docs:check` в этом проходе не выполнялись: контейнер не разрешает `github.com` для клонирования. Новые тесты требуют запуска из полного checkout с установленными зависимостями. Функциональный паритет с v1 по всем реальным последовательностям пользовательских действий пока не доказан новым дифференциальным прогоном.

Для локальной проверки по этому HEAD:

```bash
npm ci
npm run typecheck
node --test core/InlinePopupHost.test.js renderer/reentrancy.test.js renderer/renderers/poll/lifecycle.test.js shared/pollData.test.js
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

## Проверка независимых расширений, owner scopes и cleanup (2026-10-16, очередной проход)

Входной HEAD этого прохода: `8a6002cfcea9b5407f4ee64bd18fffe5bfe05056`. Последний кодовый коммит: `69cf0a2b9e9446f19fd11fd97bbe5be850e164a6`. Эти исправления сделаны напрямую в `refactor/rector-v2-architecture` поверх актуальных коммитов, без изменения master или PR.

| ID | Приоритет | Независимо воспроизведённая проблема | Исправление |
|---|---|---|---|
| I1 | P1 | `renderer/inlineWidgets.js`: зарегистрированный inline-рендерер мог отдать подключённый узел другого UI, узел чужого `Document`, уже имеющий родителя или повторно отдать один `HTMLElement` для двух occurrences. Результат принимался и мог перемещать/терять чужой DOM | `28768a5`: строгий владелец документа и отдельный неприсоединённый root для каждого occurrence; 4 теста, документация EN/RU |
| L1 | P2 | `LifecycleScope.destroy()`: выброшенная ошибка callback `onError` останавливала освобождение оставшихся ресурсов и маскировала результат teardown. Возвращённые disposer Promise/thenable не проверялись | `cd386fd`: ledger отзывается до cleanup, ресурсы очищаются независимо, ошибки sink и асинхронные отклонения содержатся и фиксируются; 4 теста |
| S3 | P1 | `InstanceScope.attachParent()` разрешал активному child присоединиться к уже revoked parent и продолжать persisted mutations; разрешал циклы родительских связей | `69cf0a2`: revoked-parent вызывает revoke child и AbortError, циклы запрещены, parent authority ограничивает child; 5 тестов |
| S4 | P1 | При позднем присоединении к уже read-only или staged parent дочерний scope не наследовал запрет авторских мутаций; активный child мог мутировать при staged parent | Входит в `69cf0a2`: наследование текущего read-only и проверка всей parent chain при mutation, task acquisition и commit |

### Red/green и границы доказательства

- Inline: пять контролируемых ситуаций — connected, foreign realm/document, detached-but-parented, duplicate occurrence и новый корректный элемент. До исправления все некорректные результаты принимались. После исправления четыре некорректные формы отклоняются, новая корректная проходит.
- Lifecycle: исходный `onError` выбрасывал ошибку и прекращал cleanup перед самым ранним ресурсом. После исправления все три ресурса проходят в обратном порядке, включая ресурс с ошибкой; асинхронные результаты наблюдаются через уже существующую синхронную границу.
- Scope: после родительского revoke дочерний instance до исправления оставался активным и мутировал; цикл `A → B → A` принимался; child, подключённый после `setReadOnly(true)`, не был read-only; при staged parent child мутировал. После исправления эти случаи запрещены. Ранее созданный дочерний data task не может коммитить после перехода parent health в failed.
- Проверены шесть фактических исходных и тестовых JavaScript-файлов на синтаксический разбор V8 после удаления module import/export строк только для этой проверки. Все шесть разобраны. Добавлено **13** regression tests в данном проходе.

Полный локальный `npm ci`, `npm test`, `npm run typecheck`, native Chromium, `test:browser`, heap, `test:package` и сравнение настоящих последовательностей ввода в v1/v2 **не выполнялись**. Попытка `git ls-remote` из локального окружения вернула ошибку DNS `Could not resolve host: github.com`. Изолированная JavaScript red/green проверка и проверка синтаксиса не заменяют проектный gate.

**Непроверенный следующий риск (не подтверждённая регрессия):** `InlineProjectionRuntime.destroyBlock` и очистка `state.widgets` выполняются до удаления внешней записи владения; следует отдельно испытать reentrant widget cleanup в реальном DOM и убедиться в exactly-once teardown. Не менять эту область без красного теста.

## Следующий независимый проход: inline/block ownership и отказоустойчивый mount (2026-10-16)

**Исходный HEAD:** `cd9c6b17a98f2b5843c8ce9402885d5ad897d86c`. **Текущий HEAD кодовых изменений:** `e4c0acd52c8468d1d8b21f6c366e92ea98ddffdc`. Изменения внесены прямо в `refactor/rector-v2-architecture` без PR и затрагивания других веток. Этот раздел дополняет исторические результаты; все полные gates ещё не воспроизведены на новом HEAD.

### Подтверждённые ошибки и коммиты

| ID | Приоритет | Наблюдаемая проблема до исправления | Исправление |
|---|---|---|---|
| IP1 | P1 | `InlineProjectionRuntime.destroyBlock()` удалял запись блока после пользовательского `destroy()`. Реэнтрантный вызов `destroyBlock()` для того же ID дважды вызывал уничтожение одного и того же inline-виджета. Аналогично карта виджетов удаляла владельца после отдельных disposers. | `71979a3`: отзывать блок и виджеты до внешних callbacks, очистка освобождает staged/live claims exactly once; 2 browser regression cases |
| IP2 | P1 | При первом `reconcileBlock()` виджет X мог быть создан, а виджет Y — бросить исключение. Частично смонтированный X сохранялся в owner map и не освобождался при неуспешном вызове; повторная попытка повторно использовала неудачное состояние. | `9bd0ec2`: cleanup частично приобретённых first-mount виджетов и отзыв orphan state; 1 browser case с повторным успешным монтажом |
| IP3 | P1 | Созданный inline-плагином `element` мог принадлежать другому живому редактору/приложению, иметь другого `ownerDocument` или передаваться двум виджетам. Ядро перемещало чужой узел, затем могло дважды вызывать disposer одного элемента. | `106b50a`: обязательный disconnected root из owning document и global WeakMap live leases; rejected borrower не уничтожает original owner; 3 browser cases. EN/RU docs `24698f7` |
| BR1 | P1 | `BlockReconciler.#createEntry()` без проверки вставлял root внешнего приложения в новый shell; два блока могли получить один DOM root и дважды освобождать ресурс. | `41e7aa8`: эксклюзивный root lease, checked owner document и detached state, cleanup exact owner; 3 Node tests. EN/RU docs `84d7bdd` |
| BR2 | P2 | `BlockReconciler.destroy()` удалял **все** дети контейнера даже после замены содержимого приложением или другого синхронного host callback. | `01bcd46`: удалять только принадлежащие текущему reconciler shells, отзывать `#entries` до external disposer; 2 Node tests |
| BR3 | P1 | Первоначальный успешный `mount()` оставлял `lifetime.candidate`, и instance context читал исходную копию, даже если canonical `DocumentStore` обновился. Неуспешная `#stageAll()` оставляла `this.#store` привязанным к попытке нового документа. | `963809f`: сброс candidate после публикации и restore previousStore при staging rejection; 2 Node tests |
| BR4 | P2 | Если DOM `replaceChildren()` успевал изменить контейнер, а затем бросал исключение при первом `mount()`, recovery очищал всё приложение вместо восстановления прежних детей. | `20ec04c`: snapshot прежних детей, independent cleanup и rollback DOM через `insertBefore()` без повторного fallible replace; 2 Node tests. Тип `ChildNode` уточнён `e4c0acd`. |

### Доказательства и ограничения

- На **исходном коде из GitHub** воспроизведены двойной destroy inline-виджета (2 вместо 1), частичная неосвобождённая инициализация первого inline-блока, перенос чужого DOM и дублированное владение при inline/block acquisition, удаление нового host DOM в `BlockReconciler.destroy()`, устаревший initial candidate при обновлении store, dangling store после failed staging и потеря host DOM при partially throwing `replaceChildren()`. Исправленные JavaScript-версии проверялись с изолированными fault-injection fixtures; негативные сценарии стали green.
- **15 новых тестов** добавлены в этом проходе: 6 browser assertions в `tests/browser/projection-contracts.js` (run as existing `projection-contracts.html`) и 9 Node tests в `core/BlockReconciler.test.js`. Созданы отдельные коммиты с кодом и paired EN/RU contract docs.
- Проверена синтаксическая корректность актуальных версий `core/InlineProjectionRuntime.js`, `core/BlockReconciler.js` и двух изменённых test-файлов (V8 parse, ESM stripping only in syntax check); это не эквивалент запуска репозиторных тестов.
- Проводить full `npm test`, `npm run typecheck`, `npm run test:browser`, `npm run test:docs`, `npm run test:types`, `npm run test:package` на данной ветке из этой среды по-прежнему не удалось из-за отсутствия сетевого checkout/установленных node_modules. Отчёты о прежних green gates не считаются подтверждением последнего HEAD. Chrome/WebKit/Firefox, system IME, native clipboard и full v1→v2 behavioral differential acceptance остаются отдельными релизными задачами.

### Следующий приоритет

Проверить реальное браузерное выполнение `projection-contracts.html` и project gates на рабочем checkout, затем повторно аудировать ошибочные ветви уже **существующего** `InlineProjectionRuntime.reconcileBlock()`: его in-place update path после частичной ошибки не обладает полноценной транзакционной гарантией для уже смонтированного блока. Никакого исправления этой отдельной области без конкретного red-теста в текущем проходе не утверждалось.

## Последующая проверка повторного reconcile и отложенных транзакций (16 октября 2026)

Исходный HEAD прохода: `1865d75d83f5f15267b7b18130bbf1f55ace275d`. Последний коммит с кодом: `3d7310c56f0221cc3c4715ac2f219f55b1eaf047`. Все изменения внесены непосредственно в `refactor/rector-v2-architecture`; исторические разделы этого отчёта остаются неизменными.

### Подтверждённые и исправленные дефекты

| ID | Важность | Дефект | Код / тесты |
|---|---|---|---|
| IR5 | P1 | Ошибка при повторном `InlineProjectionRuntime.reconcileBlock()` после частичного обновления оставляла прежний виджет в кэше, хотя его DOM/данные уже могли быть изменены или отсоединены. Предыдущая очистка срабатывала только при первом монтаже. | `8920e49`: fail-closed удаление состояния и cleanup всех live owners, затем восстановимый clean retry. **2 browser tests** |
| IR6 | P1 | Вызов `destroyBlock()` из widget `update()` мог отозвать экземпляр, но внешний `reconcileBlock()` позднее вновь монтировал уже уничтоженный root. Повторный `reconcileBlock()` того же ID порождал неограниченную рекурсию. | `6fe3edf`: block-scoped reentry guard и проверка активного владельца до публикации widget fragment; guarded `prepareBlock()`. **3 browser tests** |
| IR7 | P1 | Prepared inline state не принадлежал runtime до `apply()`: уничтожение runtime до `apply()` оставляло staged widget без disposer, а оставшийся handle мог позже выполнять `apply/finalize`. Параллельные prepared handles могли перезаписывать нового владельца. | `25aebf3`: pending preparation ledger, terminal cleanup staged/predecessor, revoked/stale publication checks. **3 browser tests** |
| BR5 | P1 | `BlockReconciler.prepare()` допускал публикацию staged blocks после уничтожения reconciler, а detached predecessors ожидали `finalize` вне карты live-экземпляров. Две подготовленные вставки могли применяться без проверки актуальности владельца. | `2ee232a`: pending projection ledger, stale apply rejection, terminal staged/previous cleanup, сохранён normal discard/recovery. **4 Node tests** |
| BR6 | P1 | `runtime.create()` мог синхронно уничтожить reconciler во время staging: `prepare` и `mount` возвращали staged instances после `destroy`. Исключение из вычисления final order после staging тоже оставляло уже приобретённые ресурсы. | `5dcae40`: проверка активного владельца и независимая cleanup до регистрации pending-ownership. **3 Node tests** |
| BR7 | P1 | `mount()` после синхронного `destroy()` из `replaceChildren` (в том числе custom-element lifecycle) продолжал публиковать новый набор блоков и возвращал успешный результат. | `3d7310c`: проверка владельца на каждом этапе DOM publication, cleanup old/new, запрет восстановления destroyed document. **2 Node tests** |

**Объём прохода:** 6 коммитов с кодом, 17 регрессионных тестов: 8 browser cases в `tests/browser/projection-contracts.js` и 9 Node cases в `core/BlockReconciler.test.js`.

### Проведённая независимая проверка

- Для IR5 исходная версия сохраняла live `x` после сбоя второго виджета; после исправления `x.destroy()` вызывался, retry создавал нового владельца.
- Для IR6 исходная версия вновь публиковала root после отзыва owner либо рекурсивно вызывала сама себя; исправление отклоняет stale update и same-block reentry до публикации.
- Для IR7 исходная версия не освобождала staged widget после `destroy()` и принимала просроченные `apply()`/ `finalize()`; исправленная версия освобождает widget и отклоняет вызовы, как и параллельный stale `apply()`.
- Для BR5 baseline после `destroy()` позволял `prepared.apply()` восстановить IDs `['a','b']`; fixed ledger держит IDs пустыми, освобождает candidate и predecessor exactly once. Нормальные `apply/finalize` и `apply/recover` сохранены в отдельных регрессионных тестах.
- Для BR6 ошибку reentrant destroy в `runtime.create` и ошибку `draft.ids()` удалось воспроизвести. До исправления staged resource не вызывал disposer, после исправления вызвал.
- Для BR7 `replaceChildren()` может удалить предыдущее DOM и синхронно уничтожить редактор. До исправления `mount` всё равно публиковал нового владельца, после исправления отказывает и освобождает old/new.
- После push подтверждён HEAD `3d7310c56f0221cc3c4715ac2f219f55b1eaf047`. Повторно прочитаны четыре фактических исходных/тестовых файла; все успешно прошли отдельную синтаксическую проверку V8 с временным снятием ESM imports/exports. Это **не** успешный npm/TypeScript/browser gate.

### Оставшиеся ограничения и риски

Полные `npm ci`, `npm run typecheck`, `npm test`, `npm run test:browser`, `npm run test:docs`, `npm run test:types`, `npm run test:package` на актуальном HEAD из этой сессии **не выполнялись**: доступ к checkout/установленным зависимостям отсутствует. Паритет поведения с первой версией редактора, реальные keyboard/IME/clipboard flows и native browser lifecycle остаются незакрытыми критериями приёмки.

**Следующий риск для изучения:** корректность отката двух последовательно подготовленных (но не завершённых) блочных операций при вызове старого `recover()` после публикации более нового owner. Такой сценарий не подтверждён и в текущем проходе не исправлялся без воспроизведения.

### Дополнение: терминальное состояние подготовленного блока

Проверка после основного обновления выявила дополнительную ошибку `BlockReconciler.prepare()`: объект с уже вызванным `discard()` по-прежнему мог выполнить `apply()`; а `recover()` после окончательного `finalize()` откатывал уже подтверждённый результат и удалял вновь опубликованный блок.

**Коммит `63ded5ac108807796b3ffe234fe8040430be086d`** добавляет терминальные проверки `discarded` в `apply()` и `finalized/discarded` в `recover()`. Дополнительно добавлены два теста в `core/BlockReconciler.test.js`.

Изолированное red/green воспроизведение подтвердило: до исправления `finalize(); recover()` возвращал список блоков с `['a','b']` обратно к `['a']`; после исправления опубликованные `['a','b']` сохраняются. После `discard()` новый `apply()` отклоняется. Нормальный `recover()` после незавершённого `apply()` остаётся доступен.

**Обновлённый итог данного прохода:** 7 коммитов с исправлениями и **19 новых регрессионных тестов**, из которых **8 браузерных**, **11 Node**. Это число новых исходных тестов, а не заявление, что полный test suite запущен и пройден. Полная TypeScript/Node/Chrome проверка и v1/v2 differential parity на текущем HEAD всё ещё ожидают локального выполнения.

## Независимая проверка перекрывающихся prepared транзакций и rollback DOM (2026-10-16, следующий проход)

**Исходный HEAD:** `0219c7c63a71be4b09718a9a7bcca7dea827357c`; **последний кодовый HEAD:** `d165593cc15a34fca09bc64cc750b5a9bc95c206`. Все коммиты непосредственно в `refactor/rector-v2-architecture` с проверкой исходного SHA перед обновлением branch ref.

| ID | Приоритет | Исходная подтверждённая ошибка | Исправление и тесты |
|---|---|---|---|
| BR8 | P1 | После `p1.apply()` и `p2.apply()/finalize()` запоздалый `p1.recover()` сбрасывал DOM и `#entries` к исходной версии, удалял результат successor и мог утекать его disposer. Запоздалый `p1.finalize()` тоже не проверял текущего владельца. | `9ba3674`: per-preparation identity опубликованной карты, отмена stale recovery/finalize, передача cleanup актуальному владельцу; **3 Node теста** |
| IR8 | P1 | Inline `p1.recover()/finalize()` после `p2.apply()` уничтожали widget-кандидат p1, который p2 ещё мог вернуть через `p2.recover()`. Получался пустой/уничтоженный восстановленный occurrence. | `2e635fc`: stale-подготовка не уничтожает recoverable predecessor, его освобождает successor; **2 browser теста** |
| BR9 | P1 | `p1.apply()` мог прерваться после частичного `insertBefore` из-за синхронной публикации p2. При этом `publishedEntries` ещё `null`; последующий `p1.recover()` сбрасывал p2, а `p1.finalize()` допускал старый handle. | `aa7b3ed`: проверка prepublication `expectedEntries`, release только staged p1 и неприкосновенность current successor; **2 Node теста** |
| BR10 | P2 | Если `recover()` создавал свежий экземпляр, а DOM `replaceChildren` изменял дерево и бросал исключение, новый экземпляр терялся; повторный `recover()` оставлял по одной утечке на попытку. | `d85d748`: per-attempt cleanup восстановленных candidates и восстановление owner pointer для повторной попытки; **2 Node теста** |
| IR9 | P1 | `destroyBlock(id)` не отзывал `prepareBlock(id)`, когда live state ещё не существовало. Stale `apply()` вновь публиковал уже удалённый блок. Вызов `destroyBlock` из `runtime.create()` тоже обходил отзыв. | `cbc4337`: block-specific pending preparation revocation и invalidation during synchronous projection; **3 browser теста** |
| IR10 | P1 | `setAttribute('data-inline-plugin')` у custom element синхронно вызывал `attributeChangedCallback`, который уничтожал блок. `#hydrateField` всё равно вставлял отозванный widget root в DOM. | `c9ee8ef`: повторная проверка owner authority непосредственно после установки host identity attributes; **2 browser теста** |
| BR11 | P1/P2 | Неудачный `BlockReconciler.restore()` оставлял ссылку на новый `DocumentStore` при активных старых экземплярах. Если `replaceChildren` менял DOM перед исключением, старые оболочки не возвращались, хотя новые были освобождены. | `d165593`: store rollback, atomic DOM child-order restoration и независимая очистка новых owners; **2 Node теста** |

**Объём прохода:** 7 кодовых коммитов, **16 новых регрессионных тестов**: 9 Node (`core/BlockReconciler.test.js`), 7 браузерных (`tests/browser/projection-contracts.js`).

### Доказательства, охват и блокеры

- На реально полученных версиях исходников из GitHub отдельно воспроизведены: сброс `['a','b','c']` к `['a']` из stale block recovery; отозванный предшественник после inline stale rollback; потеря successor от partially applied reentrant DOM commit; одна/две утечки восстановленных instance после двух ошибок `replaceChildren`; успешный `apply` удалённого, но лишь staged inline block; повторная публикация widget при синхронном attribute callback; сохранявшийся чужой store и невосстановленный DOM при failed `restore`.
- Изолированные версии с точными изменёнными исходниками исправляют приведённые наблюдаемые эффекты. Выполнена финальная повторная синтаксическая проверка шести доступных JavaScript модулей/тестов (фактические GitHub blobs, временное снятие ESM в V8-проверке), без ошибок.
- Полные `npm test`, `npm run typecheck`, `npm run test:browser`, `npm run test:docs`, `npm run test:types` и `npm run test:package` **не выполнены** на этом HEAD. В контейнере Node.js v22 установлен, но исходный checkout отсутствует, `git ls-remote` возвращает `Could not resolve host: github.com`. Прямые GitHub коммиты выполнялись через подключённый GitHub, не как эквивалент локального test run.
- Поведенческий паритет с v1, end-to-end IME, caret, toolbar, history, clipboard, memory/heap и нативные Chrome/другие браузерные engines всё ещё требуют project gates. Степень готовности к релизу не следует устанавливать по количеству локальных исправлений.

**Следующая диагностическая область:** проверить корректность совместной lifetime-авторизации block/widget root и восстановление `#fieldOwners` при повторных read/restore и ошибках внешних callback, но не изменять эту область без самостоятельного red/green сценария.

## Аудит fieldOwners, editableFields и DOM-типов 2026-10-16

**Начальный HEAD:** `34dd360cdae565d55165f5a62a3b7ad61a8dc655`. Кодовые исправления внесены в `refactor/rector-v2-architecture` напрямую (без PR и с защитой expected SHA при update_ref). Работа других агентов не перезаписывалась.

### Подтверждённые ошибки

| ID | Приоритет | Red evidence на исходном коде | Исправление |
|---|---|---|---|
| F1 | P1 | `#blockOwners` и `#fieldOwners` хранили weak associations с уже уничтоженным block shell/field. `resolveBlockTarget(detachedOldNode)` и `resolveEditableTarget(detachedOldField)` возвращали старый canonical ID даже после замены; повторное подключение shell не отзывалось. В том числе при повторном использовании прежнего ID новым экземпляром. | `fa2d0df`: resolveBlockTarget требует **exact currently mounted shell**; поле проходит проверку live entry, parent container, актуального descriptor и вложенности DOM. **3 Node-теста** |
| F2 | P1 | `editableFields()` мог вернуть узел приложения за пределами блока; BlockReconciler принимал этот descriptor и возвращал чужой элемент из `getEditableField()`. Некорректная staged definition могла претендовать на поле существующего блока. | `71ead74`: полная проверка ownerDocument и вложенности в собственный block shell до публикации ownership maps; **3 Node-теста**, исправлен setup test fixture в `4e757fc` |
| F3 | P2 | `#registerFields` сравнивал field key/element, но игнорировал `mode`. Переключение одного элемента `rich-text` → `plain-text` публиковало новый descriptor, однако пропускало повторную inline reconciliation, оставляя старую inline projection. | `0ea9527`: включить режим в проверку изменения; **2 Node-теста**, в том числе no-op стабильного descriptor |
| F4 | P1 | `BlockReconciler` требовал совпадения ownerDocument у block root, но не проверял `HTMLElement`: Comment и другие не-HTML узлы могли попасть в mounted shell. | `d875805`: проверка `instanceof` из owning DOM realm, когда доступен конструктор; **2 Node-теста** |
| F5 | P2 | Аналогично `editableFields()` мог вернуть дочерний DOM-комментарий как поле, поскольку он находился внутри блока и имел тот же ownerDocument. | `2020f20`: тип `HTMLElement` обязателен для field descriptors в браузерном DOM realm; **1 Node-тест** |

Документация блока обновлена на английском и русском: `3cd2c73`, `7286c7f`, `4049b32`.

### Проверка исправлений

- **11 новых регрессионных тестовых callbacks** из актуального `core/BlockReconciler.test.js` отдельно выполнены с фактическим текстом `core/BlockReconciler.js`, загруженным из GitHub в изолированную V8-среду. Использованы fake DOM, shim `DocumentStore`, fake `InstanceScope`/animator; **11/11 прошли**. Это явно **не** полный запуск `node --test` с настоящими зависимостями и не browser/TypeScript test gate.
- Дополнительные изолированные red/green проверки на исходном и исправленном коде подтвердили: stale IDs `a` → `null` без потери живого ID `b`; external field returned → TypeError; проекция при изменении mode 0 → 1 пересчёт; неправильные node types accepted → rejected с cleanup. Правильные HTML-элементы по-прежнему работают.
- По окончании commit проверены текущие blobs `BlockReconciler.js`, `BlockReconciler.test.js` и `projectionFields.js`. Полный инсталляционный `npm ci`, `npm run typecheck`, `npm test`, Chrome native suite, npm package-consumer gate, документационная сборка и differential parity v1/v2 на этом HEAD не запускались.

**Итог прохода:** 5 кодовых исправлений, **11 новых Node-регрессионных тестов**, вспомогательная коррекция тестового fixture и paired EN/RU docs. Следующий аудит: exception safety dynamic `editableFields()` и `#registerFields` при ошибке дочерней inline projection, проверка реальных Chrome/browser acceptance gates на доступном checkout.
