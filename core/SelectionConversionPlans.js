// @ts-check
import { cloneEditorData } from '../shared/cloneEditorData.js'
import { getRichTextLogicalLength } from '../shared/richTextOperations.js'
import { synchronousResult } from '../shared/synchronousResult.js'
import { orderedLogicalRange, sliceSelection, endpointSelection, updatedRecord } from './LogicalRangePlans.js'
import { prepareClipboardBlockSlice, selectedSourceData } from './ClipboardPlans.js'

/** @typedef {import('./CanonicalTransforms.js').CanonicalEdit} CanonicalEdit */

const noChange = () => ({ edits: /** @type {CanonicalEdit[]} */ ([]), result: /** @type {false} */ (false) })
const cloneInline = value => value === undefined ? undefined : cloneEditorData(value)

/** @param {any} s @param {any} payload */
function payloadHasContent(s, payload) {
  if (!payload || typeof payload !== 'object' || payload.kind !== 'rich-text'
    || typeof payload.data?.text !== 'string') return true
  return getRichTextLogicalLength(payload.data.text, {}, s.ownerDocument) > 0
}

/** Complete the declared import/default/configuration decision before editing the draft.
 * This is shared with ordinary block conversion and toolbox insertion.
 * @param {any} s
 * @param {any} targetDefinition
 * @param {any} payload
 * @param {{type:string,toolboxItemId?:string}} target
 * @param {any} [baseData]
 * @param {Set<string>} [reserved]
 * @param {boolean | undefined} [acceptedImport] Already validated by the owning selection route.
 */
export function conversionTargetData(s, targetDefinition, payload, target, baseData = undefined, reserved = new Set(), acceptedImport = undefined) {
  const candidate = payload == null ? null : cloneEditorData(payload)
  const conversion = targetDefinition.capabilities?.conversion
  let data
  if (baseData !== undefined) {
    data = cloneEditorData(baseData)
  } else {
    let accepted = false
    const canImport = acceptedImport === undefined ? conversion?.canImport : null
    if (candidate && (acceptedImport !== undefined || typeof canImport === 'function')) {
      const outcome = acceptedImport === undefined
        ? synchronousResult(Reflect.apply(canImport, conversion, [cloneEditorData(candidate)]))
        : acceptedImport
      if (typeof outcome !== 'boolean') {
        throw new TypeError('Conversion canImport() must return a boolean')
      }
      accepted = outcome
    }
    data = accepted
      ? synchronousResult(conversion.import(cloneEditorData(candidate), Object.freeze({ ownerDocument: s.ownerDocument })))
      : synchronousResult(targetDefinition.schema.createDefault())
  }

  if (target.toolboxItemId !== undefined) {
    const item = targetDefinition.toolbox?.find(entry => entry.id === target.toolboxItemId)
    if (!item) throw new Error('Unknown toolbox item "' + target.toolboxItemId + '" for "' + target.type + '"')
    if (item.configure) {
      const configured = synchronousResult(item.configure(data, Object.freeze({
        createId: prefix => s.allocateId(prefix, reserved),
      })))
      if (configured) data = configured
    }
  }
  return cloneEditorData(data)
}

/** Prepare direct whole-block conversion without reading the store.
 * @param {any} s
 * @param {any} current
 * @param {{type:string,toolboxItemId?:string}} target
 * @param {Set<string>} [reserved]
 */
export function convertedCanonicalRecord(s, current, target, reserved = new Set()) {
  const sourceDefinition = s.getBlockDefinition(current.type)
  const targetDefinition = s.getBlockDefinition(target.type)
  if (!targetDefinition) throw new Error('Unknown block type: ' + target.type)
  const exported = sourceDefinition?.capabilities?.conversion?.export
  const payload = exported
    ? cloneEditorData(synchronousResult(exported.call(sourceDefinition.capabilities.conversion, cloneEditorData(current.data))) ?? null)
    : null
  const data = conversionTargetData(s, targetDefinition, payload, target,
    current.type === target.type ? current.data : undefined, reserved)
  const next = s.recordFromData(current.id, target.type, targetDefinition, data, current.tunes, current.inline)
  s.assertConversionInlinePreserved(payload, current.inline, targetDefinition, next)
  return next
}

