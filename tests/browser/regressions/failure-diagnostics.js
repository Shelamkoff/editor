/** Preserve the original assertion and its cached stack when adding test evidence.
 * @param {Error} error
 * @param {string} diagnostic
 * @returns {Error}
 */
export function appendFailureDiagnostic(error, diagnostic) {
  const originalStack = error.stack ?? String(error)
  const suffix = '\n' + diagnostic
  error.message += suffix
  error.stack = originalStack + suffix
  return error
}

/** Observe only after an assertion has already failed. Callers retain and throw
 * that original Error; subsequent progress is evidence, never a new verdict.
 */
export async function observePlaybackFailure({ readState, wait, now }) {
  const startedAt = now()
  const observation = { elapsedOrigin: 'continuation-entry-after-initial-snapshot',
    limitMs: 3000, pollMs: 50, elapsedMs: 0, terminalReason: null, timeline: [],
    lateReachedOriginalPredicate: false, withinDeadline: false,
    firstProgressElapsedMs: null, collectionError: null }
  while (true) {
    try {
      const state = readState()
      observation.elapsedMs = now() - startedAt
      const originalPredicate = Boolean(state.trusted && !state.paused && state.played.length > 0)
      observation.timeline.push({ ...state, elapsedMs: observation.elapsedMs, originalPredicate })
      if (originalPredicate && observation.firstProgressElapsedMs === null) {
        observation.lateReachedOriginalPredicate = true
        observation.firstProgressElapsedMs = observation.elapsedMs
        observation.withinDeadline = observation.elapsedMs < observation.limitMs
      }
      // A delayed timer may wake after the observation window. Retain that
      // snapshot, but never describe newly observed progress as before deadline.
      if (observation.elapsedMs >= observation.limitMs) {
        observation.terminalReason = 'deadline'
        return observation
      }
      if (originalPredicate) {
        observation.terminalReason = 'progress'
        return observation
      }
      await wait(observation.pollMs)
    } catch (error) {
      observation.elapsedMs = now() - startedAt
      observation.terminalReason = 'collection-error'
      observation.collectionError = String(error)
      return observation
    }
  }
}
