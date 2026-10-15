// @ts-check
import { cloneEditorData } from '../shared/cloneEditorData.js'
import { remapRichTextReferences, scanRichTextPlaceholders } from '../shared/richTextOperations.js'
import { mapRichTextFields } from './projectionFields.js'

/**
 * Wrap the host id source with editor-session uniqueness. A value already
 * issued by this allocator is never returned again, even after the owning
 * block/widget/item has been removed. Caller-owned persisted ids belong in
 * the reserved set and are not implicitly claimed as issued values.
 *
 * @param {(prefix:string)=>string} createId
 */
export function createSessionIdAllocator(createId) {
  if (typeof createId !== 'function') throw new TypeError('Session id allocator requires createId()')
  const issued = new Set()

  return (prefix, reserved = new Set()) => {
    if (typeof prefix !== 'string' || !prefix) throw new TypeError('ID prefix must be a non-empty string')
    const occupied = reserved instanceof Set ? reserved : new Set(reserved ?? [])
    for (let attempt = 0; attempt < 1000; attempt++) {
      const id = createId(prefix)
      if (typeof id !== 'string' || !id) throw new TypeError('createId() must return a non-empty string')
      if (issued.has(id) || occupied.has(id)) continue
      issued.add(id)
      occupied.add(id)
      return id
    }
    throw new Error('Could not allocate a unique session id')
  }
}

/**
 * Scan all schema-declared rich-text fields. Placeholder-shaped text is a
 * reference only when the block owns a matching inline sidecar entry.
 *
 * @param {any} definition
 * @param {Record<string, unknown>} data
 * @param {Record<string, unknown> | undefined} inline
 * @param {Document} ownerDocument
 */
export function scanCanonicalRichText(definition, data, inline, ownerDocument) {
  const references = new Set()
  const literals = new Set()
  const occurrences = new Map()
  if (typeof definition?.schema?.mapRichText !== 'function') return { references, literals, occurrences }

  mapRichTextFields(definition, cloneEditorData(data), html => {
    const scan = scanRichTextPlaceholders(html, inline, ownerDocument)
    for (const id of scan.references) references.add(id)
    for (const id of scan.literals) literals.add(id)
    for (const [id, count] of scan.occurrences) occurrences.set(id, (occurrences.get(id) ?? 0) + count)
    return html
  })
  return { references, literals, occurrences }
}

/**
 * Keep only sidecar entries referenced by canonical rich text.
 *
 * @param {any} definition
 * @param {Record<string, unknown>} data
 * @param {Record<string, unknown> | undefined} inline
 * @param {Document} ownerDocument
 */
export function filterCanonicalInline(definition, data, inline, ownerDocument) {
  if (!inline || typeof inline !== 'object' || Array.isArray(inline)) return undefined
  const { references, occurrences } = scanCanonicalRichText(definition, data, inline, ownerDocument)
  for (const [id, count] of occurrences) {
    if (count !== 1) throw new Error('Inline widget reference must be unique: ' + id)
  }
  const result = Object.fromEntries([...references].map(id => [id, cloneEditorData(inline[id])]))
  return Object.keys(result).length ? result : undefined
}

/**
 * Remap sidecar keys without changing payload ownership.
 *
 * @param {Record<string, unknown> | undefined} inline
 * @param {Map<string, string>} remap
 */
export function remapCanonicalInline(inline, remap) {
  return Object.fromEntries(Object.entries(inline ?? {}).map(([id, value]) => [
    remap.get(id) ?? id, cloneEditorData(value),
  ]))
}

/**
 * Remap only owned inline occurrences in schema-declared rich-text fields.
 *
 * @param {any} definition
 * @param {Record<string, unknown>} data
 * @param {Record<string, unknown> | undefined} inline
 * @param {Map<string, string>} remap
 * @param {Document} ownerDocument
 */
export function remapCanonicalRichText(definition, data, inline, remap, ownerDocument) {
  if (!remap.size || typeof definition?.schema?.mapRichText !== 'function') {
    return cloneEditorData(data)
  }
  return definition.schema.mapRichText(cloneEditorData(data), html => (
    remapRichTextReferences(html, inline, remap, ownerDocument)
  ))
}

/**
 * Remap references in one rich-text fragment against ids already reserved by
 * another namespace. Literal tokens are never rewritten.
 *
 * @param {{
 *   html: string,
 *   inline?: Record<string, unknown>,
 *   reservedIds?: Iterable<string>,
 *   ownerDocument: Document,
 *   allocateInlineId: (reserved: Set<string>) => string,
 * }} input
 */
