// @ts-check
import { cloneEditorData } from '../shared/cloneEditorData.js'
import { synchronousResult } from '../shared/synchronousResult.js'

export class InlineCommandController {
  #runtime
  #registry
  #selection
  #onFreshText

  constructor({ runtime, registry, selection, onFreshText = null }) {
    if (!runtime?.insertInlineWidget) throw new TypeError('InlineCommandController requires a DocumentRuntime')
    if (!registry?.getInlineDefinition) throw new TypeError('InlineCommandController requires an ExtensionRegistry')
    if (!selection?.capture) throw new TypeError('InlineCommandController requires LogicalSelection')
    this.#runtime = runtime
    this.#registry = registry
    this.#selection = selection
    this.#onFreshText = typeof onFreshText === 'function' ? onFreshText : null
  }

  insert(type, explicitData) {
    if (this.#runtime.readOnly) return false
    const definition = this.#registry.getInlineDefinition(type)
    if (!definition) return false
    const target = this.#currentRange()
    if (!target) return false

    if (explicitData !== undefined) {
      return this.#insertWidget(type, target, explicitData, definition.insertion?.trailingText)
    }

    const fresh = definition.insertion?.createInitial?.()
    if (!fresh) {
      const data = definition.schema.createDefault()
      return this.#insertWidget(type, target, data, definition.insertion?.trailingText)
    }

    if (fresh.kind === 'text') {
      this.#withCaret(target, target.range.start + fresh.text.length, () => this.#runtime.replaceRichText(
        target.blockId,
        target.fieldKey,
        target.range,
        { kind: 'text', text: fresh.text },
      ))
      this.#onFreshText?.({
        type,
        blockId: target.blockId,
        fieldKey: target.fieldKey,
      })
      return true
    }

    return this.#insertWidget(type, target, fresh.data, definition.insertion?.trailingText)
  }

  pasteText(text, target = this.#currentRange()) {
    if (this.#runtime.readOnly || !target || typeof text !== 'string' || !text) return false

    // Match, validate and detach every candidate under one preparation boundary.
    // A failed candidate is not a plain-text fallback after Paste is owned.
    const segments = this.#runtime.prepareExtensionValue(() => {
      const matches = []
      let order = 0
      for (const type of this.#registry.inlineTypes) {
        const definition = this.#registry.getInlineDefinition(type)
        const paste = definition?.paste
        if (!paste?.patterns?.length || typeof paste.fromMatch !== 'function') continue

        for (const pattern of paste.patterns) {
          if (!(pattern instanceof RegExp)) continue
          let source = pattern.source
          if (source.startsWith('^')) source = source.slice(1)
          if (source.endsWith('$')) source = source.slice(0, -1)
          if (!source) continue

          const flags = [...pattern.flags]
            .filter(flag => flag !== 'g' && flag !== 'y')
            .join('') + 'g'
          const search = new RegExp(source, flags)

          for (const match of text.matchAll(search)) {
            const value = match[0]
            if (!value) continue

            pattern.lastIndex = 0
            let accepted
            try { accepted = synchronousResult(pattern.test(value)) }
            finally { pattern.lastIndex = 0 }
            if (typeof accepted !== 'boolean') {
              throw new TypeError(`Inline Paste pattern for "${type}" must return a boolean`)
            }
            if (!accepted) continue

            const candidate = synchronousResult(paste.fromMatch(value))
            if (candidate === null) continue
            if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
              throw new TypeError(`Inline Paste matcher for "${type}" must return an object or null`)
            }
            const data = cloneEditorData(candidate)
            matches.push({
              start: match.index ?? 0,
              end: (match.index ?? 0) + value.length,
              type,
              data,
              order: order++,
            })
          }
        }
      }

      if (!matches.length) return null
      matches.sort((left, right) => (
        left.start - right.start
        || (right.end - right.start) - (left.end - left.start)
        || left.order - right.order
      ))

      const prepared = []
      let cursor = 0
      let textStart = 0
      for (const match of matches) {
        if (match.start < cursor) continue
        if (match.start > textStart) {
          prepared.push({ kind: 'text', text: text.slice(textStart, match.start) })
        }
        prepared.push({ kind: 'widget', type: match.type, data: match.data })
        cursor = match.end
        textStart = match.end
      }
      if (textStart < text.length) prepared.push({ kind: 'text', text: text.slice(textStart) })
      return prepared.some(segment => segment.kind === 'widget') ? prepared : null
    })
    if (!segments) return false

    const result = this.#runtime.interact('inline.paste', () => this.#runtime.replaceRichTextWithInlineSegments(
      target.blockId,
      target.fieldKey,
      target.range,
      segments,
    ), caret => caret ? { anchor: caret, focus: { ...caret } } : null)
    if (!result) return false
    this.#selection.setCaret(result.blockId, {
      fieldKey: result.fieldKey,
      offset: result.offset,
    })
    return true
  }

  commitTrigger(type, session, data, options = {}) {
    if (this.#runtime.readOnly) return false
    const definition = this.#registry.getInlineDefinition(type)
    if (!definition) return false
    const encoded = definition.schema.encode(data)
    return this.#insertWidget(type, session, encoded.data, options.trailingText ?? definition.insertion?.trailingText)
  }

  #insertWidget(type, target, data, trailingText = '') {
    if (typeof trailingText !== 'string' || /[\r\n]/.test(trailingText)) throw new TypeError('Inline trailing text must be a single-line string')
    this.#withCaret(target, target.range.start + 1 + trailingText.length, () => this.#runtime.insertInlineWidget(
      target.blockId, target.fieldKey, target.range, type, data, { trailingText },
    ))
    return true
  }

  #withCaret(target, offset, operation) {
    const point = { blockId: target.blockId, fieldKey: target.fieldKey, offset }
    const result = this.#runtime.interact('inline.insert', operation, () => ({ anchor: point, focus: { ...point } }))
    this.#selection.setCaret(target.blockId, { fieldKey: target.fieldKey, offset })
    return result
  }

  #currentRange() {
    const bookmark = this.#selection.capture()
    if (!bookmark?.anchor || !bookmark?.focus) return null
    if (
      bookmark.anchor.blockId !== bookmark.focus.blockId
      || bookmark.anchor.fieldKey !== bookmark.focus.fieldKey
    ) return null
    return {
      blockId: bookmark.anchor.blockId,
      fieldKey: bookmark.anchor.fieldKey,
      range: {
        start: Math.min(bookmark.anchor.offset, bookmark.focus.offset),
        end: Math.max(bookmark.anchor.offset, bookmark.focus.offset),
      },
    }
  }
}
