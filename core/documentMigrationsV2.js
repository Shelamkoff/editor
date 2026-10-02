// @ts-check
import { cloneEditorData } from '../shared/cloneEditorData.js'
import { isTextAlign } from '../shared/textFormat.js'

export const RECTOR_V1_DOCUMENT_VERSION = '1.0.0'
export const RECTOR_V2_DOCUMENT_VERSION = '2.0.0'

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Move the v1 Paragraph/Heading alignment duplication into the v2 core-owned
 * block tune. Plugin-owned data no longer persists an align field.
 *
 * The input is cloned before modification so the migration can also be used
 * directly in tests/tools without depending on DocumentSchema's ownership
 * boundary.
 *
 * @param {import('./types').EditorDocument} input
 * @returns {import('./types').EditorDocument}
 */
export function migrateV1DocumentToV2(input) {
  const document = cloneEditorData(input)

  for (let index = 0; index < document.blocks.length; index++) {
    const candidate = document.blocks[index]
    if (!isRecord(candidate)) continue

    const type = candidate.type
    if (type !== 'paragraph' && type !== 'heading') continue
    if (!isRecord(candidate.data)) continue

    const data = candidate.data
    const legacyAlign = data.align
    delete data.align

    const sourceTunes = isRecord(candidate.tunes) ? candidate.tunes : {}
    /** @type {Record<string, unknown>} */
    const tunes = cloneEditorData(sourceTunes)

    const existingAlign = tunes.textAlign
    if (!isTextAlign(existingAlign)) {
      delete tunes.textAlign
      if (isTextAlign(legacyAlign)) tunes.textAlign = legacyAlign
    }

    if (Object.keys(tunes).length > 0) candidate.tunes = tunes
    else delete candidate.tunes
  }

  document.version = RECTOR_V2_DOCUMENT_VERSION
  return document
}

/** Built-in document-format migrations owned by Rector itself. */
export const BUILT_IN_DOCUMENT_MIGRATIONS = Object.freeze([
  Object.freeze({
    from: RECTOR_V1_DOCUMENT_VERSION,
    to: RECTOR_V2_DOCUMENT_VERSION,
    migrate: migrateV1DocumentToV2,
  }),
])
