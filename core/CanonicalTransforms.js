// @ts-check
import { cloneEditorData } from '../shared/cloneEditorData.js'
import { remapRichTextReferences, scanRichTextPlaceholders } from '../shared/richTextOperations.js'

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
  if (typeof definition?.schema?.mapRichText !== 'function') return { references, literals }

  definition.schema.mapRichText(cloneEditorData(data), html => {
    const scan = scanRichTextPlaceholders(html, inline, ownerDocument)
    for (const id of scan.references) references.add(id)
    for (const id of scan.literals) literals.add(id)
    return html
  })
  return { references, literals }
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
  const { references } = scanCanonicalRichText(definition, data, inline, ownerDocument)
  const result = {}
  for (const id of references) {
    if (Object.hasOwn(inline, id)) result[id] = cloneEditorData(inline[id])
  }
  return Object.keys(result).length ? result : undefined
}

/**
 * Remap sidecar keys without changing payload ownership.
 *
 * @param {Record<string, unknown> | undefined} inline
 * @param {Map<string, string>} remap
 */
export function remapCanonicalInline(inline, remap) {
  const result = {}
  for (const [id, value] of Object.entries(inline ?? {})) {
    result[remap.get(id) ?? id] = cloneEditorData(value)
  }
  return result
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
  const inline = {}

  for (const id of targetScan.references) {
    if (Object.hasOwn(targetInline, id)) {
      inline[targetRemap.get(id) ?? id] = cloneEditorData(targetInline[id])
    }
  }
  for (const id of sourceScan.references) {
    if (Object.hasOwn(sourceInline, id)) {
      inline[sourceRemap.get(id) ?? id] = cloneEditorData(sourceInline[id])
    }
  }

  return { targetData, sourceData, inline }
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
