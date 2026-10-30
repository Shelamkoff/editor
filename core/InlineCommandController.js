// @ts-check
import { cloneEditorData } from '../shared/cloneEditorData.js'
import { equalJsonValue } from '../shared/jsonData.js'
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
    const caretLease = this.#caretLease()
    const definition = this.#registry.getInlineDefinition(type)
    if (!definition || !this.#canRestoreCaret(caretLease)) return false
    const target = this.#currentRange()
    if (!target || !this.#canRestoreCaret(caretLease)) return false

    if (explicitData !== undefined) {
      const trailingText = this.#runtime.prepareExtensionValue(
        () => definition.insertion?.trailingText ?? '',
      )
      if (!this.#canRestoreCaret(caretLease) || !this.#stillSelected(target)) return false
      return this.#insertWidget(type, target, explicitData, trailingText)
    }

    const insertion = this.#runtime.prepareExtensionValue(() => {
      const trailingText = definition.insertion?.trailingText ?? ''
      if (typeof trailingText !== 'string' || /[\r\n]/.test(trailingText)) {
        throw new TypeError('Inline trailing text must be a single-line string')
      }
      const initial = synchronousResult(definition.insertion?.createInitial?.())
      const fresh = initial ? cloneEditorData(initial) : null
      if (fresh && (fresh.kind === 'text'
        ? typeof fresh.text !== 'string'
        : fresh.kind !== 'widget' || !fresh.data || typeof fresh.data !== 'object' || Array.isArray(fresh.data))) {
        throw new TypeError('Invalid inline insertion result')
      }
      const defaultData = fresh ? null : cloneEditorData(synchronousResult(definition.schema.createDefault()))
      return { fresh, defaultData, trailingText }
    })
    // Extension factories can revoke this editor through host callbacks while
    // preparation is running. Do not enter an obsolete canonical command.
    if (!this.#canRestoreCaret(caretLease) || !this.#stillSelected(target)) return false

    if (!insertion.fresh) {
      return this.#insertWidget(type, target, insertion.defaultData, insertion.trailingText)
    }

    if (insertion.fresh.kind === 'text') {
      // Rich-text replacement returns void on success, unlike widget insert
      // which returns an occurrence ID. Preserve an explicit failure result.
      const inserted = this.#withCaret(target, target.range.start + insertion.fresh.text.length, () => {
        const result = this.#runtime.replaceRichText(
          target.blockId,
          target.fieldKey,
          target.range,
          { kind: 'text', text: insertion.fresh.text },
        )
        return result === undefined ? true : result
      })
      if (!inserted) return false
      // Commit observers or the native focus restoration can synchronously
      // destroy the editor. A successful canonical edit must not enqueue a
      // fresh trigger query from that now-retired owner.
      if (this.#canRestoreCaretTo(caretLease, target.blockId, target.fieldKey)) this.#onFreshText?.({
        type,
        blockId: target.blockId,
        fieldKey: target.fieldKey,
      })
      return true
    }

    return this.#insertWidget(type, target, insertion.fresh.data, insertion.trailingText)
  }

  /** Match one already-typed word before a native Space/Enter delimiter.
   * Unlike a Paste scan, the v1 delimiter contract replaces the entire word
   * once a registered expression accepts it, even for unanchored patterns.
   */
  commitTypedPattern(word, target, delimiter) {
    if (this.#runtime.readOnly || typeof word !== 'string' || !word
      || !target?.range || target.range.end - target.range.start !== word.length
      || (delimiter !== ' ' && delimiter !== 'Enter')) return false

    const caretLease = this.#caretLease()
    // The initiating caret is collapsed after the word; the replacement range
    // covers the word itself. Preserve the former so extension matching cannot
    // author into an obsolete range after selecting a newer caret.
    const selected = this.#currentRange()
    if (!selected || !this.#canRestoreCaret(caretLease)) return false
    const prepared = this.#runtime.prepareExtensionValue(() => {
      for (const type of this.#registry.inlineTypes) {
        const definition = this.#registry.getInlineDefinition(type)
        const paste = definition?.paste
        if (!paste?.patterns?.length || typeof paste.fromMatch !== 'function') continue
        for (const pattern of paste.patterns) {
          if (!(pattern instanceof RegExp)) continue
          // Reuse the plugin's test behavior without modifying its RegExp
          // lastIndex; the same definition may be shared by other editors.
          const validator = new RegExp(pattern.source, pattern.flags)
          const validate = pattern.test
          const accepted = synchronousResult(Reflect.apply(validate, validator, [word]))
          if (typeof accepted !== 'boolean') {
            throw new TypeError(`Inline typed pattern for "${type}" must return a boolean`)
          }
          if (!accepted) continue
          const candidate = synchronousResult(paste.fromMatch(word))
          if (candidate === null) continue
          if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
            throw new TypeError(`Inline typed matcher for "${type}" must return an object or null`)
          }
          return { type, data: cloneEditorData(candidate) }
        }
      }
      return null
    })
    if (!prepared || !this.#canRestoreCaret(caretLease)
      || !this.#stillSelected(selected)) return false

    const segments = [
      { kind: 'widget', type: prepared.type, data: prepared.data },
      ...(delimiter === ' ' ? [{ kind: 'text', text: ' ' }] : []),
    ]
    const result = this.#interactWithCaret(caretLease, 'inline.typed-pattern', () => (
      this.#runtime.replaceRichTextWithInlineSegments(
        target.blockId, target.fieldKey, target.range, segments,
      )
    ), caret => caret)
    return Boolean(result)
  }

  pasteText(text, target = this.#currentRange()) {
    if (this.#runtime.readOnly || !target || typeof text !== 'string' || !text) return false

    // Match, validate and detach every candidate under one preparation boundary.
    // A failed candidate is not a plain-text fallback after Paste is owned.
    const caretLease = this.#caretLease()
    const segments = this.#runtime.prepareExtensionValue(() => {
      const matches = []
      let order = 0
      // V1 matches whitespace-delimited words, not substrings within one
      // word. Scanning for unanchored fragments converted URL suffixes such
      // as "https://host/#fff" into widgets and could convert one token twice.
      for (const token of text.matchAll(/\S+/g)) {
        const value = token[0]
        let matchedWord = false
        for (const type of this.#registry.inlineTypes) {
          const definition = this.#registry.getInlineDefinition(type)
          const paste = definition?.paste
          if (!paste?.patterns?.length || typeof paste.fromMatch !== 'function') continue

          for (const pattern of paste.patterns) {
            if (!(pattern instanceof RegExp)) continue
            // Run the extension's acceptance predicate against the *whole*
            // token with the original flags, without changing its own
            // RegExp.lastIndex (shared patterns may be frozen or reused).
            const validator = new RegExp(pattern.source, pattern.flags)
            const validate = pattern.test
            validator.lastIndex = 0
            let accepted
            try { accepted = synchronousResult(Reflect.apply(validate, validator, [value])) }
            finally { validator.lastIndex = 0 }
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
              start: token.index ?? 0,
              end: (token.index ?? 0) + value.length,
              type, data, order: order++,
            })
            matchedWord = true
            break
          }
          if (matchedWord) break
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
    if (!segments || !this.#canRestoreCaret(caretLease)
      || !this.#stillSelected(target)) return false

    const result = this.#interactWithCaret(caretLease, 'inline.paste', () => this.#runtime.replaceRichTextWithInlineSegments(
      target.blockId,
      target.fieldKey,
      target.range,
      segments,
    ), caret => caret)
    return Boolean(result)
  }

  commitTrigger(type, session, data, options = {}) {
    if (this.#runtime.readOnly) return false
    const caretLease = this.#caretLease()
    const definition = this.#registry.getInlineDefinition(type)
    if (!definition || !this.#canRestoreCaret(caretLease)) return false
    const prepared = this.#runtime.prepareExtensionValue(() => ({
      encoded: cloneEditorData(synchronousResult(definition.schema.encode(data))),
      trailingText: options.trailingText ?? definition.insertion?.trailingText ?? '',
    }))
    if (!this.#canRestoreCaret(caretLease)) return false
    return this.#insertWidget(type, session, prepared.encoded.data, prepared.trailingText)
  }

  #insertWidget(type, target, data, trailingText = '') {
    if (typeof trailingText !== 'string' || /[\r\n]/.test(trailingText)) throw new TypeError('Inline trailing text must be a single-line string')
    return this.#withCaret(target, target.range.start + 1 + trailingText.length, () => this.#runtime.insertInlineWidget(
      target.blockId, target.fieldKey, target.range, type, data, { trailingText },
    ))
  }

  #withCaret(target, offset, operation) {
    const caretLease = this.#caretLease()
    if (!this.#canRestoreCaret(caretLease)) return false
    const point = { blockId: target.blockId, fieldKey: target.fieldKey, offset }
    return Boolean(this.#interactWithCaret(caretLease, 'inline.insert', operation, () => point))
  }

  #interactWithCaret(lease, name, operation, resultPoint) {
    // The post-projection/pre-publication snapshot distinguishes this command's
    // DOM movement from a newer observer decision. In particular a multiline
    // Paste may target a newly created field while native selection is still
    // in the source. A different field alone cannot classify that as reentry.
    const capture = () => cloneEditorData(this.#selection.capture() ?? null)
    let expected = capture()
    if (!this.#canRestoreCaret(lease)) return false
    const result = this.#runtime.interact(name, operation, value => {
      expected = capture()
      const point = resultPoint(value)
      return point ? { anchor: point, focus: { ...point } } : null
    })
    if (!result || !this.#canRestoreCaret(lease)) return result
    const revision = this.#runtime.revision
    let current
    try { current = capture() } catch { return result }
    if (!this.#canRestoreCaret(lease) || revision !== this.#runtime.revision
      || !equalJsonValue(current, expected)) return result
    const point = resultPoint(result)
    if (point) this.#selection.setCaret(point.blockId, { fieldKey: point.fieldKey, offset: point.offset })
    return result
  }

  #canRestoreCaretTo(lease, blockId, fieldKey) {
    if (!this.#canRestoreCaret(lease)) return false
    // A synchronous commit observer may move the author's caret to another
    // block/field without changing document revision or control mode. Never
    // reclaim a different logical editing host after this command completed.
    let current
    try { current = this.#selection.capture() }
    catch { return false }
    if (!this.#canRestoreCaret(lease)) return false
    const inDifferentField = point => point && (
      point.blockId !== blockId || point.fieldKey !== fieldKey
    )
    return !inDifferentField(current?.anchor) && !inDifferentField(current?.focus)
  }

  #caretLease() {
    return { generation: this.#runtime.generation, modeEpoch: this.#runtime.modeEpoch }
  }

  #canRestoreCaret(lease) {
    // The transaction is already committed when user observers run. They may
    // synchronously destroy the editor or revoke its input mode. The old
    // command must not focus detached fields or reclaim a retired caret.
    return this.#runtime.health !== 'destroyed'
      && this.#runtime.health !== 'failed'
      && !this.#runtime.readOnly
      && this.#runtime.generation === lease.generation
      && this.#runtime.modeEpoch === lease.modeEpoch
  }

  #stillSelected(expected) {
    // Inline factories and paste matchers are extension callbacks. A newer
    // author caret is independent of document revision and control mode:
    // never apply a prepared edit to the previous logical host or offsets.
    try {
      const actual = this.#currentRange()
      return actual !== null
        && actual.blockId === expected.blockId
        && actual.fieldKey === expected.fieldKey
        && actual.range.start === expected.range.start
        && actual.range.end === expected.range.end
    } catch { return false }
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
