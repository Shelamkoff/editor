# Rector v2 — режимы исходников, владение CSS и повторная сверка, 06.10.2026

Продолжение [предыдущего прохода](RECTOR_V2_SOURCE_INDENTATION_2026-10-05.md) на базе `75c909ac621c74610b083b55170155cc0c72f389`, ветка `refactor/rector-v2-architecture`.

## Исправления

1. После Preview → исходник в Raw HTML фокус оставался на body или кнопке. Следующий native-ввод не попадал в видимое поле. Возврат из превью теперь фокусирует зарегистрированный textarea; offsets и направление выделения сохраняются. Переключение представления не меняет данные и историю. Ошибка подтверждена и в v1; Code в обеих версиях возвращает фокус корректно.
2. Heading, List, Quote, Checklist, Warning, Raw, Toggle, Columns, Spoiler, Delimiter и Table игнорировали документированные параметры `injectStyles`/`css`. В v1 их поддерживало общее основание плагинов. Теперь 11 фабрик принимают эти параметры через общий внутренний `plugins/shared/definitionStyles.js`; default URL сохранены, custom URL добавляется или заменяет встроенные при `injectStyles: false`. Итоговые URL immutable, caller-owned config не замораживается. Реестр редактора по-прежнему владеет загрузкой и reference counting; дополнительного CSS runtime или правил ядра по типам не добавлено.
3. `validate-extension-readmes.mjs` перехватывал ошибки содержимого README вместе с отсутствием файлов. Gate сообщал PASS при удалённом обязательном разделе и незакрытом code fence. Теперь только отсутствие обеих локалей допустимо для runtime-only каталогов; ошибки чтения, неполная пара и ошибки содержимого передаются вызывающему процессу. Проверка принимает типизированные записи параметров и вызовы фабрик, отклоняет удалённые class/mutation contracts.

Приведены к текущей архитектуре 42 README блочных плагинов: фабрики вместо классов, canonical transactions и зарегистрированные поля вместо удалённого `context.mutate()`. Убрано обещание class aliases Carousel. Color/Mention показывают обязательный `dataVersion: 1`, текущую фабрику renderer и владение экземплярами; Color разделяет стили и вывод документа. RU/EN копии VitePress синхронизированы. Строгая проверка также поймала непереведённое слово в RU README; оно исправлено до окончательных gates.

## TDD и сравнение с v1

Использованы [TDD](.agents/skills/tdd/SKILL.md) и [Modern JavaScript](.agents/skills/modern-javascript-patterns/SKILL.md). Для HTML-фокуса: [Red](test-results/refactor-source-modes-2026-10-06/source-modes-red.log) → [тот же Green](test-results/refactor-source-modes-2026-10-06/source-modes-green.log) → [61 сценарий](test-results/refactor-source-modes-2026-10-06/source-modes-matrix.log). Для CSS: [22 падения из 42](test-results/refactor-source-modes-2026-10-06/style-ownership-red.log) → [42 PASS](test-results/refactor-source-modes-2026-10-06/style-ownership-green.log). Для README: [две ошибки ошибочно приняты](test-results/refactor-source-modes-2026-10-06/readme-validation-red.log) → [три ошибки отклонены](test-results/refactor-source-modes-2026-10-06/readme-validation-green.log); probe восстанавливает исходник в `finally`.

[Восемь сценариев Code/Raw v1](test-results/refactor-source-modes-2026-10-06/v1-source-modes.log) проверены через native mouse/Space при обоих направлениях диапазона. [Три CSS-сценария v1](test-results/refactor-source-modes-2026-10-06/v1-style-ownership.log) проверяют отключение, замену и дополнение стилей всех 21 плагина. Историческая версия — `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340`; [240 JS/CSS](test-results/refactor-source-modes-2026-10-06/v1-source-snapshot.json) повторно сверены с Git с нормализацией LF/CRLF. Runtime v1 используется только во внешнем proof, не импортируется production или штатной матрицей v2.

Новые 61 native-сценарий проверяют start/second-line caret, local/multiline forward/backward range, Preview/Done → edit → ввод → Undo/Redo, Escape/Ctrl+Enter у Code, reopening через кнопку/подсвеченный исходник, read-only → editing, RU/dark и EN/light. Использованы реальные CDP keyboard/mouse events в собственном headless Chrome. Для setup — public `blocks.focus` и фокус публичной кнопки перед Space; диапазоны создаёт Shift+Arrow. Assertions сравнивают весь committed JSON, соседние блоки, язык кода, active element, offsets, direction и отсутствие лишней истории.

