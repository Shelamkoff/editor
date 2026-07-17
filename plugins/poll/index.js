import { sanitizeHtml } from '../../core/sanitize.js'
import { resolvePath } from '../../shared/resolvePath.js'
import { BlockPluginAbstract } from '../BlockPluginAbstract.js'
import { uid } from '../../core/uid.js'
import {
  applyLocalPollVote,
  normalizePollData,
  normalizePollResults,
  shouldAcceptPollRevision,
  validatePollData,
} from '../../shared/pollData.js'
import { setSafeUrlAttribute } from '../../shared/sanitize/sanitizeUrl.js'

const editorStyles = resolvePath('./poll.css', import.meta.url)

// Tabler icon: chart-bar
const ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z"/><path d="M9 8m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z"/><path d="M15 4m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z"/><path d="M4 20h14"/></svg>'

// Action bar icons
const ICON_SINGLE = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>'
const ICON_MULTI = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 12l2 2l4 -4"/></svg>'
const ICON_RESULTS = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4"/><path d="M3 8h10"/><path d="M3 16h7"/><path d="M3 20h14"/></svg>'
const ICON_TRASH = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M4 7h16"/><path stroke-linecap="round" stroke-linejoin="round" d="M10 11v6"/><path stroke-linecap="round" stroke-linejoin="round" d="M14 11v6"/><path stroke-linecap="round" stroke-linejoin="round" d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12"/><path stroke-linecap="round" stroke-linejoin="round" d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/></svg>'
const ICON_PLUS = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>'
const ICON_REMOVE = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M18 6L6 18"/><path stroke-linecap="round" stroke-linejoin="round" d="M6 6l12 12"/></svg>'
const ICON_SORT = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M6 12h12M10 18h4"/></svg>'

/**
 * @typedef {import('../../shared/pollData').PollData} PollData
 * @typedef {import('../../shared/pollData').PollResults} PollResults
 * @typedef {Object} PollDataSource
 * @property {(context: { pollId: string, signal: AbortSignal }) => Promise<PollResults>} load Loads the current counts and optional voter summaries for a persisted poll ID.
 * @property {(context: { pollId: string, optionIds: string[], revision?: string, signal: AbortSignal }) => Promise<PollResults>} vote Submits the selected option IDs and returns the authoritative results.
 * @property {(context: { pollId: string, signal: AbortSignal, onUpdate(results: PollResults): void, onError(error: unknown): void }) => void | (() => void)} [subscribe] Starts live result delivery and optionally returns an idempotent unsubscribe function.
 * @typedef {Object} PollConfig
 * @property {PollDataSource} [dataSource] Backend adapter. Without it votes update the serialized `initialResults` snapshot locally; no remote load, submission, or live subscription occurs.
 * @property {(error: unknown) => void} [onError] Receives rejected load, vote, and subscription errors after the plugin updates its error state.
 * @property {number} [maxVoters=50] Maximum number of voter summaries retained and rendered. Finite values are rounded down and clamped to zero; omitted or non-finite values use 50.
 * @property {(next: string, current: string) => number} [compareRevisions] Orders opaque backend revisions. Return a positive number when `next` is newer, zero when equal, and a negative number when stale.
 * @property {boolean} [injectStyles=true] Whether the editor should load the built-in poll stylesheet.
 * @property {string} [css] Additional stylesheet URL, or the replacement URL when `injectStyles` is `false`.
 * @typedef {{
 *   data: PollData,
 *   runtime: PollResults,
 *   selected: Set<string>,
 *   hasVoted: boolean,
 *   loading: boolean,
 *   submitting: boolean,
 *   error: boolean,
 *   connectionVersion: number,
 *   loadVersion: number,
 *   voteVersion: number,
 *   abortController: AbortController | null,
 *   unsubscribe: (() => void) | null,
 *   context: import('../../core/types').BlockMutationContext,
 * }} PollState
 */
