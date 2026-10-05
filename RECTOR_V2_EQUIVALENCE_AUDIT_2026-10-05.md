# Сверка эквивалентности преобразования и выделения — 2026-10-05

База: a1f1efa2458c5d7671150d6478a8639b73008514; ветка refactor/rector-v2-architecture. Исторический oracle v1: Git SHA 5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340. Продолжение [предыдущего прохода](RECTOR_V2_MOVE_CONVERSION_AUDIT_2026-10-05.md). Новая проверка выявила расхождения, которые прежние зелёные suites не покрывали.

## Что исправлено

| Расхождение | Результат |
|---|---|
| Межблочное приведение к уже совпадающему типу повторно импортировало нейтральный текст | Matching middle owner сохраняет исходные данные, параметры и ID. Matching endpoint сохраняет выбранные структурированные поля: List style/IDs, Checklist checked/IDs, Heading level, Quote caption. |
| Checklist оставлял выбранные пункты пустыми в остатке | List и Checklist используют общий чистый item slice; остаток содержит только невыделенные пункты/фрагменты с прежними параметрами. |
| После текстового преобразования терялись диапазон и конечная каретка | Как в v1, весь преобразованный текст остаётся логически выделен, toolbar доступен, native caret стоит в конце последнего выбранного поля. Форматирование и ввод используют весь диапазон. Undo/Redo возвращают содержимое и диапазон. |
| Следующее преобразование без нового выделения меняло только последний блок | Оба меню сохраняют логический bookmark до mouse down; повторная команда охватывает весь сохранённый интервал. Undo восстанавливает выделение и конечную каретку первой команды. |
| Undo → Code оставлял состояние старого rich-text выделения | Переход к одиночной цели явно снимает логический range/selectedIds; Code получает собственную начальную каретку, старый toolbar исчезает. Ошибка впервые обнаружена в production-демо, затем воспроизведена отдельной native fixture. |
| Выбор текущего типа при локальном выделении делил блок или сбрасывал параметры | Без явной конфигурации это no-op: данные, выделение, revision и история не меняются. Whole conversion с явной toolbox-конфигурацией сохраняет остальные авторские поля. |
| Accessor selectionMode наблюдался дважды | Реестр читает его один раз и фиксирует результат в неизменяемом capability snapshot. |

По прямому решению владельца **межблочное преобразование в Code создаёт один блок со всем выбранным текстом**. Авторский HTML декодируется, HTML-сущности и переносы сохраняются как текст; существующий literal Code не интерпретируется как HTML. Невыделенные края остаются исходными блоками. Один Undo возвращает весь исходный документ. Если Code не может сохранить выбранный внутристрочный виджет, операция отклоняется до изменения данных и истории.

Это согласованное отличие от v1: исторический Code создавал один пустой блок и терял выбранный текст. Предыдущее решение сохранять все авторские поля при whole conversion в текст также остаётся в силе.

## Сравнение с v1 и TDD

[Внешний probe v1](test-results/refactor-equivalence-2026-10-05/v1-oracle.log): восемь trusted-input сценариев Heading/List/Code/Raw × forward/backward. Он непосредственно подтверждает группировку целей, сохранённое выделение и конечную каретку текстовых преобразований. У v1 Code/Raw после исчезновения подсветки оставался stale CSS class; этот дефект не перенесён. Исходники v1 временно извлечены в исключённую папку доказательств; не входят в коммит, dist, исполняемую матрицу v2 или import graph новой архитектуры.

Добавлены **53 native cases**: matching middle metadata (16), endpoint List/Checklist (8), retained range + formatting/history (4), joined Code (4), typing (4), inline-widget rejection (4), literal source Code (1), local no-op (4), repeated conversion (4), Undo → plain target (4). Проверяются оба меню и оба направления там, где это влияет на поведение. Четыре Node-теста фиксируют registry snapshot, optional join hook и same-type/no-op конфигурацию.

