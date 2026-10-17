// @ts-check
import { cloneEditorData } from './cloneEditorData.js'
import { isPlainObjectPrototype } from './jsonData.js'
import { DOCUMENT_FORMAT_VERSION } from './documentFormat.js'
import { documentValidationIssue, markDocumentValidationFailure, validationBoundary, schemaValidationBoundary } from './documentValidationIssue.js'

const DOCUMENT_KEYS = new Set(['version', 'time', 'blocks'])
const BLOCK_KEYS = new Set(['id', 'type', 'dataVersion', 'data', 'tunes', 'inline', 'revision'])
const INLINE_KEYS = new Set(['type', 'dataVersion', 'data'])

/** @param {unknown} value @param {string} label @returns {asserts value is Record<string, unknown>} */
function assertPlainJsonObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !isPlainObjectPrototype(Object.getPrototypeOf(value))) {
    throw new TypeError(`${label} must be a JSON object`)
  }
}

/** @param {Record<string, unknown>} value @param {Set<string>} allowed @param {string} label */
function assertKnownKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new TypeError(`${label} contains unsupported field "${key}"`)
  }
}

/** Envelope members may not have enumerable symbol keys. Check descriptors
 * without invoking their getters before reading any author-owned payload.
 * @param {object} value
 * @param {string} label
 */
function assertNoEnumerableSymbols(value, label) {
  for (const symbol of Object.getOwnPropertySymbols(value)) {
    if (Object.prototype.propertyIsEnumerable.call(value, symbol)) {
      throw new TypeError(`${label} contains an enumerable symbol key`)
    }
  }
}

/** @param {unknown} value @param {string} label @returns {number} */
function assertPositiveVersion(value, label) {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new TypeError(`${label} must be a positive safe integer`)
  }
  return Number(value)
}

/** @param {any} schema @param {number} version @param {string} label
 * @param {Omit<import('./documentTypes').DocumentValidationIssue, 'reason'>} identity
 */
function assertSchemaVersion(schema, version, label, identity) {
  const currentVersion = assertPositiveVersion(schema?.currentVersion, `${label} schema currentVersion`)
  if (version !== currentVersion) {
    throw markDocumentValidationFailure(
      new RangeError(`Unsupported ${label} data version ${version}; current version is ${currentVersion}`),
      { reason: 'unsupported-data-version', ...identity },
    )
  }
}

/**
 * Snapshot and validate one current serialized block envelope without traversing
 * its deep payload. Used by renderer revision reuse and the full decoder.
 *
 * @param {unknown} input
 * @param {string} [label]
 * @returns {import('./documentTypes').EditorBlockData}
 */
export function snapshotCurrentBlockEnvelope(input, label = 'Editor block') {
  return validationBoundary({ reason: 'invalid-input' }, () => {
    assertPlainJsonObject(input, label)
    // Reject undeclared keys by name first. Spreading the entire input would
    // execute their getters before the unsupported-field error is reported.
    assertKnownKeys(input, BLOCK_KEYS, label)
    assertNoEnumerableSymbols(input, label)

    const id = Object.hasOwn(input, 'id') ? input.id : undefined
    if (typeof id !== 'string' || !id) {
      throw new TypeError(`${label} id must be a non-empty string`)
    }
    const type = Object.hasOwn(input, 'type') ? input.type : undefined
    if (typeof type !== 'string' || !type) {
      throw new TypeError(`${label} type must be a non-empty string`)
    }
    if (!Object.hasOwn(input, 'dataVersion')) {
      throw new TypeError(`${label} dataVersion is required`)
    }
    const dataVersion = assertPositiveVersion(input.dataVersion, `${label} dataVersion`)
    if (!Object.hasOwn(input, 'data')) throw new TypeError(`${label} data is required`)
    const data = input.data
    assertPlainJsonObject(data, `${label} data`)

    /** @type {Record<string, unknown>} */
    const candidate = { id, type, dataVersion, data }
    if (Object.hasOwn(input, 'tunes')) {
      const tunes = input.tunes
      if (tunes === undefined || tunes === null) {
        throw new TypeError(`${label} tunes must be omitted or a JSON object`)
      }
      assertPlainJsonObject(tunes, `${label} tunes`)
      candidate.tunes = tunes
    }
    if (Object.hasOwn(input, 'inline')) {
      const inline = input.inline
      if (inline === undefined || inline === null) {
        throw new TypeError(`${label} inline must be omitted or a JSON object`)
      }
      assertPlainJsonObject(inline, `${label} inline`)
      candidate.inline = inline
    }
    if (Object.hasOwn(input, 'revision')) {
      const revision = input.revision
      if (revision === undefined || revision === null
        || (typeof revision !== 'string'
          && (typeof revision !== 'number' || !Number.isFinite(revision)))) {
        throw new TypeError(`${label} revision must be omitted, a string, or a finite number`)
      }
      candidate.revision = revision
    }

    return /** @type {import('./documentTypes').EditorBlockData} */ (/** @type {unknown} */ (candidate))
  })
}