export function remapCanonicalFragment(input) {
  const sourceInline = cloneEditorData(input.inline ?? {})
  const reserved = new Set(input.reservedIds ?? [])
  const scan = scanRichTextPlaceholders(input.html, sourceInline, input.ownerDocument)
  const remap = new Map()

  for (const id of scan.references) {
    if (!Object.hasOwn(sourceInline, id)) continue
    const next = reserved.has(id) ? input.allocateInlineId(reserved) : id
    reserved.add(next)
    if (next !== id) remap.set(id, next)
  }

  return {
    html: remap.size
      ? remapRichTextReferences(input.html, sourceInline, remap, input.ownerDocument)
      : input.html,
    inline: remapCanonicalInline(sourceInline, remap),
    remap,
  }
}

/**
 * Prepare two same-type blocks for a pure merge. Reference ids from either
 * source are remapped when they collide with references or literal tokens in
 * the other source.
 *
 * @param {{
 *   definition: any,
 *   target: any,
 *   source: any,
 *   ownerDocument: Document,
 *   allocateInlineId: (reserved: Set<string>) => string,
 * }} input
 */
export function prepareCanonicalInlineMerge(input) {
  const targetInline = cloneEditorData(input.target.inline ?? {})
  const sourceInline = cloneEditorData(input.source.inline ?? {})
  const targetScan = scanCanonicalRichText(
    input.definition, input.target.data, targetInline, input.ownerDocument,
  )
  const sourceScan = scanCanonicalRichText(
    input.definition, input.source.data, sourceInline, input.ownerDocument,
  )
  const reserved = new Set([...targetScan.literals, ...sourceScan.literals])

  const targetRemap = new Map()
  for (const id of targetScan.references) {
    if (!Object.hasOwn(targetInline, id)) continue
    const next = reserved.has(id) ? input.allocateInlineId(reserved) : id
    reserved.add(next)
    if (next !== id) targetRemap.set(id, next)
  }

  const sourceRemap = new Map()
  for (const id of sourceScan.references) {
    if (!Object.hasOwn(sourceInline, id)) continue
    const next = reserved.has(id) ? input.allocateInlineId(reserved) : id
    reserved.add(next)
    if (next !== id) sourceRemap.set(id, next)
  }

  const targetData = remapCanonicalRichText(
    input.definition, input.target.data, targetInline, targetRemap, input.ownerDocument,
  )
  const sourceData = remapCanonicalRichText(
    input.definition, input.source.data, sourceInline, sourceRemap, input.ownerDocument,
  )
  const entries = []

  for (const id of targetScan.references) {
    if (Object.hasOwn(targetInline, id)) {
      entries.push([targetRemap.get(id) ?? id, cloneEditorData(targetInline[id])])
    }
  }
  for (const id of sourceScan.references) {
    if (Object.hasOwn(sourceInline, id)) {
      entries.push([sourceRemap.get(id) ?? id, cloneEditorData(sourceInline[id])])
    }
  }

  return { targetData, sourceData, inline: Object.fromEntries(entries) }
}

/**
 * Assemble one changed active block from current local data. Every caller uses
 * the same encode/tunes/inline filtering rules and producer revision is not
 * carried across a semantic change.
 *
 * @param {{
 *   id: string,
 *   type: string,
 *   definition: any,
 *   data: Record<string, unknown>,
 *   tunes?: Record<string, unknown>,
 *   inlineSource?: Record<string, unknown>,
 *   ownerDocument: Document,
 *   normalizeData: (definition: any, data: Record<string, unknown>) => {dataVersion:number,data:Record<string,unknown>},
 *   normalizeTunes: (tunes: Record<string, unknown> | undefined) => Record<string, unknown> | undefined,
 * }} input
 */
export function assembleCanonicalRecord(input) {
  const encoded = input.normalizeData(input.definition, input.data)
  const record = {
    id: input.id,
    type: input.type,
    dataVersion: encoded.dataVersion,
    data: encoded.data,
  }

  const tunes = input.normalizeTunes(input.tunes)
  if (tunes !== undefined) record.tunes = tunes

  const inline = filterCanonicalInline(
    input.definition,
    encoded.data,
    input.inlineSource,
    input.ownerDocument,
  )
  if (inline !== undefined) record.inline = inline

  return record
}
