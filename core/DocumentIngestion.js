// @ts-check
import { decodeCurrentDocument } from '../shared/DocumentSchema.js'
import { DOCUMENT_FORMAT_VERSION } from '../shared/documentFormat.js'
import { schemaValidationBoundary } from '../shared/documentValidationIssue.js'

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

/** Prepare a new document using only explicit canonical-data services. */
export function prepareNewDocument(services) {
  const type = services.defaultBlockType
  const definition = services.getBlockDefinition(type)
  if (!definition) throw new Error('Unknown default block type: ' + type)
  const id = services.createBlockId(type)
  const data = schemaValidationBoundary({ type }, () => definition.schema.createDefault())
  return {
    version: DOCUMENT_FORMAT_VERSION,
    blocks: [schemaValidationBoundary({ type }, () => services.assembleRecord(id, type, definition, data))],
  }
}

/** Decode and normalize the entire current document before publishing any result. */
export function prepareCurrentDocument(input, services) {
  const decoded = decodeCurrentDocument(input, {
    getBlockSchema: type => services.getBlockDefinition(type)?.schema,
    getInlineSchema: type => services.getInlineDefinition(type)?.schema,
  })
  const blocks = decoded.blocks.map(block => {
    const definition = services.getBlockDefinition(block.type)
    if (!definition) return block
    const encoded = schemaValidationBoundary({ blockId: block.id, type: block.type }, () => (
      services.normalizeData(definition, block.data)
    ))
    const next = { ...block, dataVersion: encoded.dataVersion, data: encoded.data }
    const tunes = services.normalizeTunes(block.tunes)
    if (tunes === undefined) delete next.tunes
    else next.tunes = tunes
    if (block.dataVersion !== next.dataVersion || !sameJson(block.data, next.data)
      || !sameJson(block.tunes, next.tunes) || !sameJson(block.inline, next.inline)) delete next.revision
    return next
  })
  return blocks.length ? { version: DOCUMENT_FORMAT_VERSION, blocks } : prepareNewDocument(services)
}
