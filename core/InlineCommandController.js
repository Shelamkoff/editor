// @ts-check

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
      this.#runtime.insertInlineWidget(target.blockId, target.fieldKey, target.range, type, explicitData)
      this.#selection.setCaret(target.blockId, {
        fieldKey: target.fieldKey,
        offset: target.range.start + 1,
      })
      return true
    }

    const fresh = definition.insertion?.createInitial?.()
    if (!fresh) {
      const data = definition.schema.createDefault()
      this.#runtime.insertInlineWidget(target.blockId, target.fieldKey, target.range, type, data)
      this.#selection.setCaret(target.blockId, {
        fieldKey: target.fieldKey,
        offset: target.range.start + 1,
      })
      return true
    }

    if (fresh.kind === 'text') {
      this.#runtime.replaceRichText(
        target.blockId,
        target.fieldKey,
        target.range,
        { kind: 'text', text: fresh.text },
      )
      this.#selection.setCaret(target.blockId, {
        fieldKey: target.fieldKey,
        offset: target.range.start + fresh.text.length,
      })
      this.#onFreshText?.({
        type,
        blockId: target.blockId,
        fieldKey: target.fieldKey,
      })
      return true
    }

    this.#runtime.insertInlineWidget(target.blockId, target.fieldKey, target.range, type, fresh.data)
    this.#selection.setCaret(target.blockId, {
      fieldKey: target.fieldKey,
      offset: target.range.start + 1,
    })
    return true
  }

  commitTrigger(type, session, data) {
    if (this.#runtime.readOnly) return false
    const definition = this.#registry.getInlineDefinition(type)
    if (!definition) return false
    const encoded = definition.schema.encode(data)
    this.#runtime.insertInlineWidget(
      session.blockId,
      session.fieldKey,
      session.range,
      type,
      encoded.data,
    )
    this.#selection.setCaret(session.blockId, {
      fieldKey: session.fieldKey,
      offset: session.range.start + 1,
    })
    return true
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
