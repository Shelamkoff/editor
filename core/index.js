import { el } from './dom.js'
import { EditorEvent } from './editorEvents.js'
import { EventBus } from '@shelamkoff/event-bus'
import { I18n } from './I18n.js'
import { BlockManager } from './BlockManager.js'
import { SelectionManager } from './SelectionManager.js'
import { EditorFacade } from './EditorFacade.js'
import { DocumentSnapshotStore } from './DocumentSnapshotStore.js'
import { DocumentSchema } from './DocumentSchema.js'
import { Diagnostics } from './Diagnostics.js'
import { EditorBlocksApi, EditorEventSubscriptions, EditorHandle } from './PublicEditorApi.js'
import { BlockOperations } from './BlockOperations.js'
import { ShortcutRegistry } from './ShortcutRegistry.js'
import { Toolbar } from './toolbar/Toolbar.js'
import { InlineToolbar } from './inline-toolbar/InlineToolbar.js'
import { TypeSelector } from './TypeSelector.js'
import { KeyboardManager } from './KeyboardManager.js'
import { UndoManager } from './UndoManager.js'
import { CommandDispatcher } from './CommandDispatcher.js'
import { Clipboard } from './clipboard/Clipboard.js'
import { DragManager } from './DragManager.js'
import { CrossBlockSelection } from './CrossBlockSelection.js'
import { ChangeNotifier } from './ChangeNotifier.js'
import { createDefaultInlineTools } from '../inline-tools/defaults.js'
import { SlashCommands } from './SlashCommands.js'
import { MouseSelectionManager } from './MouseSelectionManager.js'
import { InlinePluginRegistry } from './InlinePluginRegistry.js'
import { hydrateInlinePlugins } from './hydrateInlinePlugins.js'
import { TriggerManager } from './TriggerManager.js'
import { InlinePatternMatcher } from './InlinePatternMatcher.js'
import { PopupManager } from './PopupManager.js'
import { injectStyleUrls } from './StyleInjector.js'
import { resolveTuning } from './config.js'
import {DEFAULT_BLOCK_TYPE, DEFAULT_THEME} from './constants.js'
import { claimPluginInstances } from './PluginOwnership.js'
import { claimEditorHolder } from './EditorHolderOwnership.js'
import { LifecycleScope } from './LifecycleScope.js'
import en from './locale/en.js'

/**
 * Resolve inline tools config into tool instances.
 * Supports: undefined (all defaults), string[] (filter defaults by name),
 * or object[] (ready instances, passed through).
 * @param {undefined | Array<string | import('./types').InlineTool>} config
 * @param {import('./I18n').I18n} i18n
 * @param {import('./types').ICrossBlockSelection} crossBlockSelection
 * @returns {import('./types').InlineTool[]}
 */
function resolveInlineTools(config, i18n, crossBlockSelection) {
  if (!config) return createDefaultInlineTools({ i18n, crossBlockSelection })
  const defaultTypes = config.filter(item => typeof item === 'string')
  const allDefaults = createDefaultInlineTools({ i18n, crossBlockSelection, types: defaultTypes })

  /** @type {Map<string, import('./types').InlineTool>} */
  const defaultMap = new Map()
  for (const tool of allDefaults) defaultMap.set(tool.type, tool)

  /** @type {import('./types').InlineTool[]} */
  const resolved = []
  /** @type {Map<string, number>} */
  const indexes = new Map()

  for (const item of config) {
    let tool
    if (typeof item === 'string') {
      tool = defaultMap.get(item)
      if (!tool) throw new Error(`Unknown inline tool: "${item}"`)
    } else {
      tool = item
    }

    if (!tool || typeof tool.type !== 'string' || tool.type.length === 0) {
      throw new TypeError('Inline tool must have a non-empty string type')
    }
    if (
      typeof tool.icon !== 'string'
      || typeof tool.isActive !== 'function'
      || typeof tool.toggle !== 'function'
    ) {
      throw new TypeError(`Inline tool "${tool.type}" must define icon, isActive(), and toggle()`)
    }
    const existingIndex = indexes.get(tool.type)
    if (existingIndex === undefined) {
      indexes.set(tool.type, resolved.length)
      resolved.push(tool)
    } else {
      resolved[existingIndex] = tool
    }
  }

  return resolved
}

