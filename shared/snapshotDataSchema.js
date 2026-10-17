// @ts-check
import { cloneEditorData } from './cloneEditorData.js'
import { equalJsonValue } from './jsonData.js'
import { markDocumentValidationFailure, schemaValidationBoundary } from './documentValidationIssue.js'
import { synchronousResult } from './synchronousResult.js'

function ownObject(value, label) {
  const owned = cloneEditorData(value)
  if (!owned || typeof owned !== 'object' || Array.isArray(owned)) {
    throw new TypeError(`${label} must be a JSON object`)
  }
  return owned
}

function bindMethod(receiver, method, label, { optional = false } = {}) {
  if (method === undefined && optional) return undefined
  if (typeof method !== 'function') throw new TypeError(`${label} must be a function`)
  return (...args) => synchronousResult(Reflect.apply(method, receiver, args))
}

/**
 * Capture an exact-version schema with fixed methods and receiver, guarding
 * every returned envelope and owning JSON data without freezing the caller.
 * @param {any} source Caller-owned schema descriptor.
 * @param {string} label Contract label used in errors.
 * @param {{richText?: boolean, validateDefault?: boolean}} [options] Capture rich-text mapping and optionally probe the canonical default.
 */
export function snapshotDataSchema(source, label, { richText = false, validateDefault = true } = {}) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new TypeError(`${label} must provide a current exact-version data schema`)
  }
  if (Object.hasOwn(source, 'legacyVersion') || Object.hasOwn(source, 'migrations')) {
    throw new TypeError(`${label} schema contains removed compatibility members`)
  }
  const currentVersion = source.currentVersion
  const createDefault = bindMethod(source, source.createDefault, `${label} schema createDefault`)
  const decode = bindMethod(source, source.decode, `${label} schema decode`)
  const encode = bindMethod(source, source.encode, `${label} schema encode`)
  const mapRichText = richText
    ? bindMethod(source, source.mapRichText, `${label} schema mapRichText`, { optional: true })
    : undefined

  if (!Number.isSafeInteger(currentVersion) || currentVersion < 1) {
    throw new TypeError(`${label} schema currentVersion must be a positive safe integer`)
  }

  const schema = {
    currentVersion,

    createDefault() {
      return ownObject(createDefault(), `${label} schema default`)
    },

    decode(input) {
      if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new TypeError(`${label} schema decode input must be an object`)
      }
      // Schema decoding only owns these two envelope fields. Spreading the
      // entire caller object invokes unrelated getters (including symbols)
      // before the version gate and can inspect an unsupported payload.
      const dataVersion = Object.hasOwn(input, 'dataVersion') ? input.dataVersion : undefined
      if (dataVersion !== currentVersion) {
        throw markDocumentValidationFailure(
          new RangeError(`Unsupported ${label} data version ${String(dataVersion)}; current version is ${currentVersion}`),
          { reason: 'unsupported-data-version' },
        )
      }
      return schemaValidationBoundary({}, () => {
        const data = Object.hasOwn(input, 'data') ? input.data : undefined
        const result = decode({
          dataVersion: currentVersion,
          data: cloneEditorData(data),
        })
        if (!result || typeof result !== 'object' || Array.isArray(result)
            || result.dataVersion !== currentVersion) {
          throw new TypeError(`${label} schema decode() must preserve currentVersion`)
        }
        return {
          dataVersion: currentVersion,
          data: ownObject(result.data, `${label} schema decoded data`),
        }
      })
    },

    encode(data) {
      const result = encode(ownObject(data, `${label} schema local data`))
      if (!result || typeof result !== 'object' || Array.isArray(result)
          || result.dataVersion !== currentVersion) {
        throw new TypeError(`${label} schema encode() must emit currentVersion`)
      }
      return {
        dataVersion: currentVersion,
        data: ownObject(result.data, `${label} schema encoded data`),
      }
    },
  }

  if (mapRichText) {
    schema.mapRichText = (data, transform) => {
      if (typeof transform !== 'function') throw new TypeError('Rich-text transform must be a function')
      return ownObject(
        mapRichText(ownObject(data, `${label} rich-text data`), transform),
        `${label} rich-text result`,
      )
    }
  }

  if (validateDefault) {
    const initial = schema.createDefault()
    const encoded = schema.encode(initial)
    const decoded = schema.decode(encoded)
    if (!equalJsonValue(decoded.data, encoded.data)) {
      throw new TypeError(`${label} default must round-trip through encode/decode`)
    }
  }

  return Object.freeze(schema)
}
