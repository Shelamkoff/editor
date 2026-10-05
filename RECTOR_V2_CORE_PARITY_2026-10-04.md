# Сверка поведения ядра Rector v1 → v2 — 2026-10-04

Следующая итерация [05.10.2026](RECTOR_V2_FOLLOWUP_2026-10-05.md) добавляет phase/control guards, partial mode rollback и before/after bookmarks protected edit. Матрица повторно пройдена в общем прогоне 938 native cases (49 core behavior).

Актуальный итог — [повторная проверка 05.10.2026](RECTOR_V2_RECHECK_2026-10-05.md): исправлены protected-edit reentry, смена read-only внутри callback и unrecoverable recovery. Матрица ниже сохраняется и повторно пройдена в общем прогоне 934 native cases; прежние логи отражают опубликованный checkpoint `4e5ba54`.

База сравнения: локальный `master`, коммит `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340`. Проверяемая ветка: `refactor/rector-v2-architecture`, HEAD `eff8a06692e2f80d4c6c2e33abc1d626fa4ef1aa` с незакоммиченными исправлениями. Старое ядро используется как источник контракта при чтении, а не как runtime или adapter в v2.

Продолжение [сверки плагинов](RECTOR_V2_PLUGIN_PARITY_2026-10-04.md). Команды, итоговые gates и запуск демо — в [локальном отчёте](RECTOR_V2_LOCAL_VERIFICATION_2026-10-04.md). Нормативная спецификация: [RECTOR_V2_REMEDIATION_SPEC.md](RECTOR_V2_REMEDIATION_SPEC.md).

## Результат

Дополнительная проверка ядра выявила реальные расхождения, которые не были покрыты прежней матрицей из 718 native cases. Исправлены физические горячие клавиши, цикл Ctrl+A, modified deletion выделения, связь публичного выбора блоков с пользовательскими командами, вставка/IME и сохранение каретки в истории. Добавлено 45 проверок `native-core-behavior.html`; все прошли в общем native прогоне (выписка результатов) [native-core-plugin-final.log](test-results/refactor-audit-2026-10-04/native-core-plugin-final.log).

В браузерных assertions проверяется canonical `save()`, невыделенный контент/IDs, collapsed caret либо точный anchor/focus, DOM focus и один смысловой Undo/Redo. Проверка истории включает каретку после Redo: правильное восстановление данных само по себе недостаточно.

## Матрица ядра

| Поведение | Источник v1 / контракт и проверка v2 |
|---|---|
| Горячие клавиши | `core/ShortcutRegistry.js`, `KeyboardManager.js`: physical `KeyA/B/Z/Y`, независимо от раскладки. Native русские Ctrl+A/B/Z/Y и Ctrl+Shift+Z из editor chrome. |
| Ctrl+A | `KeyboardManager.js`: collapsed непустое поле → его native text; имеющийся range или пустое поле → все блоки; следующий Ctrl+A → native поле. Пять вариантов цикла, включая Code-only документ. |
| Межблочное выделение | `CrossBlockSelection.js`, `MouseSelectionManager.js`, `SelectionManager.js`: оба направления, выход за блок/редактор, gaps/margins, Shift arrows/word/line, opaque/widgets. Новые modified Backspace/Delete дополняют `native-cross-selection`, `native-text-input`, `native-ime`. |
| Whole-block selection | Публичный выбор `blocks.select(['d','b'])` обрабатывается в порядке документа. Delete, typing, Copy/Cut/Paste и IME затрагивают только b/d, сохраняют a/c и gaps. Delete/Cut фокусируют соседний блок у места удаления, как v1 BlockManager.removeSelected, включая Redo. `clearSelection()` и render generation отзывают intent, даже при повторном использовании IDs. |
| Каретка и история | `UndoManager.js`, `SelectionManager.js`: один завершённый жест — один undoable result; восстановление фокуса, диапазона/направления и offsets. Проверены split/merge/conversion/formatting прежними suites, новые slash/inline/clipboard/drag cases проверяют точную каретку после Redo. |
| Drag | `DragManager.js` и C7: native pointer move меняет порядок один раз, сохраняет identity DOM неизменённых блоков и caret; клавиатурный Undo/Redo. Cancel/lifetime/placement дополнительно проверяет CLI audit. |
| Slash | `SlashCommands.js`: Escape удаляет query, сохраняет suffix и исходную каретку; Enter вставляет выбранный блок и ставит caret в него. Process/229/IME не исполняет команду. |
| Clipboard | `core/clipboard/Clipboard.js`, `pasteInsert.js`: private fragments, внешний plain/HTML, несколько непустых строк → несколько блоков, соответствующие native caret/Undo/Redo. Внутренняя вставка перед suffix сохраняет правильный offset и поле, включая Quote caption и оба направления cross range. Auxiliary link input получает собственный native Copy/Cut/Paste, не сохранённый range документа. |
| Inline atoms | Вставка explicit/default Color, pattern paste с suffix, update/remove Mention и trigger → plain text сохраняют canonical payload и planned caret при Redo. Trigger/search lifecycle дополнительно проверяет CLI mention suite. |
| IME | Прежние native composition cases + новые rich/plain host-selected b/d. Preedit не меняет canonical data/history; commit заменяет selected blocks один раз, сохраняет gaps, caret и Undo/Redo. |
| Beforeinput без keydown | Node regression: deleteContentBackward/Forward и deleteWordBackward/Forward заменяют полный активный range. Native клавиши отдельно проверяются Chrome CDP. |
| События и lifecycle | committed observer видит согласованные model/DOM/history и immutable event; sequence монотонна; no-op не публикуется; debounce даёт последний snapshot, destroy отменяет pending onChange. CLI contracts/security/recovery и heap дополняют эту проверку. |
| Преобразование блоков | `splitConvert.js`, `crossBlockConvert.js`, `core/clipboard/CrossBlockEditor.js`: whole/partial/cross и 29 rich fields в обоих направлениях проверяются native conversion/plugin-ranges/local-ranges; authored fields сохраняются по согласованному с владельцем контракту. |

