# Rector v2 — повторная проверка с отказом от legacy-совместимости

## Основание и проверенный срез

Уточнение заказчика: **обратная совместимость с legacy-форматами и кодом не нужна**. Ни миграции старых документов, ни старые plugin/API contracts не являются критериями приёмки. Пользовательские возможности и сохранность допустимых текущих данных остаются требованиями.

Действующая [спецификация исправлений](RECTOR_V2_REMEDIATION_SPEC.md) пересмотрена целиком: ограничения, типы/состояния, владельцы, ошибки, dependencies, карта удаления, этапы и proofs. [Предыдущая редакция аудита](https://github.com/Shelamkoff/editor/blob/bf19263b1135745ee4e6a6479597cb2c4e5c0eb4/RECTOR_V2_AUDIT_RECHECK_2026-10-03.md) и [предыдущий план исправлений](https://github.com/Shelamkoff/editor/blob/bf19263b1135745ee4e6a6479597cb2c4e5c0eb4/RECTOR_V2_REMEDIATION_SPEC.md) сохранены в Git для воспроизводимости. Их требования поддерживать v1/migrations/preserved-document mode отменены, а не перенесены в новую реализацию.

HEAD перед правкой: **`bf19263b1135745ee4e6a6479597cb2c4e5c0eb4`**. Его parent — `6bd93c5598981e92b2f7fc8142708dc729918990`; коммит добавил только два Markdown-документа. Production-код с момента предыдущей проверки не менялся. Исходники получены из архивированного CI source.tar с PAX comment `6bd93c5598981e92b2f7fc8142708dc729918990`; SHA-256 `55361b89f10a0b346ae9d9a48798acb5f10a7f318294940c76414e4744e80035`. Прежние spec/audit из локального evidence archive сверены по Git blob SHA `9a8ecb5a93491cb351ff8e28581f600962775043` и `6fdf41a32750c17f3cb3484990d3a3d1aca10bcf`.

Ни production-код, ни dependency manifest перед запуском не исправлялись. Локальный Node — 22.16.0. Воспроизведения используют реальные model/controller classes и управляемые doubles DOM/clipboard/pointer; это не локальный browser/system-clipboard proof.

## Фактически повторённые проверки

| Проверка | Результат | Интерпретация |
|---|---|---|
| `npm test` | 380 passed, 0 failed, 0 skipped | Штатный baseline на неизменённом коде. |
| `npm run typecheck` | Две TS2554 | `inline-tools/utils.js:559` — Expected 0 arguments, got 1; `:652` — Expected 1, got 2. |
| `npm run test:docs` | Два нарушения documentation contract | `InlineTool.bindSelectionPort` отсутствует в `docs/guide/inline-extensions.md` и `docs/ru/guide/inline-extensions.md`. README/source/locale предварительные проверки проходят. |
| 13 прежних invariant assertions | 13 fail | Старые наблюдения воспроизведены, не 13 ошибок штатного набора. AUDIT-02/03 после изменения требований заменяются rejection proofs, а не должны стать зелёными для preserved mode. |
| RECHECK-14/15 clipboard | 2 fail | Cut удаляет selection без HTML; cross-paste не читает внутренний MIME. |
| 6 новых current-only policy probes | 6 fail | Текущий код ещё принимает старые/неполные формы. Это доказательство объёма новой задачи, а не шесть дополнительно найденных регрессий по прежнему контракту. |

Новые probes проверили: отсутствие document version; envelope `1.0.0`; future envelope `99.0.0`; отсутствие List dataVersion со string items; explicit List dataVersion=1 со string items; Gallery dataVersion=2 с прежним layout `grid`. Во всех шести случаях ожидаемого новым контрактом отказа пока нет.

Браузерный/package/size результат из [CI исходного среза](https://github.com/Shelamkoff/editor/actions/runs/37141477062) остаётся **историческим подтверждением того же production-кода**, не новым локальным прогоном и не проверкой коммита этой правки документации. В этом CI browser/package/size прошли, typecheck/docs не прошли. Size baseline: 50.7 KiB gzip, текущий порог 51 KiB; прежние 48 KiB больше не являются действующим порогом. Он был повышен, а не достигнут оптимизацией.

## Что изменилось в требованиях к замечаниям аудита

| Замечание | Текущий код / proof | Решение новой спецификации |
|---|---|---|
| R1: whole conversion теряет inline | AUDIT-01 продолжает падать | C2: единая сборка data/tunes/inline, включая unknown current extension payload и literal collision rules. |
| R2: mode присваивается после reset/projection/events | AUDIT-02/03 подтверждают прежний дефект | Глобальные document modes и version-reset branch **удаляются**. Unsupported input отклоняется до mutation. Согласованность обычной замены/current history решается C1 без лишней state machine. |
| R3: clipboard fragments/Cut | RECHECK-14/15 и текущий ClipboardController | Один новый fragment codec и atomic insertion. Старая fragment-v1/application/x-rector-editor совместимость не сохраняется. |
| R4: local List проходит legacy decode | AUDIT-09 продолжает падать | Exact-version serialized boundary + отдельный LocalBlockInput/encode. Старые List/Table shapes не мигрируются. |
| R5: auxiliary native history | AUDIT-11 продолжает падать | C6 target ownership до Mod+Z/Y и formatting dispatch. |
| R6: drag index/cleanup | AUDIT-12/13 продолжают падать | Gap без dragged ID и scoped pointer session. |
| R7: inline locale namespace | AUDIT-10 продолжает падать | Только inlinePlugin namespace; убрать duplicate/compat I18n путь. |
| R8: partial mount scope | AUDIT-07 продолжает падать | Scope до callback и единый stage/recovery/finalize protocol. |
| R9: stale context/mutable definitions/missing decode | AUDIT-04/05/06 продолжают падать | Revocable lifetime, exact schema validation, immutable dispatch metadata. Async tasks явно захватывают отменяемые права. |
| R10: ID-only list clones | AUDIT-08 продолжает падать | Внутренний metadata query port; внешние snapshots отделены. |
| R11: size gate | Текущий порог 51 KiB проходит | Не заявлять старое падение и не повышать бюджеты ради будущей реализации. |
| R12: multi-field API/wiring | Typecheck/docs failures воспроизведены; статически отсутствует полное production wiring нового port | C6 реальный lifecycle binding, guarded mutation и same-block multi-field; tests через createEditor/toolbar, не ручной bind. |

В этой проверке исходники только прочитаны и запущены. Таблица не означает, что перечисленные дефекты исправлены в production-коде.

## Дополнительная карта legacy-путей

Проверены не только слова в документе, но и реальные владельцы старого поведения:

| Источник | Найденное поведение и конечная судьба |
|---|---|
| `core/DocumentSchema.js`, `core/documentMigrations.js` | Default preserve, присвоение текущей версии отсутствующему envelope и migrateV1DocumentToV2. Заменяются общим current-only validator, migration module удаляется. |
| `shared/versionedDataSchema.js` | legacyVersion, optional dataVersion и forward migration chain. Удаляются; decode требует точного explicit currentVersion. |
| `shared/blockSchemas/*`, `shared/inlineSchemas/*` | Legacy options и миграции stable identities/align. Удаляются; актуальные schema versions сохраняются, включая currentVersion=1. |
| `core/publicTypes.d.ts`, runtime/config и `shared/documentTypes.d.ts` | Migration types/options, documentMode, optional serialized versions. Убираются/ужесточаются вместе с callers и declarations. |
| `renderer/index.js`, `EditorRenderer.js`, `inlineWidgets.js` | Собственная частичная boundary validation и разрешённая отсутствующая dataVersion. Переводятся на общую exact boundary; renderer не должен обходить редакторный отказ версии. |
| `shared/pollData.js`, `renderer/renderers/poll/index.js` | Преобразование прежних option.votes и fallback-генерация IDs. Compatibility-части удаляются; актуальные runtime results и создание новых options остаются. |
| `shared/carouselData.js`, `renderer/renderers/carousel/index.js` | Восстановление отсутствующих/дублированных persisted IDs. На decode/render запрещается; новое authoring добавление получает ID явно через allocator. |
| `shared/blockSchemas/gallery.js`, `renderer/renderers/gallery/index.js` | Невалидный layout нормализуется в auto; отдельный LEGACY_AUTO. Старые явно заданные values отклоняются, legacy remap удаляется. |
| `shared/sanitize/allowlist.js`, `walker.js` | Особое сохранение legacy inline-widget data-* markup. Внешний input не восстанавливает виджет из атрибутов; текущая projection имеет отдельное host ownership. |
| `shared/editableFields.js`, inline-tools callers | Fallback к первому полю при неразрешённой boundary. Заменяется явной field ownership, не переносится как compatibility helper. |
| `core/I18n.js` | ScopedI18n full-key bypass для старых callers. В прочитанных runtime-каталогах его consumers вне самого класса не найдены; карта удаления требует окончательного подтверждения экспортов/types/docs перед удалением. |

Слово legacy не является достаточным основанием удаления. Caret API feature detection, deep-signature comparison без producer revision, CSS/URL attack rejection и число currentVersion=1 — не поддержка прежнего Rector API/JSON. Массовая замена по regexp повредила бы нужные browser/security возможности.

## Исправленные противоречия самой спецификации

1. **Legacy P2 против прямого требования заказчика.** Убраны положительные обязательства читать v1, мигрировать persisted data и поддерживать unknown document versions. Первоначальный план заменён указателем на единственный действующий документ; полный старый текст доступен по неизменяемой Git-ссылке.
2. **Неизвестное расширение против несовместимой версии.** C0 разрешает лишь inert payload незарегистрированного type в текущем explicit envelope. Известный type с неподдерживаемой версией отклоняется, а не переименовывается в unknown. Это поддерживает независимость plugins без legacy reader.
3. **Document block ID против transfer block без ID.** Это два явно разных текущих контракта. Fragment полностью проверяется до выделения новых IDs; документ с пропущенным id не получает побочный обход проверки.
4. **Copy exporter без определённого владельца удаления сложной структуры.** C4 slice возвращает parts и remaining вместе. Структура List/Table/Columns принадлежит plugin capability; core не угадывает их data для Cut/Paste и не экспортирует невыбранное содержимое.
5. **Живой instance после readOnly true→false против отмены прежней async-работы.** C5 добавляет явный DataTask, полученный до async-вызова; host не выдаёт обычную проверку instance signal за task cancellation.
6. **Равные данные: no-op или новый lifetime.** C1 различает ordinary no-op и намеренный render/clear replacement. History и generation больше не требуют взаимоисключающих исходов.
7. **Strict ingress в S1 против оставленных local producers до позднего этапа.** Local callers переводятся на encode в S1; последующий HTML этап заменяет алгоритм маршрутизации, не откладывает согласование входного контракта.
8. **Range против backward selection.** C6 не предполагает, что Range хранит направление; оно берётся из согласованных anchor/focus/logical bookmark. Whole-block selection не зависит от editable endpoints.
9. **Неподдерживаемый private MIME против lossy fallback.** Присутствующий текущий MIME с неверной версией/структурой отвергается. Стандартный внешний HTML/text путь используется, когда текущего MIME нет, а не для скрытой миграции его старой версии.
10. **Проверка только editor.** C0 охватывает renderer, async presets, renderBlock и declarations; иначе старый формат продолжал бы поддерживаться через соседний entry point.

## Ограничения и вывод

Аудит не объявляет новые интерфейсы реализованными. 380 зелёных штатных тестов не доказывают целевой current-only контракт: шесть новых probes прямо показывают его отсутствие. Адресные doubles не доказывают физический clipboard, полный UI/IME или performance latency; необходимые browser/conformance/failure proofs перечислены в спецификации.

План теперь содержит current-only контракты, удаления без aliases, десять зависимых этапов с условиями завершения и матрицу доказательств. Старые форматы присутствуют только как исторические данные и отрицательные тестовые примеры. Исполнение следует [действующей спецификации](RECTOR_V2_REMEDIATION_SPEC.md), не рекомендациям предыдущей редакции, написанной до отказа от обратной совместимости.
