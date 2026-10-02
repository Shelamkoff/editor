# Конфигурация

`createEditor(config)` принимает один объект конфигурации. Публичный контракт намеренно небольшой: обязательны `holder` и `plugins`; каждое расширение представляет собой неизменяемое v2-definition, созданное фабрикой.

## Публичная форма

```ts
interface EditorConfig {
  holder: HTMLElement
  plugins: readonly BlockPluginDefinition[]
  inlinePlugins?: readonly InlinePluginDefinition[]
  inlineTools?: readonly InlineTool[]
  data?: EditorDocument
  defaultBlock?: string
  placeholder?: string
  readOnly?: boolean
  autofocus?: boolean
  injectStyles?: boolean
  theme?: 'light' | 'dark'
  minHeight?: number
  locale?: Record<string, unknown>
  validationMode?: 'preserve' | 'strict'
  documentVersionPolicy?: 'preserve' | 'strict'
  migrations?: readonly DocumentMigration[]
  changeDebounceMs?: number
  onReady?: (editor: IEditor) => void | Promise<void>
  onChange?: (document: EditorDocument) => void | Promise<void>
  onValidationError?: (issue: EditorValidationIssue) => void
}
```

## Параметры

| Параметр | Обязателен | По умолчанию | Назначение |
| --- | --- | --- | --- |
| `holder` | да | — | DOM-элемент, принадлежащий этому экземпляру редактора. Один активный `holder` нельзя занять вторым редактором. |
| `plugins` | да | — | Непустой массив неизменяемых `BlockPluginDefinition`. Значения `type` должны быть уникальны. |
| `inlinePlugins` | нет | `[]` | Неизменяемые `InlinePluginDefinition` для постоянных внутристрочных виджетов. |
| `inlineTools` | нет | `[]` | Объекты инструментов форматирования для внутристрочной панели. |
| `data` | нет | пустой блок по умолчанию | Исходный версионируемый документ. На границе владения он копируется и нормализуется. |
| `defaultBlock` | нет | `paragraph`, если зарегистрирован, иначе первое definition | Тип для пустого документа и общих структурных операций. |
| `placeholder` | нет | значение расширения/локали | Подсказка уровня редактора, доступная runtime блока по умолчанию. |
| `readOnly` | нет | `false` | Исходный режим взаимодействия. В режиме чтения пользовательские изменения документа запрещены. |
| `autofocus` | нет | `false` | Фокус первого редактируемого поля после успешного создания. |
| `injectStyles` | нет | `true` | Подключение стилей ядра и зарегистрированных definitions через общий реестр. |
| `theme` | нет | `light` | Встроенная тема: `light` или `dark`. |
| `minHeight` | нет | CSS | Конечная неотрицательная минимальная высота редактора в пикселях. |
| `locale` | нет | встроенный английский | Плоский словарь сообщений ядра и расширений. |
| `validationMode` | нет | `preserve` | Ошибочные данные известного блока/виджета сохраняются инертно либо отклоняются в `strict`. |
| `documentVersionPolicy` | нет | `preserve` | Неполная/будущая версия документа сохраняется либо отклоняется в `strict`. |
| `migrations` | нет | `[]` | Направленные синхронные миграции документа. |
| `changeDebounceMs` | нет | `250` | Задержка перед передачей отделённого снимка в `onChange`. |
| `onReady` | нет | не задан | Наблюдатель после успешной сборки. Его ошибка не ломает редактор. |
| `onChange` | нет | не задан | Наблюдатель канонических изменений с отделённым документом. |
| `onValidationError` | нет | не задан | Наблюдатель ошибок сохранения/проверки данных. |

## Definitions плагинов

Регистрируйте результаты фабрик, а не изменяемые экземпляры классов:

```js
import { createEditor } from '@shelamkoff/rector'
import { createParagraphPlugin } from '@shelamkoff/rector/plugins/paragraph'
import { createQuotePlugin } from '@shelamkoff/rector/plugins/quote'

const editor = createEditor({
  holder,
  plugins: [
    createParagraphPlugin(),
    createQuotePlugin(),
  ],
  defaultBlock: 'paragraph',
})
```

Одно definition можно использовать в нескольких редакторах. Состояние конкретного редактора принадлежит runtime из `setup()`, а состояние конкретного блока — `BlockInstance`, созданному этим runtime.

## Исходный документ и версии

`data` декодируется схемами зарегистрированных расширений до построения DOM. `documentVersionPolicy: 'preserve'` применяет все достижимые миграции и сохраняет последний достигнутый структурно корректный документ, если цепочка не доводит его до текущей версии. `strict` требует полный поддерживаемый путь.

`validationMode: 'preserve'` сохраняет ошибочные или будущие данные известного типа инертно, чтобы они могли пройти round-trip без запуска кода расширения. `strict` их отклоняет.

Канонический формат описан в разделе [Формат документа](/ru/guide/document-format).

## Режим чтения и размеры

`editor.setReadOnly(true)` меняет режим работающего runtime без создания шага истории. Экземпляры definitions получают переход через `setReadOnly()`. Ядро также отключает структурные клавиши, вставку, drag, изменения настроек, inline-команды, undo и redo.

`minHeight` задаёт только оболочку редактора. Компоновка расширения принадлежит его стилям.

## Обработчики

`onReady`, `onChange` и `onValidationError` — наблюдатели, а не части транзакции. Ошибка наблюдателя изолируется от канонического состояния.

`onChange` планируется только после зафиксированных изменений документа и получает отделённый документ. Более новый commit может заменить ещё не доставленное старое уведомление.

## Владение стилями

При `injectStyles: true` URL стилей ядра и расширений учитываются общим reference-counted реестром документа. При `false` Rector не подключает стили definitions; необходимые CSS должен импортировать host.

Фабрика конкретного расширения может дополнительно поддерживать `injectStyles: false`, если это задокументировано, но `injectStyles: false` редактора является глобальным ручным режимом.
