# Локальная проверка и доработка Rector v2 — 2026-10-04

Ветка: `refactor/rector-v2-architecture`. Исходный HEAD: `eff8a06692e2f80d4c6c2e33abc1d626fa4ef1aa`. Результаты относятся к локальным незакоммиченным исправлениям поверх этого HEAD. Это локальный Windows/Chrome прогон, не результат CI неизменённого GitHub-коммита.

Нормативный контракт: [RECTOR_V2_REMEDIATION_SPEC.md](RECTOR_V2_REMEDIATION_SPEC.md). Сверка поведения ядра: [RECTOR_V2_CORE_PARITY_2026-10-04.md](RECTOR_V2_CORE_PARITY_2026-10-04.md). Сверка каждой возможности 21 плагина: [RECTOR_V2_PLUGIN_PARITY_2026-10-04.md](RECTOR_V2_PLUGIN_PARITY_2026-10-04.md). Ранние отчёты от 29.09 и source-only implementation recheck являются историческими.

## Результат и область приёмки

Редактор запускается из исходников и собранной документации; package consumer запускает архив из текущего checkout. Перечисленная функциональная матрица v1 → v2 пройдена: проверены все 21 плагин, 34 авторских поля, видимое действие настроек, каретка/выделение, whole/partial/cross conversion, native clipboard, история, renderer, current-format/security/ownership/lifecycle boundaries. В этой матрице не осталось известных материальных missing/partial/contradicts после исправлений.

Сохранение подписи Quote, роли/биографии Person и вариантов Poll при whole conversion в текст является согласованным владельцем отличием от v1. Новые JSON/API не обязаны совпадать с прежними; old runtime/adapter в production или test dependency graph не добавлен. Размер ядра исключён владельцем из блокирующих критериев.

Сведения выше подтверждают зафиксированные возможности и их инварианты в поддерживаемом Chrome/Chromium. Они не являются обещанием отсутствия любых багов во всех сочетаниях данных, тем, плагинов и внешних сервисов. Физический IME конкретной ОС, системный file chooser и доступность remote provider playback не проверены; их границы описаны отдельно ниже. Полный универсальный паритет вне этой матрицы не заявляется.

## Исправления

- Cross-block mouse selection остаётся видимым при выходе за границы блока/редактора, в gaps и боковых отступах multiline fields. CSS Highlight использует действительное имя `oe-cross-select-v2`; возврат drag в исходное поле корректно сужает диапазон.
- Shift+arrows, word и line boundaries сохраняют anchor/focus, создают/расширяют cross-field диапазон, учитывают graphemes/widgets и вертикальную координату каретки. Cross Enter выполняет один atomic split.
- Замена выделения ставит каретку после вставки; последующий ввод сохраняет порядок символов. Undo/Redo восстанавливает направление диапазона, фокус и UTF-16 offsets. Auxiliary input сохраняет собственное поведение и не заменяет содержимое документа.
- Enter/Backspace/Delete в List/Checklist/Quote/Toggle, пустые middle/last items, exit/removal, merge caret и клик под документом сверены с v1. Сохраняются marks, checked, item IDs и один шаг истории.
- Частичное преобразование каждого rich field составного блока оставляет одного исходного владельца с прежними IDs/settings/assets и вставляет выбранный текст после него. Gallery/Person/Table больше не дублируются ради prefix/suffix. Cross endpoints сохраняют невыделенные края, simple text сохраняет prefix/target/suffix.
- Desktop block controls снова справа, toolbox/settings ограничены шириной 240 px и viewport, Heading/List имеют drill-down и «Назад», settings — отдельный уровень преобразования. Placeholder Heading получает фактический `level`.
- Gallery применяет все 21 layout к реальной геометрии; восстановлены empty slots, overflow, masonry и визуальное меню настроек. На blur больше не создаётся повторная мутация после Undo/Redo.
- Code/Raw восстановили view/edit commands и multiline indentation без стирания выделенного кода. Code Copy берёт актуальное значение, language search и highlight работают.
- Table восстановил Enter и Shift+Tab в конец предыдущей ячейки; native grid operations сохраняют unaffected IDs. Columns 3 → 2 сохраняет авторский текст лишней колонки.
- Poll восстановил rich question/options, Sort и inline settings; remote reset отменяет pending vote, multiple → single исправляет ballot/results, local vote остаётся одним history step.
- Person восстановил native reorder, рабочую crop Apply/Cancel цепочку, single-line name/role, редактирование новой пустой ссылки и hidden field focus после смены таба.
- LinkPreview восстановил все семь templates/visual selectors, URL debounce и очистку metadata прежнего URL. Attaches сохраняет четыре variants, inline chooser и expandable Card group.
- Embed восстановил видимое URL-поле в filled mode, Replace, debounce/Enter, Settings title/duration, Cover → Upload/URL/Remove/Back/custom sources и Play. Проигрыватель получает безопасный iframe; preview/title не закрывают его. Pending source tasks не могут менять заменённые данные.
- Carousel восстановил counter, inline Settings, Remove all, styled arrows/dots/thumbs, HTML/video sources и autoplay. View scope отменяет слушателей старой проекции.
- Source dialogs и media actions возвращают фокус владельцу, чтобы native Ctrl+Z/Ctrl+Shift+Z работали после замены кнопки/проекции. Non-text history restoration фокусирует block shell.
- Renderer сохраняет owned inline graph; текущие schemas/ingress, sanitizer, Trusted Types, ru/en labels, source/package/declaration/docs contracts проверены штатными gates.

