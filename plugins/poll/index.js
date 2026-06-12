import { sanitizeHtml } from '../../core/sanitize.js'
import { resolvePath } from '../../shared/resolvePath.js'
import { BlockPluginAbstract } from '../BlockPluginAbstract.js'

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

/**
 * @typedef {{ question: string, type: string, options: Array<{text: string, votes: number}> }} PollData
 * @typedef {{ data: PollData, showResults: boolean }} PollState
 */
/** @type {WeakMap<HTMLElement, PollState>} */
const stateMap = new WeakMap()


export class Poll extends BlockPluginAbstract {
  static isTextBlock = false
  static styles = [editorStyles]
  type = 'poll'
  icon = ICON
  inlineTools = false

  /** @returns {string} */
  get title() {
    return this._t('title', 'Poll')
  }

  /** @returns {{ question: string, type: string, options: Array<{text: string, votes: number}> }} */
  #defaultData() {
    return {
      question: '',
      type: 'single',
      options: [
        { text: '', votes: 0 },
        { text: '', votes: 0 },
      ],
    }
  }

  /**
   * @param {Record<string, unknown>} data
   * @returns {HTMLElement}
   */
  render(data) {
    const d = {
      question: String(data?.question || ''),
      type: data?.type === 'multiple' ? 'multiple' : 'single',
      options: Array.isArray(data?.options)
        ? data.options.map((o) => ({ text: String(o?.text || ''), votes: Number(o?.votes) || 0 }))
        : [{ text: '', votes: 0 }, { text: '', votes: 0 }],
    }
    if (d.options.length < 2) {
      while (d.options.length < 2) {
        d.options.push({ text: '', votes: 0 })
      }
    }

    const wrapper = document.createElement('div')
    wrapper.classList.add('oe-poll')
    wrapper.contentEditable = 'false'
    wrapper.tabIndex = -1

    stateMap.set(wrapper, { data: d, showResults: false })

    this.#build(wrapper)
    return wrapper
  }

  /**
   * @param {HTMLElement} element
   * @returns {Record<string, unknown>}
   */
  save(element) {
    this.#syncFromDom(element)
    const s = stateMap.get(element)
    if (!s) return { question: '', type: 'single', options: [] }
    return {
      question: s.data.question,
      type: s.data.type,
      options: s.data.options.map((o) => ({ ...o })),
    }
  }

  /**
   * @param {Record<string, unknown>} data
   * @returns {boolean}
   */
  validate(data) {
    return !!data?.question && Array.isArray(data?.options) && data.options.length >= 2
  }

  /**
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
   * @param {HTMLElement} element
   * @returns {{ text: string }}
   */
  exportData(element) {
    const s = stateMap.get(element)
    return { text: s?.data.question || '' }
  }

  /**
   * @param {HTMLElement} element
   */
  destroy(element) {
    stateMap.delete(element)
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  /** @param {HTMLElement} wrapper */
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

  /** @param {HTMLElement} wrapper */
  #build(wrapper) {
    const s = stateMap.get(wrapper)
    if (!s) return
    const w = wrapper
    w.innerHTML = ''

    // Question
    const question = document.createElement('div')
    question.className = 'oe-poll__question'
    question.contentEditable = 'true'
    question.dataset.placeholder = this._t('questionPlaceholder', 'Question...')
    if (s.data.question) question.innerHTML = sanitizeHtml(s.data.question)
    question.addEventListener('keydown', (e) => {
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
      optionsWrap.appendChild(this.#createOption(wrapper, s, opt, i, optionsWrap))
    })

    // Add option button
    const addBtn = document.createElement('button')
    addBtn.type = 'button'
    addBtn.className = 'oe-poll__option-add'
    addBtn.innerHTML = `${ICON_PLUS} ${this._t('addOption', 'Add option')}`
    addBtn.addEventListener('mousedown', (e) => e.preventDefault())
    addBtn.addEventListener('click', () => {
      this.#syncFromDom(wrapper)
      s.data.options.push({ text: '', votes: 0 })
      this.#build(wrapper)
      wrapper.dispatchEvent(new InputEvent('input', { bubbles: true }))
      const texts = wrapper.querySelectorAll('.oe-poll__option-text')
      if (texts.length) /** @type {HTMLElement} */ (texts[texts.length - 1]).focus()
    })
    optionsWrap.appendChild(addBtn)

    w.appendChild(optionsWrap)

    // Results preview
    if (s.showResults) {
      w.appendChild(this.#buildResults(s))
    }

    // Action bar
    w.appendChild(this.#buildActions(wrapper, s))
  }

  /**
   * @param {HTMLElement} wrapper
   * @param {PollState} s
   * @param {{ text: string, votes: number }} opt
   * @param {number} index
   * @param {HTMLElement} _container
   * @returns {HTMLDivElement}
   */
  #createOption(wrapper, s, opt, index, _container) {
    const option = document.createElement('div')
    option.className = 'oe-poll__option'

    // Marker
    const marker = document.createElement('span')
    marker.className = `oe-poll__option-marker oe-poll__option-marker--${s.data.type}`
    option.appendChild(marker)

    // Text
    const text = document.createElement('div')
    text.className = 'oe-poll__option-text'
    text.contentEditable = 'true'
    const placeholder = this._t('optionPlaceholder', 'Option')
    text.dataset.placeholder = `${placeholder} ${index + 1}`
    if (opt.text) text.innerHTML = sanitizeHtml(opt.text)

    text.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        this.#syncFromDom(wrapper)
        s.data.options.splice(index + 1, 0, { text: '', votes: 0 })
        this.#build(wrapper)
        wrapper.dispatchEvent(new InputEvent('input', { bubbles: true }))
        const texts = wrapper.querySelectorAll('.oe-poll__option-text')
        if (texts[index + 1]) /** @type {HTMLElement} */ (texts[index + 1]).focus()
      }
      if (e.key === 'Backspace' && !text.textContent?.trim() && s.data.options.length > 2) {
        e.preventDefault()
        e.stopPropagation()
        this.#syncFromDom(wrapper)
        s.data.options.splice(index, 1)
        this.#build(wrapper)
        wrapper.dispatchEvent(new InputEvent('input', { bubbles: true }))
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
        return
      }
      if (!e.ctrlKey && !e.metaKey) e.stopPropagation()
    })
    option.appendChild(text)

    // Remove button
    if (s.data.options.length > 2) {
      const removeBtn = document.createElement('button')
      removeBtn.type = 'button'
      removeBtn.className = 'oe-poll__option-remove'
      removeBtn.innerHTML = ICON_REMOVE
      removeBtn.addEventListener('mousedown', (e) => e.preventDefault())
      removeBtn.addEventListener('click', () => {
        this.#syncFromDom(wrapper)
        s.data.options.splice(index, 1)
        this.#build(wrapper)
        wrapper.dispatchEvent(new InputEvent('input', { bubbles: true }))
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

    const totalVotes = s.data.options.reduce((sum, o) => sum + o.votes, 0)

    for (const opt of s.data.options) {
      const row = document.createElement('div')
      row.className = 'oe-poll__result-row'

      const label = document.createElement('span')
      label.className = 'oe-poll__result-label'
      label.textContent = opt.text || '—'

      const bar = document.createElement('div')
      bar.className = 'oe-poll__result-bar'

      const fill = document.createElement('div')
      fill.className = 'oe-poll__result-fill'
      const pct = totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0
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
      this.#syncFromDom(wrapper)
      s.data.type = s.data.type === 'single' ? 'multiple' : 'single'
      this.#build(wrapper)
      wrapper.dispatchEvent(new InputEvent('input', { bubbles: true }))
    })
    actions.appendChild(typeBtn)

    actions.appendChild(this.#makeSep())

    // Results toggle
    const resultsBtn = document.createElement('button')
    resultsBtn.type = 'button'
    resultsBtn.className = `oe-poll__action-btn${s.showResults ? ' oe-poll__action-btn--active' : ''}`
    resultsBtn.innerHTML = `${ICON_RESULTS} ${this._t('results', 'Results')}`
    resultsBtn.addEventListener('mousedown', (e) => e.preventDefault())
    resultsBtn.addEventListener('click', () => {
      this.#syncFromDom(wrapper)
      s.showResults = !s.showResults
      this.#build(wrapper)
    })
    actions.appendChild(resultsBtn)

    actions.appendChild(this.#makeSep())

    // Delete
    const deleteBtn = document.createElement('button')
    deleteBtn.type = 'button'
    deleteBtn.className = 'oe-poll__action-btn oe-poll__action-btn--danger'
    deleteBtn.innerHTML = ICON_TRASH
    deleteBtn.title = this._t('delete', 'Delete')
    deleteBtn.addEventListener('mousedown', (e) => e.preventDefault())
    deleteBtn.addEventListener('click', () => {
      s.data = this.#defaultData()
      s.showResults = false
      this.#build(wrapper)
      wrapper.dispatchEvent(new InputEvent('input', { bubbles: true }))
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