/**
 * Inject a scoped I18n wrapper into a plugin so it can use short keys
 * (`_t('title')` → resolves `plugin.<type>.title`).
 *
 * The locale dictionary is already fully populated by createEditor before
 * this is called — plugins don't load their own locales.
 *
 * @param {any} plugin
 * @param {import('./I18n').I18n} i18n
 */
function injectPluginI18n(plugin, i18n) {
  if (!plugin.type || !plugin.setI18n) {
    plugin.setI18n?.(i18n)
    return
  }
  // Block plugins use `plugin.<type>.*`; inline plugins `inlinePlugin.<type>.*`.
  const isInline = 'createWidget' in plugin
  const prefix = isInline ? `inlinePlugin.${plugin.type}` : `plugin.${plugin.type}`
  plugin.setI18n(i18n.scope(prefix))
}

/**
 * Build the editor DOM scaffold.
 * @param {HTMLElement} holder
 * @param {string} theme
 * @param {number} [minHeight]
 * @returns {{ rootEl: HTMLElement, blocksEl: HTMLElement, clickArea: HTMLElement }}
 */
function buildEditorDOM(holder, theme, minHeight) {
  const rootEl = el('div', `oe-editor oe-theme-${theme}`, { tabindex: '-1' })
  if (minHeight !== undefined) rootEl.style.minHeight = `${minHeight}px`
  const blocksEl = el('div', 'oe-blocks')
  const clickArea = el('div', 'oe-click-area')
  rootEl.appendChild(blocksEl)
  rootEl.appendChild(clickArea)
  return { rootEl, blocksEl, clickArea }
}

/**
 * Synchronize the editor root's read-only class and accessibility state.
 * @param {HTMLElement} rootEl Editor root element.
 * @param {boolean} readOnly Whether document mutations are disabled.
 */
function applyReadOnlyAttributes(rootEl, readOnly) {
  rootEl.classList.toggle('oe-editor--read-only', readOnly)
  if (readOnly) rootEl.setAttribute('aria-readonly', 'true')
  else rootEl.removeAttribute('aria-readonly')
}

/**
 * Wire focusin and input tracking on the editor root.
 * @param {HTMLElement} rootEl
 * @param {import('./BlockManager').BlockManager} blocks
 * @param {import('./types').IEventBus} events
 * @returns {{ destroy(): void }}
 */
function wireInputTracking(rootEl, blocks, events) {
  const onFocusIn = (/** @type {FocusEvent} */ e) => {
    const target = /** @type {import('./types').DOMNode} */ (e.target)
    const block = blocks.getBlockByChildNode(target)
    if (!block) return
    const index = blocks.getBlockIndex(block.id)
    if (index !== blocks.getCurrentIndex()) {
      blocks.setCurrentIndex(index)
    }
  }

  const onInput = (/** @type {InputEvent} */ event) => {
    const target = /** @type {import('./types').DOMNode} */ (event.target)
    // Editor controls (URL/color/font inputs, filters, dialogs) also bubble
    // `input` through rootEl. They are not document mutations and must never
    // advance block history by falling back to the currently focused block.
    const changed = blocks.getBlockByChildNode(target)
    if (!changed) return
    changed.markDirty()
    events.emit(EditorEvent.BLOCK_CHANGED, { blockId: changed.id })
    events.emit(EditorEvent.CHANGED)
  }

  rootEl.addEventListener('focusin', onFocusIn)
  rootEl.addEventListener('input', onInput)

  return {
    destroy() {
      rootEl.removeEventListener('focusin', onFocusIn)
      rootEl.removeEventListener('input', onInput)
    },
  }
}

/**
 * Collect and inject all editor stylesheets via <link> tags (reference-counted).
 *
 * Per-plugin config knobs (passed via plugin constructor):
 *  - `injectStyles: false`  — skip the default stylesheet for this plugin
 *  - `css: '/path/to.css'`  — inject an additional stylesheet AFTER the default
 *
 * @param {Map<string, import('./types').BlockPlugin>} plugins
 * @param {import('./InlinePluginRegistry').InlinePluginRegistry} inlinePlugins
 * @param {boolean} enabled
 * @returns {{ destroy(): void } | null}
 */
