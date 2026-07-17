import { sanitizeUrl } from './sanitize/sanitizeUrl.js'

/**
 * @typedef {{ id: string, text: string }} PollOption Author-owned option with a stable document id and inline-text label.
 * @typedef {{ id: string, votes: number }} PollOptionResult Vote count for one author-owned option id.
 * @typedef {{ id: string, name?: string, avatar?: string, optionIds?: string[] }} PollVoter Optional application-owned voter summary.
 * @typedef {{ revision?: string, total: number, options: PollOptionResult[], voters?: PollVoter[], votersTotal?: number, currentUserVote?: string[] }} PollResults Runtime result snapshot. `total` is the ballot-count denominator used for percentages; multiple-choice option percentages may therefore sum above 100%.
 * @typedef {{ pollId?: string, question: string, type: 'single' | 'multiple', options: PollOption[], resultsMode: 'always' | 'afterVote' | 'hidden', initialResults?: PollResults }} PollData Persisted poll authoring data plus an optional initial/local result snapshot.
 */

export const POLL_RESULTS_MODES = Object.freeze(['always', 'afterVote', 'hidden'])

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Normalize an untrusted runtime result without retaining arbitrary fields.
 * Unknown option ids and active avatar URLs are discarded.
 * @param {unknown} input
 * @param {string[]} optionIds
 * @param {number} [maxVoters]
 * @param {'single' | 'multiple'} [selectionType]
 * @returns {PollResults}
 */
export function normalizePollResults(input, optionIds, maxVoters = 50, selectionType = 'multiple') {
  const source = isRecord(input) ? /** @type {Record<string, unknown>} */ (input) : {}
  const allowed = new Set(optionIds)
  const voterLimit = Number.isFinite(maxVoters)
    ? Math.max(0, Math.floor(maxVoters))
    : 50
  const byId = new Map()
  if (Array.isArray(source.options)) {
    for (const option of source.options) {
      if (!isRecord(option) || typeof option.id !== 'string' || !allowed.has(option.id)) continue
      const votes = Number(option.votes)
      byId.set(option.id, Number.isFinite(votes) && votes >= 0 ? Math.floor(votes) : 0)
    }
  }
  const options = optionIds.map(id => ({ id, votes: byId.get(id) ?? 0 }))
  const calculatedTotal = options.reduce((sum, option) => sum + option.votes, 0)
  const declaredTotal = Number(source.total)
  const total = Number.isFinite(declaredTotal) && declaredTotal >= 0
    ? Math.floor(declaredTotal)
    : calculatedTotal

  /** @type {PollResults} */
  const result = { total, options }
  if (typeof source.revision === 'string' && source.revision) result.revision = source.revision
  if (Array.isArray(source.currentUserVote)) {
    const selected = [...new Set(source.currentUserVote.filter(id => typeof id === 'string' && allowed.has(id)))]
    result.currentUserVote = selectionType === 'single' ? selected.slice(0, 1) : selected
  }
  if (typeof source.votersTotal === 'number'
    && Number.isFinite(source.votersTotal)
    && source.votersTotal >= 0) {
    result.votersTotal = Math.floor(source.votersTotal)
  }
  if (Array.isArray(source.voters)) {
    const voterIds = new Set()
    result.voters = source.voters.flatMap(voter => {
      if (!isRecord(voter) || typeof voter.id !== 'string' || !voter.id) return []
      if (voterIds.has(voter.id) || voterIds.size >= voterLimit) return []
      voterIds.add(voter.id)
      /** @type {PollVoter} */
      const safe = { id: voter.id }
      if (typeof voter.name === 'string') safe.name = voter.name
      const avatar = sanitizeUrl(typeof voter.avatar === 'string' ? voter.avatar : '', { policy: 'media', fallback: '' })
      if (avatar) safe.avatar = avatar
      if (Array.isArray(voter.optionIds)) {
        const selected = [...new Set(voter.optionIds.filter(id => typeof id === 'string' && allowed.has(id)))]
        safe.optionIds = selectionType === 'single' ? selected.slice(0, 1) : selected
      }
      return [safe]
    })
  }
  return result
}

/**
 * @param {unknown} input
 * @param {() => string} createId
 * @returns {PollData}
 */
export function normalizePollData(input, createId) {
  const source = isRecord(input) ? /** @type {Record<string, unknown>} */ (input) : {}
  const used = new Set()
  const rawOptions = Array.isArray(source.options) ? source.options : []
  const options = rawOptions.map(option => {
    const record = isRecord(option) ? option : {}
    let id = typeof record.id === 'string' && record.id ? record.id : createId()
    while (used.has(id)) id = createId()
    used.add(id)
    return { id, text: typeof record.text === 'string' ? record.text : '' }
  })
  while (options.length < 2) {
    let id = createId()
    while (used.has(id)) id = createId()
    used.add(id)
    options.push({ id, text: '' })
  }

  const data = {
    question: typeof source.question === 'string' ? source.question : '',
    type: source.type === 'multiple' ? /** @type {'multiple'} */ ('multiple') : /** @type {'single'} */ ('single'),
    options,
    resultsMode: POLL_RESULTS_MODES.includes(/** @type {any} */ (source.resultsMode))
      ? /** @type {'always' | 'afterVote' | 'hidden'} */ (source.resultsMode)
      : /** @type {'always'} */ ('always'),
  }
  if (typeof source.pollId === 'string' && source.pollId) data.pollId = source.pollId

  let initial = source.initialResults
  // One-way normalization for documents produced by the old editor: votes
  // become an initial runtime snapshot instead of remaining on author options.
  if (!initial && rawOptions.some(option => isRecord(option) && Number(option.votes) > 0)) {
    initial = {
      total: rawOptions.reduce((sum, option) => sum + Math.max(0, Number(isRecord(option) ? option.votes : 0) || 0), 0),
      options: options.map((option, index) => ({
        id: option.id,
        votes: Math.max(0, Number(isRecord(rawOptions[index]) ? rawOptions[index].votes : 0) || 0),
      })),
    }
  }
  if (initial) data.initialResults = normalizePollResults(initial, options.map(option => option.id), 50, data.type)
  return data
}

