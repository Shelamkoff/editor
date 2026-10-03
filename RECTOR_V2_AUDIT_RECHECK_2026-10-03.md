# Rector v2 — аудит: повторная проверка перед исправлениями

## Область и доказательства

Этот документ актуализирует замечания R1–R11 архитектурного аудита от 3 октября 2026 года и добавляет R12 по изменениям, сделанным после него. Исторический финальный срез аудита — `a5530bd2e57b717a09faf39a763229aebc529e41`; повторно проверенный срез — **`6bd93c5598981e92b2f7fc8142708dc729918990`**. Между ними 28 коммитов. Сравнительная база v1 — `62038cefd8817a849c1a476a8c076b6bf535670b` из [исходной спецификации](RECTOR_V2_REFACTOR_PLAN.md). Позднейшие изменения исходников не следует автоматически считать проверенными этим отчётом.

[Спецификация устранения замечаний](RECTOR_V2_REMEDIATION_SPEC.md) определяет целевую архитектуру. Этот аудит описывает наблюдаемое состояние, а не заменяет нормативные контракты спецификации.

Исходники и зависимости получены из [CI run 37141477062](https://github.com/Shelamkoff/editor/actions/runs/37141477062), artifact `11280856694`. PAX-заголовок `source.tar` содержит проверенный SHA. SHA-256 архива исходников: `55361b89f10a0b346ae9d9a48798acb5f10a7f318294940c76414e4744e80035`. Локальная среда — Node 22.16.0. Production-код перед проверками не исправлялся.

Проверены дельта исходников, владельцы затронутых контрактов, публичные типы, сборка runtime, схемы, обработчики clipboard/keyboard/selection, жизненный цикл, прежние воспроизведения и CI соответствующего SHA. Дополнительные проверки используют реальные классы модели/контроллеров и тестовые двойники DOM, clipboardData и pointer-геометрии. Это не локальный прогон браузера и не подтверждение записи в системный clipboard. Браузерный результат ниже взят из CI; отдельный локальный browser-прогон при этой повторной проверке не выполнялся.

## Результаты текущего среза

| Проверка | Результат | Основание |
|---|---|---|
| `npm test` | 380 passed, 0 failed, 0 skipped | Локальный повторный запуск |
| `npm run typecheck` | FAIL, две ошибки TS2554 | Локально и Node 20.19/22/24 в CI |
| `npm run test:docs` | FAIL, два отсутствующих описания нового API | Локально и docs job CI |
| Package gate | PASS | CI job `111256865845` |
| Browser gate | PASS | CI job `111256865902`; не доказательство закрытия отсутствующих сценариев |
| Size gate | PASS при текущих бюджетах | CI job `111256865913` |
| Прежние 13 адресных проверок | Все 13 по-прежнему выявляют нарушение ожидаемого инварианта | Повторный локальный запуск на неизменённом текущем срезе |
| Две дополнительные clipboard-проверки | Обе выявляют нарушение | Частичный Cut без HTML; cross-selection Paste не читает внутренний MIME |

15 неуспешных адресных assertions — **не** 15 падений штатного набора и **не** 15 независимых критических ошибок. Соответствие группам замечаний приведено ниже.

Текущие ошибки typecheck:

```text
inline-tools/utils.js(559,20): TS2554: Expected 0 arguments, but got 1.
inline-tools/utils.js(652,25): TS2554: Expected 1 arguments, but got 2.
```

Текущие ошибки документации:

```text
docs/guide/inline-extensions.md: InlineTool.bindSelectionPort is not documented
docs/ru/guide/inline-extensions.md: InlineTool.bindSelectionPort is not documented
```

Синтаксическое повреждение `InlineCommandController.js`, встречавшееся в начальном срезе старого аудита `160c9783`, исправлено. Оно не является открытым замечанием текущей ветки.

## Реестр замечаний

### R1 — потеря inline-sidecar при полной конвертации; P1, открыто

**Источник:** [DocumentRuntime.convert](https://github.com/Shelamkoff/editor/blob/6bd93c5598981e92b2f7fc8142708dc729918990/core/DocumentRuntime.js#L593-L644).

Параграф содержит `Hello {{w}}` и `inline.w` с mention. После `convert(id, {type: 'heading'})` строка со ссылкой остаётся, а таблица `inline` отсутствует. AUDIT-01 повторно подтверждает это. Новая запись вручную собирается без sidecar; другие пути конвертации используют иную сборку.

Нарушение находится в канонических данных, не только в DOM. Требуется единый инвариант сборки data/tunes/inline для полной, частичной и межблочной конвертации, split/merge и вставки; сохранение opaque inline и защита литеральных `{{id}}` от случайного связывания.

### R2 — замена документа не атомарна с режимом и событиями; P1, открыто

**Источники:** [DocumentRuntime](https://github.com/Shelamkoff/editor/blob/6bd93c5598981e92b2f7fc8142708dc729918990/core/DocumentRuntime.js), [TransactionEngine](https://github.com/Shelamkoff/editor/blob/6bd93c5598981e92b2f7fc8142708dc729918990/core/TransactionEngine.js), [composition root](https://github.com/Shelamkoff/editor/blob/6bd93c5598981e92b2f7fc8142708dc729918990/core/createEditorRuntime.js).

`render()` вызывает `engine.reset(next.document)` раньше обновления `#documentMode`. Подготовка проекции и публикация видят старый режим. AUDIT-02: future/preserved → supported/editable оставляет `oe-preserved-block` при активной канонической записи. AUDIT-03: observer видит новый документ со старым `mode/readOnly`.

Дополнительно `reset` публикует `changes` на верхнем уровне, а адаптер `document:changed` читает `event.record?.changes`, формируя пустой список. Это проверено по связанной цепочке вызовов; не отдельное 16-е воспроизведение.

Нужна общая commit-граница документа, mode/time и влияющих на проекцию метаданных; единая форма события и отдельная семантика host-authorized команд и пользовательского readOnly.

### R3 — неполный перенос clipboard-фрагментов; P1, открыто

**Источник:** [ClipboardController](https://github.com/Shelamkoff/editor/blob/6bd93c5598981e92b2f7fc8142708dc729918990/core/ClipboardController.js#L114-L255). **Сравнительная база:** [v1 rangeClipboard](https://github.com/Shelamkoff/editor/blob/62038cefd8817a849c1a476a8c076b6bf535670b/core/clipboard/rangeClipboard.js).

Частичный Cut записывает только plain text, затем удаляет выделение. Частичный Copy формирует HTML без канонического inline-payload. При активном межблочном выделении Paste читает HTML/plain text и выходит до разбора внутреннего MIME.

RECHECK-14 подтверждает отсутствие HTML перед удалением; RECHECK-15 подтверждает отсутствие чтения внутреннего MIME. Наличие v1 `application/x-rector-fragment` с HTML и sidecar, защита opaque payload и сохранение обрамляющего форматирования подтверждены исходником v1. Полное покрытие этих сценариев прежним числом зелёных browser-тестов не доказано.

Нужен один канонический формат выбранного содержимого и один import/replace путь независимо от способа выделения. Cut и Copy используют общий сериализатор. Обнаруживаемая ошибка записи достаточного представления не разрешает удаление; при этом нельзя обещать транзакцию между моделью и системным clipboard.

### R4 — актуальные List DTO декодируются как legacy; P1, открыто

**Источники:** [ClipboardController.#htmlBlockRecords](https://github.com/Shelamkoff/editor/blob/6bd93c5598981e92b2f7fc8142708dc729918990/core/ClipboardController.js), [list schema](https://github.com/Shelamkoff/editor/blob/6bd93c5598981e92b2f7fc8142708dc729918990/shared/blockSchemas/list.js).

HTML-обработчик создаёт `items: [{id, text}]`, но не задаёт `dataVersion`. `insertExternalBlocks` отправляет этот локальный актуальный объект в decode, где отсутствие версии означает v1 и ожидаются строки. AUDIT-09: ошибка `List item text must be a string`.

После ошибки возможен переход к whole-input plugin resolver, извлекающему только вложенный список и не учитывающему соседние части HTML. Риск потери соседних узлов установлен статически, не выдан за полный локальный browser-repro.

Нужны разные контракты local/current и serialized/external; структурная HTML-маршрутизация должна учитывать все исходные узлы, не содержать в core таблицу форматов конкретных встроенных блоков и не продолжать другой resolver после частичного побочного эффекта.

### R5 — нативная история вспомогательного input перехватывается редактором; P1, открыто

**Источник:** [KeyboardRouter](https://github.com/Shelamkoff/editor/blob/6bd93c5598981e92b2f7fc8142708dc729918990/core/KeyboardRouter.js#L62-L96). **База:** [v1 history ownership tests](https://github.com/Shelamkoff/editor/blob/62038cefd8817a849c1a476a8c076b6bf535670b/core/KeyboardManager.history-target.test.js).

Mod+Z/Y обрабатываются до определения владельца поля. AUDIT-11: при отсутствии зарегистрированного editable owner вызываются document undo и preventDefault. В v1 вспомогательные input/textarea/select сохраняли native history, а document-backed поля маршрутизировались отдельно.

Нужна общая классификация владельца события до выполнения любых shortcut/clipboard/formatting операций; ближайший вложенный native control не наследует владение внешнего rich-text host.

### R6 — ошибка конечного drag-индекса и утечка pointer-сессии; P2, открыто

**Источник:** [DragController](https://github.com/Shelamkoff/editor/blob/6bd93c5598981e92b2f7fc8142708dc729918990/core/DragController.js).

AUDIT-12: A в A/B/C/D при drop между B и C перемещается в индекс 2 вместо 1. AUDIT-13: destroy во время жеста оставляет на document pointermove/up/cancel listeners. Нужны расчёт относительно порядка без dragged ID и единый scope активного pointerId, освобождаемый на всех завершениях.

### R7 — несовпадающий namespace inline-локализации; P2, открыто

**Источники:** [ExtensionRegistry](https://github.com/Shelamkoff/editor/blob/6bd93c5598981e92b2f7fc8142708dc729918990/core/ExtensionRegistry.js), [locale](https://github.com/Shelamkoff/editor/tree/6bd93c5598981e92b2f7fc8142708dc729918990/locale).

Registry обращается к `inline.mention.noResults`, словари содержат `inlinePlugin.mention.noResults`. AUDIT-10 получает английский fallback вместо `Ничего не найдено`. Нужен один правильный namespace и тест фактической сборки runtime с ru/en, не только сравнение деревьев словарей.

### R8 — незавершённый mount не освобождает все ресурсы; P2, открыто

**Источники:** [BlockReconciler](https://github.com/Shelamkoff/editor/blob/6bd93c5598981e92b2f7fc8142708dc729918990/core/BlockReconciler.js), [InlineProjectionRuntime](https://github.com/Shelamkoff/editor/blob/6bd93c5598981e92b2f7fc8142708dc729918990/core/InlineProjectionRuntime.js).

AUDIT-07: `runtime.create()` бросает исключение, но переданный ему signal остаётся неотменённым, поскольку ownership entry ещё не зарегистрирован. Проверены также соседние стадии setReadOnly/fields/inline hydration, требующие такой же гарантии освобождения при исключении.

Нужен scope до первого вызова расширения, передача владения только после успешного stage и освобождение частично созданных block/inline instances. Ошибка recovery должна иметь определённый безопасный исход, а не возвращать редактор в обычный idle с неизвестной проекцией.

### R9 — слабая защита расширяемых контрактов; P2, открыто

**Источники:** [DocumentRuntime contexts](https://github.com/Shelamkoff/editor/blob/6bd93c5598981e92b2f7fc8142708dc729918990/core/DocumentRuntime.js), [ExtensionRegistry](https://github.com/Shelamkoff/editor/blob/6bd93c5598981e92b2f7fc8142708dc729918990/core/ExtensionRegistry.js).

AUDIT-04: сохранённый callback отменённого context изменяет запись нового документа с тем же ID. AUDIT-05: caller меняет definition.type, а registry продолжает хранить тот же объект под прежним ключом. AUDIT-06: схема без обязательного decode принимается регистрацией.

Это недостаточная защита host boundary. Это не утверждение, что все встроенные uploaders игнорируют отмену: у них есть собственные проходящие проверки. Нужны revocable capabilities, поколение документа/экземпляра, snapshot descriptor и полный ранний schema contract check. AbortSignal и request-order guards на стороне расширения остаются необходимы.

### R10 — полное клонирование payload для ID-only запросов; P2, открыто

**Источники:** [InteractionState](https://github.com/Shelamkoff/editor/blob/6bd93c5598981e92b2f7fc8142708dc729918990/core/InteractionState.js), [DocumentStore](https://github.com/Shelamkoff/editor/blob/6bd93c5598981e92b2f7fc8142708dc729918990/core/DocumentStore.js).

AUDIT-08: один reconcile при подключённом onChange выполняет три runtime.list(), каждый клонирует записи. Это не измерение задержки в миллисекундах, а подтверждение обхода всех payload на пути, которому нужны ID.

Нужен внутренний неизменяемый query port; внешние detached snapshots/save сохраняются. Точечный DOM не делает всю операцию O(1): draft/commit пока копируют индексы, и эту отдельную стоимость нельзя скрывать в отчётности.

### R11 — прежний красный size gate больше не актуален; изменение политики

**Источник:** [bundle-budget](https://github.com/Shelamkoff/editor/blob/6bd93c5598981e92b2f7fc8142708dc729918990/benchmarks/bundle-budget.mjs).

На a5530bd2 core был 50.3 KiB gzip при пороге 48. На текущем срезе core — **50.7 KiB**, порог — **51 KiB**, gate зелёный. Это увеличение бюджета, не уменьшение bundle. Остальные текущие бюджеты: paragraph 40, defaultInteractive 64, fullPreset 96 KiB gzip. В плане нельзя оставлять это как нынешнее падение или повышать пороги автоматически при следующих изменениях.

### R12 — новый контракт межполевого форматирования не доведён до runtime; P1/P2, открыто

**Источники:** [inline-tools/types](https://github.com/Shelamkoff/editor/blob/6bd93c5598981e92b2f7fc8142708dc729918990/inline-tools/types.d.ts), [utils](https://github.com/Shelamkoff/editor/blob/6bd93c5598981e92b2f7fc8142708dc729918990/inline-tools/utils.js), [InlineToolbar](https://github.com/Shelamkoff/editor/blob/6bd93c5598981e92b2f7fc8142708dc729918990/core/InlineToolbar.js), [composition](https://github.com/Shelamkoff/editor/blob/6bd93c5598981e92b2f7fc8142708dc729918990/core/createEditorRuntime.js).

Новый `CrossEditableSelectionPort` задаёт activate(range) и deactivate(), но utils передаёт старые дополнительные аргументы. Это две фактические ошибки TS2554. Новый `InlineTool.bindSelectionPort` отсутствует в двух guide; это фактическое падение docs gate.

Более существенная часть проверена по связанной сборке: production-вызовов bindSelectionPort не найдено; новый syncBlocksFromProjection не имеет production consumer; InlineToolbar ограничивает mutation/formatting selection одним полем/блоком. Тест fontSize вручную связывает порт, что не доказывает его привязку реальным createEditor. Метод многоблочной синхронизации выполняет переданную DOM-операцию до входа в engine, поэтому простое подключение не даёт полной транзакционной гарантии.

Требуется один транзакционно защищённый путь single/multi-field форматирования, фактическая lifecycle-привязка selection port, корректное хранение alignment только в tunes и end-to-end proof через toolbar/shortcut, а не прямой вызов внутреннего метода. Отсутствие UI-wiring — статическое заключение, не отдельный локально воспроизведённый browser-result.

## Сохранённые достижения и границы вывода

DocumentStore, history изменений, фабрики block/inline runtimes, общие versioned schemas editor/renderer и новый публичный API уже существуют. Нельзя планировать их создание заново или возвращение прежнего BlockPlugin/EditorFacade runtime. Сохранены 21 block type и 12 default inline tools; их наличие не доказывает эквивалентность всех операций. Обычные undo/redo, roundtrip и browser-группы CI проходят, однако перечисленные дополнительные условия штатными gate не доказаны.

Изменение API в пользу новых границ допустимо. Потеря пользовательского содержимого не является допустимым побочным эффектом breaking change. Чтение уже поддерживаемых v1/v2 документов и inert-preserve неизвестного содержимого сохраняются; это не требует совместимого старого editing runtime.

**Вывод повторной проверки:** R1–R10 остаются открытыми; прежнее описание R11 как красного gate снято и заменено фактом изменения бюджета; R12 добавлен из текущей дельты. Нужна реализация [целевой спецификации](RECTOR_V2_REMEDIATION_SPEC.md), после которой паритет доказывается по пользовательским сценариям и инвариантам, а не по одному общему числу зелёных тестов.
