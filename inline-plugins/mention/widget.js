// @ts-check
/**
 * Mention widget primitives — the read-only half of the mention inline
 * plugin (build + read DOM, no editor runtime).
 *
 * Pure DOM factories with no dependencies on the editor (TriggerManager,
 * dropdown UI, search pipeline, i18n, styles). Used by:
 *   - `createMentionPlugin()` — full editor plugin delegates to these.
 *   - Read-only renderer — `EditorRenderer` receives this via
 *     `RendererConfig.inlinePlugins` and uses it to rehydrate committed
 *     mention placeholders (`{{<id>}}`) back into pills.
 */

import { generateInlineId } from '../../shared/inlineMarshal.js'

/** @typedef {import('./index').MentionWidgetData} MentionWidgetData */

/**
 * Trigger character (the `@` in front of the name). Kept in sync with
 * the full plugin's default — the widget IS the trigger + the name.
 */
const TRIGGER = '@'

/**
 * @param {MentionWidgetData} data
 * @param {string} [id] Stable widget instance id. Preserved across save /
 *   load round-trips. Generated if not supplied (fresh commit path).
 * @returns {HTMLElement}
 */
function createWidget(data, id) {
  const span = document.createElement('span')
  span.className = 'oe-ip oe-ip--mention'
  span.setAttribute('data-inline-plugin', 'mention')
  span.setAttribute('data-id', id || generateInlineId())
  span.setAttribute('data-value', String(data.id ?? ''))
  span.textContent = TRIGGER + String(data.name ?? '')
  return span
}

/**
 * @param {HTMLElement} element
 * @returns {MentionWidgetData}
 */
function getData(element) {
  const text = element.textContent || ''
  const name = text.startsWith(TRIGGER) ? text.slice(TRIGGER.length) : text
  return {
    id: element.dataset.value || '',
    name,
  }
}

/**
 * Lightweight mention widget factory — enough for the renderer (and any
 * consumer that only needs the DOM round-trip without editor runtime).
 *
 * Implements the structural subset of `InlinePlugin` expected by
 * `EditorRenderer.config.inlinePlugins` (`type` + `createWidget` + `getData`).
 *
 * @returns {import('../../renderer/types').InlinePluginLike}
 */
export function createMentionWidget() {
  return {
    type: 'mention',
    createWidget,
    getData,
  }
}