Продолжение 05.10: native Code rich-fragment paste, local Cut/async Quote caption caret и изолированные clipboard history steps исправлены в ядре. Во всех 34 полях проверены local Paste/Cut; Attaches filename и Person URL сохраняют post-native selection при смене projection. Добавлены визуальные состояния всех плагинов, восстановлены media dropzones, Image Replace и Gallery/Carousel Add drill-downs. Исправлены hidden-state CSS, ширина Raw/Carousel/Poll, caption/controls Gallery, открытые Settings 320×500 и переводы настроек. Raw iframe preview получил читаемый светлый canvas без изменения opaque sandbox или authored HTML. Подробности и red/green logs — в матрицах ядра и плагинов.

Последующая сверка ядра обнаружила дополнительные ошибки shortcuts, selection intent, clipboard ownership и caret-after при Redo. Восстановлены v1 Ctrl+A cycle, physical keys на русской раскладке, полное modified deletion, действия над disjoint blocks и соседний focus после их удаления. Planned caret теперь коммитится вместе со slash/inline/clipboard операциями; provisional IME не меняет невыбранные gaps. Подробные red/green witnesses — в отдельном отчёте ядра.

## Нативные проверки

Все 925 cases завершились PASS, driver errors отсутствуют. Дополнительные end-to-end Enter/toolbox/history сценарии также прошли. Cases не выводятся из roundtrip-only сравнения: контролируются canonical save, DOM-эффект, caret/focus, неизменённые поля/ID и история.

| Набор | PASS | Что проверено |
|---|---:|---|
| native-core-behavior | 45 | Russian shortcuts/Ctrl+A cycle, disjoint selection/Delete/Cut/type/clipboard/IME, slash/widgets/paste caret, drag, render/events/auxiliary ownership |
| native-text-input | 42 | Ввод, Unicode/widgets, замена, направления, Quote fields, whole-document selection |
| native-tools | 24 | Все 12 инструментов на single/cross backward ranges |
| native-clipboard | 7 | Trusted Copy/Cut/Paste, private MIME, независимые editors |
| native-ime | 9 | Composition engine, preedit/commit/cancel, read-only/revision revocation |
| native-conversion | 7 | Whole/partial/cross gestures, Heading/List/Code, marks/inline и lossy rejection |
| native-block-menus | 8 | Геометрия, drill-down, keyboard/mobile, placeholder, stale callbacks |
| native-structural | 21 | Enter/Backspace/Delete, items/merge/exit, клик под документом |
| native-cross-selection | 32 | Видимая смешанная подсветка, margins/gaps, Shift navigation, controls, Enter/conversion/history |
| native-plugin-parity | 139 | 21 plugin, 34 поля, native authoring, Code/Raw, literal/whole conversion, read-only |
| native-plugin-controls | 141 | Общие команды каждого plugin, Table/Columns, Person/Gallery drag/crop, Poll, templates и buttons |
| native-plugin-ranges | 116 | Все 29 rich fields как first/last cross endpoints × оба направления |
| native-plugin-local-ranges | 76 | 54 single-field partial + 22 own-multi-field partial, один residual owner |
| native-plugin-clipboard | 48 | 12 compound plugins × Copy/Cut × оба направления, без утечки assets/unselected fields |
| native-plugin-media | 58 | URL/custom sources, Embed Play/settings/cover, Carousel/media/autoplay, 21 Gallery layouts, read-only disclosure, source drill-down, thumbnail controls, открытые Settings 320×500 |
| native-plugin-field-clipboard | 68 | Local native Paste/Cut во всех 34 полях, marks/plain payload, untouched siblings, точный caret/focus после Redo |
| native-plugin-design | 84 | 336 состояний всех 21 плагинов × light/dark × 640/288px, filled/empty/read-only/empty-read-only |