function injectEditorStyles(plugins, inlinePlugins, enabled) {
  if (!enabled) return null
  /** @type {string[]} */
  const styleUrls = [
    new URL('./themes/variables.css', import.meta.url).href,
    new URL('./themes/light.css', import.meta.url).href,
    new URL('./themes/dark.css', import.meta.url).href,
  ]
  for (const plugin of plugins.values()) {
    const cfg = typeof plugin.getPluginConfig === 'function'
      ? plugin.getPluginConfig()
      : undefined
    if (cfg?.injectStyles !== false) {
      const constructor = /** @type {import('./types').BlockPluginConstructor} */ (plugin.constructor)
      const urls = constructor.styles
      if (urls) styleUrls.push(...urls)
    }
    if (cfg?.css) styleUrls.push(cfg.css)
  }
  for (const plugin of inlinePlugins.values()) {
    if (plugin.styles) styleUrls.push(...plugin.styles)
  }
  return styleUrls.length > 0 ? injectStyleUrls(styleUrls) : null
}

/**
 * @typedef {Object} EditModeDeps
 * @property {HTMLElement} rootEl
 * @property {HTMLElement} blocksEl
 * @property {HTMLElement} clickArea
 * @property {Map<string, import('./types').BlockPlugin>} plugins
 * @property {import('./BlockManager').BlockManager} blocks
 * @property {import('./SelectionManager').SelectionManager} selection
 * @property {import('./I18n').I18n} i18n
 * @property {import('./types').IEventBus} events
 * @property {CommandDispatcher} commands
 * @property {import('./CrossBlockSelection').CrossBlockSelection} crossBlockSelection
 * @property {string} defaultBlockType
 * @property {import('./InlinePluginRegistry').InlinePluginRegistry} inlinePluginRegistry
 * @property {import('./types').InlinePluginContext} inlinePluginCtx
 * @property {EditorFacade} facade
 * @property {DocumentSnapshotStore} snapshots
 * @property {import('./config').EditorTuning} tuning
 * @property {import('./types').EditorConfig} config
 * @property {Diagnostics} diagnostics
 * @property {LifecycleScope} scope
 * @property {UndoManager} undoManager
 */

/**
 * Wire all edit-mode managers (toolbar, undo, clipboard, drag, keyboard, etc.).
 * Only called when `readOnly` is false.
 * @param {EditModeDeps} deps
 */
