# Локальная проверка Rector — 29.09.2026

Это исторический отчёт о предыдущей версии. Актуальная ветка `refactor/rector-v2-architecture`, последние результаты приведены в [повторной проверке v2 от 05.10.2026](RECTOR_V2_TOOLTIP_AUDIT_2026-10-05.md), команды запуска — в [проверке v2 от 04.10.2026](RECTOR_V2_LOCAL_VERIFICATION_2026-10-04.md). Числа ниже не относятся к текущему рефакторингу.

Редактор запускается и работает в проверенных сценариях Chrome/Chromium.

## Исходники и окружение

- Репозиторий: https://github.com/Shelamkoff/editor
- Ветка: `fix/audit-tdd-2026-09-05`.
- Коммит: `62038cefd8817a849c1a476a8c076b6bf535670b`.
- Совпадение с актуальной удалённой веткой подтверждено через `git ls-remote` после проверки.
- `master` отстаёт от этой ветки на 663 коммита.
- Windows, Node.js 24.9.0, npm 11.2.0, Google Chrome 153.0.8010.53.
- Зависимости установлены командой `npm ci --no-audit --no-fund --cache .npm-cache`.
- Сам Rector взят из Git. Проверка потребителя использовала архив, собранный из этого checkout.
- SHA-256 `package-lock.json`: `3E4EF8BA0C9C3BA91943338FC9B6DFAAFAB9A4984C7621CF0678462AFFE56E87`.

## Результаты

| Команда | Результат | Лог |
| --- | --- | --- |
| `npm run typecheck` | Оба проекта TypeScript прошли | [typecheck.log](test-results/typecheck.log) |
| `npm test` | 613 тестов прошли, 0 ошибок, 0 пропусков | [unit.log](test-results/unit.log) |
| `npm run build` | Сборка прошла, 271 runtime-декларация, 0 диагностик | [build.log](test-results/build.log) |
| `npm run test:browser` | Все 23 страницы, физический ввод/история и heap gate прошли | [browser.log](test-results/browser.log) |
| `npm run test:package` | Локальный архив: импорт, Vite, типы Bundler/NodeNext, 22 CSS-ресурса | [package.log](test-results/package.log) |
| `npm run test:docs` | Контракты, исходники плагинов, локали и примеры прошли | [docs-contract.log](test-results/docs-contract.log) |
| `npm run docs:check` | Production-сборка и браузерная проверка прошли; 123 HTML-страницы, 0 битых ссылок, 0 пропавших ресурсов | [docs-browser.log](test-results/docs-browser.log) |

Heap gate: 128 контрольных объектов, удержано 0. Это результат штатного сценария очистки, а не доказательство отсутствия любых возможных утечек.

Вручную во встроенном Chromium проверены ввод русского текста, создание абзаца через Enter, жирное форматирование, Ctrl+Z/Ctrl+Shift+Z, наличие изменённого текста в JSON и переключение редактор/превью. Снимок: [editor-demo.png](test-results/editor-demo.png).

Проверка не распространяется на Firefox/Safari, внешние серверы загрузки файлов и реальные системные IME. Предупреждение сборки документации о чанках больше 500 kB не помешало её работе.

## Исправление локального демо

При `docs:dev` оптимизатор Vite менял базу `import.meta.url` пакета ColorPicker, поэтому браузер запрашивал отсутствующий `.vitepress/cache/deps/colorPicker.css`.

В [docs/.vitepress/config.ts](docs/.vitepress/config.ts) исключены из предварительной сборки четыре ESM-зависимости, которые разрешают соседние CSS через `import.meta.url`: ColorPicker, Cropper, Carousel, Expose. После изменения проверены корректные ссылки в DOM, HTTP 200 для всех четырёх CSS, загрузка демо и переключение превью. Основной код редактора не изменён.

Опция `optimizeDeps.exclude` относится к режиму разработки: [документация Vite](https://vite.dev/config/dep-optimization-options.html#optimizedeps-exclude). Полные штатные проверки выше выполнены до этой правки; после неё выполнена адресная проверка режима разработки и `git diff --check`.

## Скилы

Из `C:\OSPanel\domains\ecom\.agents\skills` скопированы в `.agents/skills`:

- `modern-javascript-patterns`
- `vue-best-practices`
- `vue3-app`
- `vue-pinia-best-practices`
- `vue-router-best-practices`
- `create-adaptable-composable`

Всего 50 файлов. Контрольные суммы копий совпадают с оригиналами. Скилы сохранены без изменений; специфичные для ecom/Nuxt рекомендации следует применять только в соответствующем контексте. Ядро Rector — обычный JavaScript/ESM; Vue используется в сайте документации.

## Запуск

Из корня репозитория:

```powershell
npm.cmd run docs:dev -- --port 5187 --strictPort
```

Открыть http://127.0.0.1:5187/ru/#demo. На момент завершения проверки сервер оставлен запущенным.

Логи, снимок и npm-кеш исключены локально через `.git/info/exclude`. Генерация документации не оставила изменений её содержимого. Изменения не закоммичены и не отправлены на GitHub.
