import { el } from './dom.js'
import { EditorEvent } from './editorEvents.js'
import { EventBus } from '../../event-bus/index.js'
import { I18n } from './I18n.js'
import { BlockManager } from './BlockManager.js'
import { SelectionManager } from './SelectionManager.js'
import { EditorFacade } from './EditorFacade.js'
import { BlockOperations } from './BlockOperations.js'
import { ShortcutRegistry } from './ShortcutRegistry.js'
import { Toolbar } from './toolbar/Toolbar.js'
import { InlineToolbar } from './inline-toolbar/InlineToolbar.js'
import { TypeSelector } from './TypeSelector.js'
import { KeyboardManager } from './KeyboardManager.js'
import { UndoManager } from './UndoManager.js'
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
import { populateBlocks } from './populateBlocks.js'
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
  const allDefaults = createDefaultInlineTools({ i18n, crossBlockSelection })
  if (!config) return allDefaults

  /** @type {Map<string, import('./types').InlineTool>} */
  const defaultMap = new Map()
  for (const tool of allDefaults) defaultMap.set(tool.type, tool)

  return config.map(item => {
    if (typeof item === 'string') {
      const tool = defaultMap.get(item)
      if (!tool) throw new Error(`Unknown inline tool: "${item}"`)
      return tool
    }
    return item
  })
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
  if (minHeight) rootEl.style.minHeight = `${minHeight}px`
  const blocksEl = el('div', 'oe-blocks')
  const clickArea = el('div', 'oe-click-area')
  rootEl.appendChild(blocksEl)
  rootEl.appendChild(clickArea)
  holder.appendChild(rootEl)
  return { rootEl, blocksEl, clickArea }
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
    const target = /** @type {Node} */ (e.target)
    const block = blocks.getBlockByChildNode(target)
    if (!block) return
    const index = blocks.getBlockIndex(block.id)
    if (index !== blocks.getCurrentIndex()) {
      blocks.setCurrentIndex(index)
    }
  }

  const onInput = () => {
    const current = blocks.getCurrentBlock()
    if (current) {
      events.emit(EditorEvent.BLOCK_CHANGED, { blockId: current.id })
    }
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
 * Collect and inject plugin stylesheets via <link> tags (reference-counted).
 *
 * Per-plugin config knobs (passed via plugin constructor):
 *  - `injectStyles: false`  — skip the default stylesheet for this plugin
 *  - `css: '/path/to.css'`  — inject an additional stylesheet AFTER the default
 *
 * @param {Map<string, import('./types').BlockPlugin>} plugins
 * @returns {{ destroy(): void } | null}
 */
function injectPluginStyles(plugins) {
  /** @type {string[]} */
  const styleUrls = []
  for (const plugin of plugins.values()) {
    const cfg = typeof plugin.getPluginConfig === 'function'
      ? plugin.getPluginConfig()
      : undefined
    if (cfg?.injectStyles !== false) {
      const urls = plugin.constructor?.styles
      if (urls) styleUrls.push(...urls)
    }
    if (cfg?.css) styleUrls.push(cfg.css)
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
 * @property {import('./CrossBlockSelection').CrossBlockSelection} crossBlockSelection
 * @property {string} defaultBlockType
 * @property {import('./InlinePluginRegistry').InlinePluginRegistry} inlinePluginRegistry
 * @property {import('./types').InlinePluginContext} inlinePluginCtx
 * @property {EditorFacade} facade
 * @property {import('./config').EditorTuning} tuning
 * @property {import('./types').EditorConfig} config
 */

/**
 * Wire all edit-mode managers (toolbar, undo, clipboard, drag, keyboard, etc.).
 * Only called when `readOnly` is false.
 * @param {EditModeDeps} deps
 */
function wireEditMode(deps) {
  const {
    rootEl, blocksEl, clickArea, plugins, blocks, selection,
    i18n, events, crossBlockSelection, defaultBlockType,
    inlinePluginRegistry, inlinePluginCtx, facade, tuning, config,
  } = deps

  const blockOps = new BlockOperations(blocks, selection, defaultBlockType, events)

  const toolbar = new Toolbar(rootEl, {
    plugins, blocks, selection, i18n, events, crossBlockSelection,
    blockOps, defaultBlockType, inlinePluginRegistry,
    tuning: {
      filterThreshold: tuning.toolbar.filterThreshold,
      mobileBreakpoint: tuning.mobileBreakpoint,
      moveAnimationMs: tuning.animations.blockMoveMs,
    },
  })
  facade.registerDestroyable(toolbar)

  events.on(EditorEvent.INLINE_PLUGIN_INSERT, (/** @type {{ type: string }} */ payload) => {
    facade.insertInlinePlugin(payload.type)
  })

  const inlineTools = resolveInlineTools(config.inlineTools, i18n, crossBlockSelection)

  const getInlineControls = (/** @type {string} */ type) => {
    const p = plugins.get(type)
    return p?.renderInlineControls ? p.renderInlineControls.bind(p) : undefined
  }

  const typeSelector = new TypeSelector(blocks, selection, plugins, i18n, crossBlockSelection, events, tuning.toolbar)
  const inlineToolbar = new InlineToolbar(rootEl, selection, blocks, events, inlineTools, getInlineControls, typeSelector, crossBlockSelection)
  facade.registerDestroyable(inlineToolbar)

  const undoManager = new UndoManager(
    blocks, events,
    () => facade.save(),
    (data, caret) => facade.render(data, caret),
    () => selection.getCaret(),
    tuning.undo,
  )
  facade.registerDestroyable(undoManager)

  const shortcuts = new ShortcutRegistry()
  shortcuts.register('Mod+Z', () => undoManager.undo())
  shortcuts.register('Mod+Shift+Z', () => undoManager.redo())

  const slashCommands = new SlashCommands(rootEl, { plugins, blocks, selection, events, i18n, inlinePluginRegistry, inlinePluginCtx })
  facade.registerDestroyable(slashCommands)

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
          if (current) sc.handler(current.contentElement)
        })
      }
    }
  }

  const uiActivePredicate = () => inlineToolbar.hasActiveUI() || slashCommands.isOpen

  const keyboardManager = new KeyboardManager(rootEl, blockOps, shortcuts, blocks, events, defaultBlockType, uiActivePredicate)
  facade.registerDestroyable(keyboardManager)

  if (inlinePluginRegistry.hasTriggers) {
    facade.registerDestroyable(new TriggerManager(rootEl, inlinePluginRegistry, inlinePluginCtx, events))
  }

  if (inlinePluginRegistry.size > 0) {
    facade.registerDestroyable(new InlinePatternMatcher(rootEl, inlinePluginRegistry, inlinePluginCtx, events, blocks))
  }

  const clipboard = new Clipboard(rootEl, {
    blocks, selection, plugins, defaultBlockType, crossBlockSelection, events, blockOps, uiActivePredicate,
  })
  facade.registerDestroyable(clipboard)
  facade.registerDestroyable(new DragManager(rootEl, blocksEl, blocks, toolbar.dragHandle, events, tuning.drag))
  facade.registerDestroyable(new MouseSelectionManager(rootEl, { blocksEl, clickArea, blocks, selection, events, crossBlockSelection, defaultBlockType }))

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
  const localeMessages = /** @type {Record<string, any>} */ (config.locale) || en
  const lang = localeMessages.__lang || 'en'
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
    injectPluginI18n(plugin, i18n)
    if (placeholder && plugin.type === defaultBlockType && /** @type {*} */ (plugin).setPlaceholder) {
      /** @type {*} */ (plugin).setPlaceholder(placeholder)
    }
    plugins.set(plugin.type, plugin)
  }
  return plugins
}