/**
 * Snapshot the current document envelope and all block envelopes. Deep payloads
 * are deliberately not cloned here so a renderer can honor an already
 * validated producer revision without re-traversing unchanged data.
 *
 * @param {unknown} input
 * @param {{ snapshotBlock?: (block: unknown, label?: string) => import('./documentTypes').EditorBlockData }} [options]
 * @returns {import('./documentTypes').EditorOutputData}
 */
export function snapshotCurrentDocumentEnvelope(input, options = {}) {
  return validationBoundary({ reason: 'invalid-input' }, () => {
    assertPlainJsonObject(input, 'Editor document')
    assertKnownKeys(input, DOCUMENT_KEYS, 'Editor document')
    assertNoEnumerableSymbols(input, 'Editor document')

    if (!Object.hasOwn(input, 'version')) {
      throw new TypeError('Editor document version is required')
    }
    const version = input.version
    if (typeof version !== 'string' || !version) {
      throw new TypeError('Editor document version must be a non-empty string')
    }
    if (version !== DOCUMENT_FORMAT_VERSION) {
      throw markDocumentValidationFailure(
        new RangeError(`Unsupported document version "${version}"; current version is "${DOCUMENT_FORMAT_VERSION}"`),
        { reason: 'unsupported-document-version' },
      )
    }
    // Never inspect blocks or optional metadata for an unsupported document
    // version. Snapshot allowed fields only after passing the version gate.
    if (!Object.hasOwn(input, 'blocks')) {
      throw new TypeError('Editor document blocks must be an array')
    }
    const sourceBlocks = input.blocks
    if (!Array.isArray(sourceBlocks)) {
      throw new TypeError('Editor document blocks must be an array')
    }
    const hasTime = Object.hasOwn(input, 'time')
    const time = hasTime ? input.time : undefined
    if (hasTime && (typeof time !== 'number' || !Number.isFinite(time))) {
      throw new TypeError('Editor document time must be a finite number when present')
    }

    const snapshotBlock = options.snapshotBlock ?? snapshotCurrentBlockEnvelope
    const ids = new Set()
    const blocks = []
    for (let index = 0; index < sourceBlocks.length; index++) {
      if (!Object.hasOwn(sourceBlocks, index)) {
        throw new TypeError('Editor document blocks must be a dense array')
      }
      const block = snapshotBlock(sourceBlocks[index], `Editor document block[${index}]`)
      if (ids.has(block.id)) throw new TypeError(`Duplicate block id: ${block.id}`)
      ids.add(block.id)
      blocks.push(block)
    }

    return /** @type {import('./documentTypes').EditorOutputData} */ ({
      version: DOCUMENT_FORMAT_VERSION,
      ...(time === undefined ? {} : { time }),
      blocks,
    })
  })
}

/**
 * Decode one current inline map. Unknown extension types remain inert JSON;
 * registered types must declare their exact current dataVersion.
 *
 * @param {unknown} input
 * @param {{ getInlineSchema?: (type: string) => any }} [resolvers]
 */
