// @ts-check
/**
 * Mention widget primitives — the renderer-side half of the mention inline
 * plugin (build + read DOM, no editor runtime).
 *
 * Pure DOM factories with no dependencies on the editor (TriggerManager,
 * dropdown UI, search pipeline, i18n, styles). Used by:
 *   - `createMentionPlugin()` — full editor plugin delegates to these.
 *   - Document renderer — `EditorRenderer` receives this via
 *     `RendererConfig.inlinePlugins` and uses it to rehydrate committed
 *     mention placeholders (`{{<id>}}`) back into pills.
 */

import { generateInlineId } from '../../shared/inlineMarshal.js'
import { normalizeTextValue } from '../../shared/textFormat.js'

/** @typedef {import('./index').MentionWidgetData} MentionWidgetData */

/**
 * @param {Record<string, unknown>} data
 * @param {string} trigger
 * @param {string} [id] Stable widget instance id. Preserved across save /
 *   load round-trips. Generated if not supplied (fresh commit path).
 * @returns {HTMLElement}
 */
function createWidget(data, trigger, id) {
  const value = normalizeTextValue(data.id)
  const name = normalizeTextValue(data.name)
  const span = document.createElement('span')
  span.className = 'oe-ip oe-ip--mention'
  span.setAttribute('data-inline-plugin', 'mention')
  span.setAttribute('data-id', id || generateInlineId())
  span.setAttribute('data-value', value)
  span.textContent = trigger + name
  return span
}

/**
 * @param {HTMLElement} element
 * @param {string} trigger
 * @returns {MentionWidgetData}
 */
function getData(element, trigger) {
  const text = element.textContent || ''
  const name = text.startsWith(trigger) ? text.slice(trigger.length) : text
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
 * The renderer must receive the same trigger as the editor plugin when a
 * non-default trigger is used. The trigger is presentation configuration and
 * is not duplicated in every serialized widget.
 *
 * @param {string} [trigger='@'] Exactly one Unicode code point.
 * @returns {import('../../renderer/types').InlinePluginLike}
 */
export function createMentionWidget(trigger = '@') {
  if (typeof trigger !== 'string' || Array.from(trigger).length !== 1) {
    throw new TypeError('Mention widget trigger must be exactly one Unicode code point')
  }
  return {
    type: 'mention',
    createWidget: (data, id) => createWidget(data, trigger, id),
    getData: element => getData(element, trigger),
  }
}
