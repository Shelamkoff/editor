import { invokeObserver } from '../../../shared/invokeObserver.js'
// @ts-check
import {
  applyLocalPollVote,
  normalizePollData,
  normalizePollResults,
  shouldAcceptPollRevision,
} from '../../../shared/pollData.js'
import { setSafeUrlAttribute } from '../../../shared/sanitize/sanitizeUrl.js'
import { localeText } from '../locale.js'

const styles = new URL('./styles.css', import.meta.url).href

/**
 * Interactive poll renderer. Author configuration stays in the document;
 * remote counts and voters are owned by the mounted renderer instance.
 * @param {string} classPrefix
 * @param {Record<string, any>} locale
 * @param {import('../../types').PollRendererConfig} [config]
 * @returns {import('../../types').BlockRenderer<import('../../types').PollBlock>}
 */
export function createPollRenderer(classPrefix, locale, config = {}) {
  const p = `${classPrefix}-poll`
  /** @type {WeakMap<HTMLElement, {
   *   data: import('../../types').PollData,
   *   results: import('../../types').PollResults,
   *   selected: Set<string>,
   *   hasVoted: boolean,
   *   loading: boolean,
   *   submitting: boolean,
   *   error: boolean,
   *   connectionVersion: number,
   *   loadVersion: number,
   *   voteVersion: number,
   *   controller: AbortController | null,
   *   unsubscribe: (() => void) | null,
   *   parseInline: import('../../types').InlineParser,
   *   ownerDocument: Document,
   * }>} */
  const states = new WeakMap()

  /** @param {string} key @param {string} fallback */
  const t = (key, fallback) => localeText(locale, `renderer.poll.${key}`, fallback)

  /** @param {HTMLElement} wrapper @param {any} state @param {unknown} input @param {boolean} [confirmedVote] */
  function accept(wrapper, state, input, confirmedVote = false) {
    const next = normalizePollResults(input, state.data.options.map(option => option.id), config.maxVoters, state.data.type)
    let accepted
    try {
      accepted = shouldAcceptPollRevision(next.revision, state.results.revision, config.compareRevisions)
    } catch (error) {
      fail(wrapper, state, error)
      return
    }
    if (confirmedVote) state.hasVoted = true
    if (!accepted) {
      state.error = false
      build(wrapper, state)
      return
    }
    state.results = next
    state.selected = new Set(next.currentUserVote || state.selected)
    state.hasVoted ||= (next.currentUserVote?.length || 0) > 0
    state.error = false
    build(wrapper, state)
  }

  /** @param {HTMLElement} wrapper @param {any} state @param {unknown} error */
  function fail(wrapper, state, error) {
    state.error = true
    invokeObserver(config.onError, [error])
    build(wrapper, state)
  }

  /** @param {any} state */
  function showResults(state) {
    if (state.data.resultsMode === 'hidden') return false
    if (state.data.resultsMode === 'always') return true
    return state.hasVoted
  }

  /** @param {HTMLElement} wrapper @param {any} state */
  function build(wrapper, state) {
    if (states.get(wrapper) !== state) return
    wrapper.replaceChildren()

    if (state.data.question) {
      const question = state.ownerDocument.createElement('div')
      question.className = `${p}__question`
      question.appendChild(state.parseInline(state.data.question))
      wrapper.appendChild(question)
    }

    const options = state.ownerDocument.createElement('div')
    options.className = `${p}__options`
    const votes = new Map(state.results.options.map(option => [option.id, option.votes]))
    for (const option of state.data.options) {
      const row = state.ownerDocument.createElement('div')
      row.className = `${p}__option`
      const marker = state.ownerDocument.createElement('button')
      marker.type = 'button'
      marker.className = `${p}__marker ${p}__marker--${state.data.type}`
      marker.setAttribute('aria-pressed', String(state.selected.has(option.id)))
      if (state.selected.has(option.id)) marker.classList.add(`${p}__marker--selected`)
      marker.disabled = state.submitting
      marker.addEventListener('click', () => {
        if (states.get(wrapper) !== state || state.submitting) return
        if (state.data.type === 'single') state.selected = new Set([option.id])
        else if (state.selected.has(option.id)) state.selected.delete(option.id)
        else state.selected.add(option.id)
        build(wrapper, state)
      })
      row.appendChild(marker)

      const content = state.ownerDocument.createElement('div')
      content.className = `${p}__option-content`
      const text = state.ownerDocument.createElement('span')
      text.className = `${p}__option-text`
      text.appendChild(state.parseInline(option.text))
      marker.setAttribute('aria-label', `${t('selectOption', 'Select option')}: ${text.textContent || option.id}`)
      content.appendChild(text)

      if (showResults(state)) {
        const count = votes.get(option.id) || 0
        const pct = state.results.total > 0 ? Math.round((count / state.results.total) * 100) : 0
        const bar = state.ownerDocument.createElement('div')
        bar.className = `${p}__bar`
        const fill = state.ownerDocument.createElement('div')
        fill.className = `${p}__bar-fill`
        fill.style.width = `${pct}%`
        bar.appendChild(fill)
        const label = state.ownerDocument.createElement('span')
        label.className = `${p}__pct`
        label.textContent = `${pct}%`
        content.append(bar, label)
      }
      row.appendChild(content)
      options.appendChild(row)
    }
    wrapper.appendChild(options)

    if (state.loading || state.error || (showResults(state) && state.results.total === 0)) {
      const status = state.ownerDocument.createElement('div')
      status.className = `${p}__status${state.error ? ` ${p}__status--error` : ''}`
      status.setAttribute('role', state.error ? 'alert' : 'status')
      status.textContent = state.loading
        ? t('loading', 'Loading results…')
        : state.error
          ? t('loadError', 'Could not load poll results')
          : t('emptyResults', 'No votes yet')
      wrapper.appendChild(status)
    }

    if (showResults(state) && state.results.voters?.length) {
      const voters = state.ownerDocument.createElement('div')
      voters.className = `${p}__voters`
      const title = state.ownerDocument.createElement('strong')
      title.textContent = `${t('voters', 'Voters')}: ${state.results.votersTotal ?? state.results.voters.length}`
      voters.appendChild(title)
      const list = state.ownerDocument.createElement('ul')
      for (const voter of state.results.voters) {
        const item = state.ownerDocument.createElement('li')
        if (voter.avatar) {
          const avatar = state.ownerDocument.createElement('img')
          setSafeUrlAttribute(avatar, 'src', voter.avatar, 'media')
          avatar.alt = ''
          avatar.width = 24
          avatar.height = 24
          item.appendChild(avatar)
        }
        const name = state.ownerDocument.createElement('span')
        name.textContent = voter.name || t('anonymousVoter', 'Anonymous voter')
        item.appendChild(name)
        list.appendChild(item)
      }
      voters.appendChild(list)
      wrapper.appendChild(voters)
    }

    const submit = state.ownerDocument.createElement('button')
    submit.type = 'button'
    submit.className = `${p}__submit`
    submit.disabled = state.loading || state.submitting || state.selected.size === 0
    submit.textContent = state.submitting ? t('submitting', 'Submitting…') : t('vote', 'Vote')
    submit.addEventListener('click', () => vote(wrapper, state))
    wrapper.appendChild(submit)
  }

  /** @param {HTMLElement} wrapper @param {any} state */
  function vote(wrapper, state) {
    if (states.get(wrapper) !== state || state.submitting || state.selected.size === 0) return
    const selected = [...state.selected]
    if (!config.dataSource) {
      state.results = applyLocalPollVote(
        state.results,
        state.results.currentUserVote || [],
        selected,
        state.data.options.map(option => option.id),
      )
      state.hasVoted = true
      build(wrapper, state)
      return
    }
    if (!state.data.pollId || !state.controller || state.controller.signal.aborted) {
      fail(wrapper, state, new Error('Poll dataSource requires pollId'))
      return
    }
    const connectionVersion = state.connectionVersion
    const voteVersion = ++state.voteVersion
    state.submitting = true
    state.error = false
    build(wrapper, state)

    let voteRequest
    try {
      voteRequest = config.dataSource.vote({
        pollId: state.data.pollId,
        optionIds: selected,
        revision: state.results.revision,
        signal: state.controller.signal,
      })
    } catch (error) {
      if (states.get(wrapper) === state && !state.controller.signal.aborted
        && connectionVersion === state.connectionVersion && voteVersion === state.voteVersion) {
        state.submitting = false
        fail(wrapper, state, error)
      }
      return
    }

    void Promise.resolve(voteRequest).then(result => {
      if (states.get(wrapper) === state && !state.controller.signal.aborted
        && connectionVersion === state.connectionVersion && voteVersion === state.voteVersion) {
        accept(wrapper, state, result, true)
      }
    }).catch(error => {
      if (states.get(wrapper) === state && !state.controller.signal.aborted
        && connectionVersion === state.connectionVersion && voteVersion === state.voteVersion) fail(wrapper, state, error)
    }).finally(() => {
      if (states.get(wrapper) === state && !state.controller.signal.aborted
        && connectionVersion === state.connectionVersion && voteVersion === state.voteVersion) {
        state.submitting = false
        build(wrapper, state)
      }
    })
  }

  /** @param {HTMLElement} wrapper @param {any} state */
  function connect(wrapper, state) {
    if (!config.dataSource || !state.data.pollId) return
    const AbortControllerCtor = state.ownerDocument.defaultView?.AbortController ?? AbortController
    const controller = new AbortControllerCtor()
    state.controller = controller
    const connectionVersion = ++state.connectionVersion
    const loadVersion = ++state.loadVersion
    state.voteVersion++
    state.loading = true
    build(wrapper, state)
    if (config.dataSource.subscribe) {
      try {
        const unsubscribe = config.dataSource.subscribe({
          pollId: state.data.pollId,
          signal: controller.signal,
          onUpdate: result => {
            if (states.get(wrapper) !== state || controller.signal.aborted) return
            state.loadVersion++
            state.loading = false
            accept(wrapper, state, result)
          },
          onError: error => {
            if (states.get(wrapper) === state && !controller.signal.aborted) fail(wrapper, state, error)
          },
        })
        if (typeof unsubscribe === 'function') state.unsubscribe = unsubscribe
      } catch (error) {
        fail(wrapper, state, error)
      }
    }
    void Promise.resolve().then(() => {
      if (states.get(wrapper) !== state || controller.signal.aborted) return
      return config.dataSource.load({
        pollId: state.data.pollId,
        signal: controller.signal,
      })
    }).then(result => {
      if (states.get(wrapper) === state && !controller.signal.aborted
        && connectionVersion === state.connectionVersion && loadVersion === state.loadVersion) accept(wrapper, state, result)
    }).catch(error => {
      if (states.get(wrapper) === state && !controller.signal.aborted
        && connectionVersion === state.connectionVersion && loadVersion === state.loadVersion) fail(wrapper, state, error)
    }).finally(() => {
      if (states.get(wrapper) === state && !controller.signal.aborted
        && connectionVersion === state.connectionVersion && loadVersion === state.loadVersion) {
        state.loading = false
        build(wrapper, state)
      }
    })
  }

  return {
    type: 'poll',
    styles: [styles],
    render(block, parseInline, context = { ownerDocument: globalThis.document }) {
      let fallbackIndex = 0
      const data = normalizePollData(block.data, () => `legacy-option-${++fallbackIndex}`)
      const results = normalizePollResults(data.initialResults, data.options.map(option => option.id), config.maxVoters, data.type)
      const wrapper = context.ownerDocument.createElement('div')
      wrapper.className = p
      const state = {
        data,
        results,
        selected: new Set(results.currentUserVote || []),
        hasVoted: (results.currentUserVote?.length || 0) > 0,
        loading: false,
        submitting: false,
        error: false,
        connectionVersion: 0,
        loadVersion: 0,
        voteVersion: 0,
        controller: null,
        unsubscribe: null,
        parseInline,
        ownerDocument: context.ownerDocument,
      }
      states.set(wrapper, state)
      build(wrapper, state)
      connect(wrapper, state)
      return wrapper
    },
    destroy(element) {
      const state = states.get(element)
      if (!state) return
      // Revoke the lease before invoking caller-owned abort/unsubscribe code.
      // Retained controls and a reentrant destroy must see an inactive result.
      states.delete(element)
      state.connectionVersion++
      state.loadVersion++
      state.voteVersion++
      const controller = state.controller
      const unsubscribe = state.unsubscribe
      state.controller = null
      state.unsubscribe = null
      controller?.abort()
      try { unsubscribe?.() } catch (error) {
        invokeObserver(config.onError, [error])
      }
    },
  }
}