/** @param {unknown} data */
export function validatePollData(data) {
  if (!isRecord(data)) return false
  const value = /** @type {Record<string, unknown>} */ (data)
  if (value.pollId !== undefined && (typeof value.pollId !== 'string' || !value.pollId)) return false
  if (typeof value.question !== 'string' || !value.question.trim()) return false
  if (value.type !== 'single' && value.type !== 'multiple') return false
  if (!POLL_RESULTS_MODES.includes(/** @type {any} */ (value.resultsMode))) return false
  if (!Array.isArray(value.options) || value.options.length < 2) return false
  const ids = new Set()
  for (const option of value.options) {
    if (!isRecord(option) || typeof option.id !== 'string' || !option.id || ids.has(option.id)) return false
    if (typeof option.text !== 'string' || !option.text.trim()) return false
    ids.add(option.id)
  }
  if (value.initialResults !== undefined) {
    if (!isRecord(value.initialResults)) return false
    const result = /** @type {Record<string, unknown>} */ (value.initialResults)
    if (typeof result.total !== 'number'
      || !Number.isInteger(result.total)
      || result.total < 0
      || !Array.isArray(result.options)) return false
    if (result.revision !== undefined && (typeof result.revision !== 'string' || !result.revision)) return false
    if (result.votersTotal !== undefined
      && (typeof result.votersTotal !== 'number'
        || !Number.isInteger(result.votersTotal)
        || result.votersTotal < 0)) return false
    const resultIds = new Set()
    for (const option of result.options) {
      if (!isRecord(option) || typeof option.id !== 'string' || !ids.has(option.id) || resultIds.has(option.id)) return false
      if (typeof option.votes !== 'number' || !Number.isInteger(option.votes) || option.votes < 0) return false
      resultIds.add(option.id)
    }
    if (resultIds.size !== ids.size) return false
    if (result.currentUserVote !== undefined) {
      if (!Array.isArray(result.currentUserVote)) return false
      const selected = new Set(result.currentUserVote)
      if (selected.size !== result.currentUserVote.length
        || [...selected].some(id => typeof id !== 'string' || !ids.has(id))
        || (value.type === 'single' && selected.size > 1)) return false
    }
    if (result.voters !== undefined) {
      if (!Array.isArray(result.voters)) return false
      const voterIds = new Set()
      for (const voter of result.voters) {
        if (!isRecord(voter) || typeof voter.id !== 'string' || !voter.id || voterIds.has(voter.id)) return false
        voterIds.add(voter.id)
        if (voter.name !== undefined && typeof voter.name !== 'string') return false
        if (voter.avatar !== undefined
          && (typeof voter.avatar !== 'string'
            || sanitizeUrl(voter.avatar, { policy: 'media', fallback: '' }) !== voter.avatar)) return false
        if (voter.optionIds !== undefined) {
          if (!Array.isArray(voter.optionIds)) return false
          const voterOptions = new Set(voter.optionIds)
          if (voterOptions.size !== voter.optionIds.length
            || [...voterOptions].some(id => typeof id !== 'string' || !ids.has(id))
            || (value.type === 'single' && voterOptions.size > 1)) return false
        }
      }
    }
  }
  return true
}

/**
 * Apply a local vote and return a new immutable runtime snapshot.
 * @param {PollResults | undefined} current
 * @param {string[]} previousIds
 * @param {string[]} nextIds
 * @param {string[]} optionIds
 * @returns {PollResults}
 */
export function applyLocalPollVote(current, previousIds, nextIds, optionIds) {
  const result = normalizePollResults(current, optionIds)
  const previous = new Set(previousIds)
  const next = new Set(nextIds)
  result.options = result.options.map(option => ({
    id: option.id,
    votes: Math.max(0, option.votes - (previous.has(option.id) ? 1 : 0) + (next.has(option.id) ? 1 : 0)),
  }))
  result.total = Math.max(
    0,
    result.total - (previous.size > 0 ? 1 : 0) + (next.size > 0 ? 1 : 0),
  )
  result.currentUserVote = [...next]
  return result
}

/**
 * Decide whether a runtime result may replace the currently displayed revision.
 * Opaque unequal revisions follow arrival order unless the host supplies an
 * ordering function. Equal revisions are idempotent and therefore ignored.
 *
 * @param {string | undefined} next
 * @param {string | undefined} current
 * @param {((next: string, current: string) => number) | undefined} compare
 */
export function shouldAcceptPollRevision(next, current, compare) {
  if (!next || !current) return true
  if (next === current) return false
  return compare ? compare(next, current) > 0 : true
}