/** @param {any} s @param {any} view @param {any} start @param {any} end @param {any} target @param {any} targetDefinition @param {Set<string>} reserved */
function singleSelection(s, view, start, end, target, targetDefinition, reserved) {
  const current = view.peek(start.blockId)
  if (!current || !s.getBlockDefinition(current.type)) return noChange()
  const sliced = sliceSelection(s, current, start, end)
  if (!sliced || !payloadHasContent(s, sliced.selected)) return noChange()

  const targetData = conversionTargetData(s, targetDefinition, sliced.selected, target, undefined, reserved)
  const sourceDefinition = sliced.definition
  const sourceInline = sliced.inline
  const index = view.ids.indexOf(current.id)

  // A compound block owns its residual assets/items. Reuse its existing
  // clipboard slicing contract instead of duplicating or splitting those assets.
  if ((sliced.before || sliced.after) && sourceDefinition.capabilities?.clipboard) {
    const residual = prepareClipboardBlockSlice(s, current, start, end)
    if (!residual) return noChange()
    const targetId = residual.remaining ? s.allocateId(target.type, reserved) : current.id
    const targetRecord = s.recordFromData(targetId, target.type, targetDefinition, targetData, current.tunes, sourceInline)
    s.assertConversionInlinePreserved(sliced.selected, sourceInline, targetDefinition, targetRecord)
    const edits = residual.remaining
      ? [...updatedRecord(current.id, current, residual.remaining), { kind: 'insert', index: index + 1, record: targetRecord }]
      : updatedRecord(current.id, current, targetRecord)
    return { edits, result: { focusId: targetId, convertedIds: [targetId] } }
  }

  const before = sliced.before
    ? s.recordFromData(current.id, current.type, sourceDefinition, sliced.before, current.tunes, sourceInline)
    : null
  const targetId = before ? s.allocateId(target.type, reserved) : current.id
  const targetRecord = s.recordFromData(targetId, target.type, targetDefinition, targetData, current.tunes, sourceInline)
  s.assertConversionInlinePreserved(sliced.selected, sourceInline, targetDefinition, targetRecord)
  const after = sliced.after
    ? s.recordFromData(s.allocateId(current.type, reserved), current.type, sourceDefinition, sliced.after, current.tunes, sourceInline)
    : null

  /** @type {CanonicalEdit[]} */
  const edits = before
    ? [...updatedRecord(current.id, current, before), { kind: 'insert', index: index + 1, record: targetRecord }]
    : updatedRecord(current.id, current, targetRecord)
  if (after) edits.push({ kind: 'insert', index: index + (before ? 2 : 1), record: after })
  return { edits, result: { focusId: targetId, convertedIds: [targetId] } }
}

