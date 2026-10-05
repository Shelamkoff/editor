# Rector v2 — отступы исходников и повторная сверка, 06.10.2026

Проход начат 05.10.2026; окончательные gates и отчёт завершены 06.10.2026. Имя папки доказательств сохраняет дату начала.

Продолжение [предыдущего прохода](RECTOR_V2_PANEL_CONTINUATIONS_2026-10-05.md) на базе `4138e601e144e2a8f68712248728a1fac2cb61df`, ветка `refactor/rector-v2-architecture`.

## Найденная ошибка

В Code и Raw HTML выделение `Alpha\nBravo\n` заканчивается в начале строки `Charlie`. Tab добавлял отступ перед `Charlie`, хотя строка не выбрана. При пустой следующей строке он также добавлял туда пробелы. Это меняло содержимое вне строк, затронутых выделением.

Общий `plugins/shared/indentTextarea.js` теперь исключает конечный перевод строки из заменяемого фрагмента и возвращает его в сохранённый диапазон. Выбранный newline остаётся выбранным, следующая строка не получает отступ. Сохраняются направление диапазона, текущая семантика расширения multiline selection до начала первой строки, ввод Tab в каретку и замена single-line selection. Ширина отступа Code — 4, Raw — 2.

Исправление относится к общему помощнику двух плагинов. Оба вызывают его через `context.commitDomMutation`; ядро снимает bookmark до/после DOM-операции и сохраняет одну каноническую транзакцию с историей. Второго механизма истории, веток ядра по типам блоков, нового формата данных или API не добавлено. Публичные JSON/envelope и типы сохранены.

## TDD и v1

[Red](test-results/refactor-source-indentation-2026-10-05/indent-boundary-red.log) воспроизводит реальным Tab лишний отступ в `Charlie`. [Green](test-results/refactor-source-indentation-2026-10-05/indent-boundary-green.log) проверяет те же сохранённые данные, caret/range и native Undo/Redo после исправления. Использованы [TDD](.agents/skills/tdd/SKILL.md) и [Modern JavaScript](.agents/skills/modern-javascript-patterns/SKILL.md).

[Четыре native-сценария v1](test-results/refactor-source-indentation-2026-10-05/v1-indentation.log) на `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340` подтвердили ошибку в Code/Raw при forward и backward selection. v1 также меняет backward direction на forward; v2 сохраняет направление. Ошибку вне выделенных строк не закрепляем ради буквального воспроизведения старого поведения.

[240 JS/CSS v1](test-results/refactor-source-indentation-2026-10-05/v1-source-snapshot.json) повторно сверены с Git с нормализацией LF/CRLF; byte hashes записаны раздельно. Исторический runtime остаётся внешним proof, отсутствует в production imports и в штатной матрице v2.

## Новые native-проверки

[50 сценариев](test-results/refactor-source-indentation-2026-10-05/indent-ranges-green.log) включены в общий runner и повторены в окончательном проходе:

- 32: Code/Raw × 8 видов выделения × оба направления. Диапазон до начала следующей строки, частичная первая строка, одна строка с newline, одна/две пустые строки, конечный newline, конец внутри строки и single-line replacement.
- 8: Tab → ввод X → два Undo и два Redo. Проверяется замена видимого диапазона и сохранение невыбранного хвоста.
- 8: Tab → Shift+Tab → последовательные Undo/Redo. Проверяются отдельные шаги истории и восстановление исходной каретки/диапазона.
- 2: Tab при collapsed caret, положение ввода и один шаг истории.

Public `blocks.focus` используется для setup зарегистрированного plain-text поля. Диапазоны создаёт настоящий Shift+Arrow; Tab, ввод и history приходят через собственный headless Chrome/CDP. Нет синтетических DOM keyboard events или видимых окон Chrome. Assertions проверяют весь committed JSON, соседние блоки, language, активное поле, offsets и direction. При чтении Undo не вызывается дополнительный focus.

## Повторная проверка архитектуры и паритета

