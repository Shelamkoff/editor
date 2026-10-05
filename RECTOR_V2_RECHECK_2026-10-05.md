# Повторная проверка Rector v2 — 05.10.2026

Продолжение проверки: [следующая итерация 05.10.2026](RECTOR_V2_FOLLOWUP_2026-10-05.md) исправляет дополнительные границы commands/control recovery и точные selection bookmarks. Актуальный итог — 938 native cases и 421 Node tests. Числа ниже относятся к checkpoint `cf97ac6`.

Ветка: `refactor/rector-v2-architecture`. База этой итерации — опубликованный коммит `4e5ba54857844422827d6db74de88b370af3c772`. Результаты получены на локальных исправлениях поверх него; изменённые исходники и стенды перечислены с SHA-256 в [source-manifest.json](test-results/refactor-recheck-2026-10-05/source-manifest.json). Это локальный Windows/Chrome прогон, не CI исходного коммита.

Контракт v1 сверяется по локальному `master`, `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340`. Матрицы [ядра](RECTOR_V2_CORE_PARITY_2026-10-04.md) и [21 плагина](RECTOR_V2_PLUGIN_PARITY_2026-10-04.md) сохраняются; предыдущий итог из 925 native cases — исторический checkpoint в [отчёте 04.10](RECTOR_V2_LOCAL_VERIFICATION_2026-10-04.md). Нормативные требования — в [спецификации](RECTOR_V2_REMEDIATION_SPEC.md).

## Результат

Повторная проверка нашла реальные ошибки за пределами прежних сценариев открытых меню и восстановления проекции. Исправлены шесть групп дефектов ниже. Полный повторный прогон расширенной матрицы прошёл: 934 native cases, 419 Node tests, 24 браузерные страницы, сборка, декларации, package consumer и документация. Известных невыполненных требований в этой проверяемой матрице после исправлений нет.

Это подтверждает перечисленные возможности в Chrome/Chromium, а не отсутствие всех возможных багов. Принятое владельцем отличие сохраняется: whole conversion включает все авторские поля, в том числе Quote caption, Person role/bio и Poll options, которые v1 могла отбрасывать. Размер ядра не является блокирующим критерием.

## Найденные ошибки и исправления через TDD

Каждая red-запись воспроизводит дефект до исправления. FAIL в этих файлах ожидаем; green и итоговые gates проверяют исправленный результат. Native assertions не ослаблялись: проверяются реальные bounds/hit testing, доверенный ввод, canonical data, фокус и Undo/Redo.

| Дефект | Исправление и доказательство |
|---|---|
| Gallery Settings перекрывались соседним ранее сфокусированным блоком | Восстановлен слой открытой поверхности, как в v1 `gallery/view-filled.js`. Аналогичный пропущенный слой восстановлен в Carousel/Attaches; Embed также поднимает открытое меню. Native hit test действительно попадает в layout button, клик меняет layout, Undo/Redo сохраняют настройки. [layer red](test-results/refactor-recheck-2026-10-05/gallery-panel-layer-red.log), [green](test-results/refactor-recheck-2026-10-05/gallery-panel-layer-green.log). |
| Уже открытые Gallery/Image/Carousel/Embed Settings выходили за viewport после resize | Общий lifecycle positioner реагирует на resize/scroll и размер блока, ограничивает меню актуальным viewport. Проверяются resize 900×900 → 320×300/500 и положение всех пяти media-меню. RAF, listeners и ResizeObserver принадлежат projection signal. [Gallery red](test-results/refactor-recheck-2026-10-05/gallery-panel-resize-red.log), [расширенный red](test-results/refactor-recheck-2026-10-05/media-settings-expanded-red.log), [18 Settings cases green](test-results/refactor-recheck-2026-10-05/media-settings-expanded-green.log). |
| Escape не закрывал Gallery/Carousel/Attaches Settings сразу после открытия мышью | Кнопка Settings получает фокус при открытии: Escape обрабатывается меню, а не прежним caption/filename. Команда не создаёт document/history mutation. [Gallery red](test-results/refactor-recheck-2026-10-05/gallery-panel-escape-red.log), [green](test-results/refactor-recheck-2026-10-05/gallery-panel-escape-green.log); остальные случаи входят в расширенный Settings gate. |
| Невозможное восстановление protected DOM edit оставляло runtime здоровым | Вторая ошибка восстановления переводит runtime в failed. `save()` продолжает читать committed модель; последующие mutation producers не вызываются. AggregateError сохраняет обе причины. [red](test-results/refactor-recheck-2026-10-05/projection-recovery-red.log), [green](test-results/refactor-recheck-2026-10-05/projection-recovery-green.log). |
| Внутри protected DOM callback можно было выполнить отдельную persisted команду | Guard начинается до operation/read/encode. Вложенная команда отвергается до producer, исходная проекция восстанавливается, модель/revision/history остаются прежними. Следующая корректная операция и Undo работают. [red](test-results/refactor-recheck-2026-10-05/projection-reentry-red.log), [green](test-results/refactor-recheck-2026-10-05/projection-reentry-green.log). |
| Protected DOM callback мог сменить read-only посреди операции | `setReadOnly` проверяет тот же guard до изменения control state. Неудачная вложенная смена не меняет mode, модель или историю; обычная внешняя смена работает. [red](test-results/refactor-recheck-2026-10-05/projection-mode-reentry-red.log), [green](test-results/refactor-recheck-2026-10-05/projection-mode-reentry-green.log). |