/**
 * Create a new block editor instance.
 *
 * @param {import('./types').EditorConfig} config
 * @returns {EditorFacade}
 */
export function createEditor(config) {
  const readOnly = config.readOnly ?? false
  const defaultBlockType = config.defaultBlock || DEFAULT_BLOCK_TYPE
  const theme = config.theme || DEFAULT_THEME
  const tuning = resolveTuning(config.tuning)

  const events = new EventBus()
  const i18n = initI18n(config)
  const plugins = registerPlugins(config.plugins, i18n, defaultBlockType, config.placeholder)

  const { rootEl, blocksEl, clickArea } = buildEditorDOM(config.holder, theme, config.minHeight)

  const blocks = new BlockManager(blocksEl, plugins, events, tuning.animations)
  const selection = new SelectionManager(rootEl, blocks)

  // Inline plugin registry must exist BEFORE `populateBlocks` so that any
  // saved inline widget placeholders in the initial content get rehydrated
  // (BlockManager.insert → plugin.mapTextFields → deserializeInlineHtml).
  const inlinePluginRegistry = new InlinePluginRegistry(config.inlinePlugins || [])
  for (const ip of inlinePluginRegistry.values()) {
    injectPluginI18n(ip, i18n)
  }
  i18n.freeze()
  blocks.setInlinePluginRegistry(inlinePluginRegistry)

  populateBlocks(blocks, config.data?.blocks, defaultBlockType)
  blocks.setCurrentIndex(0)
  blocks.enableAnimations()

  const crossBlockSelection = new CrossBlockSelection()

  const inlinePluginCtx = new PopupManager(events, EditorEvent.CHANGED)
  inlinePluginCtx.setRoot(rootEl)

  if (inlinePluginRegistry.size > 0) {
    for (const block of blocks) {
      hydrateInlinePlugins(block.contentElement, inlinePluginRegistry, inlinePluginCtx)
    }
  }

  const facade = new EditorFacade(rootEl, blocks, selection, events, config, inlinePluginRegistry, inlinePluginCtx, crossBlockSelection)
  facade.registerDestroyable(inlinePluginCtx)
  const changeNotifier = new ChangeNotifier(() => facade.save(), config.onChange, tuning.change.debounceMs)
  facade.registerDestroyable(changeNotifier)

  facade.registerDestroyable(wireInputTracking(rootEl, blocks, events))

  events.on(EditorEvent.CHANGED, () => changeNotifier.schedule())

  if (!readOnly) {
    wireEditMode({
      rootEl, blocksEl, clickArea, plugins, blocks, selection,
      i18n, events, crossBlockSelection, defaultBlockType,
      inlinePluginRegistry, inlinePluginCtx, facade, tuning, config,
    })
  }

  const styleCleanup = injectPluginStyles(plugins)
  if (styleCleanup) facade.registerDestroyable(styleCleanup)

  if (config.autofocus) {
    facade.focus()
  }

  facade.markReady()
  events.emit(EditorEvent.READY)

  if (config.onReady) {
    queueMicrotask(() => config.onReady())
  }

  return facade
}

// ── Public API ──────────────────────────────────────────────────────────────
export { EditorFacade } from './EditorFacade.js'
export { uid } from './uid.js'
export { sanitizeHtml, escapeHtml } from './sanitize.js'
export { createDefaultInlineTools } from '../inline-tools/defaults.js'
export { InlinePluginRegistry } from './InlinePluginRegistry.js'
export { createColorSwatchPlugin } from '../inline-plugins/color.js'
export { createMentionPlugin } from '../inline-plugins/mention/index.js'

// Block plugins are NOT re-exported here — import them directly from their
// own entry points to keep bundles tree-shakeable. See frontend/editor/demo.html
// for the canonical import shape.