## Штатные gates

Актуальные логи продолжения 05.10: `test-results/refactor-audit-2026-10-04/*-core-plugin-final.log`. `*-core-audit.log`, `native-core-full.log` и `native-core-current.log` относятся к предыдущему прогону. Bundle-size лог остаётся историческим информационным измерением. Логи с иными именами, red/debug файлы отражают предыдущие итерации или намеренные воспроизведения ошибок. Ожидаемые FAIL witnesses внутри `harness-contract.html` проверяют сам harness (`correct: true`); runner завершился успешно.

| Проверка | Результат | Лог |
|---|---|---|
| npm run typecheck | PASS, оба TypeScript проекта | [typecheck-core-plugin-final.log](test-results/refactor-audit-2026-10-04/typecheck-core-plugin-final.log) |
| node --test | 416 PASS, 0 FAIL/skip | [node-core-plugin-final.log](test-results/refactor-audit-2026-10-04/node-core-plugin-final.log) |
| npm run test:docs | PASS: source/locale/contract, 94 README, 53 examples, 44 JSON, 62 links, 92 dist copies | [docs-contract-core-plugin-final.log](test-results/refactor-audit-2026-10-04/docs-contract-core-plugin-final.log) |
| npm run build | PASS, 262 runtime declarations, 0 source diagnostics | [build-core-plugin-final.log](test-results/refactor-audit-2026-10-04/build-core-plugin-final.log) |
| npm run test:types | 6 PASS после свежего build | [types-core-plugin-final.log](test-results/refactor-audit-2026-10-04/types-core-plugin-final.log) |
| npm run test:package | Локальный tarball 2.0.0, Bundler/NodeNext, Vite/import, 22 CSS assets | [package-core-plugin-final.log](test-results/refactor-audit-2026-10-04/package-core-plugin-final.log) |
| node tests/browser/run.mjs | 24 CLI pages PASS | [browser-cli-core-plugin-final.log](test-results/refactor-audit-2026-10-04/browser-cli-core-plugin-final.log) |
| node tests/browser/physical-history.mjs | 925 native cases PASS + Enter/toolbox/history scenarios | [native-core-plugin-final.log](test-results/refactor-audit-2026-10-04/native-core-plugin-final.log) |
| node tests/browser/heap-gate.mjs | PASS: 11 sentinels, 0 retained; used heap 12.32 MiB, snapshot 24.26 MiB | [heap-core-plugin-final.log](test-results/refactor-audit-2026-10-04/heap-core-plugin-final.log) |
| npm run docs:check | PASS: 123 HTML, 47 README, 0 broken links/missing assets; EN/RU demo Editor/Preview/JSON | [docs-build-core-plugin-final.log](test-results/refactor-audit-2026-10-04/docs-build-core-plugin-final.log) |
| node benchmarks/bundle-budget.mjs | PASS информационно: paragraph 4.1/40, default 13.4/64, full 83.7/96 KiB gzip; core 81.0 KiB | [bundle-current.log](test-results/refactor-audit-2026-10-04/bundle-current.log) |

