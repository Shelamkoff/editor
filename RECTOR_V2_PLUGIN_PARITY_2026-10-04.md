# Сверка встроенных плагинов Rector v1 → v2 — 2026-10-04

Актуальный проход: [отступы исходников, выделение и паритет от 06.10.2026](RECTOR_V2_SOURCE_INDENTATION_2026-10-05.md). Числа ниже относятся к предыдущему срезу.

Актуальное продолжение: [проверка составных команд и паритета от 05.10.2026](RECTOR_V2_OBSERVER_AUDIT_2026-10-05.md). Таблицы и числа этого отчёта описывают предыдущий срез; матрица повторно проверяется после новых исправлений.

Последнее продолжение [05.10.2026](RECTOR_V2_FOLLOWUP_2026-10-05.md) исправляет partial mode rollback блоков/inline widgets и сохраняет каретку/выделение protected edits. Все suites поведения и дизайна плагинов повторно пройдены в общем прогоне 938 cases.

Актуальный итог — [повторная проверка 05.10.2026](RECTOR_V2_RECHECK_2026-10-05.md): исправлены resize/layer/Escape у media Settings, добавлено девять native cases и lifecycle открытых меню. Все возможности таблицы ниже повторно пройдены в общем прогоне 934 cases; прежние логи относятся к опубликованному checkpoint `4e5ba54`.

База: исходники v1 `master`, коммит `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340`. Проверяемая ветка: `refactor/rector-v2-architecture`, HEAD `eff8a06692e2f80d4c6c2e33abc1d626fa4ef1aa` с локальными исправлениями. Старый runtime в v2 не подключается. Итоговые результаты команд и границы приёмки — в [локальном отчёте](RECTOR_V2_LOCAL_VERIFICATION_2026-10-04.md).

Сравнение ведётся по пользовательскому результату: содержимому и marks, порядку, видимому действию настроек, направлению выделения, каретке, сохранению невыделенных полей и смысловым шагам истории. Новый JSON/API намеренно отличается. Таблица ниже описывает проверяемые возможности каждого плагина, а не только roundtrip его фабрики.

Последующая отдельная [сверка ядра](RECTOR_V2_CORE_PARITY_2026-10-04.md) обнаружила дополнительные ошибки shortcuts/selection/clipboard/caret и исправила их через TDD. Прежние 718 native cases расширены 45 core cases; актуальный общий результат приведён в локальном отчёте. Матрица плагинов не служит доказательством всех комбинаций поведения ядра.

## Матрица плагинов

