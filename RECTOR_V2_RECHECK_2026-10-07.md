# Повторный аудит Rector v2 — 2026-10-07

Перепроверка предыдущего полного аудита нашла дополнительные ошибки представления и границ мутации. Исправления внесены в текущую рабочую ветку `refactor/rector-v2-architecture`, HEAD `98d5233e43e242d618670e2104da95d79f1a559f`. Предыдущий отчёт описывает более ранний снимок; результаты этого прохода относятся к отдельному окончательному снимку исходников.

## Исправления

1. **Повторное открытие Person/Carousel.** После нескольких переходов на другую карточку или слайд и обратно JSON сохранял inline-пayload, но DOM показывал обычную подпись или placeholder вместо принадлежащего core виджета. `BlockReconciler` наблюдает замену зарегистрированных полей, обновляет их владельцев и проецирует canonical rich text до следующего отображения. Observer освобождается при уничтожении редактора. Документ и история не меняются от навигации.
2. **Режим чтения.** Image перерисовывал содержимое прежнего caption-host и терял виджет без изменения идентичности поля. Переключение режима теперь явно обновляет inline-проекцию. Poll также исключал вопрос из `editableFields()` в режиме чтения; вопрос теперь остаётся зарегистрированным для отображения и сериализации. Запрет authoring по-прежнему определяется runtime/read-only authority.
3. **Автозамена внутри упоминания.** `insertReplacementText` с явным диапазоном замены обходил обработчик при свёрнутой каретке. Принадлежащий подписи `getTargetRanges()` теперь определяет изменяемый текст, даже если каретка находится в префиксе или другом виджете. JSON, видимая подпись и один Undo/Redo согласованы.
4. **Чужие события ввода.** При восстановленном DOM-выделении внутри подписи обработчики упоминания и общий `InlineWidgetInputController` могли забрать событие служебного input. Проверяется владелец события, а native controls сохраняют ввод. Аналогичная проверка добавлена для клавиш и начала композиции упоминания. Обычный native ввод в input/textarea проверен отдельно.
5. **Повторный вход из callbacks проекции.** Создание нового inline-представления после навигации могло вызвать authoring producer или переключить read-only из callback. Общий внутренний `projectPresentation` guard запрещает plugin/host мутации до producer. Дополнительная проверка выявила второй незащищённый вызов `editableFields()` из `getEditableFields()`; core теперь возвращает уже зарегистрированный снимок полей.

Эти изменения не требуют знания встроенных типов в ядре и не добавляют публичного API или адаптеров старого формата.

## Дополнительные регрессии

`native-audit-recheck.html` содержит **49 случаев**:

- 29 rich-text полей встроенных плагинов: немедленные переключения read-only/editable с упоминанием, native ввод, сохранность соседних данных и один native Undo/Redo.
- 8 сценариев повторных переходов Person/Carousel в editable/read-only: сохранность JSON и восстановление виджета после возврата.
- 3 удаления карточки/слайда: удаляются только inline-payload соответствующего поля; скрытые зарегистрированные и opaque данные сохраняются, Undo/Redo точны.
- 2 native сценария ввода в input/textarea после ухода из упоминания.
- 7 синтетических контрактных случаев: 3 явных диапазона браузерной автозамены, 2 чужих beforeinput со восстановленным выделением и 2 проверки запрета повторного входа из plugin callbacks.

Это **42 случая с native жестами и 7 синтетических контрактов**. Автозамена проверена через `InputEvent`/`StaticRange`, не через OS spellchecker. Новая страница включена в общий physical runner. Предыдущие 29 регрессий повторно входят в полный прогон.

Дополнительно устранена нестабильность native oracle word deletion: он использует такой же inline-бокс без widget identity и ждёт загрузки стилей; `white-space: pre-wrap` проверяется явно. Строки сравниваются точно, без замены NBSP на обычный пробел. Все 21 сценарий страницы прошли три последовательных запуска; `browser-before-oracle-fix.log` сохранён как отрицательный диагностический прогон. Runtime-код от этого уточнения теста не изменился.

## Итоговая проверка