## Исправления через TDD

Ниже red witness перед исправлением и green witness того же поведения. FAIL в red-логах ожидаем: это доказательство воспроизведения ошибки, не результат итогового gate.

| Ошибка | Логи в `test-results/refactor-audit-2026-10-04/` |
|---|---|
| Русская раскладка не выполняла Ctrl+A | `core-layout-red/green.log` |
| Ctrl+A не расширял partial range и не возвращался из whole selection | `core-select-cycle-red/green.log` |
| Ctrl+Backspace/Delete удалял только в native host | `core-modified-delete-red/green.log` |
| `blocks.select()` красил блоки, но Delete/type игнорировал их | `core-host-selection-red/green.log`; clipboard: `core-selection-clipboard.log` |
| render оставлял whole selection на повторно использованных IDs | `core-selection-generation-red/green.log` |
| Документ только из Code не получал whole selection | `core-plain-select-red/green.log` |
| Beforeinput deletion без keydown терял полный range | `core-beforeinput-delete-red/green.log` |
| Slash Escape/Enter Redo терял каретку/целевой host | `core-slash-caret-red/green.log`, `core-slash-command-red/green.log` |
| Slash Enter перехватывал IME Process/229 | `core-slash-ime-red/green.log` |
| Inline explicit/default insertion Redo ставил caret 0 | `core-widget-caret-red/green.log`, `core-widget-fresh-red/green.log` |
| Plain/HTML paste терял caret; multiline оставался одним полем | `core-external-paste-red/green.log`, `core-multiline-paste-red.log`; итог — native core suite |
| Host-selected IME менял focused a вместо b/d | `core-host-ime-red/green.log` |
| Вставка в link input заменяла retained document range | `core-aux-clipboard-red/green.log`; auxiliary copy/cut — итоговая suite |
| Inline-pattern paste Redo терял caret после atom/suffix | `core-pattern-caret-red/green.log` |
| Async file paste Redo фокусировал прежний блок | `core-file-caret-red/green.log` |
| Delete/Cut whole blocks фокусировал первый блок вместо соседа у удаления | `core-remove-focus-red/green.log` |
| Private fragment paste уходил за suffix/в первое поле, cross paste терял join caret | `core-private-caret-red/green.log`, `core-cross-paste-caret-red/green.log` |
| Update/remove Mention Redo ставил caret 0 | `core-widget-delete-red/green.log`; trigger → text — итоговая suite |

## Исправления стендов и пределы доказательства

После восстановления v1 Ctrl+A empty-field ветка прежнего native-text-input теста должна нажимать Ctrl+A один раз: второе нажатие уже снимает whole selection. Assertions всего набора ID/контента оставлены. Отдельный новый тест проверяет оба шага этого цикла.

Local plugin range fixture измерял drag после фиксированных 150 мс и в общем прогоне получил неправильный начальный offset до команды conversion. Теперь он ждёт CSS/fonts и два layout frames; точные anchor/focus assertions сохранены, retries или замены жеста программным selection нет. Все 76 cases прошли [core-local-layout-green.log](test-results/refactor-audit-2026-10-04/core-local-layout-green.log).

Slash suffix fixtures используют дефисы: соседние обычные пробелы Chrome мог нормализовать при native input. Нормативная проверка caret/сохранения suffix не ослаблена.

Keyboard/mouse/clipboard события поступают через Chrome CDP и проверяются как trusted. IME проходит через browser engine, не физический метод ввода ОС. Async file case передаёт disposable File синтетическим ClipboardEvent, после чего проверяет native history keys; он не доказывает работу системного file chooser. Auxiliary clipboard проверен настоящими Ctrl+C/X/V; native Backspace с retained caret возле Mention также не меняет документ (`core-atom-ownership-current.log`).

Матрица доказывает перечисленные сценарии в Chrome/Chromium. Новые API/JSON намеренно отличаются от v1; сохранение Quote caption, Person role/bio и Poll options согласовано владельцем. Не заявляется отсутствие любых ошибок вне зафиксированных сценариев, поддержка других browser engines или доступность внешних upload/provider services.

## Продолжение проверки — 2026-10-05

Дополнительные пять core cases закрепляют native private rich paste в plain Code host, локальный rich Cut с caret после Redo, async rich paste в Quote.caption и отдельные history steps для Code Paste/Cut между двумя сериями ввода. ClipboardController больше не перехватывает plain-text paste; локальный Cut готовит caret до commit; async paste возвращает правильный fieldKey/offset; NativeInputController выделяет paste/drop/cut из typing group.

Все 34 авторских поля отдельно проверены локальными native Paste/Cut (68 cases). При непрерывной замене projection Attaches и Person native selection захватывается до reconciliation и восстанавливается после него; очищение недоверенного pasted DOM сохранено.

Red/green: `core-code-paste-red/green.log`, `core-local-cut-red/green.log`, `core-async-rich-caret-red/green.log`, `core-plain-clipboard-history-red/green.log`, `plugin-field-clipboard-first.log`, `plugin-field-clipboard-green.log`. Окончательный полный результат — `native-core-plugin-final.log`.