Сверены C1/C2/C5/C6/C7 действующей [спецификации](RECTOR_V2_REMEDIATION_SPEC.md), границы `commitDomMutation`, регистрация document/auxiliary fields, путь DOM → canonical transaction → projection/history и штатный source audit. Изменение не обходит lifetime/authority guard и не возвращает legacy runtime, manager APIs или старые форматы.

Полная действующая матрица охватывает 21 блочный плагин и 12 default inline tools: core/native input/IME, caret, local/cross/backward selection, partial/cross conversion, grouping, author-field preservation, controls/settings/source/media, clipboard, read-only, lifecycle и дизайн обеих тем. Сохранены решения владельца: все авторские поля при преобразовании, один Code с выбранным текстом и отдельная Image Settings.

| Gate | Итог | Доказательство |
|---|---|---|
| TypeScript / Node | Оба TS проекта PASS; 436 PASS, 0 FAIL/skip | [TS](test-results/refactor-source-indentation-2026-10-05/typecheck.log), [Node](test-results/refactor-source-indentation-2026-10-05/node.log) |
| Native | 1572 PASS, 0 FAIL; 27 групп, включая 50 новых случаев | [Native](test-results/refactor-source-indentation-2026-10-05/native-all.log) |
| Browser / lifecycle | 24 страницы PASS; 21 sentinel, 0 retained; heap 12.58 MiB | [Browser](test-results/refactor-source-indentation-2026-10-05/browser.log), [Heap](test-results/refactor-source-indentation-2026-10-05/heap.log) |
| Package / types | 266 declarations, 0 diagnostics; import/Vite/Bundler/NodeNext PASS; 22 CSS; 6 consumer tests PASS | [Package](test-results/refactor-source-indentation-2026-10-05/package.log), [Consumers](test-results/refactor-source-indentation-2026-10-05/consumer-types.log) |
| Docs / locales | 47 RU/EN pairs, 94 README; contract/source/locale audits PASS | [Docs](test-results/refactor-source-indentation-2026-10-05/docs.log) |
| Demo / design | Production 123 страницы, 0 broken links; RU/EN обе темы, 0 missing assets; 29 свежих PNG | [Production](test-results/refactor-source-indentation-2026-10-05/docs-check.log), [Dev](test-results/refactor-source-indentation-2026-10-05/demo.log) |
| Bundle | Paragraph 4.1/40, default 13.7/64, full 87.9/96 KiB gzip PASS; core 86.1 KiB информационно по решению владельца | [Bundle](test-results/refactor-source-indentation-2026-10-05/bundle.log) |

Просмотрены свежие [RU кнопки перемещённого блока](test-results/refactor-source-indentation-2026-10-05/demo/moved-buttons-ru.png) и [RU межблочное преобразование в Image](test-results/refactor-source-indentation-2026-10-05/demo/cross-image-ru.png). Геометрия кнопок соответствует блоку; создаётся один целевой Image, невыбранный пункт списка сохранён. UI QA также повторяет локализованные tooltip/shortcut, уровни заголовка, меню преобразований вне тулбара, точечное преобразование через tune и объединение в Code.

[582 исходника](test-results/refactor-source-indentation-2026-10-05/source-snapshot.json) зафиксированы до окончательных gates и совпадают после них. [Summary](test-results/refactor-source-indentation-2026-10-05/verification-summary.json) пересчитывается из raw logs; [summarize.mjs](test-results/refactor-source-indentation-2026-10-05/summarize.mjs) проверяет counts, исторические observations и hashes. [Manifest](test-results/refactor-source-indentation-2026-10-05/source-manifest.json) связывает проверенные исходники, отчёты и доказательства по локальным байтам до Git normalization. [Команды воспроизведения](test-results/refactor-source-indentation-2026-10-05/README.md).

Это подтверждение указанной матрицы Chrome, а не доказательство отсутствия ошибок во всех возможных последовательностях и браузерах. Демо: [127.0.0.1:5173/ru/#demo](http://127.0.0.1:5173/ru/#demo).
