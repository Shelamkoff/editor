import {
  createEditor,
} from '../../.package-tmp/declaration-tests/core/index.js'
import type {
  BlockPluginDefinition,
  EditorConfig,
  EditorOutputData,
  EditorEventMap,
  IEditor,
  TransactionCommitted,
} from '../../.package-tmp/declaration-tests/core/index.js'
import type {
  BlockCapabilities,
  ClipboardCapability,
  DataTask,
  HtmlImportCapability,
} from '../../.package-tmp/declaration-tests/types.js'
import type { TransactionEngine } from '../../.package-tmp/declaration-tests/core/TransactionEngine.js'
import type { InstanceScope } from '../../.package-tmp/declaration-tests/core/InstanceScope.js'

declare const holder: HTMLElement
const schema = {
  currentVersion: 1,
  createDefault: () => ({ text: '' }),
  decode(input: { dataVersion: number; data: unknown }) {
    if (input.dataVersion !== 1) throw new RangeError('dataVersion')
    const data = input.data as { text?: unknown }
    if (typeof data?.text !== 'string') throw new TypeError('text')
    return { dataVersion: 1, data: { text: data.text } }
  },
  encode(data: Readonly<{ text: string }>) {
    return { dataVersion: 1, data: { text: data.text } }
  },
}

const capabilities: BlockCapabilities<{ text: string }> = {
  shortcuts: {
    handle(event, data, context) {
      const length: number = context.fieldLength('text')
      if (event.key === 'Enter') return { kind: 'exit', data }
      return event.key === 'Backspace'
        ? { kind: 'update', data, focus: { fieldKey: 'text', offset: length } }
        : null
    },
  },
  htmlImport: {
    matchesRoot(element) { return element.tagName === 'P' },
    importRoot(element, context) {
      return { text: context.serializeRichText(element) }
    },
  } satisfies HtmlImportCapability<{ text: string }>,
  clipboard: {
    slice(data, context) {
      const field = context.field('text')
      return {
        parts: [{ kind: 'rich-text', html: field?.selected ?? data.text }],
        remaining: field ? { text: field.before + field.after } : data,
        focus: { fieldKey: 'text', offset: 0 },
      }
    },
  } satisfies ClipboardCapability<{ text: string }>,
}

const customPlugin: BlockPluginDefinition<{ text: string }> = {
  type: 'custom',
  label: { key: 'title', fallback: 'Custom' },
  icon: '',
  schema,
  capabilities,
  setup(runtimeContext) {
    const placeholder = runtimeContext.t('placeholder', 'Custom 3', { level: 3 })
    return {
      create(initial, context) {
        const task: DataTask<{ text: string }> = context.beginTask()
        task.cancel()
        const element = context.ownerDocument.createElement('p')
        element.dataset.placeholder = placeholder
        element.textContent = initial.text
        return {
          element,
          read: () => ({ text: element.textContent ?? '' }),
          update(next) { element.textContent = next.text },
          editableFields: () => [{ key: 'text', element, mode: 'plain-text' }],
          setReadOnly(value) { element.contentEditable = value ? 'false' : 'true' },
          destroy() {},
        }
      },
      destroy() {},
    }
  },
}

const config: EditorConfig = {
  holder,
  plugins: [customPlugin],
  historyMaxBytes: 1024,
}

const editor: IEditor = createEditor(config)
const document: EditorOutputData = editor.save()
const unsubscribe = editor.on('transaction:committed', (event: TransactionCommitted) => {
  // @ts-expect-error committed observer payloads are immutable
  event.changes.push({ kind: 'block.move', id: 'a', from: 0, to: 1 })
  // @ts-expect-error nested history state is immutable
  event.history.canUndo = false
  const origin: EditorEventMap['transaction:committed']['origin'] = event.origin
  void origin
})
unsubscribe()
void document

// @ts-expect-error document version is mandatory
editor.render({ blocks: [] })
// @ts-expect-error only the current format is accepted
editor.render({ version: '1.0.0', blocks: [] })

// @ts-expect-error the byte budget is numeric, not a size string
config.historyMaxBytes = '1KiB'
// @ts-expect-error null is not the omitted byte-budget state
config.historyMaxBytes = null

// Internal generated contracts must preserve the engine's serialized states.
// Preparation/observation contexts, health and scope state are other dimensions.
declare const transactionEngine: TransactionEngine
const enginePhases = [
  'idle',
  'preparing-metadata',
  'capturing-selection',
  'building',
  'preparing-projection',
  'applying-projection',
  'committing',
  'finalizing',
  'publishing',
  'diagnostic-observation',
  'failed',
] as const satisfies readonly TransactionEngine['phase'][]

function inspectEnginePhase(phase: TransactionEngine['phase']): void {
  switch (phase) {
    case 'idle':
    case 'preparing-metadata':
    case 'capturing-selection':
    case 'building':
    case 'preparing-projection':
    case 'applying-projection':
    case 'committing':
    case 'finalizing':
    case 'publishing':
    case 'diagnostic-observation':
    case 'failed':
      return
    default: {
      const exhaustive: never = phase
      void exhaustive
    }
  }
}
inspectEnginePhase(transactionEngine.phase)
for (const phase of enginePhases) inspectEnginePhase(phase)

// @ts-expect-error misspelled states cannot enter the lifecycle contract
const unknownEnginePhase: TransactionEngine['phase'] = 'committting'
// @ts-expect-error runtime invocation context is not an engine state
const runtimeContextAsPhase: TransactionEngine['phase'] = 'extension-preparation'
// @ts-expect-error instance lifetime is not the transaction phase
const scopeStateAsPhase: TransactionEngine['phase'] = 'active'
// @ts-expect-error control health is not the transaction phase
const healthAsPhase: TransactionEngine['phase'] = 'ready'

// Scope admission sees the engine state or one of the runtime's invocation
// contexts. Derive this from the actual callback, not a parallel type fixture.
declare const instanceScope: InstanceScope
type ScopeOptions = NonNullable<Parameters<InstanceScope['configure']>[0]>
type ScopedContext = ReturnType<NonNullable<ScopeOptions['phase']>>
const invocationContexts = [
  'validation-observation',
  'presentation-projection',
  'extension-preparation',
  'protected-projection-edit',
  'read-only-transition',
] as const satisfies readonly ScopedContext[]

instanceScope.configure({ phase: () => transactionEngine.phase })
for (const phase of [...enginePhases, ...invocationContexts]) {
  instanceScope.configure({ phase: () => phase })
}
for (const context of invocationContexts) {
  // @ts-expect-error invocation contexts stay outside the serialized lifecycle
  inspectEnginePhase(context)
}

function inspectScopedContext(context: ScopedContext): void {
  switch (context) {
    case 'validation-observation':
    case 'presentation-projection':
    case 'extension-preparation':
    case 'protected-projection-edit':
    case 'read-only-transition':
      return
    default:
      inspectEnginePhase(context)
  }
}
for (const context of [...enginePhases, ...invocationContexts]) inspectScopedContext(context)

// @ts-expect-error scoped admission rejects misspelled contexts
instanceScope.configure({ phase: () => 'extension-preperation' })
// @ts-expect-error instance lifetime remains separate from mutation context
instanceScope.configure({ phase: () => 'revoked' })
// @ts-expect-error control health remains separate from mutation context
instanceScope.configure({ phase: () => 'ready' })