[63 браузерных CSS-сценария](test-results/refactor-source-modes-2026-10-06/style-ownership-browser.log) проверяют каждый плагин: disabled built-in styles, replace/append custom CSS, его применение в computed style, совместное владение двумя редакторами и очистку после последнего destroy. Использован один локальный stylesheet без внешнего сетевого сервиса.

## Окончательная проверка

Повторена текущая матрица 21 block plugin и 12 default inline tools: ядро, native input/IME, caret, local/cross/backward selection, partial/cross conversion, grouping, сохранение авторских полей, продолжение действий, настройки/source/media, clipboard, read-only, lifetime/heap и обе темы. Решения владельца сохранены: все авторские поля при преобразовании, один Code с выбранным текстом, отдельная кнопка Image Settings.

Изменения согласованы с C1/C5/C6/C7 [действующей спецификации](RECTOR_V2_REMEDIATION_SPEC.md): focus относится к UI плагина, native input и история остаются у единственного canonical engine; CSS URLs входят в immutable definition и приобретает их existing registry. Новый формат данных, legacy aliases, private-core imports или дополнительный selection/history engine не вводились.

| Gate | Итог | Доказательство |
|---|---|---|
| Types / Node | Два TS проекта PASS; 478 PASS, 0 FAIL/skip | [typecheck.log](test-results/refactor-source-modes-2026-10-06/typecheck.log), [node.log](test-results/refactor-source-modes-2026-10-06/node.log) |
| Native | 1633 PASS, 0 FAIL; 28 групп | [native-all.log](test-results/refactor-source-modes-2026-10-06/native-all.log) |
| Browser / lifecycle | 25 страниц PASS; 21 sentinel, 0 retained; heap 12.59 MiB | [browser.log](test-results/refactor-source-modes-2026-10-06/browser.log), [heap.log](test-results/refactor-source-modes-2026-10-06/heap.log) |
| Package / consumer types | 267 declarations, 0 diagnostics; import/Vite/Bundler/NodeNext PASS; 22 CSS; 6 consumer tests PASS | [package.log](test-results/refactor-source-modes-2026-10-06/package.log), [consumer-types.log](test-results/refactor-source-modes-2026-10-06/consumer-types.log) |
| Docs / locales | 47 RU/EN pairs, 94 README; строгие content/source/locale/contract checks PASS | [docs.log](test-results/refactor-source-modes-2026-10-06/docs.log) |
| Demo / design | 123 production pages, 0 broken links; RU/EN, light/dark, 0 missing assets; 29 PNG | [docs-check.log](test-results/refactor-source-modes-2026-10-06/docs-check.log), [demo.log](test-results/refactor-source-modes-2026-10-06/demo.log) |
| Bundle | Paragraph 4.1/40, default 13.7/64, full 88/96 KiB gzip PASS; core 86.1 KiB информационно по решению владельца | [bundle.log](test-results/refactor-source-modes-2026-10-06/bundle.log) |

Просмотрены свежие [RU меню преобразования](test-results/refactor-source-modes-2026-10-06/demo/conversion-ru-dark.png) и [RU уровни заголовка](test-results/refactor-source-modes-2026-10-06/demo/heading-ru-dark.png). Полная UI QA повторяет tooltip/shortcut на выбранном языке, menu вне тулбара, кнопки перемещённого блока, fragment conversion, один Image при cross conversion и один Code с выбранным текстом.

[589 исходников](test-results/refactor-source-modes-2026-10-06/source-snapshot.json) зафиксированы до окончательных gates и совпадают после них. [Summary](test-results/refactor-source-modes-2026-10-06/verification-summary.json) пересчитывается из raw logs; [summarize.mjs](test-results/refactor-source-modes-2026-10-06/summarize.mjs) проверяет counts и hashes. [Manifest](test-results/refactor-source-modes-2026-10-06/source-manifest.json) связывает проверенные исходники, отчёт и доказательства по локальным байтам до Git normalization. [Команды воспроизведения](test-results/refactor-source-modes-2026-10-06/README.md).

Подтверждена указанная матрица Chrome; это не доказательство отсутствия ошибок во всех последовательностях и браузерах. Демо: [127.0.0.1:5173/ru/#demo](http://127.0.0.1:5173/ru/#demo).