| Плагин | Сверенные возможности и доказательства |
|---|---|
| Paragraph | Ввод/placeholder, локальные диапазоны, Enter/Shift+Enter, split/merge/exit, Backspace/Delete, форматирование/выравнивание, whole/partial/cross conversion. `native-text-input`, `native-structural`, `native-tools`, `native-cross-selection`, `native-plugin-parity/ranges`. |
| Heading | Всё текстовое + H2–H6, inline controls, Heading drill-down, localized placeholder, смена уровня при cross selection без потери диапазона. `native-block-menus`, `native-cross-selection`, `native-plugin-parity/ranges`. |
| List | Ordered/unordered, Enter в пункте, пустой middle/last item, выход в Paragraph, merge, partial item conversion, clipboard. Остаток остаётся одним списком с исходными IDs, цель вставляется после него, как v1 `splitConvert`. Native structural/ranges/local-ranges/clipboard, CLI `selection-convert`. |
| Quote | Text/caption, переходы Tab/Shift+Tab, переносы, направленное многополевое выделение, cross conversion/clipboard без утечки невыделенного текста. Whole conversion сохраняет подпись по решению владельца. Native parity/structural/ranges/local-ranges/clipboard. |
| Code | View/edit, Escape/Ctrl+Enter, Copy актуального значения, языки/поиск/подсветка, Tab/Shift+Tab и многострочная индентация по 4 пробела, scroll, plain-text → rich conversion без интерпретации HTML. Native plugin-parity, CLI lifecycle/renderer. |
| Image | Upload/URL/custom sources, Replace/Delete, caption, настройки/стили, read-only, async ownership, whole/partial/cross conversion. Native media/controls/ranges/local-ranges; CLI plugin-surfaces/lifecycle/TT. В v1 Image не имел crop: обрезка относится к Person. |
| Delimiter | Вставка, whole selection, Move up/down, Duplicate/Delete, Undo/Redo из блока без editing host, renderer/read-only. Native controls (все четыре общие команды именно на Delimiter), native text/IME opaque edges, CLI roundtrip. |
| Table | Ввод ячеек, Tab/Shift+Tab/Enter, header, добавление/удаление строк/столбцов, сохранение cell/row IDs, многополевые диапазоны, conversion/clipboard. Native plugin-parity/controls/ranges/local-ranges/clipboard. |
| Checklist | Checkbox как один шаг истории, Enter/split, empty item/exit, Backspace/merge, checked/IDs при conversion/clipboard. Native controls/structural/parity/ranges/local-ranges/clipboard. |
| Warning | Title/message, Enter/Tab/Shift+Tab, multiline, formatting, локальные/межблоковые преобразования и clipboard; untouched fields и one-step history. Native structural/parity/ranges/local-ranges/clipboard. |
| Embed | URL Enter/debounce/paste contract, видимый URL в filled mode, Replace, services/metadata, Settings title/duration и реальные overlays, Cover → Upload/URL/Remove/Back/custom source, Play в editor/read-only. Native media/parity/ranges/local-ranges; CLI service-registry/async cover ownership. |
| Raw | Source editing, Tab/Shift+Tab и многострочный отступ без стирания HTML, Ctrl+Enter/Escape, sandboxed preview iframe и размер, read-only, literal conversion. Native parity; CLI security/TT/renderer. |
| Gallery | Upload/URL/custom sources, captions, add/remove/reorder, все 21 layout с реальной геометрией, empty slots/overflow/masonry, визуальное Settings menu, options/styles, clipboard и partial conversion без дублирования assets. Native media/controls/parity/ranges/local-ranges/clipboard; CLI masonry/lifecycle/renderer. |
| Carousel | Image/video/HTML sources, add/remove/remove-all/reorder, active caption, arrows/dots/thumbs, styled navigation/counter, settings, loop/autoplay, read-only, source abort. Native media/controls/parity/ranges/local-ranges/clipboard; CLI carousel/renderer/lifecycle. Авторские данные не меняются от navigation/autoplay. |
| Attaches | Upload/URL/custom sources, имя файла, Delete, A/B/F/G и inline template chooser, expandable Card group, download links, read-only, clipboard/source abort. Native media/controls/parity; CLI URL/object-URL lifecycle/settings/renderer. |
| LinkPreview | Native URL input, Enter/paste/debounce, replacement metadata clearing и stale-request protection, все 7 templates и визуальные selectors, filled Delete/read-only. Native parity/controls; CLI metadata ownership/renderer. |
| Toggle | Title Enter → content/open, body multiline, chevron, merge, whole/partial/cross conversion/clipboard, раскрытие read-only без авторской истории. Native structural/parity/ranges/local-ranges/clipboard/media. |
| Columns | Layouts, rich fields, переносы, 3 → 2 с сохранением содержимого лишней колонки и retained IDs, partial/cross conversion/clipboard. Native controls/parity/ranges/local-ranges/clipboard. |
| Spoiler | Label Enter → content, multiline, reveal/hide, read-only presentation без истории, merge, conversion/clipboard. Native structural/parity/ranges/local-ranges/clipboard/media. |
| Poll | Rich question/options, Enter/Backspace transitions, add/remove/min 2, Sort, single/multiple, results modes, local voting/history, remote vote/reset/abort/revision/subscription, voter validation, marked text conversion. Native parity/controls/ranges/local-ranges/clipboard; CLI poll runtime/renderer. |
| Person | Tabs/add/remove/native reorder, hidden editing hosts после смены таба, avatar upload/crop Apply/Cancel, single-line name/role, multiline bio, links/add/remove/resolvers, text conversion и clipboard. Native controls/parity/ranges/local-ranges/clipboard; CLI CSP/avatar/task ownership. |

На каждом из 21 плагинов нативно проверены Move up/down, Duplicate/Delete, сохранение данных/порядка/ID и один клавиатурный Undo/Redo. 34 авторских поля проверены настоящим вводом, локальной заменой, кареткой и соседними полями. Все 29 rich-text полей проверены как первый и последний конец межблокового диапазона в обоих направлениях (116 cases).

## Существенные исправления этого прохода

- Gallery снова применяет layout к реальной сетке: восстановлены шаблоны, пустые слоты, overflow и визуальное меню 21 варианта. Ключи унаследованного prototype не принимаются как layouts.
- Poll снова поддерживает rich-text вопрос/варианты, Sort и inline settings. Remote reset отзывает pending vote; изменение multiple → single приводит сохранённый local ballot и counts к новой семантике.
- Person восстановил native reorder, рабочий avatar crop, single-line name/role и редактирование новой пустой ссылки.
- Code восстановил клавиши view/edit, актуальный Copy, поиск языка, подсветку и multiline indent. Raw multiline Tab не заменяет всё выделение пробелами.
- LinkPreview восстанавливает все templates, URL debounce и удаляет metadata предыдущего URL при замене. Attaches сохраняет все четыре представления и inline chooser.
- Embed раньше фокусировал скрытое URL-поле при Replace, а Play не имел обработчика. Теперь URL видим, Play монтирует player, preview/title/duration не перехватывают взаимодействие; восстановлены Settings и Cover drill-down.
- Carousel восстановил counter, inline Settings и Remove all. Слушатели старой проекции отменяются отдельным view scope; media actions возвращают фокус для клавиатурного Undo/Redo.
- Partial conversion составного owner больше не дублирует его карточки/картинки/таблицу: остаётся один владелец с исходными IDs/assets и отдельная цель с выбранным текстом.
- Shift navigation поддерживает vertical/word/line boundaries и создание cross-block диапазона. Cross Enter выполняет атомарный split, а не случайный `<br>`.
- Block controls и меню оформлены и расположены согласно v1; drill-down и Heading placeholder больше не выводят склеенные варианты или `{level}`.