/** @type {WeakMap<HTMLElement, PollState>} */
const stateMap = new WeakMap()


/**
 * Interactive single- or multiple-choice poll with optional remote result
 * loading, vote submission, and live result subscriptions.
 * @extends {BlockPluginAbstract<PollConfig>}
 */
export class Poll extends BlockPluginAbstract {
  static isTextBlock = false
  static styles = [editorStyles]
  type = 'poll'
  icon = ICON
  inlineTools = false

  /**
   * Return the localized toolbox label for this block.
   * @returns {string}
   */
  get title() {
    return this._t('title', 'Poll')
  }

  /**
   * Create a Poll instance with the supplied consumer configuration.
   * @param {PollConfig} [config]
   */
  constructor(config) {
    super(config)
  }

  /** Create a stable identifier for a new answer option. @returns {string} */
  #createOptionId() {
    return `option-${uid()}`
  }

  /** @returns {PollData} */
  #defaultData() {
    return /** @type {PollData} */ ({
      question: '',
      type: 'single',
      options: [
        { id: this.#createOptionId(), text: '' },
        { id: this.#createOptionId(), text: '' },
      ],
      resultsMode: 'always',
    })
  }
  /**
   * Create the editable DOM owned by this block instance.
   * @param {Record<string, unknown>} data
   * @param {import('../../core/types').BlockMutationContext} context
   * @returns {HTMLElement}
   */
  render(data, context) {
    const d = normalizePollData(data, () => this.#createOptionId())
    const runtime = normalizePollResults(d.initialResults, d.options.map(option => option.id), this._config.maxVoters, d.type)

    const wrapper = document.createElement('div')
    wrapper.classList.add('oe-poll')
    wrapper.contentEditable = 'false'
    wrapper.tabIndex = -1

    stateMap.set(wrapper, {
      data: d,
      runtime,
      selected: new Set(runtime.currentUserVote || []),
      hasVoted: (runtime.currentUserVote?.length || 0) > 0,
      loading: false,
      submitting: false,
      error: false,
      connectionVersion: 0,
      loadVersion: 0,
      voteVersion: 0,
      abortController: null,
      unsubscribe: null,
      context,
    })

    this.#build(wrapper)
    this.#connectDataSource(wrapper)
    return wrapper
  }

  /**
   * Serialize the current block DOM into document data.
   * @param {HTMLElement} element
   * @returns {PollData}
   */
  save(element) {
    this.#syncFromDom(element)
    const s = stateMap.get(element)
    if (!s) return { question: '', type: 'single', options: [], resultsMode: 'always' }
    return /** @type {PollData} */ ({
      ...(s.data.pollId ? { pollId: s.data.pollId } : {}),
      question: s.data.question,
      type: s.data.type,
      options: s.data.options.map((o) => ({ ...o })),
      resultsMode: s.data.resultsMode,
      ...(s.data.initialResults ? { initialResults: structuredClone(s.data.initialResults) } : {}),
    })
  }

  /**
   * Check whether serialized data satisfies this block's schema.
   * @param {Record<string, unknown>} data
   * @returns {boolean}
   */
  validate(data) {
    return validatePollData(data)
  }

  /**
   * Check whether the block has no meaningful user content.
   * @param {HTMLElement} element
   * @returns {boolean}
   */
  isEmpty(element) {
    this.#syncFromDom(element)
    const s = stateMap.get(element)
    if (!s) return true
    return !s.data.question.trim() && s.data.options.every((o) => !o.text.trim())
  }

  /**
   * Extract neutral text that can initialize another block type.
   * @param {HTMLElement} element
   * @returns {{ text: string }}
   */
  exportData(element) {
    const s = stateMap.get(element)
    return { text: s?.data.question || '' }
  }

  /**
   * Release listeners and resources owned by this block element.
   * @param {HTMLElement} element
   * @returns {void}
   */
  destroy(element) {
    const s = stateMap.get(element)
    if (s) {
      s.connectionVersion++
      s.loadVersion++
      s.voteVersion++
      s.abortController?.abort()
      try { s.unsubscribe?.() } catch (error) {
        try { this._config.onError?.(error) } catch {}
      }
      s.abortController = null
      s.unsubscribe = null
    }
    stateMap.delete(element)
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  /** @param {HTMLElement} wrapper @returns {void} */
  #syncFromDom(wrapper) {
    const s = stateMap.get(wrapper)
    if (!s) return
    const questionEl = wrapper.querySelector('.oe-poll__question')
    s.data.question = sanitizeHtml(questionEl?.innerHTML?.trim() || '')

    const optionEls = wrapper.querySelectorAll('.oe-poll__option-text')
    optionEls.forEach((el, i) => {
      const opt = s.data.options[i]
      if (opt) {
        opt.text = sanitizeHtml(el.innerHTML?.trim() || '')
      }
    })
  }

  /** @param {HTMLElement} wrapper @returns {void} */
  #build(wrapper) {
    const s = stateMap.get(wrapper)
    if (!s) return
    const w = wrapper
    w.innerHTML = ''

    // Question
    const question = document.createElement('div')
    question.className = 'oe-poll__question'
    question.contentEditable = s.context.readOnly ? 'false' : 'true'
    question.dataset.placeholder = this._t('questionPlaceholder', 'Question...')
    if (s.data.question) question.innerHTML = sanitizeHtml(s.data.question)
    if (!s.context.readOnly) question.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        // Focus first option
        const first = w.querySelector('.oe-poll__option-text')
        if (first) /** @type {HTMLElement} */ (first).focus()
        return
      }
      // Let modifier combos (Ctrl+Z, Ctrl+A, etc.) bubble to ShortcutRegistry
      if (!e.ctrlKey && !e.metaKey) e.stopPropagation()
    })
    w.appendChild(question)

    // Options container
    const optionsWrap = document.createElement('div')
    optionsWrap.className = 'oe-poll__options'

    s.data.options.forEach((opt, i) => {
      optionsWrap.appendChild(this.#createOption(wrapper, s, opt, i))
    })

    // Add option button
    if (!s.context.readOnly) {
      const addBtn = document.createElement('button')
      addBtn.type = 'button'
      addBtn.className = 'oe-poll__option-add'
      addBtn.innerHTML = `${ICON_PLUS} ${this._t('addOption', 'Add option')}`
      addBtn.addEventListener('mousedown', (e) => e.preventDefault())
      addBtn.addEventListener('click', () => {
        s.context.mutate(() => {
          this.#syncFromDom(wrapper)
          s.data.options.push({ id: this.#createOptionId(), text: '' })
          this.#reconcileRuntime(s)
          this.#build(wrapper)
          const texts = wrapper.querySelectorAll('.oe-poll__option-text')
          if (texts.length) /** @type {HTMLElement} */ (texts[texts.length - 1]).focus()
        })
      })
      optionsWrap.appendChild(addBtn)
    }

    w.appendChild(optionsWrap)

    w.appendChild(this.#buildRuntime(wrapper, s))

    // Action bar
    if (!s.context.readOnly) w.appendChild(this.#buildActions(wrapper, s))
  }

  /**
   * @param {HTMLElement} wrapper
   * @param {PollState} s
   * @param {{ id: string, text: string }} opt
   * @param {number} index
   * @returns {HTMLDivElement}
   */
  #createOption(wrapper, s, opt, index) {
    const option = document.createElement('div')
    option.className = 'oe-poll__option'

    // Marker
    const marker = document.createElement('button')
    marker.type = 'button'
    marker.className = `oe-poll__option-marker oe-poll__option-marker--${s.data.type}`
    marker.dataset.optionId = opt.id
    marker.disabled = s.context.readOnly
    marker.setAttribute('aria-label', this._t('selectOption', 'Select option'))
    marker.setAttribute('aria-pressed', String(s.selected.has(opt.id)))
    if (s.selected.has(opt.id)) marker.classList.add('oe-poll__option-marker--selected')
    if (!s.context.readOnly) marker.addEventListener('click', () => {
      if (s.submitting) return
      if (s.data.type === 'single') {
        s.selected = new Set([opt.id])
      } else if (s.selected.has(opt.id)) {
        s.selected.delete(opt.id)
      } else {
        s.selected.add(opt.id)
      }
      this.#syncSelectionUi(wrapper, s)
      this.#replaceRuntime(wrapper, s)
    })
    option.appendChild(marker)

    // Text
    const text = document.createElement('div')
    text.className = 'oe-poll__option-text'
    text.contentEditable = s.context.readOnly ? 'false' : 'true'
    const placeholder = this._t('optionPlaceholder', 'Option')
    text.dataset.placeholder = `${placeholder} ${index + 1}`
    if (opt.text) text.innerHTML = sanitizeHtml(opt.text)

    if (!s.context.readOnly) text.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        s.context.mutate(() => {
          this.#syncFromDom(wrapper)
          s.data.options.splice(index + 1, 0, { id: this.#createOptionId(), text: '' })
          this.#reconcileRuntime(s)
          this.#build(wrapper)
          const texts = wrapper.querySelectorAll('.oe-poll__option-text')
          if (texts[index + 1]) /** @type {HTMLElement} */ (texts[index + 1]).focus()
        })
      }
      if (e.key === 'Backspace' && !text.textContent?.trim() && s.data.options.length > 2) {
        e.preventDefault()
        e.stopPropagation()
        s.context.mutate(() => {
          this.#syncFromDom(wrapper)
          s.data.options.splice(index, 1)
          this.#reconcileRuntime(s)
          this.#build(wrapper)
          const focusIdx = Math.max(0, index - 1)
          const texts = wrapper.querySelectorAll('.oe-poll__option-text')
          if (texts[focusIdx]) {
            /** @type {HTMLElement} */ (texts[focusIdx]).focus()
            const sel = window.getSelection()
            if (sel) {
              const range = document.createRange()
              range.selectNodeContents(texts[focusIdx])
              range.collapse(false)
              sel.removeAllRanges()
              sel.addRange(range)
            }
          }
        })
        return
      }
      if (!e.ctrlKey && !e.metaKey) e.stopPropagation()
    })
    option.appendChild(text)

    // Remove button
    if (!s.context.readOnly && s.data.options.length > 2) {
      const removeBtn = document.createElement('button')
      removeBtn.type = 'button'
      removeBtn.className = 'oe-poll__option-remove'
      removeBtn.innerHTML = ICON_REMOVE
      removeBtn.addEventListener('mousedown', (e) => e.preventDefault())
      removeBtn.addEventListener('click', () => {
        s.context.mutate(() => {
          this.#syncFromDom(wrapper)
          s.data.options.splice(index, 1)
          this.#reconcileRuntime(s)
          this.#build(wrapper)
        })
      })
      option.appendChild(removeBtn)
    }

    return option
  }

  /**
   * @param {PollState} s
   * @returns {HTMLDivElement}
   */
  #buildResults(s) {
    const results = document.createElement('div')
    results.className = 'oe-poll__results'

    const totalVotes = s.runtime.total
    const votesById = new Map(s.runtime.options.map(option => [option.id, option.votes]))

    for (const opt of s.data.options) {
      const row = document.createElement('div')
      row.className = 'oe-poll__result-row'

      const label = document.createElement('span')
      label.className = 'oe-poll__result-label'
      if (opt.text) label.innerHTML = sanitizeHtml(opt.text)
      else label.textContent = '—'

      const bar = document.createElement('div')
      bar.className = 'oe-poll__result-bar'

      const fill = document.createElement('div')
      fill.className = 'oe-poll__result-fill'
      const votes = votesById.get(opt.id) || 0
      const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0
      fill.style.width = `${pct}%`
      bar.appendChild(fill)

      const pctLabel = document.createElement('span')
      pctLabel.className = 'oe-poll__result-pct'
      pctLabel.textContent = `${pct}%`

      row.append(label, bar, pctLabel)
      results.appendChild(row)
    }

    return results
  }

  /** @param {'always' | 'afterVote' | 'hidden'} mode @returns {string} */
  #resultsModeLabel(mode) {
    if (mode === 'afterVote') return this._t('resultsAfterVote', 'Results after vote')
    if (mode === 'hidden') return this._t('resultsHidden', 'Results hidden')
    return this._t('resultsAlways', 'Results always visible')
  }

  /** @param {PollState} s @returns {void} */
  #reconcileRuntime(s) {
    const ids = s.data.options.map(option => option.id)
    s.runtime = normalizePollResults(s.runtime, ids, this._config.maxVoters, s.data.type)
    s.selected = new Set([...s.selected].filter(id => ids.includes(id)))
    if (s.data.type === 'single' && s.selected.size > 1) {
      s.selected = new Set([[...s.selected][0]])
    }
    if (!this._config.dataSource && s.data.initialResults) {
      s.data.initialResults = normalizePollResults(s.data.initialResults, ids, this._config.maxVoters, s.data.type)
    }
  }

  /** @param {HTMLElement} wrapper @param {PollState} s @returns {void} */
  #syncSelectionUi(wrapper, s) {
    wrapper.querySelectorAll('.oe-poll__option-marker').forEach(element => {
      const button = /** @type {HTMLButtonElement} */ (element)
      const selected = !!button.dataset.optionId && s.selected.has(button.dataset.optionId)
      button.classList.toggle('oe-poll__option-marker--selected', selected)
      button.setAttribute('aria-pressed', String(selected))
    })
  }

  /** @param {HTMLElement} wrapper @param {PollState} s @returns {void} */
  #replaceRuntime(wrapper, s) {
    wrapper.querySelector('.oe-poll__runtime')?.replaceWith(this.#buildRuntime(wrapper, s))
  }

  /** @param {HTMLElement} wrapper @param {PollState} s @returns {HTMLDivElement} */
  #buildRuntime(wrapper, s) {
    const runtime = document.createElement('div')
    runtime.className = 'oe-poll__runtime'

    if (s.loading) {
      const status = document.createElement('div')
      status.className = 'oe-poll__status'
      status.setAttribute('role', 'status')
      status.textContent = this._t('loading', 'Loading results…')
      runtime.appendChild(status)
    } else if (s.error) {
      const status = document.createElement('div')
      status.className = 'oe-poll__status oe-poll__status--error'
      status.setAttribute('role', 'alert')
      status.textContent = this._t('loadError', 'Could not load poll results')
      runtime.appendChild(status)
    }

    const showResults = s.data.resultsMode === 'always'
      || (s.data.resultsMode === 'afterVote' && s.hasVoted)
    if (!s.loading && showResults) {
      runtime.appendChild(this.#buildResults(s))
      if (s.runtime.total === 0) {
        const empty = document.createElement('div')
        empty.className = 'oe-poll__status'
        empty.textContent = this._t('emptyResults', 'No votes yet')
        runtime.appendChild(empty)
      }
      if (s.runtime.voters?.length) runtime.appendChild(this.#buildVoters(s))
    }

    const submit = document.createElement('button')
    submit.type = 'button'
    submit.className = 'oe-poll__submit'
    submit.disabled = s.context.readOnly || s.submitting || s.loading || s.selected.size === 0
    submit.textContent = s.submitting ? this._t('submitting', 'Submitting…') : this._t('vote', 'Vote')
    submit.addEventListener('click', () => this.#submitVote(wrapper, s))
    runtime.appendChild(submit)
    return runtime
  }

  /** @param {PollState} s @returns {HTMLDivElement} */
  #buildVoters(s) {
    const section = document.createElement('div')
    section.className = 'oe-poll__voters'
    const heading = document.createElement('div')
    heading.className = 'oe-poll__voters-title'
    const total = s.runtime.votersTotal ?? s.runtime.voters?.length ?? 0
    heading.textContent = `${this._t('voters', 'Voters')}: ${total}`
    section.appendChild(heading)
    const list = document.createElement('ul')
    for (const voter of s.runtime.voters || []) {
      const item = document.createElement('li')
      if (voter.avatar) {
        const image = document.createElement('img')
        setSafeUrlAttribute(image, 'src', voter.avatar, 'media')
        image.alt = ''
        image.width = 24
        image.height = 24
        item.appendChild(image)
      }
      const name = document.createElement('span')
      name.textContent = voter.name || this._t('anonymousVoter', 'Anonymous voter')
      item.appendChild(name)
      list.appendChild(item)
    }
    section.appendChild(list)
    return section
  }

  /** @param {HTMLElement} wrapper @param {PollState} s @returns {void} */
  #submitVote(wrapper, s) {
    if (s.context.readOnly || s.submitting || s.selected.size === 0) return
    const optionIds = [...s.selected]
    if (!this._config.dataSource) {
      s.context.mutate(() => {
        this.#syncFromDom(wrapper)
        const previous = s.runtime.currentUserVote || []
        s.runtime = applyLocalPollVote(s.runtime, previous, optionIds, s.data.options.map(option => option.id))
        s.hasVoted = true
        s.data.initialResults = structuredClone(s.runtime)
        this.#replaceRuntime(wrapper, s)
      })
      return
    }
    if (!s.data.pollId) {
      this.#reportDataSourceError(wrapper, s, new Error('Poll dataSource requires pollId'))
      return
    }

    const dataSource = this._config.dataSource
    const controller = s.abortController
    if (!controller || controller.signal.aborted) return
    const connectionVersion = s.connectionVersion
    const voteVersion = ++s.voteVersion
    s.submitting = true
    s.error = false
    this.#replaceRuntime(wrapper, s)

    // Invoke the consumer callback synchronously with the user action. The
    // pending flag is already set, so subscription-driven re-renders cannot
    // admit a second submission. Wrap only the returned value as a promise;
    // deferring the callback itself would make observable submission timing
    // depend on an unrelated microtask.
    let voteRequest
    try {
      voteRequest = dataSource.vote({
        pollId: /** @type {string} */ (s.data.pollId),
        optionIds,
        revision: s.runtime.revision,
        signal: controller.signal,
      })
    } catch (error) {
      if (stateMap.get(wrapper) === s && !controller.signal.aborted
        && connectionVersion === s.connectionVersion && voteVersion === s.voteVersion) {
        s.submitting = false
        this.#reportDataSourceError(wrapper, s, error)
      }
      return
    }

    void Promise.resolve(voteRequest).then(results => {
      if (stateMap.get(wrapper) !== s || controller.signal.aborted
        || connectionVersion !== s.connectionVersion || voteVersion !== s.voteVersion) return
      this.#acceptRuntimeResults(wrapper, s, results, true)
    }).catch(error => {
      if (controller.signal.aborted || stateMap.get(wrapper) !== s
        || connectionVersion !== s.connectionVersion || voteVersion !== s.voteVersion) return
      this.#reportDataSourceError(wrapper, s, error)
    }).finally(() => {
      if (stateMap.get(wrapper) !== s || controller.signal.aborted
        || connectionVersion !== s.connectionVersion || voteVersion !== s.voteVersion) return
      s.submitting = false
      this.#replaceRuntime(wrapper, s)
    })
  }

  /** @param {HTMLElement} wrapper @param {PollState} s @param {PollResults} results @param {boolean} [confirmedVote] @returns {void} */
  #acceptRuntimeResults(wrapper, s, results, confirmedVote = false) {
    const normalized = normalizePollResults(results, s.data.options.map(option => option.id), this._config.maxVoters, s.data.type)
    let accepted
    try {
      accepted = shouldAcceptPollRevision(normalized.revision, s.runtime.revision, this._config.compareRevisions)
    } catch (error) {
      this.#reportDataSourceError(wrapper, s, error)
      return
    }
    if (confirmedVote) s.hasVoted = true
    if (!accepted) {
      s.error = false
      this.#replaceRuntime(wrapper, s)
      return
    }
    s.runtime = normalized
    s.selected = new Set(normalized.currentUserVote || s.selected)
    s.hasVoted ||= (normalized.currentUserVote?.length || 0) > 0
    s.error = false
    this.#syncSelectionUi(wrapper, s)
    this.#replaceRuntime(wrapper, s)
  }

  /** @param {HTMLElement} wrapper @param {PollState} s @param {unknown} error @returns {void} */
  #reportDataSourceError(wrapper, s, error) {
    s.error = true
    try { this._config.onError?.(error) } catch {}
    this.#replaceRuntime(wrapper, s)
  }

  /** @param {HTMLElement} wrapper @returns {void} */
  #connectDataSource(wrapper) {
    const s = stateMap.get(wrapper)
    const dataSource = this._config.dataSource
    if (!s || !dataSource || !s.data.pollId) return

    s.abortController?.abort()
    try { s.unsubscribe?.() } catch (error) {
      try { this._config.onError?.(error) } catch {}
    }
    const controller = new AbortController()
    s.abortController = controller
    const connectionVersion = ++s.connectionVersion
    const loadVersion = ++s.loadVersion
    s.voteVersion++
    s.loading = true
    s.error = false
    this.#replaceRuntime(wrapper, s)

    if (dataSource.subscribe) {
      try {
        const unsubscribe = dataSource.subscribe({
          pollId: s.data.pollId,
          signal: controller.signal,
          onUpdate: results => {
            if (stateMap.get(wrapper) === s && !controller.signal.aborted) {
              s.loadVersion++
              s.loading = false
              this.#acceptRuntimeResults(wrapper, s, results)
            }
          },
          onError: error => {
            if (stateMap.get(wrapper) === s && !controller.signal.aborted) {
              this.#reportDataSourceError(wrapper, s, error)
            }
          },
        })
        if (typeof unsubscribe === 'function') s.unsubscribe = unsubscribe
      } catch (error) {
        this.#reportDataSourceError(wrapper, s, error)
      }
    }

    void Promise.resolve().then(() => dataSource.load({
      pollId: /** @type {string} */ (s.data.pollId),
      signal: controller.signal,
    })).then(results => {
      if (stateMap.get(wrapper) !== s || controller.signal.aborted
        || connectionVersion !== s.connectionVersion || loadVersion !== s.loadVersion) return
      this.#acceptRuntimeResults(wrapper, s, results)
    }).catch(error => {
      if (stateMap.get(wrapper) !== s || controller.signal.aborted
        || connectionVersion !== s.connectionVersion || loadVersion !== s.loadVersion) return
      this.#reportDataSourceError(wrapper, s, error)
    }).finally(() => {
      if (stateMap.get(wrapper) !== s || controller.signal.aborted
        || connectionVersion !== s.connectionVersion || loadVersion !== s.loadVersion) return
      s.loading = false
      this.#replaceRuntime(wrapper, s)
    })
  }

  /**
   * @param {HTMLElement} wrapper
   * @param {PollState} s
   * @returns {HTMLDivElement}
   */
  #buildActions(wrapper, s) {
    const actions = document.createElement('div')
    actions.className = 'oe-poll__actions'

    // Type toggle
    const isSingle = s.data.type === 'single'
    const typeBtn = document.createElement('button')
    typeBtn.type = 'button'
    typeBtn.className = 'oe-poll__action-btn'
    const typeIcon = isSingle ? ICON_SINGLE : ICON_MULTI
    const typeLabel = isSingle
      ? this._t('single', 'Single choice')
      : this._t('multiple', 'Multiple choice')
    typeBtn.innerHTML = `${typeIcon} ${typeLabel}`
    typeBtn.addEventListener('mousedown', (e) => e.preventDefault())
    typeBtn.addEventListener('click', () => {
      s.context.mutate(() => {
        this.#syncFromDom(wrapper)
        const previousVote = s.runtime.currentUserVote || []
        s.data.type = s.data.type === 'single' ? 'multiple' : 'single'
        if (s.data.type === 'single' && s.selected.size > 1) {
          s.selected = new Set([[...s.selected][0]])
        }
        if (!this._config.dataSource && s.data.type === 'single' && previousVote.length > 1) {
          s.runtime = applyLocalPollVote(
            s.runtime,
            previousVote,
            previousVote.slice(0, 1),
            s.data.options.map(option => option.id),
          )
          s.data.initialResults = structuredClone(s.runtime)
        }
        this.#reconcileRuntime(s)
        this.#build(wrapper)
      })
    })
    actions.appendChild(typeBtn)

    actions.appendChild(this.#makeSep())

    // Results toggle
    const resultsBtn = document.createElement('button')
    resultsBtn.type = 'button'
    resultsBtn.className = 'oe-poll__action-btn'
    resultsBtn.innerHTML = `${ICON_RESULTS} ${this.#resultsModeLabel(s.data.resultsMode)}`
    resultsBtn.addEventListener('mousedown', (e) => e.preventDefault())
    resultsBtn.addEventListener('click', () => {
      s.context.mutate(() => {
        this.#syncFromDom(wrapper)
        const modes = /** @type {const} */ (['always', 'afterVote', 'hidden'])
        const index = modes.indexOf(s.data.resultsMode)
        s.data.resultsMode = modes[(index + 1) % modes.length]
        this.#build(wrapper)
      })
    })
    actions.appendChild(resultsBtn)

    actions.appendChild(this.#makeSep())

    const sortBtn = document.createElement('button')
    sortBtn.type = 'button'
    sortBtn.className = 'oe-poll__action-btn'
    sortBtn.innerHTML = `${ICON_SORT} ${this._t('sort', 'Sort')}`
    sortBtn.addEventListener('mousedown', (e) => e.preventDefault())
    sortBtn.addEventListener('click', () => {
      s.context.mutate(() => {
        this.#syncFromDom(wrapper)
        s.data.options = s.data.options
          .map((option, index) => ({ option, index }))
          .sort((a, b) => a.option.text.localeCompare(b.option.text) || a.index - b.index)
          .map(entry => entry.option)
        this.#build(wrapper)
      })
    })
    actions.appendChild(sortBtn)

    actions.appendChild(this.#makeSep())

    // Delete
    const deleteBtn = document.createElement('button')
    deleteBtn.type = 'button'
    deleteBtn.className = 'oe-poll__action-btn oe-poll__action-btn--danger'
    deleteBtn.innerHTML = ICON_TRASH
    deleteBtn.title = this._t('delete', 'Delete')
    deleteBtn.addEventListener('mousedown', (e) => e.preventDefault())
    deleteBtn.addEventListener('click', () => {
      s.context.mutate(() => {
        s.connectionVersion++
        s.loadVersion++
        s.voteVersion++
        s.abortController?.abort()
        try { s.unsubscribe?.() } catch (error) {
          try { this._config.onError?.(error) } catch {}
        }
        s.abortController = null
        s.unsubscribe = null
        s.data = this.#defaultData()
        s.runtime = normalizePollResults(undefined, s.data.options.map(option => option.id), this._config.maxVoters, s.data.type)
        s.selected.clear()
        s.hasVoted = false
        this.#build(wrapper)
      })
    })
    actions.appendChild(deleteBtn)

    return actions
  }

  /** @returns {HTMLDivElement} */
  #makeSep() {
    const sep = document.createElement('div')
    sep.className = 'oe-poll__actions-sep'
    return sep
  }
}
