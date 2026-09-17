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
  /** @type {Array<() => void>} */ #postCommitQueue = []
  /** @type {boolean} */ #drainingPostCommit = false
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

  /**
   * Deliver external observations only after the enclosing command commits.
   *
   * A post-commit callback may synchronously execute another command. While the
   * queue is draining, those reentrant observations are appended instead of
   * delivered recursively. This preserves causal FIFO ordering: every public
   * event belonging to command A is observed before events from a command B
   * started by one of A's observers.
   *
   * Internal editor services continue to receive synchronous working-state events.
   * @param {() => void} observer
   */
  afterCommit(observer) {
    if (this.active || this.#drainingPostCommit) this.#postCommitQueue.push(observer)
    else observer()
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
    this.#flushPostCommit(this.#markAndCommit(affected))
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
    const postCommitStart = outermost ? this.#postCommitQueue.length : -1
    if (outermost) {
      this.#nestedFailure = null
      this.#hasNestedFailure = false
    }

    // Nothing below this point may mutate transaction state until the prelude
    // has completed. A throwing affected iterable, checkpoint capture, or
    // WILL_CHANGE listener must leave the next command with a clean slate.
    const commandAffected = [...(command.affected ?? [])]
    const checkpoint = outermost && this.#capture ? this.#capture() : null
    if (outermost && command.notifyChange !== false) this.#events.emit(EditorEvent.WILL_CHANGE)
    for (const block of commandAffected) this.#affected.add(block)

    this.#depth++
    let result
    let committed = null
    try {
      result = command.apply()
      command.notify?.(result)
      // A nested command cannot be made successful by catching its error in
      // the caller: the outer transaction is poisoned and rolls back whole.
      this.#throwNestedFailure(outermost)
      if (outermost && command.notifyChange !== false) {
        committed = this.#markAndCommit(command.markDirty === false ? [] : [...this.#affected])
      }
    } catch (cause) {
      // Capture this before registering a direct outer failure below. A
      // pre-existing nested failure means an outer command-specific inverse
      // cannot be assumed to undo every mutation in the joined transaction.
      const failedNestedTransaction = outermost && this.#hasNestedFailure
      if (!this.#hasNestedFailure) {
        this.#nestedFailure = cause
        this.#hasNestedFailure = true
      }
      if (outermost) {
        // Drop observations produced by the transaction that is about to roll
        // back, while retaining callbacks from an already-draining parent
        // command that happen to precede this reentrant transaction.
        this.#postCommitQueue.length = postCommitStart
        this.#diagnostics?.emit('command.failed', {
          operation: command.name,
          errorName: this.#diagnostics.errorName(cause),
        })
      }
      if (outermost) this.#rollback(command, checkpoint, cause, failedNestedTransaction)
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

    // Release transaction state before publication. #flushPostCommit publishes
    // terminal events first so their public deliveries are already queued when
    // an earlier structural observer starts a reentrant command.
    if (outermost && committed) this.#flushPostCommit(committed)
    return result
  }

  /**
   * Publish one committed command and drain public observations in FIFO order.
   * Reentrant commands publish synchronously while the drain is active, but
   * their public deliveries append behind the already queued parent events.
   * @param {import('./types').IBlock[]} affected
   */
  #flushPostCommit(affected) {
    if (this.#drainingPostCommit) {
      this.#publish(affected)
      return
    }

    this.#drainingPostCommit = true
    try {
      this.#publish(affected)
      while (this.#postCommitQueue.length > 0) {
        const observer = this.#postCommitQueue.shift()
        observer?.()
      }
    } catch (error) {
      // Never leak callbacks from an interrupted drain into an unrelated later
      // command. A throwing observer still propagates after the commit, which
      // preserves the existing synchronous afterCommit contract.
      this.#postCommitQueue = []
      throw error
    } finally {
      this.#drainingPostCommit = false
    }
  }

  #rollback(command, checkpoint, cause, forceCheckpoint = false) {
    const canRestoreCheckpoint = !!checkpoint && !!this.#restore
    let inverseError = null
    if (command.rollback && !(forceCheckpoint && canRestoreCheckpoint)) {
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
    return [...seen]
  }

  #publish(affected) {
    for (const block of affected) {
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