function wireEditMode(deps) {
  const {
    rootEl, blocksEl, clickArea, plugins, blocks, selection,
    i18n, events, commands, crossBlockSelection, defaultBlockType,
    inlinePluginRegistry, inlinePluginCtx, facade, snapshots, tuning, config, diagnostics,
    scope, undoManager,
  } = deps

  const blockOps = new BlockOperations(blocks, selection, defaultBlockType, events, commands)
  blocks.setPluginStructuralCommands({
    splitBlock: () => blockOps.splitBlock(),
    exitEmptyBlock: () => blockOps.exitEmptyBlock(),
  })
  scope.register({
    destroy: () => blocks.setPluginStructuralCommands({ splitBlock: null, exitEmptyBlock: null }),
  })
  const pluginMutations = commands

  const duplicateBlock = (current, index) => {
    const snapshot = snapshots.capture().blocks.find(block => block.id === current.id)
    if (!snapshot) return undefined

    const duplicate = blocks.insert(
      snapshot.type,
      snapshot.data,
      index + 1,
      undefined,
      snapshot.inline,
    )
    hydrateInlinePlugins(duplicate.contentElement, inlinePluginRegistry, inlinePluginCtx)
    const duplicateIndex = blocks.getBlockIndex(duplicate.id)
    blocks.setCurrentIndex(duplicateIndex)
    selection.setCaretToBlock(duplicate.id, 'end')
    duplicate.focus()
    return duplicate
  }

  const toolbar = new Toolbar(rootEl, {
    plugins, blocks, selection, i18n, events, commands, crossBlockSelection,
    blockOps, defaultBlockType, inlinePluginRegistry, duplicateBlock,
    tuning: {
      filterThreshold: tuning.toolbar.filterThreshold,
      mobileBreakpoint: tuning.mobileBreakpoint,
      moveAnimationMs: tuning.animations.blockMoveMs,
    },
  })
  scope.register(toolbar)

  const unsubscribeInlineInsert = events.on(EditorEvent.INLINE_PLUGIN_INSERT, (/** @type {{ type: string }} */ payload) => {
    facade.insertInlinePlugin(payload.type)
  })
  scope.register({ destroy: unsubscribeInlineInsert })

  const inlineTools = resolveInlineTools(config.inlineTools, i18n, crossBlockSelection)

  const getInlineControls = (/** @type {string} */ type) => {
    const p = plugins.get(type)
    return p?.renderInlineControls ? p.renderInlineControls.bind(p) : undefined
  }

  const typeSelector = new TypeSelector(blocks, selection, plugins, i18n, crossBlockSelection, events, tuning.toolbar)
  const inlineToolbar = new InlineToolbar(
    rootEl,
    selection,
    blocks,
    events,
    inlineTools,
    getInlineControls,
    typeSelector,
    crossBlockSelection,
    commands,
  )
  scope.register(inlineToolbar)

  const shortcuts = new ShortcutRegistry()
  shortcuts.register('Mod+Z', () => undoManager.undo(), { scope: 'editor' })
  shortcuts.register('Mod+Shift+Z', () => undoManager.redo(), { scope: 'editor' })
  shortcuts.register('Mod+Y', () => undoManager.redo(), { scope: 'editor' })

  const slashCommands = new SlashCommands(rootEl, {
    plugins,
    blocks,
    selection,
    events,
    commands,
    i18n,
    inlinePluginRegistry,
    inlinePluginCtx,
  })
  scope.register(slashCommands)

  shortcuts.register('Escape', () => {
    toolbar.closeToolbox()
    toolbar.closeSettingsMenu()
    inlineToolbar.hide()
    slashCommands.close()
  })

  for (const tool of inlineTools) {
    if (tool.shortcut) {
      shortcuts.register(tool.shortcut, () => inlineToolbar.openTool(tool.type))
    }
  }

  for (const plugin of plugins.values()) {
    if (plugin.shortcuts) {
      for (const sc of plugin.shortcuts) {
        shortcuts.register(sc.combo, () => {
          const current = blocks.getCurrentBlock()
          if (current) {
            pluginMutations.runForBlock(current, () => sc.handler(current.contentElement))
          }
        })
      }
    }
  }

  const uiActivePredicate = () => inlineToolbar.hasActiveUI() || slashCommands.isOpen

  const keyboardManager = new KeyboardManager(rootEl, blockOps, shortcuts, blocks, events, defaultBlockType, uiActivePredicate)
  scope.register(keyboardManager)

  if (inlinePluginRegistry.hasTriggers) {
    scope.register(new TriggerManager(rootEl, inlinePluginRegistry, inlinePluginCtx, events))
  }

  if (inlinePluginRegistry.size > 0) {
    scope.register(new InlinePatternMatcher(
      rootEl,
      inlinePluginRegistry,
      inlinePluginCtx,
      events,
      blocks,
      commands,
    ))
  }

  const clipboard = new Clipboard(rootEl, {
    blocks, selection, plugins, defaultBlockType, crossBlockSelection, events, commands,
    blockOps, inlinePluginRegistry, inlinePluginCtx, diagnostics, uiActivePredicate,
    pendingPasteLabel: i18n.t('clipboard.processingFile'),
    captureSnapshot: () => snapshots.capture(),
  })
  scope.register(clipboard)
  scope.register(new DragManager(rootEl, blocks, toolbar.dragHandle, events, tuning.drag))
  scope.register(new MouseSelectionManager(rootEl, { blocksEl, clickArea, blocks, selection, events, crossBlockSelection, defaultBlockType }))

  // Re-emit block:focused so Toolbar positions itself
  // (initial setCurrentIndex fired before Toolbar was created)
  const currentBlock = blocks.getCurrentBlock()
  if (currentBlock) {
    events.emit(EditorEvent.BLOCK_FOCUSED, { blockId: currentBlock.id })
  }
}