## Согласованное отличие от v1

Владелец выбрал сохранять авторские поля при whole conversion: подпись Quote, роль/биографию Person, варианты Poll включаются в текст, хотя v1 часть этих данных отбрасывал. Это закреплено в C2 [спецификации](RECTOR_V2_REMEDIATION_SPEC.md). Эти поля проверяются отдельно от частичной конвертации: выделение не должно захватить или удалить невыбранный текст.

## Метод и границы доказательства

Стенды используют текущие схемы и независимые ожидаемые результаты из поведения/исходников v1. Старый код не импортируется в v2. Настоящие CDP mouse/key/clipboard events и `isTrusted` отделены от синтетических contract/failure fixtures. Проверяются save, DOM-эффект, focus/caret, untouched payload и атомарная история, а не только наличие настройки в JSON.

Физический IME конкретной ОС не проверен: девять cases используют настоящий composition engine Chrome. Для Person тест подставляет File в системный chooser, затем выполняет настоящий crop dialog/canvas/upload; ручной OS chooser не является проверенным результатом. Embed проверяет монтирование безопасного provider iframe и доступность слоя проигрывателя, но не доступность внешнего YouTube/Vimeo. Native drop использует disposable File/DataTransfer, сохраняя фактический путь плагина и загрузочного сервиса. Firefox/WebKit не являются release-supported движками без собственных native gates.

Матрица подтверждает перечисленные возможности в поддерживаемом Chrome. Она не утверждает отсутствие всех возможных багов во всех сочетаниях данных, тем и внешних сервисов; статус полного закрытия спецификации не выводится из одного числа зелёных тестов.

## Повторная проверка поведения и дизайна — 2026-10-05

Матрица дополнена 68 native local Paste/Cut cases для всех 34 полей и 84 проверками дизайна (336 состояний всех 21 плагинов: filled/empty/read-only/empty-read-only × light/dark × 640/288 px). Это проверка CSS/геометрии и видимых состояний, а не автоматический pixel diff двух приложений. Отдельные native media cases проверяют открытые меню и реальное действие их controls.

Исправлено:

- Каретка после native Cut/Paste в Attaches filename и Person URL; clipboard не объединяется с предыдущим/следующим typing group в Code.
- `[hidden]` больше не переопределяется унаследованными display rules: empty/filled/read-only состояния Image и Embed отображаются корректно.
- Восстановлены иконки/ссылки media dropzones Image, Gallery, Carousel, Attaches; стили filled action buttons Image/Attaches.
- Image снова имеет inline Settings и Replace → Back/Upload/custom sources/URL. Gallery и Carousel снова имеют Add → Back/Upload/custom sources/URL (+ HTML для Carousel), как v1 `gallery/view-filled.js` и `CarouselBlock.#showAddView`.
- Raw textarea и Carousel/Poll actions не выходят за узкую ширину блока. Carousel source/main views сохраняют перенос controls.
- Миниатюрный Gallery asset не сжимает editing caption до одного пикселя; backward/forward cross ranges и их Undo/Redo сохраняют точные offsets. Кнопки overflow thumbnail не пересекаются друг с другом и caption.
- Открытые Image/Gallery/Carousel/Embed Settings помещаются в 320×500; учитываются anchor, menu gap и scrollbar width. Gallery switches оформлены и идут отдельными строками, поля не требуют горизонтальной прокрутки.
- Исправлены ключи настроек Image/Gallery/Carousel; locale audit теперь проверяет v2 runtimeContext.t и Label wrappers, а не только v1 _t/_p.
- Унаследованный v1 Raw preview был почти нечитаемым на тёмном фоне. Его sandbox iframe получил светлый canvas; исходный HTML, canonical data и opaque sandbox не менялись.

Red/green logs: `plugin-design-layout.log`, `plugin-design-states-red.log`, `image-settings-viewport-red/green.log`, `gallery-overflow-controls-red/green.log`, `media-add-drilldown-red/green.log`, `carousel-drilldown-layout-red/green.log`, `media-settings-layout-red/green.log`, `plugin-settings-locale-red/green.log`, `raw-preview-canvas-red/green.log`. Регрессия caption geometry после первой правки UI поймана общим прогоном и закрыта `gallery-caption-controls-green.log`; итоговый gate включает её без retries или ослабления offset assertions.

Снимки существующей вкладки Codex: [Gallery drill-down](test-results/refactor-audit-2026-10-04/gallery-drilldown-current.jpg), [Gallery Settings](test-results/refactor-audit-2026-10-04/gallery-settings-current.jpg), [Carousel 288px drill-down](test-results/refactor-audit-2026-10-04/carousel-drilldown-current.jpg).
