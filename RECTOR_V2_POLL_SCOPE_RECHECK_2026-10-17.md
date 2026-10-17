# Rector v2 — повторная проверка Poll и InstanceScope

Дата: 17 октября 2026. Ветка: `refactor/rector-v2-architecture`.
Исходный HEAD: `90ce95ec4414577f2fdd411b8964720e5fcbf475`.
Эталон пользовательского поведения: v1 (`master`), **не** её legacy API или формат данных.

## Результат

Два новых подтверждённых дефекта исправлены. Проведены red/green проверки, включая настоящий Chromium для Poll и проверку всех зарегистрированных InstanceScope unit cases на исходном коде через изолированное V8-исполнение. Проектная полная приёмка на актуальном HEAD **не выполнена**; релизная стабильность и полный паритет v1/v2 не заявляются.

## POLL-PENDING-1 — незавершённый выбор терялся после авторского обновления (P2)

В `plugins/poll/index.js` `update(next)` безусловно восстанавливал `selected` из `runtime.currentUserVote`, даже если пользователь только что выбрал вариант и ещё не отправил голос. Пустой `currentUserVote` стирал pending selection при изменении вопроса, подписи другого варианта и некоторых settings.

Это подтверждённое расхождение с v1: `Poll.#reconcileRuntime` в `master` сохраняет текущие локальные selected IDs, отсеивает отсутствующие варианты и сокращает multiple→single до одного.

В настоящем Chromium 144 исходный код v2 дал:
- вариант `b` выбран: `['b']`;
- после обновления вопроса: `[]` (ошибка);
- в первом запуске новых тестов — 2 корректно воспроизведённых failures.

**Исправление:** при обычной авторской правке сохраняются текущие разрешённые option IDs, удалённые IDs отбрасываются; переход в single оставляет один. Смена `pollId` или явная замена/удаление `initialResults` по-прежнему сбрасывает pending в пользу авторитетного `runtime.currentUserVote`. Счётчики голосов, локальная/удалённая запись и API не менялись.

**Red/green:** 4 новых случая на реальном DOM Chromium плюс 14 ранее зарегистрированных:
- исходный код: **16/18 PASS**, два pending-сценария падали;
- исправленный код: **18/18 PASS**; 0 ошибок browser/page, 0 skipped;
- проверены pending single, pending multiple, смена типа, удаление варианта, смена идентичности опроса, explicit seed reset, старые remote/subscription/history/native-input сценарии.

Проверка использовала настоящие исходные ESM-модули `createPollPlugin`, `DocumentStore`, `HistoryStore`, `TransactionEngine` и `NativeInputController`, импортированные браузером через изолированные Blob URL (исходные relative import specifiers переадресованы). На внешнем projector adapter сохранены реальные transaction/history boundaries; это **не** полный `createEditor` integration gate. Браузерные option `click()` события не объявляются физическими клавишными событиями.

Результирующий Git blob `plugins/poll/index.js`: `dfbd84ba831f23ddf28f62a5e301e1f8e27afb5f`.

Коммиты: [регрессии](https://github.com/Shelamkoff/editor/commit/93acfb81133ac152458304257bbf587f369714a7) и [исправление](https://github.com/Shelamkoff/editor/commit/ddfd8901aa74842173f84216eb6b24cf7a02bb82).

## SCOPE-RO-1 — дочерние полномочия и отмена задач при readOnly (P1)

`core/InstanceScope.js` хранил один `#readOnly` одновременно для **локальной** настройки child scope и унаследованного запрета parent scope. Родительское `setReadOnly(false)` передавалось ребёнку как новое локальное значение, что снимает независимый запрет ребёнка и наследуемый запрет его descendants. Обратное действие `child.setReadOnly(false)` позволяло ребёнку сообщить `readOnly=false` даже пока родитель оставался readonly. Реальные мутации при этом чаще блокировались рекурсивной проверкой родителя, но публичный reporting / policy semantics нарушались.

Отдельно `configure({readOnly:true})` напрямую присваивал внутренний флаг, обходя `setReadOnly()`: уже выданные задачи не получали `AbortSignal.abort` в момент отзыва полномочий. Они не должны продолжать расходовать ресурсы после смены режима.

**Исправление:** независимые локальная `#readOnly` и наследуемая `#inheritedReadOnly`, а `readOnly` возвращает их эффективное OR (либо revoked). Внутреннее `#setInheritedReadOnly` распространяет запрет на descendants **без перезаписи** локальных флагов. `configure({readOnly})` использует общий переход; при изменении effective mode обновляется epoch и синхронно отменяются текущие data tasks. Проверки mutation/beginTask/commit читают эффективный `readOnly`. Сохранены parent revoke, generation и phase guards, public API не менялся.

**Red/green:** 3 новых focused теста и 13 существующих:
- RED: **13/16 PASS**, три новых теста падали по своим проверяемым контрактам;
- GREEN: **16/16 PASS**;
- добавлена модель дерева из четырёх scope и **1 200 детерминированных операций** `setReadOnly/configure`, с независимым oracle OR всех ancestors; **17/17 PASS** итогового набора.

Верификация исполняла точный текст `InstanceScope.js` в V8 со stub `cloneEditorData`, `AbortController`, `DOMException`; unit cases исполнялись с `use strict`. Этот red/green результат не заменяет полный `node --test` на текущей ветке.

Результирующий Git blob `core/InstanceScope.js`: `e128cb4aaa858aea48f106cd84738503cccda846`.

Коммиты: [три регрессии](https://github.com/Shelamkoff/editor/commit/9fc001f67a36c4929ed67f13a12d5422ec1df008), [исправление](https://github.com/Shelamkoff/editor/commit/b2f9a388fabad1a16fdc786ddfc9830f4160dc19), [модель разрешений](https://github.com/Shelamkoff/editor/commit/ee7e77c2117656c6aac689f631c0dc12a4a160f2).

## Отрицательный контроль, отсев ложных тревог

В `Attaches` чтение пустого редактируемого filename возвращает прежнее имя через fallback. Сравнение с `plugins/attaches/index.js` в v1 подтвердило такое же поведение, а текущая схема допускает пустую строку имени. Однако один только факт fallback **не доказывает регрессию поведенческого паритета**. Этот код не менялся. Отдельная оценка UX пустого имени выходит за пределы подтверждённых ошибок.

`Checklist` уже избегает перемещения существующей строки, если её индекс соответствует текущему — дефект List/Columns не следует автоматически переносить на него. Существующие проектные архитектурные ограничения и запрет legacy compatibility сохранены.

## Невыполненные проверки

На этом HEAD не выполнены полные `npm test`, `npm run typecheck` (оба TS-проекта), `npm run test:browser` (включая все native/CDP/IME suites), `npm run test:docs`, `npm run test:package`, Firefox/WebKit, системный IME и полный heap/retention stress. Эти gate нужно запускать локально после синхронизации окончательного SHA; результаты других исторических SHA не переносятся автоматически.

**Вывод:** исправлены два подтверждённых дефекта Poll/InstanceScope, все целевые проверки green; полной сертификации стабильности и паритета всей библиотеки пока нет.