/**
 * Initialize I18n from config.
 * @param {import('./types').EditorConfig} config
 * @returns {I18n}
 */
function initI18n(config) {
  const localeMessages = /** @type {Record<string, import('./types').LocaleValue>} */ (
    config.locale ?? en
  )
  const configuredLang = localeMessages.__lang
  const lang = typeof configuredLang === 'string' ? configuredLang : 'en'
  return new I18n(localeMessages, localeMessages === en ? undefined : en, lang)
}

/**
 * Build the plugin map, inject I18n and placeholder.
 * @param {import('./types').BlockPlugin[]} pluginList
 * @param {I18n} i18n
 * @param {string} defaultBlockType
 * @param {string} [placeholder]
 * @returns {Map<string, import('./types').BlockPlugin>}
 */
function registerPlugins(pluginList, i18n, defaultBlockType, placeholder) {
  /** @type {Map<string, import('./types').BlockPlugin>} */
  const plugins = new Map()
  for (const plugin of pluginList) {
    if (!plugin || typeof plugin.type !== 'string' || !plugin.type) {
      throw new TypeError('Every block plugin must have a non-empty string type')
    }
    if (typeof plugin.render !== 'function' || typeof plugin.save !== 'function') {
      throw new TypeError(`Block plugin "${plugin.type}" must implement render() and save()`)
    }
    if (plugins.has(plugin.type)) {
      throw new Error(`Duplicate block plugin type: "${plugin.type}"`)
    }
    injectPluginI18n(plugin, i18n)
    if (placeholder !== undefined && plugin.type === defaultBlockType && typeof plugin.setPlaceholder === 'function') {
      plugin.setPlaceholder(placeholder)
    }
    plugins.set(plugin.type, plugin)
  }
  if (!plugins.has(defaultBlockType)) {
    throw new Error(`Default block plugin "${defaultBlockType}" is not registered`)
  }
  return plugins
}

/**
 * Create a new block editor instance.
 *
 * @param {import('./types').EditorConfig} config
 * @returns {import('./types').IEditor}
 */