Декларации получены штатным build, dist вручную не исправлялся. Browser discovery не запускает `chrome.exe --version`: headless Chrome сразу получает URL стенда; новые пустые окна не создаются. Во время native run исходники и fixtures не редактировались.

## TDD и ручное демо

Использованы скопированные ecom JS-навыки и TDD red → green → refactor. Новые regression tests проверяют public behavior, а не устройство private методов. Красные воспроизведения сохранены в test-results: local compound conversion (дублирование owner), Embed URL/Play/settings, media focus/history, Code/Raw keys, Gallery layout, Poll controls, Person crop/reorder и прежние cross-selection/structural ошибки. После исправления выполнялись focused cases и полный соответствующий gate.

Исправлены и стенды: DOM realm double дополнен действительным contains/focus; Embed async-race проходит через Cover → Upload в обеих парах запросов; List partial expectation сверена с v1 `core/splitConvert.js`; native gestures ждут загрузки CSS/fonts, сохраняя точные offset/hit/isTrusted assertions. CLI Carousel file-input lifecycle теперь открывает Add → Upload, как восстановленное v1 меню; проверка наличия/очистки временного file input сохранена. После последнего native PASS в production JS добавлены только обязательные JSDoc @returns двух helpers; их тела не менялись.

192 conversion cases разделены на две страницы, чтобы не увеличивать timeout и не терять coverage.

В существующей вкладке Codex по `http://127.0.0.1:5173/ru/#demo` дополнительно проверены Heading drill-down и рост выделения с клавиатуры от Heading через Paragraph/widgets, List, Quote до Warning. Подсветка видима, toolbar сохраняет Heading/H2, block buttons справа. Временный viewport 1400×1000 сброшен после проверки.

Снимки: [видимое cross-block selection](test-results/refactor-audit-2026-10-04/editor-cross-selection-current.png), [Heading drill-down](test-results/refactor-audit-2026-10-04/editor-heading-drilldown-current.png). Дополнительные снимки: [Gallery drill-down](test-results/refactor-audit-2026-10-04/gallery-drilldown-current.jpg), [Carousel drill-down 288px](test-results/refactor-audit-2026-10-04/carousel-drilldown-current.jpg), [Gallery Settings](test-results/refactor-audit-2026-10-04/gallery-settings-current.jpg), [Raw preview](test-results/refactor-audit-2026-10-04/raw-preview-current.jpg), [новая проверка выделения в демо](test-results/refactor-audit-2026-10-04/editor-cross-selection-followup.jpg), [пустые блоки в тёмной теме](test-results/refactor-audit-2026-10-04/plugin-empty-dark-current.jpg).

SHA-256 локальных изменённых исходников/fixtures/docs зафиксированы в [source-manifest.json](test-results/refactor-audit-2026-10-04/source-manifest.json).

## Границы

- Composition проверяется настоящим движком Chrome через CDP, не физическим IME конкретной ОС. Программная доставка commit не заменяет такую ручную сессию.
- Private clipboard проверен trusted Ctrl+C/X/V между независимыми editors. Часть contract/failure tests использует synthetic ClipboardEvent; системные permission dialogs не являются проверенным результатом.
- Crop Person выполняет настоящий dialog/canvas/upload; только OS chooser подменяется disposable File. Image v1 не имел crop.
- Video проверяет local media authoring и provider iframe integration, а не доступность внешнего сервиса/сети или сервера upload пользователя.
- Firefox/WebKit не объявляются поддерживаемыми без аналогичных native gates. Heap gate доказывает очистку своего сценария, не отсутствие всех потенциальных утечек.

## Запуск демо

Из `C:\OSPanel\domains\editor`:

```powershell
npm.cmd run docs:dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Открыть [русское демо](http://127.0.0.1:5173/ru/#demo). Если текущий сервер уже слушает 5173, достаточно обновить открытую страницу. Полная проверка браузера: `npm.cmd run test:browser`; focused native page задаётся через `EDITOR_NATIVE_PAGE` и optional `EDITOR_NATIVE_FILTER` (сбросить перед полным прогоном).

Проверенное состояние публикуется в ветке `refactor/rector-v2-architecture`. Приведённые результаты относятся к исходникам, зафиксированным в `source-manifest.json`.
