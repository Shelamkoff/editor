// @ts-check

export class EditorRendererError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message)
    this.name = 'EditorRendererError'
  }
}

export class UnknownBlockTypeError extends EditorRendererError {
  /** @readonly @type {string} */
  blockType
  /** @readonly @type {string | undefined} */
  blockId

  /**
   * @param {string} blockType
   * @param {string} [blockId]
   */
  constructor(blockType, blockId) {
    const idInfo = blockId ? ` (id: ${blockId})` : ''
    super(`Unknown block type: "${blockType}"${idInfo}`)
    this.name = 'UnknownBlockTypeError'
    this.blockType = blockType
    this.blockId = blockId
  }
}

export class InvalidBlockDataError extends EditorRendererError {
  /** @readonly @type {string} */
  blockType
  /** @readonly @type {string | undefined} */
  blockId

  /**
   * @param {string} blockType
   * @param {string} reason
   * @param {string} [blockId]
   */
  constructor(blockType, reason, blockId) {
    const idInfo = blockId ? ` (id: ${blockId})` : ''
    super(`Invalid data for block type "${blockType}"${idInfo}: ${reason}`)
    this.name = 'InvalidBlockDataError'
    this.blockType = blockType
    this.blockId = blockId
  }
}