export function createEditor(config) {
  if (!(config?.holder instanceof HTMLElement)) {
    throw new TypeError('createEditor() requires an HTMLElement holder')
  }
  if (!Array.isArray(config.plugins)) {
    throw new TypeError('createEditor() requires a plugins array')
  }
  if (config.readOnly !== undefined && typeof config.readOnly !== 'boolean') {
    throw new TypeError('createEditor() readOnly must be a boolean')
  }
  if (config.injectStyles !== undefined && typeof config.injectStyles !== 'boolean') {
    throw new TypeError('createEditor() injectStyles must be a boolean')
  }
  if (config.placeholder !== undefined && typeof config.placeholder !== 'string') {
    throw new TypeError('createEditor() placeholder must be a string')
  }
  if (
    config.minHeight !== undefined
    && (typeof config.minHeight !== 'number' || !Number.isFinite(config.minHeight) || config.minHeight < 0)
  ) {
    throw new RangeError('createEditor() minHeight must be a finite number greater than or equal to 0')
  }

  let readOnly = config.readOnly ?? false
  const injectStyles = config.injectStyles ?? true
  const defaultBlockType = config.defaultBlock
    || (config.plugins?.some(plugin => plugin?.type === DEFAULT_BLOCK_TYPE)
      ? DEFAULT_BLOCK_TYPE
      : config.plugins?.[0]?.type || DEFAULT_BLOCK_TYPE)
  const theme = config.theme || DEFAULT_THEME
  const tuning = resolveTuning(config.tuning)

  let rootEl
  let blocks
  let inlinePluginRegistry
  let facade
  let pluginOwnership
  const diagnostics = new Diagnostics(config.onDiagnostic, config.diagnosticThresholds)
  const holderOwnership = claimEditorHolder(config.holder)

  try {
    pluginOwnership = claimPluginInstances([
      ...config.plugins,
      ...(config.inlinePlugins || []),
    ])
    const events = new EventBus()
    const documentSchema = new DocumentSchema({
      migrations: config.migrations,
      versionPolicy: config.documentVersionPolicy,
      diagnostics,
    })
    const i18n = initI18n(config)
    const plugins = registerPlugins(config.plugins, i18n, defaultBlockType, config.placeholder)

    const dom = buildEditorDOM(config.holder, theme, config.minHeight)
    rootEl = dom.rootEl
    applyReadOnlyAttributes(rootEl, readOnly)
    const { blocksEl, clickArea } = dom

    blocks = new BlockManager(
      blocksEl,
      plugins,
      events,
      tuning.animations,
      readOnly,
      type => i18n.t('block.unsupported', { type }),
    )
    const commands = new CommandDispatcher(blocks, events, diagnostics)
    blocks.setCommandDispatcher(commands)
    const selection = new SelectionManager(rootEl, blocks)

    // Register inline plugins before inserting blocks so saved inline widget
    // placeholders can be rehydrated as each block enters the document.
    inlinePluginRegistry = new InlinePluginRegistry(config.inlinePlugins || [])
    for (const ip of inlinePluginRegistry.values()) {
      injectPluginI18n(ip, i18n)
    }
    i18n.freeze()
    blocks.setInlinePluginRegistry(inlinePluginRegistry)

    const initialDocument = config.data ? documentSchema.normalize(config.data) : null
    blocks.prepareReplacement(initialDocument?.blocks, defaultBlockType, 'createEditor').commit()
    blocks.setCurrentIndex(0)
    blocks.enableAnimations()
    config.holder.appendChild(rootEl)

    const crossBlockSelection = new CrossBlockSelection()

    const inlinePluginCtx = new PopupManager(
      events,
      EditorEvent.CHANGED,
      blocks,
      commands,
      () => readOnly,
    )
    inlinePluginCtx.setRoot(rootEl)
    inlinePluginRegistry.mount(rootEl, inlinePluginCtx)
    blocks.setInlinePluginContext(inlinePluginCtx)

    if (inlinePluginRegistry.size > 0) {
      for (const block of blocks) {
        hydrateInlinePlugins(block.contentElement, inlinePluginRegistry, inlinePluginCtx)
      }
    }

    const snapshots = new DocumentSnapshotStore(
      blocks,
      inlinePluginRegistry,
      config,
      diagnostics,
      initialDocument?.version ?? documentSchema.currentVersion,
    )
    const publicBlocks = new EditorBlocksApi(blocks, events)
    const publicEvents = new EditorEventSubscriptions(events, commands)
    facade = new EditorFacade(rootEl, {
      blocks,
      selection,
      events,
      defaultBlockType,
      inlinePluginRegistry,
      inlinePluginCtx,
      crossBlockSelection,
      commands,
      documentSchema,
      diagnostics,
      snapshots,
      publicBlocks,
      publicEvents,
      readOnly,
    })
    facade.registerDestroyable(holderOwnership)
    facade.registerDestroyable(pluginOwnership)
    facade.registerDestroyable(inlinePluginCtx)
    facade.registerDestroyable(inlinePluginRegistry)
    /** @type {{ blockId: string, offset: number } | null} */
    let rollbackCaret = null
    commands.configureRollback(
      () => {
        rollbackCaret = selection.getCaret()
        return snapshots.capture()
      },
      document => facade.restoreCheckpoint(document, rollbackCaret ?? undefined),
    )
    const changeNotifier = new ChangeNotifier(() => facade.save(), config.onChange, tuning.change.debounceMs)
    facade.registerDestroyable(changeNotifier)
    events.on(EditorEvent.CHANGED, () => changeNotifier.schedule())

    const undoManager = new UndoManager(
      blocks, events,
      () => snapshots.capture(),
      (data, caret) => facade.restoreCheckpoint(data, caret),
      () => selection.getCaret(),
      tuning.undo,
    )
    undoManager.setCommandsEnabled(!readOnly, { notify: false })
    undoManager.configureCommandActivity(() => commands.active)
    facade.configureHistory(undoManager)
    commands.configureCommit(affected => {
      for (const block of affected) {
        hydrateInlinePlugins(block.contentElement, inlinePluginRegistry, inlinePluginCtx)
      }
      // Validate even inside an undo batch, where commit() intentionally waits.
      snapshots.capture()
      undoManager.commit()
    })
    facade.registerDestroyable(undoManager)

    /** @type {LifecycleScope | null} */
    let editModeScope = null
    const mountEditMode = () => {
      if (editModeScope) return
      const scope = new LifecycleScope()
      try {
        scope.register(wireInputTracking(rootEl, blocks, events))
        wireEditMode({
          rootEl, blocksEl, clickArea, plugins, blocks, selection,
          i18n, events, commands, crossBlockSelection, defaultBlockType,
          inlinePluginRegistry, inlinePluginCtx, facade, snapshots, tuning, config, diagnostics,
          scope, undoManager,
        })
        editModeScope = scope
      } catch (error) {
        scope.destroy()
        throw error
      }
    }

    const unmountEditMode = () => {
      editModeScope?.destroy()
      editModeScope = null
      crossBlockSelection.deactivate(rootEl)
      blocks.clearSelection()
    }
    facade.registerDestroyable({ destroy: unmountEditMode })

    facade.configureReadOnlyTransition(nextReadOnly => {
      const previousReadOnly = facade.readOnly
      // Cancel transient widget previews before capturing the canonical
      // document. Otherwise a preview could be serialized as a committed edit.
      inlinePluginCtx.hidePopup()
      undoManager.commit()
      const document = facade.save()
      unmountEditMode()
      readOnly = nextReadOnly
      blocks.setReadOnly(nextReadOnly)
      applyReadOnlyAttributes(rootEl, nextReadOnly)

      try {
        facade.render(document, undefined, { focus: false, notifyChange: false })
        if (!nextReadOnly) mountEditMode()
        undoManager.setCommandsEnabled(!nextReadOnly, { notify: false })
      } catch (transitionError) {
        unmountEditMode()
        readOnly = previousReadOnly
        blocks.setReadOnly(previousReadOnly)
        applyReadOnlyAttributes(rootEl, previousReadOnly)
        try {
          facade.render(document, undefined, { focus: false, notifyChange: false })
          if (!previousReadOnly) mountEditMode()
        } catch (rollbackError) {
          throw new AggregateError(
            [transitionError, rollbackError],
            'Editor read-only transition and rollback failed',
          )
        }
        throw transitionError
      }
    })

    if (!readOnly) mountEditMode()

    const styleCleanup = injectEditorStyles(plugins, inlinePluginRegistry, injectStyles)
    if (styleCleanup) facade.registerDestroyable(styleCleanup)

    if (config.autofocus && !readOnly) {
      facade.focus()
    }

    facade.markReady()
    events.emit(EditorEvent.READY)

    if (config.onReady) {
      queueMicrotask(() => {
        if (facade.isReady) config.onReady()
      })
    }

    return new EditorHandle(facade)
  } catch (error) {
    diagnostics.emit('editor.create.failed', { errorName: diagnostics.errorName(error) })
    if (facade) {
      facade.destroy()
    } else {
      blocks?.clear()
      inlinePluginRegistry?.destroy()
      pluginOwnership?.destroy()
      holderOwnership.destroy()
      rootEl?.remove()
    }
    throw error
  }
}

export { DocumentSchema } from './DocumentSchema.js'

// ── Public API ──────────────────────────────────────────────────────────────
export { uid } from './uid.js'
export { sanitizeHtml, escapeHtml } from './sanitize.js'
export { createDefaultInlineTools } from '../inline-tools/defaults.js'
export { InlinePluginRegistry } from './InlinePluginRegistry.js'
export { createColorSwatchPlugin } from '../inline-plugins/color.js'
export { createMentionPlugin } from '../inline-plugins/mention/index.js'

// Block plugins are NOT re-exported here — import them directly from their
// own entry points to keep bundles tree-shakeable. See index.html for the
// canonical import shape.
