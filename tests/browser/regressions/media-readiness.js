/** Read only the captured media owner and the functional playback predicate. */
export function playbackState(frame, child, video, trusted) {
  const played = video.played
  return {
    trusted, paused: video.paused,
    played: Array.from({ length: played.length }, (_, index) => [played.start(index), played.end(index)]),
    currentTime: video.currentTime, readyState: video.readyState,
    mediaError: video.error ? { code: video.error.code, message: String(video.error.message ?? '') } : null,
    videoConnected: video.isConnected, frameConnected: frame.isConnected,
    sameChildDocument: frame.contentDocument === child,
    sameVideoDocument: video.ownerDocument === child,
  }
}

/**
 * Observe the same video after its one native action. The caller retains the
 * initial 100ms wait. Reading state precedes the clock sample, so a slow getter
 * or delayed timer cannot admit a positive observation at/after the deadline.
 * No outcome changes focus, media state, ownership or input delivery.
 */
export async function waitForNativePlayback({ readState, now, wait, startedAt, timeoutMs = 3000, pollMs = 50 }) {
  const result = {
    schemaVersion: 2, contract: 'native-playback-functional-v2', origin: 'dispatchKey-completion',
    timeoutMs, pollMs, initialObservation: null, firstObservedPositiveElapsedMs: null,
    finalObservation: null, observations: [], outcome: null,
  }
  const finish = (outcome, error) => {
    result.outcome = outcome
    if (error) result.error = String(error.stack ?? error)
    return result
  }
  if (!Number.isFinite(startedAt) || !(timeoutMs > 0) || !Number.isFinite(timeoutMs)
      || !(pollMs > 0) || !Number.isFinite(pollMs)) return finish('CLOCK_ERROR', new Error('Invalid playback observation clock or budget'))
  let previousElapsed = 0
  while (true) {
    let state, elapsedMs
    try { state = readState() } catch (error) { return finish('OBSERVATION_ERROR', error) }
    try { elapsedMs = now() - startedAt } catch (error) { return finish('CLOCK_ERROR', error) }
    if (!Number.isFinite(elapsedMs) || elapsedMs < previousElapsed) {
      return finish('CLOCK_ERROR', new Error('Playback observation clock is not monotonic'))
    }
    previousElapsed = elapsedMs
    const predicate = state.trusted === true && state.paused === false && state.played.length > 0
    const observation = { elapsedMs, predicate, withinDeadline: elapsedMs < timeoutMs, state }
    result.observations.push(observation)
    result.initialObservation ??= observation
    result.finalObservation = observation
    if (predicate && result.firstObservedPositiveElapsedMs === null) result.firstObservedPositiveElapsedMs = elapsedMs
    if (!state.videoConnected || !state.frameConnected || !state.sameChildDocument || !state.sameVideoDocument) return finish('OWNER_LOST')
    if (state.mediaError !== null) return finish('MEDIA_ERROR')
    if (elapsedMs >= timeoutMs) return finish('DEADLINE')
    if (predicate) return finish('PLAYING')
    try { await wait(Math.min(pollMs, timeoutMs - elapsedMs)) }
    catch (error) { return finish('OBSERVATION_ERROR', error) }
  }
}