Три архитектурных сценария дополнительно проходят через настоящий `createEditor`, смонтированный Paragraph и plugin context в `runtime-contracts.html`: nested write, nested read-only и read failure + recovery create failure. Node projector doubles используются только для точного fault injection на соответствующей границе; они не заменяют интеграционную проверку.

## Архитектурная проверка

Исправления сохраняют единственную committed модель и transaction/history authority. Protected projection edit не создаёт параллельную модель: после синхронного DOM callback считываются affected fields, выполняется schema normalization и один transaction commit. Recovery возвращает committed projection; при невозможном recovery новая persisted работа запрещена. Контракт описан в EN/RU commands/history и разделе 10.2 спецификации.

Новые media listeners не являются глобальным бессрочным сервисом: каждый positioner связан с projection AbortSignal и owner window. Открытые и повторно открытые Settings всех пяти плагинов проходят read-only → editable → destroy. Проверены listeners, observers, object URLs, styles и отсутствие retained panel nodes после GC. Plugin source/locale audit и runtime/declaration/package contracts прошли; старые классы/adapter в runtime не возвращались.

## Итоговые проверки

Логи находятся в `test-results/refactor-recheck-2026-10-05/`. Runtime JS/CSS/fixtures не менялись во время итоговых прогонов.

| Gate | Результат | Доказательство |
|---|---|---|
| `node --test` | 419 PASS, 0 FAIL/skip | [node-final.log](test-results/refactor-recheck-2026-10-05/node-final.log) |
| `npm run typecheck` | Оба проекта PASS | [typecheck-final.log](test-results/refactor-recheck-2026-10-05/typecheck-final.log) |
| `node tests/browser/run.mjs` | 24 страницы PASS, включая реальные protected-edit failures и media lifecycle | [browser-final.log](test-results/refactor-recheck-2026-10-05/browser-final.log) |
| `node tests/browser/physical-history.mjs` | 934 native PASS и physical Enter/toolbox/history scenarios; driver errors отсутствуют | [native-final.log](test-results/refactor-recheck-2026-10-05/native-final.log) |
| `node tests/browser/heap-gate.mjs` | 21 sentinel, 0 retained; used heap 12.46 MiB | [heap-final.log](test-results/refactor-recheck-2026-10-05/heap-final.log) |
| `npm run build` | 262 runtime declarations, 0 source diagnostics | [build-final.log](test-results/refactor-recheck-2026-10-05/build-final.log) |
| `npm run test:types` | 6 PASS, Bundler/NodeNext | [types-final.log](test-results/refactor-recheck-2026-10-05/types-final.log) |
| `npm run test:package` | Архив текущего checkout: native import, Bundler/NodeNext и Vite consumer PASS; CSS assets PASS | [package-final.log](test-results/refactor-recheck-2026-10-05/package-final.log) |
| `npm run test:docs` | Source/locales/contracts PASS; 47 EN/RU README pairs, 53 examples, 44 JSON и 62 links | [docs-contract-final.log](test-results/refactor-recheck-2026-10-05/docs-contract-final.log) |
| `npm run docs:check` | 123 HTML pages, 0 broken links/missing assets; демо, поиск и Mention smoke PASS | [docs-final.log](test-results/refactor-recheck-2026-10-05/docs-final.log) |

Native suites: core behavior 45, text input 42, tools 24, clipboard 7, IME 9, conversion 7, block menus 8, structural 21, cross selection 32, plugin parity 139, controls 141, cross ranges 116, local ranges 76, plugin clipboard 48, field clipboard 68, media 67, design 84. Последние 84 combinations включают 336 состояний: все 21 плагин × light/dark × 640/288 px × filled/empty/read-only/empty-read-only. Это проверка видимого состояния, CSS и геометрии, не pixel diff двух приложений.

`harness-contract.html` намеренно создаёт FAIL witnesses для проверки самого harness; его итог `correct: true`, runner exit 0. VitePress сообщает информационное предупреждение о размере chunks; build и smoke прошли.

## Ручная проверка и границы

Использована существующая вкладка Codex; новых окон Chrome не открывалось. Gallery Settings после resize до 320×500 остаются внутри экрана, имеют вертикальный scroll и закрываются Escape. В русском демо Shift+Down расширяет видимое выделение через Heading → Paragraph с Mention/Color → List. Клик «Текст» преобразует выбранные блоки, сохраняет текст/widgets, оставляет Quote/Warning без изменений; один Ctrl+Z возвращает исходные типы и выделение.

Снимки: [Gallery после resize](test-results/refactor-recheck-2026-10-05/gallery-settings-resized.jpg), [выделение после Undo преобразования](test-results/refactor-recheck-2026-10-05/cross-selection.jpg). Демо: [http://127.0.0.1:5173/ru/#demo](http://127.0.0.1:5173/ru/#demo).

Физический IME конкретной ОС, ручной системный file chooser, доступность удалённых media/upload providers и Firefox/WebKit не проверены этим прогоном. Native clipboard проверен в headless Chrome между независимыми редакторами; встроенный браузер используется для ручной геометрии/selection, а не как доказательство системного clipboard. Heap gate подтверждает очистку проверенного сценария, не всех возможных сторонних расширений.