export function decodeCurrentInlineMap(input, resolvers = {}) {
  return validationBoundary({ reason: 'invalid-input' }, () => {
    if (input === undefined) return undefined
    assertPlainJsonObject(input, 'Inline map')
    // Capture one occurrence at a time. Deep-cloning the whole map first
    // would execute unrelated getters (even from later occurrences) before a
    // known inline schema can reject an unsupported dataVersion.
    const source = /** @type {Record<string, unknown>} */ (input)
    assertNoEnumerableSymbols(source, 'Inline map')
    const ids = Object.keys(source)
    /** @type {Record<string, import('./documentTypes').EditorInlineWidget>} */
    const result = {}

    for (const id of ids) {
      if (!id) throw new TypeError('Inline widget id must be a non-empty string')
      const value = source[id]
      assertPlainJsonObject(value, `Inline widget "${id}"`)
      assertKnownKeys(value, INLINE_KEYS, `Inline widget "${id}"`)
      assertNoEnumerableSymbols(value, `Inline widget "${id}"`)
      const type = Object.hasOwn(value, 'type') ? value.type : undefined
      if (typeof type !== 'string' || !type) {
        throw new TypeError(`Inline widget "${id}" type must be a non-empty string`)
      }
      if (!Object.hasOwn(value, 'dataVersion')) {
        throw new TypeError(`Inline widget "${id}" dataVersion is required`)
      }
      const version = assertPositiveVersion(value.dataVersion, `Inline widget "${id}" dataVersion`)
      if (!Object.hasOwn(value, 'data')) {
        throw new TypeError(`Inline widget "${id}" data is required`)
      }
      const schema = resolvers.getInlineSchema?.(type)
      if (schema) {
        assertSchemaVersion(schema, version, `inline widget "${type}"`, { inlineId: id, type })
      }
      const data = value.data
      assertPlainJsonObject(data, `Inline widget "${id}" data`)
      const ownedData = cloneEditorData(data)
      if (!schema) {
        Object.defineProperty(result, id, { value: { type, dataVersion: version, data: ownedData }, enumerable: true, configurable: true, writable: true })
        continue
      }

      const decodedValue = schemaValidationBoundary({ inlineId: id, type }, () => {
        const decoded = schema.decode({ dataVersion: version, data: ownedData })
        const dataVersion = decoded?.dataVersion
        const data = decoded?.data
        if (dataVersion !== schema.currentVersion) {
          throw new TypeError(`Inline widget "${type}" schema returned an invalid version`)
        }
        assertPlainJsonObject(data, `Inline widget "${type}" decoded data`)
        return {
          type,
          dataVersion: schema.currentVersion,
          data: cloneEditorData(data),
        }
      })
      Object.defineProperty(result, id, { value: decodedValue, enumerable: true, configurable: true, writable: true })
    }
    return result
  })
}

/**
 * Deep-own and decode one current serialized block.
 *
 * @param {unknown} input
 * @param {{ getBlockSchema?: (type: string) => any, getInlineSchema?: (type: string) => any }} [resolvers]
 * @returns {import('./documentTypes').EditorBlockData}
 */
export function decodeCurrentBlock(input, resolvers = {}) {
  return validationBoundary({ reason: 'invalid-input' }, () => {
    const envelope = snapshotCurrentBlockEnvelope(input)
    const schema = resolvers.getBlockSchema?.(envelope.type)
    // A rejected schema version must not deep-clone the author payload.
    if (schema) {
      assertSchemaVersion(schema, envelope.dataVersion, `block "${envelope.type}"`, { blockId: envelope.id, type: envelope.type })
    }
    // Inline occurrences have their own version and ownership boundary. Leave
    // that map untouched until decodeCurrentInlineMap validates each entry.
    const { inline: inlineSource, ...withoutInline } = envelope
    const block = /** @type {import('./documentTypes').EditorBlockData} */ (cloneEditorData(withoutInline))
    if (schema) {
      const decoded = schemaValidationBoundary({ blockId: block.id, type: block.type }, () => {
        const result = schema.decode({ dataVersion: block.dataVersion, data: block.data })
        const dataVersion = result?.dataVersion
        const data = result?.data
        if (dataVersion !== schema.currentVersion) {
          throw new TypeError(`Block "${block.type}" schema returned an invalid version`)
        }
        assertPlainJsonObject(data, `Block "${block.type}" decoded data`)
        return { dataVersion: schema.currentVersion, data: cloneEditorData(data) }
      })
      block.dataVersion = decoded.dataVersion
      block.data = decoded.data
    }

    if (inlineSource !== undefined) {
      let inline
      try { inline = decodeCurrentInlineMap(inlineSource, resolvers) }
      catch (error) {
        const issue = documentValidationIssue(error)
        throw issue ? markDocumentValidationFailure(error, { type: block.type, ...issue, blockId: block.id }) : error
      }
      if (inline && Object.keys(inline).length > 0) block.inline = inline
      else delete block.inline
    }
    return block
  })
}

/**
 * Deep-own and exact-decode one current serialized document.
 *
 * @param {unknown} input
 * @param {{ getBlockSchema?: (type: string) => any, getInlineSchema?: (type: string) => any }} [resolvers]
 * @returns {import('./documentTypes').EditorOutputData}
 */
export function decodeCurrentDocument(input, resolvers = {}) {
  const envelope = snapshotCurrentDocumentEnvelope(input)
  return {
    version: DOCUMENT_FORMAT_VERSION,
    ...(envelope.time === undefined ? {} : { time: envelope.time }),
    blocks: envelope.blocks.map(block => decodeCurrentBlock(block, resolvers)),
  }
}
