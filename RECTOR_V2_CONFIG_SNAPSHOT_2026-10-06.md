# Rector v2 — захват настроек и повторная проверка паритета, 06.10.2026

Продолжение: [Poll, каретка и повторная проверка паритета от 06.10.2026](RECTOR_V2_POLL_RUNTIME_2026-10-06.md). Числа этого отчёта относятся к предыдущему срезу.

Продолжение [предыдущего прохода](RECTOR_V2_SOURCE_MODES_AND_STYLES_2026-10-06.md) на базе `fc95610d25dab56b125db686458bdd7ff190c769`, ветка `refactor/rector-v2-architecture`.

## Исправления

1. `definitionStyles`, Paragraph и шесть фабрик повторно читали свойства настроек с функцией чтения. Проверка и фактическое значение могли расходиться; второе чтение могло выбросить ошибку. Собственные перечисляемые свойства верхнего объекта теперь захватываются один раз, проверки используют захваченные значения. Унаследованные параметры не читаются, как при копировании настроек в v1.
2. У Image, Embed, Attaches, Gallery, Carousel и Person неизменяемый массив продолжал содержать исходные изменяемые записи приложения. После создания определения приложение могло заменить подпись или обработчик действия, либо правило/иконку социальной ссылки. Фабрики теперь владеют отдельными неизменяемыми записями. Пользовательские объекты остаются изменяемыми.
3. Асинхронный preset дважды читал выбранную запись карты настроек. Кроме того, записи действий и социальных правил копировались только после ожидания импорта. Загрузчик теперь захватывает запрошенную запись один раз и фиксирует поддерживаемые списки до динамического импорта. Незатребованные записи не читаются; порядок и устранение повторов сохранены.
4. Дополнительная проверка обнаружила регрессию первого варианта копирования записей: свойства и обработчики экземпляров классов пропадали. Используемые поля теперь захватываются также из неперечисляемых свойств и прототипа, а метод вызывается с исходным объектом `this`. Сохраняется захваченная реализация метода, включая работу с приватными полями. Первый вариант не принят как окончательный.

Изменения находятся в фабриках и внутреннем модуле `plugins/shared/configRecords.js`, а также в async loader. C5 [действующей спецификации](RECTOR_V2_REMEDIATION_SPEC.md) сохраняет единственное владение определениями и отдельные ресурсы каждого редактора. Метаданные/ссылки вызова фиксируются; произвольное состояние приложения внутри обработчика не клонируется. `RegExp` сохраняет идентичность и прежнее поведение. Новые JSON/API, ветки ядра по типам плагинов, legacy aliases или второй engine выделения/истории не добавлены. Ядро в этом проходе проверено без изменения исходников.

RU/EN документация описывает владение настройками, поддерживаемые формы записей и момент захвата при ленивой загрузке.

## TDD и v1

Использованы [TDD](.agents/skills/tdd/SKILL.md) и [Modern JavaScript](.agents/skills/modern-javascript-patterns/SKILL.md).

| Ошибка | До исправления | После исправления |
|---|---|---|
| Повторное чтение style getters | [Raw Red](test-results/refactor-config-snapshot-2026-10-06/style-getter-red.log), [15 падений матрицы](test-results/refactor-config-snapshot-2026-10-06/config-matrix-red.log) | [Raw Green](test-results/refactor-config-snapshot-2026-10-06/style-getter-green.log), [58 PASS](test-results/refactor-config-snapshot-2026-10-06/config-complete-green.log) |
| Повторное чтение async config entry | [два падения](test-results/refactor-config-snapshot-2026-10-06/async-config-red.log) | [58 PASS](test-results/refactor-config-snapshot-2026-10-06/config-complete-green.log) |
| Изменение существующих действий/социальных правил | [Red](test-results/refactor-config-snapshot-2026-10-06/record-matrix-red.log) | [Green](test-results/refactor-config-snapshot-2026-10-06/record-matrix-green.log) |
| Записи изменяются во время dynamic import | [Red](test-results/refactor-config-snapshot-2026-10-06/async-record-red.log) | [Green](test-results/refactor-config-snapshot-2026-10-06/async-record-green.log) |
| Потеря prototype/getter records и исходного receiver | [12 падений](test-results/refactor-config-snapshot-2026-10-06/record-methods-red.log) | [те же 12 PASS](test-results/refactor-config-snapshot-2026-10-06/record-methods-green.log) |

[30 новых native-сценариев](test-results/refactor-config-snapshot-2026-10-06/native-config-matrix.log) проверяют реальные клики, ввод и Ctrl+Z/Ctrl+Shift+Z: действия пяти media/source плагинов, правила Person, sync/async capture, методы классов с приватными полями, однократное чтение свойств, два независимых редактора с одним определением, отдельные сигналы задач и работа второго редактора после destroy первого. Paragraph проверен после обновления соседнего блока: выделение остаётся в исходном поле, ввод заменяет только выбранный фрагмент, Undo восстанавливает диапазон. Assertions сравнивают committed JSON и соседние блоки, а не только наличие кнопки.