| Gate | Результат | Протокол |
|---|---|---|
| Node | 563 PASS, 0 FAIL, 0 skipped | [лог](C:/OSPanel/domains/editor/test-results/recheck-2026-10-07/node-complete.log) |
| TypeScript | 2 проекта, без ошибок | [лог](C:/OSPanel/domains/editor/test-results/recheck-2026-10-07/typecheck-complete.log) |
| Browser | 25 контрактных страниц; 1893 PASS / 39 native-групп, 0 FAIL | [лог](C:/OSPanel/domains/editor/test-results/recheck-2026-10-07/browser-complete.log) |
| Heap/lifecycle | 21 sentinel-объект; retained=0; heap 12.79 MiB | [лог](C:/OSPanel/domains/editor/test-results/recheck-2026-10-07/browser-complete.log) |
| npm package | Archive/import/Vite/Bundler/NodeNext; 22 CSS-ресурса | [лог](C:/OSPanel/domains/editor/test-results/recheck-2026-10-07/package-complete.log) |
| Декларации | 273 runtime-декларации; source diagnostics=0 | [лог](C:/OSPanel/domains/editor/test-results/recheck-2026-10-07/package-complete.log) |
| Документированные контракты | 94 README, 92 packaged-копии; source/locale/import/encoding проверки пройдены | [лог](C:/OSPanel/domains/editor/test-results/recheck-2026-10-07/contracts-complete.log) |
| Документация и demo | 123 HTML-страницы, brokenLinks=0, missingAssets=0; RU/EN × light/dark | [лог](C:/OSPanel/domains/editor/test-results/recheck-2026-10-07/docs-complete.log) |
| Бюджеты сборки | Все обязательные лимиты пройдены | [лог](C:/OSPanel/domains/editor/test-results/recheck-2026-10-07/bundle-complete.log) |

| Сборка | gzip KiB | Лимит KiB |
|---|---:|---:|
| core | 88.4 | Информационно (ориентир 51) |
| paragraph | 4.1 | 40 |
| defaultInteractive | 13.7 | 64 |
| fullPreset | 89.2 | 96 |

Размер core не блокирует gate по зафиксированному решению владельца; остальные бюджеты не повышались.

## Паритет и архитектура

Состав снова независимо сравнен с v1 `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340`: **21 блоковый плагин, 12 inline-инструментов, отсутствующих типов нет**. Функциональный паритет оценивается по закреплённой поведенческой матрице v1 и сценариям текущего редактора. Полный старый runtime повторно не запускался; совместимость старых классов API и JSON не является требованием текущей спецификации.

В статическом графе **274 runtime-модуля и 672 локальные связи импорта**: циклов, импортов приватного core из расширений, зависимостей shared от core и editing-runtime зависимостей renderer не найдено. Изменения сохраняют canonical model и единый transaction/projection seam; переключение представления не создаёт историю автора.

Архитектурный долг сохраняется: `DocumentRuntime.js` — 3069 строк, Mention — 916 строк, `BlockReconciler.js` — 694 строки. Дальнейшее разделение больших модулей имеет смысл делать отдельным изменением с сохранением тех же контрактов и браузерных gates.

## Доказательства и границы

[Сводный протокол](C:/OSPanel/domains/editor/test-results/recheck-2026-10-07/verification-summary.json); исходные журналы: `node-complete.log`, `typecheck-complete.log`, `browser-complete.log`, `package-complete.log`, `contracts-complete.log`, `docs-complete.log`, `bundle-complete.log`. Отдельно сохранены `architecture.json`, `parity-inventory.json`, `environment.json` и `source-snapshot.json`.

Снимок содержит SHA-256 **742 файлов**. Проверка сводного протокола повторно сверяет хеши с текущим кодом. Отрицательные журналы новых ошибок сохранены: `edges-red.log`, `readonly-red.log`, `presentation-guard-red.log`, `field-query-red.log`. `browser-superseded.log` намеренно остановлен после дополнительной найденной регрессии и не считается успешной проверкой. Окончательный полный прогон выполнялся без изменения проверяемых исходников. После него в `tests/browser/README.md` обновлены только три численных счётчика по итоговому JSON; runtime-код не менялся. Исходный снимок этого прогона сохранён в `source-snapshot-at-browser-start.json`, различие с итоговым снимком — в `snapshot-difference.json`.

Среда: Windows, Node 24.9.0, npm 11.2.0, Chrome 154.0.8037.98. Firefox/WebKit, конкретные OS IME и доступность удалённых провайдеров не подтверждены этим локальным прогоном. Выполненная матрица не доказывает все произвольные сочетания сторонних плагинов.

Изменения остаются локальными, без commit/push.