/** @param {any} s @param {any} view @param {any} start @param {any} end @param {any} target @param {any} targetDefinition @param {Set<string>} reserved */
function crossSelection(s, view, start, end, target, targetDefinition, reserved) {
  const originalIds = view.ids
  const firstIndex = originalIds.indexOf(start.blockId)
  const lastIndex = originalIds.indexOf(end.blockId)
  if (firstIndex < 0 || lastIndex <= firstIndex) return noChange()
  const first = view.peek(start.blockId)
  const last = view.peek(end.blockId)
  if (!first || !last || !s.getBlockDefinition(first.type) || !s.getBlockDefinition(last.type)) return noChange()

  const firstSlice = endpointSelection(s, first, start, 'first')
  const lastSlice = endpointSelection(s, last, end, 'last')
  if (!firstSlice || !lastSlice) return noChange()

  const targetConversion = targetDefinition.capabilities?.conversion
  // A non-per-block target is a single replacement. Joining is an optional
  // explicit conversion capability rather than inferred from payload shape.
  if (targetConversion?.selectionMode !== 'per-block') {
    let payload = null
    const selected = []
    if (typeof targetConversion?.joinSelection === 'function') {
      if (payloadHasContent(s, firstSlice.selected)) selected.push({ payload: firstSlice.selected, inline: firstSlice.inline })
      for (let index = firstIndex + 1; index < lastIndex; index++) {
        const record = view.peek(originalIds[index])
        const conversion = record && s.getBlockDefinition(record.type)?.capabilities?.conversion
        if (!conversion || typeof conversion.export !== 'function') return noChange()
        const part = cloneEditorData(synchronousResult(conversion.export(cloneEditorData(record.data))))
        selected.push({ payload: part, inline: cloneInline(record.inline) ?? {} })
      }
      if (payloadHasContent(s, lastSlice.selected)) selected.push({ payload: lastSlice.selected, inline: lastSlice.inline })
      if (!selected.length) return noChange()
      payload = cloneEditorData(synchronousResult(targetConversion.joinSelection(
        selected.map(part => cloneEditorData(part.payload)), { ownerDocument: s.ownerDocument },
      )))
      const accepted = synchronousResult(targetConversion.canImport(cloneEditorData(payload)))
      if (typeof accepted !== 'boolean') throw new TypeError('Selection join canImport() must return a boolean')
      if (!accepted) return noChange()
    }
    const targetData = conversionTargetData(s, targetDefinition, payload, target, undefined, reserved,
      payload === null ? undefined : true)
    const targetId = s.allocateId(target.type, reserved)
    const targetRecord = s.recordFromData(targetId, target.type, targetDefinition, targetData, first.tunes, {})
    for (const part of selected) s.assertConversionInlinePreserved(part.payload, part.inline, targetDefinition, targetRecord)

    /** @type {CanonicalEdit[]} */
    const edits = []
    const nextIds = [...originalIds]
    const remove = id => {
      edits.push({ kind: 'remove', id })
      nextIds.splice(nextIds.indexOf(id), 1)
    }
    if (firstSlice.before) {
      const before = s.recordFromData(first.id, first.type, firstSlice.definition, firstSlice.before, first.tunes, firstSlice.inline)
      edits.push(...updatedRecord(first.id, first, before))
    } else remove(first.id)

    for (let index = firstIndex + 1; index < lastIndex; index++) remove(originalIds[index])
    if (lastSlice.after) {
      const after = s.recordFromData(last.id, last.type, lastSlice.definition, lastSlice.after, last.tunes, lastSlice.inline)
      edits.push(...updatedRecord(last.id, last, after))
    } else remove(last.id)

    const index = firstSlice.before ? nextIds.indexOf(first.id) + 1
      : lastSlice.after ? nextIds.indexOf(last.id)
        : Math.min(firstIndex, nextIds.length)
    edits.push({ kind: 'insert', index, record: targetRecord })
    return { edits, result: { focusId: targetId, convertedIds: [targetId] } }
  }

  const pieces = []
  if (payloadHasContent(s, firstSlice.selected)) {
    pieces.push({ original: first, payload: firstSlice.selected, inline: firstSlice.inline, position: 'first' })
  }
  for (let index = firstIndex + 1; index < lastIndex; index++) {
    const record = view.peek(originalIds[index])
    const conversion = record && s.getBlockDefinition(record.type)?.capabilities?.conversion
    if (!conversion || typeof conversion.export !== 'function') return noChange()
    const payload = cloneEditorData(synchronousResult(conversion.export(cloneEditorData(record.data))))
    pieces.push({ original: record, payload, inline: cloneInline(record.inline) ?? {}, position: 'middle' })
  }
  if (payloadHasContent(s, lastSlice.selected)) {
    pieces.push({ original: last, payload: lastSlice.selected, inline: lastSlice.inline, position: 'last' })
  }
  if (!pieces.length) return noChange()

  const prepared = []
  for (const piece of pieces) {
    const sameType = piece.original.type === target.type && target.toolboxItemId === undefined
    if (!sameType && !acceptsTarget(targetConversion, piece.payload)) return noChange()
    const data = sameType
      ? piece.position === 'middle'
        ? piece.original.data
        : selectedSourceData(s, piece.original,
          piece.position === 'first' ? start : null,
          piece.position === 'last' ? end : null)
      : conversionTargetData(s, targetDefinition, piece.payload, target, undefined, reserved, true)
    const insert = (piece.position === 'first' && !!firstSlice.before)
      || (piece.position === 'last' && !!lastSlice.after)
    const id = insert ? s.allocateId(target.type, reserved) : piece.original.id
    const record = s.recordFromData(id, target.type, targetDefinition, data, piece.original.tunes, piece.inline)
    s.assertConversionInlinePreserved(piece.payload, piece.inline, targetDefinition, record)
    prepared.push({ ...piece, record, insert })
  }

  /** @type {CanonicalEdit[]} */
  const edits = []
  const nextIds = [...originalIds]
  if (firstSlice.before) {
    const before = s.recordFromData(first.id, first.type, firstSlice.definition, firstSlice.before, first.tunes, firstSlice.inline)
    edits.push(...updatedRecord(first.id, first, before))
  }

  const convertedIds = []
  for (const piece of prepared) {
    if (piece.insert) {
      const anchorIndex = nextIds.indexOf(piece.position === 'first' ? first.id : last.id)
      const index = piece.position === 'first' ? anchorIndex + 1 : anchorIndex
      edits.push({ kind: 'insert', index, record: piece.record })
      nextIds.splice(index, 0, piece.record.id)
    } else {
      edits.push(...updatedRecord(piece.original.id, piece.original, piece.record))
    }
    convertedIds.push(piece.record.id)
  }
  if (lastSlice.after) {
    const after = s.recordFromData(last.id, last.type, lastSlice.definition, lastSlice.after, last.tunes, lastSlice.inline)
    edits.push(...updatedRecord(last.id, last, after))
  }
  return { edits, result: { focusId: convertedIds[convertedIds.length - 1], convertedIds } }
}

