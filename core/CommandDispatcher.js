import { EditorEvent } from './editorEvents.js'

/**
 * Single execution boundary for editor commands.
 *
 * Commands may provide a cheap inverse rollback. Otherwise, the dispatcher
 * restores the canonical pre-command checkpoint configured by the composition
 * root. Nested commands join the outer command and produce one history entry.
 */
export class CommandDispatcher {
  /** @type {import('./types').IBlockManager} */ #blocks
  /** @type {import('./types').IEventBus} */ #events
  /** @type {number} */ #depth = 0
  /** @type {Set<import('./types').IBlock>} */ #affected = new Set()
  /** @type {(() => import('./types').EditorDocument) | null} */ #capture = null
  /** @type {((document: import('./types').EditorDocument) => void) | null} */ #restore = null
  /** @type {((affected: import('./types').IBlock[]) => void) | null} */ #commit = null
  /** @type {boolean} */ #restoring = false
  /** @type {unknown} */ #nestedFailure = null
  /** @type {boolean} */ #hasNestedFailure = false
  /** @type {import('./Diagnostics').Diagnostics | null} */ #diagnostics

  /**
   * @param {import('./types').IBlockManager} blocks Block manager whose
   * affected instances are marked dirty after a successful command.
   * @param {import('./types').IEventBus} events Event bus used to delimit
   * document changes and history transactions.
   * @param {import('./Diagnostics').Diagnostics} [diagnostics] Optional
   * diagnostics sink for failed and slow commands.
   */
  constructor(blocks, events, diagnostics) {
    this.#blocks = blocks
    this.#events = events
    this.#diagnostics = diagnostics ?? null
  }

  /**
   * Propagate a nested command failure to the outer transaction even when an
   * intermediate caller caught it.
   * @param {boolean} outermost Whether the current command owns the transaction.
   * @throws {unknown} The first failure raised by a nested command.
   */
  #throwNestedFailure(outermost) {
    if (outermost && this.#hasNestedFailure) throw this.#nestedFailure
  }

  /** Configure the canonical fallback used when a command throws. */
  configureRollback(capture, restore) {
    this.#capture = capture
    this.#restore = restore
  }

  /** Configure the mandatory synchronous persistence/history step.
   * @param {(affected: import('./types').IBlock[]) => void} commit
   */
  configureCommit(commit) { this.#commit = commit }

  /** Restore core state without capturing or committing the damaged live document.
   * @template T
   * @param {() => T} operation
   * @returns {T}
   */
  restore(operation) {
    const previous = this.#restoring
    this.#restoring = true
    try { return operation() } finally { this.#restoring = previous }
  }

  get active() { return this.#depth > 0 }

  runForRange(range, operation) {
    return this.execute({
      name: 'inline-range',
      affected: this.#blocksForRange(range),
      apply: operation,
    })
  }

  runForBlock(block, operation) {
    return this.execute({ name: `block:${block.type}`, affected: [block], apply: operation })
  }

  runForBlocks(blocks, operation) {
    return this.execute({ name: 'blocks', affected: blocks, apply: operation })
  }

  /** Commit a mutation performed by an integration callback outside execute(). */
  commitExternal(block) {
    this.commitExternalMany([block])
  }

  /** Commit a callback that already changed a known set of blocks. */
  commitExternalMany(blocks) {
    for (const block of blocks) this.#affected.add(block)
    if (this.#depth > 0) return
    const affected = [...this.#affected]
    this.#affected.clear()
    this.#markAndCommit(affected)
  }

  /**
   * Execute a command object.
   * @template T
   * @param {{
   *   name: string,
   *   affected?: Iterable<import('./types').IBlock>,
   *   apply: () => T,
   *   rollback?: () => void,
   *   markDirty?: boolean,
   *   notifyChange?: boolean,
   *   notify?: (result: T) => void,
   * }} command
   * @returns {T}
   */
  execute(command) {
    if (this.#restoring) return command.apply()

    const outermost = this.#depth === 0
    const startedAt = outermost && this.#diagnostics?.enabled ? this.#diagnostics.now() : 0
    if (outermost) {
      this.#nestedFailure = null
      this.#hasNestedFailure = false
    }
    for (const block of command.affected ?? []) this.#affected.add(block)
    const checkpoint = outermost && this.#capture ? this.#capture() : null
    if (outermost && command.notifyChange !== false) this.#events.emit(EditorEvent.WILL_CHANGE)

    this.#depth++
    try {
      const result = command.apply()
      command.notify?.(result)
      // A nested command cannot be made successful by catching its error in
      // the caller: the outer transaction is poisoned and rolls back whole.
      this.#throwNestedFailure(outermost)
      if (outermost && command.notifyChange !== false) {
        this.#markAndCommit(command.markDirty === false ? [] : [...this.#affected])
      }
      return result
    } catch (cause) {
      if (!this.#hasNestedFailure) {
        this.#nestedFailure = cause
        this.#hasNestedFailure = true
      }
      if (outermost) {
        this.#diagnostics?.emit('command.failed', {
          operation: command.name,
          errorName: this.#diagnostics.errorName(cause),
        })
      }
      if (outermost) this.#rollback(command, checkpoint, cause)
      throw cause
    } finally {
      this.#depth--
      if (outermost) {
        this.#affected.clear()
        if (startedAt && this.#diagnostics) {
          const durationMs = this.#diagnostics.now() - startedAt
          if (durationMs >= this.#diagnostics.threshold('commandMs')) {
            this.#diagnostics.emit('command.slow', { operation: command.name, durationMs })
          }
        }
        this.#nestedFailure = null
        this.#hasNestedFailure = false
      }
    }
  }

  #rollback(command, checkpoint, cause) {
    let inverseError = null
    if (command.rollback) {
      try {
        command.rollback()
        return
      } catch (error) {
        inverseError = error
      }
    }

    if (!checkpoint || !this.#restore) {
      if (inverseError) throw new AggregateError([cause, inverseError], `Command "${command.name}" and its rollback failed`)
      return
    }

    this.#restoring = true
    try {
      this.#restore(checkpoint)
    } catch (restoreError) {
      throw new AggregateError(
        inverseError ? [cause, inverseError, restoreError] : [cause, restoreError],
        `Command "${command.name}" failed and its checkpoint could not be restored`,
      )
    } finally {
      this.#restoring = false
    }
  }

  #markAndCommit(affected) {
    const seen = new Set()
    for (const block of affected) {
      if (seen.has(block) || this.#blocks.getBlockById(block.id) !== block) continue
      seen.add(block)
      block.markDirty()
    }
    // Validation and history are required work, not isolated event observers.
    // Run them inside execute()'s catch boundary before announcing success.
    this.#commit?.([...seen])
    for (const block of seen) {
      this.#events.emit(EditorEvent.BLOCK_CHANGED, { blockId: block.id })
    }
    this.#events.emit(EditorEvent.CHANGED)
    this.#events.emit(EditorEvent.HISTORY_COMMIT)
  }

  #blocksForRange(range) {
    const result = []
    for (const block of this.#blocks) {
      const content = block.contentElement
      let intersects = content.contains(range.startContainer)
        || content.contains(range.endContainer)
      try {
        intersects ||= range.intersectsNode(content)
      } catch { /* detached node */ }
      if (intersects) result.push(block)
    }

    if (result.length === 0) {
      const start = this.#blocks.getBlockByChildNode(range.startContainer)
      const end = this.#blocks.getBlockByChildNode(range.endContainer)
      if (start) result.push(start)
      if (end && end !== start) result.push(end)
    }
    return result
  }
}
