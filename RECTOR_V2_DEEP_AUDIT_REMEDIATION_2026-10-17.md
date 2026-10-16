# Rector v2 — исправления по глубокому аудиту

**Дата:** 2026-10-17. **Ветка:** `refactor/rector-v2-architecture`.
**Базовый кодовый SHA аудита:** `22865b5415c385ebe88d6bcb8b2fea59f1137a5a`.
**Базовый коммит отчёта:** `ae6e53ba6c499e5176fde36bb8003e42668c2458`.
**Кодовый HEAD после исправлений:** `e5af55915433dcf9cf67bb937ffc62def6d6a726`.

Статус: **все шесть подтверждённых находок аудита R1–R3/A1–A3 исправлены в исходниках; полный проектный gate и сквозной браузерный паритет ещё не подтверждены**. Это отчёт об изменениях, а не заявление о принятой версии 2.0.0.

| Находка | Приоритет | Исправление | Коммит |
|---|---|---|---|
| R1: новый запрос Mention повторно захватывал подключённый popup | P1 | Каждому запросу выделяется новая отсоединённая поверхность. Предыдущая презентация освобождается через её handle; epoch защищает от reentrant successor. Добавлены 2 теста. | [`1a60055`](https://github.com/Shelamkoff/editor/commit/1a600555665e445bc6068d26dd7519017b89570c) |
| R2: структурная HTML-вставка игнорировала локальное выделение | P1 | Router передаёт leading inline HTML по capability, контроллер вызывает единый range-aware clipboard planner вместо anchor-only insertion; planner принимает `local-block` и сохраняет замену пустого блока. 4 теста. | [`ac316f7`](https://github.com/Shelamkoff/editor/commit/ac316f7063ee7a32c26b157cc79dff7f4c9fa5c8) |
| R3: пустая разметка rich text считалась содержимым | P2 | Нейтральный HTML-aware parser `shared/richTextEmpty.js`, контекст owning Document, общий контракт `EmptyCapability`, применение к 12 built-in rich-text типам и выходу из List. 16 тестов. | [`377d03d`](https://github.com/Shelamkoff/editor/commit/377d03d93df728507d6bbfd0251179cf2afce41a), [`77ebbef`](https://github.com/Shelamkoff/editor/commit/77ebbef4c0c298485b437cbe6691ac99a087c011), [`d7a314d`](https://github.com/Shelamkoff/editor/commit/d7a314d3e841962c43a42d90f342dbc9b6086e3a) |
| A1: изменение одного блока копировало всю Map и order | P2 | `PersistentBlockMap`: immutable AVL с O(log N) path copy; order разделяется по copy-on-write; внутренний guarded snapshot для prepareCommit, публичный snapshotState остаётся отсоединённой Map. 4 теста. | [`e5af559`](https://github.com/Shelamkoff/editor/commit/e5af55915433dcf9cf67bb937ffc62def6d6a726) |
| A2: JSON object order создавал ложную semantic change | P2 | `canonicalRecordsEqual` теперь рекурсивно сравнивает значения и наличие собственных ключей объектов без учёта порядка ключей; порядок массивов значим. 2 теста. | [`843de6e`](https://github.com/Shelamkoff/editor/commit/843de6e0b1e9b5c834842c9990a5247dc8aa0c0a) |
| A3: мёртвые DOM splitting helpers в List | P3 | Удалены `fragmentHtml`, `splitAtCaret`, `atStart`; действующий shortcut использует `context.splitField`. | [`bc72561`](https://github.com/Shelamkoff/editor/commit/bc725619e2df6acd3f7ffb75ab5b6c37de8fc586) |

## Проверка и ограничения

- R1: изолированно исполнялись точные исходники Mention и InlinePopupHost на управляемом DOM-адаптере. Baseline: ошибка второго вызова, исправление: 3 последовательных запроса и одна активная поверхность.
- R2: фактический `prepareInsertClipboardParts` выполнен с управляемыми операциями rich-text; результат диапазона 3–6 в `abcDEFghi` и двух HTML-частей — `abcXghi | Y`; исходная версия отклоняла `local-block`. Новые controller/plan tests записаны в репозиторий, но полный ClipboardController/native Clipboard в Chromium после исправления пока не прогнан.
- R3: включён самостоятельный модуль определения пустоты с явным ownerDocument и проверками текстовых/HTML-примеров. Chromium-проверка оригинальной ошибки содержится в базовом аудите; повторный browser launch после патча в этой среде завершился тайм-аутом.
- A2: red/green на оригинальной функции `canonicalRecordsEqual` подтвердил, что порядок ключей больше не влияет на equality при сохранении значимости порядка массива.
- A1: **68/68** независимых Node тестов на локально исправленных оригинальных модулях DocumentStore, TransactionEngine, HistoryStore и InstanceScope; ранее включённая модель выполняет **10 000** детерминированных переходов. Выборочный TypeScript check двух модулей: PASS на установленном TS **5.8.3** (версии репозитория **5.9.3** здесь нет).
- Все 14 основных изменённых исходных и тестовых JavaScript-файлов после push успешно разбираются JavaScript parser с удалёнными для этой проверки ESM-imports. Это не равно штатной сборке.
- На одном локальном сравнении при 50 000 блоков update занимал ~79.16 мс на базовой версии и ~0.19 мс после оптимизации. Построение исходного документа было ~631 мс и ~669 мс соответственно. Данные измеряют одну транзакцию с no-op projector, а не реальный ввод на устройстве пользователя.
- Всего добавлено **28 проверок** в репозиторий в рамках этого исправительного прохода (2 + 4 + 16 + 4 + 2; удаление dead code новых тестов не потребовало). Эти тесты ещё не выполнялись вместе в полном checkout.

## Обязательная локальная приёмка на финальном SHA

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

При приёмке обратить внимание на полный встроенный Mention (`@` → ввод, удаление символов, выбор мышью/Enter → Undo/Redo), HTML Paste с локальным выделением и составными блоками, ownerDocument/Trusted Types, rich-text widget-only empty, доступность расширений из опубликованного пакета, многошаговые Undo/Redo и heap/resource cleanup.

**Не было:** полного локального npm checkout, runtime gate на TS 5.9.3, реального Chromium-after-fix/native/heap и полного v1/v2 жестового differential. Эти непроверенные gates не должны обозначаться как `PASS` до выполнения.
