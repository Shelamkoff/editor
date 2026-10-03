// @ts-check
import { cloneEditorData } from './cloneEditorData.js'
import { isPlainObjectPrototype } from './jsonData.js'
import { DOCUMENT_FORMAT_VERSION } from './documentFormat.js'

const DOCUMENT_KEYS = new Set(['version', 'time', 'blocks'])
const BLOCK_KEYS = new Set(['id', 'type', 'dataVersion', 'data', 'tunes', 'inline', 'revision'])
const INLINE_KEYS = new Set(['type', 'dataVersion', 'data'])

/** @param {unknown} value @param {string} label */
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

/** @param {unknown} value @param {string} label @returns {number} */
function assertPositiveVersion(value, label) {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new TypeError(`${label} must be a positive safe integer`)
  }
  return Number(value)
}

/** @param {any} schema @param {number} version @param {string} label */
function assertSchemaVersion(schema, version, label) {
  const currentVersion = assertPositiveVersion(schema?.currentVersion, `${label} schema currentVersion`)
  if (version !== currentVersion) {
    throw new RangeError(`Unsupported ${label} data version ${version}; current version is ${currentVersion}`)
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
  assertPlainJsonObject(input, label)
  const candidate = /** @type {Record<string, unknown>} */ ({ ...input })
  assertKnownKeys(candidate, BLOCK_KEYS, label)

  if (!Object.hasOwn(candidate, 'id') || typeof candidate.id !== 'string' || !candidate.id) {
    throw new TypeError(`${label} id must be a non-empty string`)
  }
  if (!Object.hasOwn(candidate, 'type') || typeof candidate.type !== 'string' || !candidate.type) {
    throw new TypeError(`${label} type must be a non-empty string`)
  }
  if (!Object.hasOwn(candidate, 'dataVersion')) {
    throw new TypeError(`${label} dataVersion is required`)
  }
  assertPositiveVersion(candidate.dataVersion, `${label} dataVersion`)
  if (!Object.hasOwn(candidate, 'data')) throw new TypeError(`${label} data is required`)
  assertPlainJsonObject(candidate.data, `${label} data`)

  if (Object.hasOwn(candidate, 'tunes')) {
    if (candidate.tunes === undefined || candidate.tunes === null) {
      throw new TypeError(`${label} tunes must be omitted or a JSON object`)
    }
    assertPlainJsonObject(candidate.tunes, `${label} tunes`)
  }
  if (Object.hasOwn(candidate, 'inline')) {
    if (candidate.inline === undefined || candidate.inline === null) {
      throw new TypeError(`${label} inline must be omitted or a JSON object`)
    }
    assertPlainJsonObject(candidate.inline, `${label} inline`)
  }
  if (Object.hasOwn(candidate, 'revision')) {
    const revision = candidate.revision
    if (revision === undefined || revision === null
      || (typeof revision !== 'string'
        && (typeof revision !== 'number' || !Number.isFinite(revision)))) {
      throw new TypeError(`${label} revision must be omitted, a string, or a finite number`)
    }
  }

  return /** @type {import('./documentTypes').EditorBlockData} */ (candidate)
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
  assertPlainJsonObject(input, 'Editor document')
  const candidate = /** @type {Record<string, unknown>} */ ({ ...input })
  assertKnownKeys(candidate, DOCUMENT_KEYS, 'Editor document')

  if (!Object.hasOwn(candidate, 'version')) {
    throw new TypeError('Editor document version is required')
  }
  if (typeof candidate.version !== 'string' || !candidate.version) {
    throw new TypeError('Editor document version must be a non-empty string')
  }
  if (candidate.version !== DOCUMENT_FORMAT_VERSION) {
    throw new RangeError(
      `Unsupported document version "${candidate.version}"; current version is "${DOCUMENT_FORMAT_VERSION}"`,
    )
  }
  if (!Object.hasOwn(candidate, 'blocks') || !Array.isArray(candidate.blocks)) {
    throw new TypeError('Editor document blocks must be an array')
  }
  if (Object.hasOwn(candidate, 'time')
      && (typeof candidate.time !== 'number' || !Number.isFinite(candidate.time))) {
    throw new TypeError('Editor document time must be a finite number when present')
  }

  const snapshotBlock = options.snapshotBlock ?? snapshotCurrentBlockEnvelope
  const ids = new Set()
  const blocks = []
  for (let index = 0; index < candidate.blocks.length; index++) {
    if (!Object.hasOwn(candidate.blocks, index)) {
      throw new TypeError('Editor document blocks must be a dense array')
    }
    const block = snapshotBlock(candidate.blocks[index], `Editor document block[${index}]`)
    if (ids.has(block.id)) throw new Error(`Duplicate block id: ${block.id}`)
    ids.add(block.id)
    blocks.push(block)
  }

  return /** @type {import('./documentTypes').EditorOutputData} */ ({
    version: DOCUMENT_FORMAT_VERSION,
    ...(candidate.time === undefined ? {} : { time: candidate.time }),
    blocks,
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
  if (input === undefined) return undefined
  assertPlainJsonObject(input, 'Inline map')
  const source = /** @type {Record<string, unknown>} */ (cloneEditorData(input))
  /** @type {Record<string, import('./documentTypes').EditorInlineWidget>} */
  const result = {}

  for (const [id, value] of Object.entries(source)) {
    if (!id) throw new TypeError('Inline widget id must be a non-empty string')
    assertPlainJsonObject(value, `Inline widget "${id}"`)
    const candidate = /** @type {Record<string, unknown>} */ ({ ...value })
    assertKnownKeys(candidate, INLINE_KEYS, `Inline widget "${id}"`)
    if (typeof candidate.type !== 'string' || !candidate.type) {
      throw new TypeError(`Inline widget "${id}" type must be a non-empty string`)
    }
    if (!Object.hasOwn(candidate, 'dataVersion')) {
      throw new TypeError(`Inline widget "${id}" dataVersion is required`)
    }
    const version = assertPositiveVersion(candidate.dataVersion, `Inline widget "${id}" dataVersion`)
    if (!Object.hasOwn(candidate, 'data')) {
      throw new TypeError(`Inline widget "${id}" data is required`)
    }
    assertPlainJsonObject(candidate.data, `Inline widget "${id}" data`)

    const schema = resolvers.getInlineSchema?.(candidate.type)
    if (!schema) {
      result[id] = /** @type {import('./documentTypes').EditorInlineWidget} */ (candidate)
      continue
    }

    assertSchemaVersion(schema, version, `inline widget "${candidate.type}"`)
    const decoded = schema.decode({ dataVersion: version, data: candidate.data })
    if (!decoded || decoded.dataVersion !== schema.currentVersion) {
      throw new TypeError(`Inline widget "${candidate.type}" schema returned an invalid version`)
    }
    assertPlainJsonObject(decoded.data, `Inline widget "${candidate.type}" decoded data`)
    result[id] = {
      type: candidate.type,
      dataVersion: schema.currentVersion,
      data: cloneEditorData(decoded.data),
    }
  }
  return result
}

/**
 * Deep-own and decode one current serialized block.
 *
 * @param {unknown} input
 * @param {{ getBlockSchema?: (type: string) => any, getInlineSchema?: (type: string) => any }} [resolvers]
 * @returns {import('./documentTypes').EditorBlockData}
 */
export function decodeCurrentBlock(input, resolvers = {}) {
  const envelope = snapshotCurrentBlockEnvelope(input)
  const block = /** @type {import('./documentTypes').EditorBlockData} */ (cloneEditorData(envelope))
  const schema = resolvers.getBlockSchema?.(block.type)
  if (schema) {
    assertSchemaVersion(schema, block.dataVersion, `block "${block.type}"`)
    const decoded = schema.decode({ dataVersion: block.dataVersion, data: block.data })
    if (!decoded || decoded.dataVersion !== schema.currentVersion) {
      throw new TypeError(`Block "${block.type}" schema returned an invalid version`)
    }
    assertPlainJsonObject(decoded.data, `Block "${block.type}" decoded data`)
    block.dataVersion = schema.currentVersion
    block.data = cloneEditorData(decoded.data)
  }

  if (block.inline !== undefined) {
    const inline = decodeCurrentInlineMap(block.inline, resolvers)
    if (inline && Object.keys(inline).length > 0) block.inline = inline
    else delete block.inline
  }
  return block
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