[27 наблюдений публичного config-контракта v1](test-results/refactor-config-snapshot-2026-10-06/v1-config.log): все 21 конструктора читают собственные getters один раз; шесть списков сохраняли ссылки на исходные записи приложения. Последнее явно зафиксировано как отличие владения v1 от C5 v2, а не выдано за прежнюю неизменяемость. Историческая версия `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340`; [240 JS/CSS](test-results/refactor-config-snapshot-2026-10-06/v1-source-snapshot.json) повторно сверены с Git, с нормализацией LF/CRLF. v1 используется только внешним oracle, не импортируется production.

## Окончательные проверки

Повторена полная текущая матрица 21 блочного плагина и 12 default inline tools: ввод/IME, каретка, локальное/межполевое/межблочное прямое и обратное выделение, частичные и межблочные преобразования, clipboard, настройки/source/media, read-only, lifetime и дизайн обеих тем. Сохранены решения владельца: все авторские поля при преобразовании, один Code с выбранным текстом и отдельная кнопка Image Settings.

| Gate | Итог | Доказательство |
|---|---|---|
| Types / Node | Два TS проекта PASS; 536 PASS, 0 FAIL/skip | [typecheck.log](test-results/refactor-config-snapshot-2026-10-06/typecheck.log), [node.log](test-results/refactor-config-snapshot-2026-10-06/node.log) |
| Native input | 1663 PASS, 0 FAIL; 29 групп, включая новые 30 | [native-all.log](test-results/refactor-config-snapshot-2026-10-06/native-all.log) |
| Browser / lifecycle | 25 страниц PASS; 21 sentinel, 0 retained; heap 12.6 MiB | [browser.log](test-results/refactor-config-snapshot-2026-10-06/browser.log), [heap.log](test-results/refactor-config-snapshot-2026-10-06/heap.log) |
| Package / consumer types | 268 declarations, 0 diagnostics; import/Vite/Bundler/NodeNext PASS; 22 CSS; 6 consumer tests PASS | [package.log](test-results/refactor-config-snapshot-2026-10-06/package.log), [consumer-types.log](test-results/refactor-config-snapshot-2026-10-06/consumer-types.log) |
| Docs / locales | 47 RU/EN pairs, 94 README; content/source/locale/contract checks PASS | [docs.log](test-results/refactor-config-snapshot-2026-10-06/docs.log) |
| Demo / design | 123 production pages, 0 broken links; RU/EN, light/dark, 0 missing assets; 29 PNG | [docs-check.log](test-results/refactor-config-snapshot-2026-10-06/docs-check.log), [demo.log](test-results/refactor-config-snapshot-2026-10-06/demo.log) |
| Bundle | Paragraph 4.1/40, default 13.7/64, full 88.3/96 KiB gzip PASS; core 86.1 KiB информационно по решению владельца | [bundle.log](test-results/refactor-config-snapshot-2026-10-06/bundle.log) |

Свежая UI QA повторяет локализованные tooltip/shortcut, menu вне тулбара, кнопки перемещённого блока, fragment conversion, один Image при cross conversion и один Code с выбранным текстом. Просмотрены [RU tooltip в светлой теме](test-results/refactor-config-snapshot-2026-10-06/demo/tooltip-ru-light.png) и [кнопки перемещённого блока](test-results/refactor-config-snapshot-2026-10-06/demo/moved-buttons-ru.png).

Первый общий прогон сохранён как `*-before-methods.*`: первоначальные 1651 native cases прошли, но дополнительный class-record probe выявил 12 ошибок, после чего исправление и все gates повторены. Первая dev-demo попытка не открыла страницу из-за остановленного локального сервера; сервер запущен снова, окончательная dev/demo проверка прошла. Exploratory `async-config-initial-red.log` завершал assertion до наблюдения rejection; canonical `async-config-red.log` исправляет порядок проверки, ожидание результата не ослаблено.

[593 исходника](test-results/refactor-config-snapshot-2026-10-06/source-snapshot.json) зафиксированы до окончательных gates и совпадают после них. [Summary](test-results/refactor-config-snapshot-2026-10-06/verification-summary.json) вычислен из raw logs; [helper](test-results/refactor-config-snapshot-2026-10-06/summarize.mjs) проверяет все прежние native groups, новые counts, exit codes и hashes. [Manifest](test-results/refactor-config-snapshot-2026-10-06/source-manifest.json) связывает изменённые файлы, отчёт и доказательства по локальным байтам до нормализации Git. [Команды воспроизведения](test-results/refactor-config-snapshot-2026-10-06/README.md).

Подтверждена указанная матрица Chrome, включая фактический ввод через CDP. Это не доказывает отсутствие ошибок во всех последовательностях и браузерах; внешние upload providers и системные IME этой матрицей не охвачены. Видимые окна Chrome не открывались. Демо: [127.0.0.1:5173/ru/#demo](http://127.0.0.1:5173/ru/#demo).
