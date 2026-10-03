# Формат документа

Rector принимает один сериализованный формат документа. Текущая wire-версия — `2.0.0`; редактор, renderer, async presets и импорт приватного clipboard используют одну current-only границу.

## Оболочка документа

```ts
interface EditorDocument {
  version: '2.0.0'
  time?: number
  blocks: BlockData[]
}
```

```json
{
  "version": "2.0.0",
  "blocks": [
    {
      "id": "p1",
      "type": "paragraph",
      "dataVersion": 2,
      "data": { "text": "Hello" }
    }
  ]
}
```

`version` и `blocks` обязательны. Отсутствующая, старая или будущая версия оболочки отклоняется до построения проекции. `time` необязателен и при наличии должен быть конечным JSON-числом.

## Данные блока

```ts
interface BlockData {
  id: string
  type: string
  dataVersion: number
  data: Record<string, unknown>
  revision?: string | number
  tunes?: Record<string, unknown>
  inline?: Record<string, EditorInlineWidget>
}
```

```ts
interface EditorInlineWidget {
  type: string
  dataVersion: number
  data: Record<string, unknown>
}
```

`id`, `type`, `dataVersion` и `data` обязательны. ID блоков уникальны в документе. Для зарегистрированного блока или inline-типа `dataVersion` должен точно совпадать с `schema.currentVersion`. Схема с текущей версией `1` остаётся текущей и не считается legacy. Числовой `revision` должен быть конечным.

## Данные, принадлежащие плагину

```json
{
  "id": "h1",
  "type": "heading",
  "dataVersion": 2,
  "data": { "text": "Title", "level": 2 },
  "tunes": { "textAlign": "center" }
}
```

```js
const encoded = definition.schema.encode(localData)
const decoded = definition.schema.decode({
  dataVersion: encoded.dataVersion,
  data: encoded.data,
})
```

Локальные authoring-значения проходят через `schema.encode()`. Сериализованные значения проходят через `schema.decode()` и обязаны явно содержать точную текущую версию. Выравнивание Paragraph и Heading хранится только в `tunes.textAlign`; старый `data.align` отклоняется.

## Хранение внутристрочных виджетов

```json
{
  "data": { "text": "Hello {{mention-1}}" },
  "inline": {
    "mention-1": {
      "type": "mention",
      "dataVersion": 1,
      "data": { "id": "42", "name": "Ada" }
    }
  }
}
```

```ts
type InlineTable = Record<string, EditorInlineWidget>
```

Незарегистрированный inline-тип текущего формата остаётся непрозрачным и инертным. Для зарегистрированного типа точная версия схемы проверяется до вызова runtime-кода. Rich-text placeholder и inline-sidecar образуют одно логическое значение и преобразуются вместе.

## Текстовые поля с HTML

```html
<b>safe formatting</b>
```

```text
Внешний HTML очищается до превращения в канонические данные плагина.
Live-маркеры виджетов, созданные host, не являются сериализованным decoder.
```

Защита sanitizer, URL policy и Trusted Types сохраняется. Current-only версионирование не ослабляет границы безопасности.

## Проверка только текущего формата

Публичная граница до commit отклоняет ошибочный JSON, разреженные массивы, неизвестные поля оболочки, дубли ID, отсутствующие обязательные метаданные и несовпадение версии известной схемы. Незарегистрированные block types обрабатываются отдельно: при корректной текущей оболочке их JSON сохраняется непрозрачно со статусом `unregistered`.

## Правила версий

Версия документа — версия wire-формата, а не npm-пакета. Patch-релиз библиотеки сам по себе не меняет `2.0.0`. При изменении wire-контракта новая версия задаётся явно; старые документы не переименовываются и не угадываются.

## Без встроенных миграций

Rector v2 не экспортирует `DocumentMigration`, `documentVersionPolicy`, цепочки миграций или preserved-document mode. Если приложение намеренно преобразует исторические внешние данные, это выполняется вне Rector; затем передаётся полностью валидный текущий документ.

## Проверка расширений

Зарегистрированные block/inline definitions предоставляют exact-version схемы с `currentVersion`, `createDefault()`, `encode()` и `decode()`. Ошибочные данные известного типа отклоняются. `onValidationError` не содержит контент и является только observer; его ошибка не превращает отклонённые данные в принятые.

## Правила развития формата

Текущую схему изменяют явно: producers и consumers обновляются вместе, версия схемы повышается при изменении её сериализованной формы, а wire-версия документа — только при изменении envelope-контракта. Не добавляйте implicit versions, fallback migrations, compatibility aliases или молчаливую legacy-нормализацию. Исторический JSON остаётся в negative tests или во внешнем converter приложения, но не в Rector runtime.