/** @param {any} conversion @param {unknown} payload */
function acceptsTarget(conversion, payload) {
  const canImport = conversion?.canImport
  if (typeof canImport !== 'function') return false
  const accepted = synchronousResult(Reflect.apply(canImport, conversion, [cloneEditorData(payload)]))
  if (typeof accepted !== 'boolean') throw new TypeError('Conversion canImport() must return a boolean')
  return accepted
}

/** Prepare one complete conversion against the current immutable draft view.
 * Calculations, validation and final focus precede the common transaction edit loop.
 * @param {any} s Narrow canonical schema/allocator services, never a runtime.
 * @param {any} view Captured order and immutable record references.
 * @param {any} bookmark Logical selection snapshot.
 * @param {any} target Declared conversion target.
 */
export function prepareSelectionConversion(s, view, bookmark, target) {
  const anchor = bookmark?.anchor, focus = bookmark?.focus
  // A caret chooses its owning block, including plain-text and inert owners.
  // Only a noncollapsed text selection needs schema-declared rich fields.
  const collapsed = anchor && focus && anchor.blockId === focus.blockId
    && anchor.fieldKey === focus.fieldKey && anchor.offset === focus.offset
  const ordered = collapsed ? { start: anchor, end: focus } : orderedLogicalRange(s, view, bookmark)
  if (!ordered || !target || typeof target.type !== 'string') return noChange()
  const targetDefinition = s.getBlockDefinition(target.type)
  if (!targetDefinition) return noChange()
  const { start, end } = ordered
  const first = view.peek(start.blockId)
  if (!first || !s.getBlockDefinition(first.type)) return noChange()
  const reserved = new Set(view.ids)

  if (start.blockId === end.blockId) {
    if (first.type === target.type && target.toolboxItemId === undefined) return noChange()
    if (start.fieldKey === end.fieldKey && start.offset === end.offset) {
      const next = convertedCanonicalRecord(s, first, target, reserved)
      return { edits: updatedRecord(first.id, first, next),
        result: { focusId: first.id, convertedIds: [first.id] } }
    }
    return singleSelection(s, view, start, end, target, targetDefinition, reserved)
  }

  return crossSelection(s, view, start, end, target, targetDefinition, reserved)
}
