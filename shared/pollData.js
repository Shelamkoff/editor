import { sanitizeUrl } from './sanitize/sanitizeUrl.js'

/**
 * @typedef {{ id: string, text: string }} PollOption
 * @typedef {{ id: string, votes: number }} PollOptionResult
 * @typedef {{ id: string, name?: string, avatar?: string, optionIds?: string[] }} PollVoter
 * @typedef {{ revision?: string, total: number, options: PollOptionResult[], voters?: PollVoter[], votersTotal?: number, currentUserVote?: string[] }} PollResults
 * @typedef {{ pollId?: string, question: string, type: 'single' | 'multiple', options: PollOption[], resultsMode: 'always' | 'afterVote' | 'hidden', initialResults?: PollResults }} PollData
 */

export const POLL_RESULTS_MODES = Object.freeze(['always', 'afterVote', 'hidden'])

/** @param {unknown} value */
function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Normalize an untrusted runtime result without retaining arbitrary fields.
 * Unknown option ids and active avatar URLs are discarded.
 * @param {unknown} input
 * @param {string[]} optionIds
 * @param {number} [maxVoters]
 * @returns {PollResults}
 */
export function normalizePollResults(input, optionIds, maxVoters = 50) {
  const source = isRecord(input) ? /** @type {Record<string, unknown>} */ (input) : {}
  const allowed = new Set(optionIds)
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
    result.currentUserVote = [...new Set(source.currentUserVote.filter(id => typeof id === 'string' && allowed.has(id)))]
  }
  if (Number.isFinite(source.votersTotal) && source.votersTotal >= 0) {
    result.votersTotal = Math.floor(Number(source.votersTotal))
  }
  if (Array.isArray(source.voters)) {
    result.voters = source.voters.slice(0, Math.max(0, maxVoters)).flatMap(voter => {
      if (!isRecord(voter) || typeof voter.id !== 'string' || !voter.id) return []
      /** @type {PollVoter} */
      const safe = { id: voter.id }
      if (typeof voter.name === 'string') safe.name = voter.name
      const avatar = sanitizeUrl(typeof voter.avatar === 'string' ? voter.avatar : '', { policy: 'media', fallback: '' })
      if (avatar) safe.avatar = avatar
      if (Array.isArray(voter.optionIds)) {
        safe.optionIds = [...new Set(voter.optionIds.filter(id => typeof id === 'string' && allowed.has(id)))]
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
  if (initial) data.initialResults = normalizePollResults(initial, options.map(option => option.id))
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
    if (!Number.isFinite(result.total) || result.total < 0 || !Array.isArray(result.options)) return false
    const resultIds = new Set()
    for (const option of result.options) {
      if (!isRecord(option) || typeof option.id !== 'string' || !ids.has(option.id) || resultIds.has(option.id)) return false
      if (!Number.isFinite(option.votes) || option.votes < 0) return false
      resultIds.add(option.id)
    }
    if (resultIds.size !== ids.size) return false
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
  result.total = result.options.reduce((sum, option) => sum + option.votes, 0)
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