Red до соответствующих исправлений:

- [matching owner](test-results/refactor-equivalence-2026-10-05/same-type-red.log), [Checklist остаток](test-results/refactor-equivalence-2026-10-05/checklist-residual-red.log).
- [сохранённое выделение](test-results/refactor-equivalence-2026-10-05/converted-selection-red.log), [один Code](test-results/refactor-equivalence-2026-10-05/joined-code-red.log).
- [same-type no-op](test-results/refactor-equivalence-2026-10-05/same-type-noop-red.log), [локальное выделение](test-results/refactor-equivalence-2026-10-05/local-noop-red.log).
- [повторная команда](test-results/refactor-equivalence-2026-10-05/repeated-conversion-red.log), [Undo → Code](test-results/refactor-equivalence-2026-10-05/plain-target-red.log).
- [accessor](test-results/refactor-equivalence-2026-10-05/registry-accessor-red.log), [join contract](test-results/refactor-equivalence-2026-10-05/join-contract-red.log).

Финальный green всех новых и прежних cases: [native-all.log](test-results/refactor-equivalence-2026-10-05/native-all.log), [node.log](test-results/refactor-equivalence-2026-10-05/node.log). Команды повторения и focused green — в [README доказательств](test-results/refactor-equivalence-2026-10-05/README.md). Использован [TDD skill](.agents/skills/tdd/SKILL.md): сначала наблюдаемый отказ публичного поведения, затем исправление, адресный повтор и общие gates.

## Проверки окончательного кода

| Gate | Результат | Доказательство |
|---|---|---|
| TypeScript / Node | Оба проекта PASS; 436 PASS, 0 FAIL/skip | [typecheck](test-results/refactor-equivalence-2026-10-05/typecheck.log), [node](test-results/refactor-equivalence-2026-10-05/node.log) |
| Trusted native input | 1203 PASS, 0 FAIL; 20 групп ядра/плагинов, включая 53 новых случая | [native](test-results/refactor-equivalence-2026-10-05/native-all.log) |
| Browser CLI | 24 страницы PASS | [browser](test-results/refactor-equivalence-2026-10-05/browser.log) |
| Heap | 21 sentinel, 0 retained; usedHeap 12.58 MiB | [heap](test-results/refactor-equivalence-2026-10-05/heap.log) |
| Build / consumer types | 266 declarations, 0 diagnostics; 6 PASS | [build](test-results/refactor-equivalence-2026-10-05/build.log), [types](test-results/refactor-equivalence-2026-10-05/consumer-types.log) |
| Package | Checkout tarball, импорт, Vite, Bundler/NodeNext, 22 CSS PASS | [package](test-results/refactor-equivalence-2026-10-05/package.log) |
| Source / locales / docs | 47 EN/RU pairs; 94 README, 53 examples, 44 JSON, 62 links, 92 package copies PASS | [docs](test-results/refactor-equivalence-2026-10-05/docs.log) |
| Production docs/demo | 123 pages, 0 broken links/missing assets; RU/EN trusted QA PASS | [production](test-results/refactor-equivalence-2026-10-05/docs-check.log) |
| Dev demo | RU/EN trusted QA; 29 PNG; четыре новых снимка диапазона/Code просмотрены | [demo](test-results/refactor-equivalence-2026-10-05/demo.log) |
| Bundle budgets | Paragraph 4.1/40, defaultInteractive 13.5/64, fullPreset 87.9/96 KiB gzip PASS; core 85.8 KiB — информационно по решению владельца | [bundle](test-results/refactor-equivalence-2026-10-05/bundle.log) |

Повторены все группы ядра и [матрица каждого из 21 плагинов](RECTOR_V2_PLUGIN_PARITY_2026-10-04.md): поля, переходы каретки, локальные/межблочные диапазоны, преобразование всех целей, clipboard, controls/settings, sources/media, read-only, lifecycle и дизайн. 12 стандартных inline tools проходят trusted-input suite. IME проверяется через protocol движка Chrome. Настоящее демо RU/EN дополнительно проверяет Move/геометрию кнопок, частичный тюн, cross Image, retained range, одну цель Code, Undo/Redo, локализованные tooltips, меню, поиск/Align и отдельные media settings в обеих темах.

Снимки действующего демо: [диапазон RU](test-results/refactor-equivalence-2026-10-05/demo/converted-range-ru.png), [один Code RU](test-results/refactor-equivalence-2026-10-05/demo/joined-code-ru.png), [диапазон EN](test-results/refactor-equivalence-2026-10-05/demo/converted-range-en.png), [один Code EN](test-results/refactor-equivalence-2026-10-05/demo/joined-code-en.png). Результаты и хеши — в [verification-summary.json](test-results/refactor-equivalence-2026-10-05/verification-summary.json).

Перед последним общим native-прогоном зафиксированы SHA-256 **568 исходников** runtime/CSS/types/docs/fixtures/scripts; после итоговых проверок все совпали с [снимком](test-results/refactor-equivalence-2026-10-05/source-snapshot.json). [Manifest](test-results/refactor-equivalence-2026-10-05/source-manifest.json) содержит хеши исходников, логов и 29 PNG. После пройденных Node/TypeScript/build/package/docs gates изменялись только native fixtures: устаревшие ожидания List/Checklist и ожидание завершения Undo-анимации перед измерением клика. Product code и документы контрактов оставались теми же; финальная native-матрица проверяет уже окончательные fixtures. Контрольные суммы относятся к локальным байтам до нормализации LF/CRLF в Git.

Первый общий запуск одновременно пересобирал dist в npm test и package gate и получил конфликт временных файлов; окончательный запуск выполнялся последовательно. Новая Node fixture, случайно требовавшая DOM для pure model теста, исправлена на plain-text контракт. Промежуточный green без настройки inline tools также не был доказательством проверки форматирования. Четыре старых Checklist assertions сохраняли выбранные пункты пустыми в остатке: они приведены к удалению потреблённых пунктов, уже принятому в Clipboard slice и новых endpoint tests; [адресный повтор](test-results/refactor-equivalence-2026-10-05/checklist-range-green.log) содержит 8 PASS. Отдельный устаревший native assertion ожидал начало List: он исправлен на подтверждённый v1 конец фрагмента. В новом сценарии Undo → Code координата клика измерялась во время 350 ms removal animation; [диагностика](test-results/refactor-equivalence-2026-10-05/animation-click-diagnostic-1.log) зафиксировала смещение кнопки на 62 px между измерением и доставкой события. Fixture ждёт фактическое завершение конечных анимаций, затем измеряет координаты; hit/selection/caret assertions сохранены. Эти отказы не выдаются за продуктовые исправления или финальный PASS.

## Архитектура и пределы вывода

DocumentRuntime владеет атомарным преобразованием интервала, canonical records и проверкой inline references до commit. Плагины владеют формой данных, slicing пунктов и политикой агрегации Code. Optional conversion.joinSelection получает отделённые payloads и явный ownerDocument; реестр фиксирует метод. Ядро не перечисляет имена встроенных плагинов.

Общий conversionSelection разрешает bookmark по фактически смонтированным полям. SelectionController владеет логическим диапазоном и отличает сохранённую конечную каретку от обычного перемещения. История использует тот же selection port. Это продолжение существующего command/runtime, без второго редактора, v1 manager или compatibility path.

Подтверждена перечисленная функциональная матрица на Chrome и исправлены найденные расхождения. Зелёные gates не доказывают эквивалентность всех возможных комбинаций и отсутствие любых ошибок. Firefox/Safari, конкретные системные IME и серверы внешних загрузчиков не проверены этим локальным окружением. Демо: [http://127.0.0.1:5173/ru/#demo](http://127.0.0.1:5173/ru/#demo).
